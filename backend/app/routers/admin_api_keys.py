import json
import re
from datetime import datetime, timedelta

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..api_key_service import API_KEY_SCOPES, api_key_scopes, generate_api_key
from ..database import get_db
from ..deps import require_interactive_admin
from ..log_util import audit
from ..models import ApiKey, ApiKeyUsageLog, User
from ..utils import dt

router = APIRouter(prefix="/api/admin", tags=["api-keys"])


def _key_dict(db: Session, row: ApiKey) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "key_prefix": row.key_prefix,
        "key_suffix": row.key_suffix,
        "masked_key": f"{row.key_prefix}…{row.key_suffix}",
        "scopes": api_key_scopes(row),
        "active": row.active,
        "expired": bool(row.expires_at and row.expires_at <= datetime.now()),
        "expires_at": dt(row.expires_at),
        "created_by": row.created_by,
        "creator_name": row.creator.full_name or row.creator.username,
        "created_at": dt(row.created_at),
        "updated_at": dt(row.updated_at),
        "rotated_at": dt(row.rotated_at),
        "last_used_at": dt(row.last_used_at),
        "last_used_ip": row.last_used_ip,
        "usage_count": db.query(ApiKeyUsageLog).filter(ApiKeyUsageLog.api_key_id == row.id).count(),
    }


def _name(payload: dict) -> str:
    name = str(payload.get("name", "")).strip()
    if not name or len(name) > 100:
        raise HTTPException(400, "密钥名称需为 1–100 个字符")
    return name


def _scopes(payload: dict) -> list[str]:
    raw = payload.get("scopes", [])
    if not isinstance(raw, list):
        raise HTTPException(400, "权限范围必须为数组")
    selected = set(raw)
    unknown = selected - set(API_KEY_SCOPES)
    if unknown or not selected:
        raise HTTPException(400, "至少选择一个有效的权限范围")
    return [scope for scope in API_KEY_SCOPES if scope in selected]


def _expires_at(value, *, default_90_days: bool = False) -> datetime | None:
    if value in (None, "", "never"):
        return datetime.now() + timedelta(days=90) if default_90_days else None
    text = str(value).strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        text = f"{text}T23:59:59"
    try:
        expires = datetime.fromisoformat(text)
    except ValueError:
        raise HTTPException(400, "有效期格式应为 YYYY-MM-DD 或 YYYY-MM-DDTHH:MM") from None
    if expires.tzinfo is not None:
        raise HTTPException(400, "有效期请使用不带时区的本地时间")
    if expires <= datetime.now():
        raise HTTPException(400, "有效期必须晚于当前时间")
    return expires


@router.get("/api-keys")
def list_api_keys(db: Session = Depends(get_db), _: User = Depends(require_interactive_admin)):
    rows = db.query(ApiKey).order_by(ApiKey.id.desc()).all()
    return {
        "items": [_key_dict(db, row) for row in rows],
        "scope_options": [{"id": scope, "description": description} for scope, description in API_KEY_SCOPES.items()],
    }


@router.post("/api-keys")
def create_api_key(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_interactive_admin)):
    raw, prefix, suffix, key_hash = generate_api_key()
    scopes = _scopes(payload)
    row = ApiKey(
        name=_name(payload),
        key_prefix=prefix,
        key_suffix=suffix,
        key_hash=key_hash,
        scopes_json=json.dumps(scopes, ensure_ascii=False),
        active=True,
        expires_at=_expires_at(payload.get("expires_at"), default_90_days="expires_at" not in payload),
        created_by=user.id,
    )
    db.add(row)
    db.flush()
    audit(db, user, "api_key", "create", "api_key", row.id, {"name": row.name, "scopes": scopes, "expires_at": dt(row.expires_at)})
    db.commit()
    return {"item": _key_dict(db, row), "api_key": raw, "message": "完整密钥仅本次显示，请立即复制并安全保存"}


@router.patch("/api-keys/{key_id}")
def update_api_key(key_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_interactive_admin)):
    row = db.get(ApiKey, key_id)
    if not row:
        raise HTTPException(404, "API Key 不存在")
    changes = {}
    if "name" in payload:
        row.name = _name(payload)
        changes["name"] = row.name
    if "scopes" in payload:
        scopes = _scopes(payload)
        row.scopes_json = json.dumps(scopes, ensure_ascii=False)
        changes["scopes"] = scopes
    if "expires_at" in payload:
        row.expires_at = _expires_at(payload["expires_at"])
        changes["expires_at"] = dt(row.expires_at)
    if "active" in payload:
        row.active = bool(payload["active"])
        changes["active"] = row.active
    audit(db, user, "api_key", "update", "api_key", key_id, changes)
    db.commit()
    return _key_dict(db, row)


@router.post("/api-keys/{key_id}/rotate")
def rotate_api_key(key_id: int, db: Session = Depends(get_db), user: User = Depends(require_interactive_admin)):
    row = db.get(ApiKey, key_id)
    if not row:
        raise HTTPException(404, "API Key 不存在")
    raw, prefix, suffix, key_hash = generate_api_key()
    row.key_prefix = prefix
    row.key_suffix = suffix
    row.key_hash = key_hash
    row.rotated_at = datetime.now()
    audit(db, user, "api_key", "rotate", "api_key", key_id, {"name": row.name})
    db.commit()
    return {"item": _key_dict(db, row), "api_key": raw, "message": "旧密钥已立即失效，新密钥仅本次显示"}


@router.delete("/api-keys/{key_id}")
def delete_api_key(key_id: int, db: Session = Depends(get_db), user: User = Depends(require_interactive_admin)):
    row = db.get(ApiKey, key_id)
    if not row:
        raise HTTPException(404, "API Key 不存在")
    audit(db, user, "api_key", "delete", "api_key", key_id, {"name": row.name, "key_prefix": row.key_prefix})
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/api-key-logs")
def api_key_logs(key_id: int = Query(0), result: str = Query("all", pattern="^(all|success|denied)$"), page: int = Query(1, ge=1), q: str = Query(""), db: Session = Depends(get_db), _: User = Depends(require_interactive_admin)):
    query = db.query(ApiKeyUsageLog)
    if key_id:
        query = query.filter(ApiKeyUsageLog.api_key_id == key_id)
    if result == "success":
        query = query.filter(ApiKeyUsageLog.status_code < 400)
    elif result == "denied":
        query = query.filter(ApiKeyUsageLog.status_code >= 400)
    if q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(or_(ApiKeyUsageLog.key_name.like(term), ApiKeyUsageLog.path.like(term), ApiKeyUsageLog.ip.like(term)))
    total = query.count()
    rows = query.order_by(ApiKeyUsageLog.id.desc()).offset((page - 1) * 20).limit(20).all()
    return {
        "items": [{
            "id": row.id,
            "api_key_id": row.api_key_id,
            "key_name": row.key_name,
            "key_prefix": row.key_prefix,
            "method": row.method,
            "path": row.path,
            "status_code": row.status_code,
            "ip": row.ip,
            "user_agent": row.user_agent,
            "created_at": dt(row.created_at),
        } for row in rows],
        "total": total,
        "page": page,
        "page_size": 20,
    }
