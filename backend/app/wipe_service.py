"""一键清除：清空系统里的业务数据，只保留当前管理员与系统设置。

清除码只通过短信发送到内置手机号，任何接口都不回显清除码本身；
执行清除还需要原样输入确认口令，避免误触。
"""

import random
import shutil
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .config import UPLOAD_DIR
from .database import engine
from .log_util import audit
from .models import AppSettings, SmsOtpCode, User
from .security import hash_otp, hash_password
from .sms_service import deliver, get_settings

# 内置接收号码：清除码只发到这个号码，界面上只显示掩码。
WIPE_TARGET_PHONE = "18602113774"
WIPE_PHONE_MASKED = "186****3774"
# 清除码用途标识，与普通短信验证码分开存放。
WIPE_CODE_PURPOSE = "wipe_code"
WIPE_CODE_TTL_MINUTES = 10
WIPE_CODE_RESEND_SECONDS = 60
WIPE_CODE_MAX_ATTEMPTS = 5
# 二次确认口令：必须原样输入才会执行清除。
WIPE_CONFIRM_TEXT = "清除全部数据"
# 清除后当前管理员重置成的密码。
WIPE_ADMIN_PASSWORD = "Tpc@2026"
# 与业务无关的系统设置，清除时保留。
PRESERVED_TABLES = ("app_settings", "sms_settings", "backup_plan_settings", "api_keys")


def request_wipe_code(db: Session, actor: User) -> dict:
    """生成清除码，并只通过短信发给内置手机号。

    清除码不写进返回值，界面与接口都拿不到它。
    """
    settings = get_settings(db)
    now = datetime.now()
    latest = db.query(SmsOtpCode).filter(SmsOtpCode.purpose == WIPE_CODE_PURPOSE).order_by(SmsOtpCode.id.desc()).first()
    if latest and (now - latest.created_at).total_seconds() < WIPE_CODE_RESEND_SECONDS:
        wait = max(1, int(WIPE_CODE_RESEND_SECONDS - (now - latest.created_at).total_seconds()))
        raise HTTPException(429, f"发送过于频繁，请 {wait} 秒后再试")
    code = "".join(random.choice("0123456789") for _ in range(6))
    content = (
        f"{settings.signature_prefix}数据清除码：{code}，{WIPE_CODE_TTL_MINUTES} 分钟内有效，"
        "仅用于清空本系统数据，请勿转发给他人。"
    )
    result = deliver(db, purpose=WIPE_CODE_PURPOSE, phone=WIPE_TARGET_PHONE, content=content)
    if not result.get("sent"):
        raise HTTPException(502, "清除码发送失败，请先在「短信通知」里启用短信通道并配置服务商账号")
    # 旧挑战立即作废，同一时间只允许一个有效清除码。
    db.query(SmsOtpCode).filter(SmsOtpCode.purpose == WIPE_CODE_PURPOSE, SmsOtpCode.used_at.is_(None)).update({"used_at": now})
    db.add(SmsOtpCode(
        phone=WIPE_TARGET_PHONE,
        purpose=WIPE_CODE_PURPOSE,
        code_hash=hash_otp(code),
        expires_at=now + timedelta(minutes=WIPE_CODE_TTL_MINUTES),
        created_at=now,
    ))
    db.commit()
    return {
        "ok": True,
        "phone": WIPE_PHONE_MASKED,
        "expires_in_minutes": WIPE_CODE_TTL_MINUTES,
        "confirm_text": WIPE_CONFIRM_TEXT,
        "message": f"清除码已发送至 {WIPE_PHONE_MASKED}，{WIPE_CODE_TTL_MINUTES} 分钟内有效",
    }


def _verify_code(db: Session, code: str) -> None:
    row = (
        db.query(SmsOtpCode)
        .filter(
            SmsOtpCode.phone == WIPE_TARGET_PHONE,
            SmsOtpCode.purpose == WIPE_CODE_PURPOSE,
            SmsOtpCode.used_at.is_(None),
        )
        .order_by(SmsOtpCode.id.desc())
        .first()
    )
    if not row or row.expires_at < datetime.now() or row.attempts >= WIPE_CODE_MAX_ATTEMPTS:
        raise HTTPException(400, "清除码错误或已过期")
    row.attempts += 1
    if row.code_hash != hash_otp(str(code or "").strip()):
        db.commit()
        raise HTTPException(400, "清除码错误或已过期")
    row.used_at = datetime.now()
    db.commit()


def _delete_tables(keep_user_id: int) -> dict[str, int]:
    """清空所有业务表，用户表只保留当前管理员。

    走原生连接并临时关闭外键校验：整库清空时子表要先于父表删除，
    逐张按外键顺序删除既慢又容易漏，这里直接一次性清空。
    """
    stats: dict[str, int] = {}
    connection = engine.raw_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=OFF")
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        for table in tables:
            if table in PRESERVED_TABLES or table.startswith("sqlite_"):
                continue
            cursor.execute(f'SELECT COUNT(*) FROM "{table}"')
            total = int(cursor.fetchone()[0] or 0)
            if table == "users":
                cursor.execute("DELETE FROM users WHERE id != ?", (keep_user_id,))
                stats[table] = max(0, total - 1)
                continue
            cursor.execute(f'DELETE FROM "{table}"')
            stats[table] = total
        if "sqlite_sequence" in tables:
            placeholders = ",".join("?" for _ in PRESERVED_TABLES)
            cursor.execute(f"DELETE FROM sqlite_sequence WHERE name NOT IN ({placeholders})", PRESERVED_TABLES)
        connection.commit()
        cursor.close()
    finally:
        connection.close()
    return stats


def _clear_uploads() -> int:
    """清空上传目录（会员档案图片等），保留目录本身。"""
    removed = 0
    if not UPLOAD_DIR.exists():
        return removed
    for item in UPLOAD_DIR.iterdir():
        try:
            if item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
            else:
                item.unlink()
            removed += 1
        except OSError:
            continue
    return removed


def wipe_data(db: Session, actor: User, *, code: str, confirm: str) -> dict:
    """按清除码执行一键清除：业务数据清空，保留系统设置与当前管理员。"""
    if str(confirm or "").strip() != WIPE_CONFIRM_TEXT:
        raise HTTPException(400, f"请原样输入确认口令「{WIPE_CONFIRM_TEXT}」")
    _verify_code(db, code)
    db.commit()
    stats = _delete_tables(actor.id)
    db.expire_all()
    actor.password_hash = hash_password(WIPE_ADMIN_PASSWORD)
    actor.deleted_at = None
    actor.deleted_by = ""
    actor.deleted_state_json = "{}"
    actor.active = True
    settings = db.get(AppSettings, 1)
    if settings is None:
        settings = AppSettings(id=1)
        db.add(settings)
    # 清除后不再自动写入演示数据，避免重启后台又冒出一批示例会员。
    settings.demo_data_disabled = True
    db.commit()
    removed_files = _clear_uploads()
    # 清除完成后补一条操作日志，作为这次操作的唯一留痕。
    audit(db, actor, "maintenance", "wipe_data", "database", detail={
        "tables": stats,
        "removed_files": removed_files,
        "kept_user": actor.username,
        "password_reset": True,
    })
    db.commit()
    return {
        "ok": True,
        "message": "数据已全部清除，仅保留当前管理员账号与系统设置，请使用新密码重新登录",
        "deleted_tables": stats,
        "removed_files": removed_files,
        "kept_username": actor.username,
        "new_password": WIPE_ADMIN_PASSWORD,
    }
