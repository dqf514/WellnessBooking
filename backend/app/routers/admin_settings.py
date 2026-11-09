import hashlib
import re

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_admin, require_read
from ..log_util import audit, sms_log
from ..models import AppSettings, OperationLog, SmsSendLog, SmsSettings, User
from ..security import hash_password
from ..serializers import user_dict
from ..sms_gateway import query_balance, send_sms_batch
from ..sms_service import DEFAULT_BOOKING, DEFAULT_CANCEL, DEFAULT_REMINDER, get_settings, password_md5, sp_id
from ..utils import dt, valid_phone

router = APIRouter(prefix="/api/admin", tags=["admin-settings"])


def _settings_dict(row: AppSettings) -> dict:
    return {"venue_name": row.venue_name, "venue_name_en": row.venue_name_en, "address": row.address, "address_en": row.address_en, "phone": row.phone, "booking_cutoff_minutes": row.booking_cutoff_minutes, "no_show_block_days": row.no_show_block_days, "reminder_hours": row.reminder_hours}


@router.get("/settings")
def get_app_settings(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return _settings_dict(db.get(AppSettings, 1))


@router.put("/settings")
def put_app_settings(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_admin)):
    row = db.get(AppSettings, 1)
    allowed = {"venue_name", "venue_name_en", "address", "address_en", "phone", "booking_cutoff_minutes", "no_show_block_days", "reminder_hours"}
    for key, value in payload.items():
        if key in allowed:
            setattr(row, key, value)
    if not 0 <= int(row.booking_cutoff_minutes) <= 10080 or not 0 <= int(row.no_show_block_days) <= 365 or not 1 <= int(row.reminder_hours) <= 168:
        raise HTTPException(400, "预约或提醒参数超出允许范围")
    audit(db, user, "settings", "update", "app_settings", 1, payload)
    db.commit()
    return _settings_dict(row)


@router.get("/users")
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return {"items": [user_dict(row) for row in db.query(User).order_by(User.id).all()]}


@router.post("/users")
def create_user(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_admin)):
    username = str(payload.get("username", "")).strip().lower()
    password = str(payload.get("password", ""))
    role = str(payload.get("role", "viewer"))
    if not re.fullmatch(r"[a-z0-9_]{3,30}", username) or len(password) < 8:
        raise HTTPException(400, "用户名需为 3-30 位字母数字下划线，密码至少 8 位")
    if role not in {"admin", "finance", "frontdesk", "teacher", "viewer"}:
        raise HTTPException(400, "角色不合法")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(400, "用户名已存在")
    phone = str(payload.get("phone", "")).strip()
    if phone:
        valid_phone(phone)
    row = User(username=username, password_hash=hash_password(password), full_name=str(payload.get("full_name", "")).strip(), phone=phone or None, role=role, active=True)
    db.add(row)
    db.flush()
    audit(db, user, "account", "create", "user", row.id, {"username": username, "role": role})
    db.commit()
    return user_dict(row)


@router.patch("/users/{user_id}")
def update_user(user_id: int, payload: dict = Body(...), db: Session = Depends(get_db), actor: User = Depends(require_admin)):
    row = db.get(User, user_id)
    if not row:
        raise HTTPException(404, "账号不存在")
    if "role" in payload:
        if payload["role"] not in {"admin", "finance", "frontdesk", "teacher", "viewer"}:
            raise HTTPException(400, "角色不合法")
        row.role = payload["role"]
    if "full_name" in payload:
        row.full_name = str(payload["full_name"]).strip()
    if "phone" in payload:
        phone = str(payload["phone"]).strip()
        if phone:
            valid_phone(phone)
        row.phone = phone or None
    if "active" in payload:
        if row.id == actor.id and not payload["active"]:
            raise HTTPException(400, "不能停用当前登录账号")
        row.active = bool(payload["active"])
    if str(payload.get("password", "")):
        if len(str(payload["password"])) < 8:
            raise HTTPException(400, "密码至少 8 位")
        row.password_hash = hash_password(str(payload["password"]))
    audit(db, actor, "account", "update", "user", user_id, {key: value for key, value in payload.items() if key != "password"})
    db.commit()
    return user_dict(row)


def _sms_public(row: SmsSettings) -> dict:
    return {"enabled": row.enabled, "sp_id": row.sp_id, "password_set": bool(row.password_md5), "send_url": row.send_url, "balance_url": row.balance_url, "signature_prefix": row.signature_prefix, "notify_booking": row.notify_booking, "notify_cancel": row.notify_cancel, "notify_reminder": row.notify_reminder, "template_booking": row.template_booking, "template_cancel": row.template_cancel, "template_reminder": row.template_reminder}


@router.get("/sms-settings")
def get_sms_settings(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return _sms_public(get_settings(db))


@router.put("/sms-settings")
def put_sms_settings(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_admin)):
    row = get_settings(db)
    for key in {"enabled", "sp_id", "send_url", "balance_url", "notify_booking", "notify_cancel", "notify_reminder", "template_booking", "template_cancel", "template_reminder"}:
        if key in payload:
            setattr(row, key, payload[key])
    password = str(payload.get("password", "")).strip()
    if password:
        row.password_md5 = password.lower() if re.fullmatch(r"[a-fA-F0-9]{32}", password) else hashlib.md5(password.encode("utf-8")).hexdigest()
    for key in ("template_booking", "template_cancel", "template_reminder"):
        value = getattr(row, key) or ""
        if re.match(r"^\s*【[^】]+】", value):
            raise HTTPException(400, "短信模板无需重复填写签名，系统会自动添加")
    audit(db, user, "settings", "update_sms", "sms_settings", 1, {key: value for key, value in payload.items() if key != "password"})
    db.commit()
    return _sms_public(row)


@router.post("/sms-settings/test")
def test_sms(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_admin)):
    row = get_settings(db)
    phone = valid_phone(str(payload.get("phone", "")))
    if not sp_id(row) or not password_md5(row):
        raise HTTPException(400, "请先填写 sp_id 和接口密码")
    content = f"{row.signature_prefix}这是一条 Wellness 预约系统连通性测试消息，若非本人操作请忽略。"
    try:
        result = send_sms_batch(sp_id=sp_id(row), password_md5=password_md5(row), mobiles=phone, content=content, send_url=row.send_url)
    except Exception as exc:
        sms_log(db, purpose="connectivity_test", phone=phone, content=content, status="failed", reason="exception", provider={"error": str(exc)})
        db.commit()
        return {"ok": False, "message": "短信网关调用异常", "error": str(exc)}
    failed = bool(result.get("failed_data")) or str(result.get("code")) != "0"
    sms_log(db, purpose="connectivity_test", phone=phone, content=content, status="failed" if failed else "sent", reason="provider_error" if failed else "ok", provider=result)
    audit(db, user, "settings", "test_sms", "sms_settings", 1, {"ok": not failed})
    db.commit()
    return {"ok": not failed, "message": "测试短信已提交" if not failed else "运营商返回失败", "provider": result, "content": content}


@router.get("/sms-settings/balance")
def sms_balance(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    row = get_settings(db)
    if not sp_id(row) or not password_md5(row):
        raise HTTPException(400, "请先填写 sp_id 和接口密码")
    try:
        return {"ok": True, "provider": query_balance(sp_id=sp_id(row), password_md5=password_md5(row), balance_url=row.balance_url)}
    except Exception as exc:
        raise HTTPException(502, f"余额查询失败：{exc}") from exc


@router.get("/logs")
def operation_logs(kind: str = Query("operation"), page: int = Query(1, ge=1), q: str = Query(""), db: Session = Depends(get_db), _: User = Depends(require_admin)):
    model = SmsSendLog if kind == "sms" else OperationLog
    query = db.query(model)
    if q:
        query = query.filter(SmsSendLog.phone.like(f"%{q}%")) if kind == "sms" else query.filter(OperationLog.actor_username.like(f"%{q}%"))
    total = query.count()
    rows = query.order_by(model.id.desc()).offset((page - 1) * 50).limit(50).all()
    if kind == "sms":
        items = [{"id": row.id, "created_at": dt(row.created_at), "purpose": row.purpose, "phone": row.phone, "booking_id": row.booking_id, "content": row.content, "status": row.status, "reason": row.reason, "provider_json": row.provider_json} for row in rows]
    else:
        items = [{"id": row.id, "created_at": dt(row.created_at), "actor_username": row.actor_username, "actor_role": row.actor_role, "category": row.category, "action": row.action, "entity": row.entity, "entity_id": row.entity_id, "detail_json": row.detail_json} for row in rows]
    return {"items": items, "total": total, "page": page, "page_size": 50}
