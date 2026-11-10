import re

from fastapi import Depends, HTTPException
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from starlette.requests import Request

from .api_key_service import api_key_scopes, authenticate_api_key
from .database import get_db
from .models import Member, User
from .security import decode_token

bearer = HTTPBearer(auto_error=False)
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def _payload(creds: HTTPAuthorizationCredentials | None) -> dict:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    payload = decode_token(creds.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    return payload


def get_current_user(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(bearer), raw_api_key: str | None = Depends(api_key_header), db: Session = Depends(get_db)) -> User:
    if raw_api_key and creds is not None:
        raise HTTPException(400, "Bearer Token 与 X-API-Key 不能同时使用")
    if raw_api_key:
        key = authenticate_api_key(db, raw_api_key)
        request.state.auth_kind = "api_key"
        request.state.api_key_id = key.id
        request.state.api_key_scopes = api_key_scopes(key)
        request.state.api_key_authenticated = True
        return key.creator
    payload = _payload(creds)
    subject = str(payload["sub"])
    if not subject.startswith("staff:"):
        raise HTTPException(status_code=403, detail="需要员工账号")
    user = db.get(User, int(subject.split(":", 1)[1]))
    if not user or not user.active or user.deleted_at is not None:
        raise HTTPException(status_code=401, detail="账号不存在或已停用")
    request.state.auth_kind = "jwt"
    return user


def get_current_member(creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> Member:
    payload = _payload(creds)
    subject = str(payload["sub"])
    if not subject.startswith("member:"):
        raise HTTPException(status_code=403, detail="需要会员账号")
    member = db.get(Member, int(subject.split(":", 1)[1]))
    if not member or not member.active or member.deleted_at is not None:
        raise HTTPException(status_code=401, detail="会员账号不存在或已停用")
    return member


def required_api_key_scope(request: Request) -> str | None:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return "read"
    path = request.url.path
    if "/bookings/" in path or path == "/api/admin/private-bookings" or re.fullmatch(r"/api/admin/sessions/\d+/bookings", path):
        return "bookings:write"
    if path.startswith(("/api/admin/members", "/api/admin/cards", "/api/admin/no-shows", "/api/admin/documents", "/api/admin/reminders", "/api/admin/vouchers")):
        return "members:write"
    if path.startswith(("/api/admin/sessions", "/api/admin/room-reservations")):
        return "schedule:write"
    if path.startswith(("/api/admin/courses", "/api/admin/rooms", "/api/admin/teachers")):
        return "catalog:write"
    if path.startswith(("/api/admin/products", "/api/admin/transactions", "/api/admin/orders")):
        return "finance:write"
    if path.startswith(("/api/admin/settings", "/api/admin/users", "/api/admin/sms-settings")):
        return "settings:write"
    if path.startswith("/api/admin/maintenance"):
        return "maintenance:write"
    return None


def require_roles(*roles: str):
    def dependency(request: Request, user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="当前角色无权执行此操作")
        if getattr(request.state, "auth_kind", "jwt") == "api_key":
            scope = required_api_key_scope(request)
            if not scope or scope not in getattr(request.state, "api_key_scopes", []):
                raise HTTPException(status_code=403, detail=f"API Key 缺少所需权限范围：{scope or '不支持此接口'}")
        return user
    return dependency


def require_interactive_admin(request: Request, user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="当前角色无权执行此操作")
    if getattr(request.state, "auth_kind", "jwt") != "jwt":
        raise HTTPException(status_code=403, detail="API Key 管理仅允许管理员登录会话操作")
    return user


require_admin = require_roles("admin")
require_staff = require_roles("admin", "frontdesk")
require_finance = require_roles("admin", "finance")
require_read = require_roles("admin", "frontdesk", "finance", "teacher", "viewer")
