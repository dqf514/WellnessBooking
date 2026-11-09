from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import Member, User
from .security import decode_token

bearer = HTTPBearer(auto_error=False)


def _payload(creds: HTTPAuthorizationCredentials | None) -> dict:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    payload = decode_token(creds.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    return payload


def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    payload = _payload(creds)
    subject = str(payload["sub"])
    if not subject.startswith("staff:"):
        raise HTTPException(status_code=403, detail="需要员工账号")
    user = db.get(User, int(subject.split(":", 1)[1]))
    if not user or not user.active:
        raise HTTPException(status_code=401, detail="账号不存在或已停用")
    return user


def get_current_member(creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> Member:
    payload = _payload(creds)
    subject = str(payload["sub"])
    if not subject.startswith("member:"):
        raise HTTPException(status_code=403, detail="需要会员账号")
    member = db.get(Member, int(subject.split(":", 1)[1]))
    if not member or not member.active:
        raise HTTPException(status_code=401, detail="会员账号不存在或已停用")
    return member


def require_roles(*roles: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="当前角色无权执行此操作")
        return user
    return dependency


require_admin = require_roles("admin")
require_staff = require_roles("admin", "frontdesk")
require_finance = require_roles("admin", "finance")
require_read = require_roles("admin", "frontdesk", "finance", "teacher", "viewer")
