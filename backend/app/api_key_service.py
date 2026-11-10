import hashlib
import secrets
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session
from starlette.requests import Request

from .database import SessionLocal
from .models import ApiKey, ApiKeyUsageLog
from .utils import json_loads

API_KEY_SCOPES = {
    "read": "读取后台业务数据、报表与日志",
    "members:write": "新建和修改会员、会员卡、会员记录及合同文件",
    "bookings:write": "后台添加预约、签到、取消签到、完成、取消和爽约",
    "schedule:write": "新建和修改排课、复制课表及管理教室占用",
    "catalog:write": "维护课程、教室和教练基础资料",
    "finance:write": "维护卡课产品、手工入账、退款及电子码核销",
    "settings:write": "修改场馆、品牌、员工账号和短信设置",
    "maintenance:write": "执行数据导入导出、备份与恢复",
}


def hash_api_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def generate_api_key() -> tuple[str, str, str, str]:
    raw = f"yyk_{secrets.token_urlsafe(32)}"
    return raw, raw[:16], raw[-4:], hash_api_key(raw)


def api_key_scopes(row: ApiKey) -> list[str]:
    return [scope for scope in API_KEY_SCOPES if scope in set(json_loads(row.scopes_json, []))]


def authenticate_api_key(db: Session, raw: str) -> ApiKey:
    raw = raw.strip()
    if not raw.startswith("yyk_") or len(raw) > 200:
        raise HTTPException(401, "API Key 无效、已停用或已过期")
    row = db.query(ApiKey).filter(ApiKey.key_hash == hash_api_key(raw)).first()
    if not row or row.deleted_at is not None or not row.active or (row.expires_at and row.expires_at <= datetime.now()) or not row.creator or not row.creator.active or row.creator.deleted_at is not None:
        raise HTTPException(401, "API Key 无效、已停用或已过期")
    return row


def record_api_key_usage(request: Request, status_code: int) -> None:
    raw = request.headers.get("x-api-key", "").strip()
    if not raw.startswith("yyk_"):
        return
    db = SessionLocal()
    try:
        key_id = getattr(request.state, "api_key_id", None)
        authenticated = bool(getattr(request.state, "api_key_authenticated", False))
        row = db.get(ApiKey, key_id) if key_id else None
        if not row:
            row = db.query(ApiKey).filter(ApiKey.key_hash == hash_api_key(raw)).first()
        if row and authenticated:
            row.last_used_at = datetime.now()
            row.last_used_ip = request.client.host if request.client else ""
        db.add(ApiKeyUsageLog(
            api_key_id=row.id if row else None,
            key_name=row.name if row else "未知密钥",
            key_prefix=row.key_prefix if row else raw[:16],
            actor_user_id=row.created_by if row and authenticated else None,
            method=request.method,
            path=request.url.path[:500],
            status_code=status_code,
            ip=(request.client.host if request.client else "")[:64],
            user_agent=request.headers.get("user-agent", "")[:300],
            created_at=datetime.now(),
        ))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
