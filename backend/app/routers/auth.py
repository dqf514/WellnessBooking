from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..security import create_access_token, hash_password, verify_password
from ..serializers import user_dict
from ..sms_service import send_otp, verify_otp
from ..utils import valid_phone

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(payload: dict = Body(...), db: Session = Depends(get_db)):
    username = str(payload.get("username", "")).strip()
    user = db.query(User).filter(User.username == username).first()
    if not user or not user.active or not verify_password(str(payload.get("password", "")), user.password_hash):
        raise HTTPException(400, "用户名或密码错误")
    return {"access_token": create_access_token(f"staff:{user.id}", user.role), "user": user_dict(user)}


@router.post("/sms/send-code")
def staff_sms_code(payload: dict = Body(...), db: Session = Depends(get_db)):
    phone = valid_phone(str(payload.get("phone", "")))
    user = db.query(User).filter(User.phone == phone, User.active.is_(True)).first()
    if not user:
        raise HTTPException(400, "手机号未绑定员工账号")
    return send_otp(db, phone=phone, purpose="staff_login")


@router.post("/login-sms")
def staff_sms_login(payload: dict = Body(...), db: Session = Depends(get_db)):
    phone = valid_phone(str(payload.get("phone", "")))
    user = db.query(User).filter(User.phone == phone, User.active.is_(True)).first()
    if not user:
        raise HTTPException(400, "手机号未绑定员工账号")
    verify_otp(db, phone=phone, purpose="staff_login", code=str(payload.get("code", "")))
    return {"access_token": create_access_token(f"staff:{user.id}", user.role), "user": user_dict(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_dict(user)


@router.post("/change-password")
def change_password(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not verify_password(str(payload.get("old_password", "")), user.password_hash):
        raise HTTPException(400, "原密码不正确")
    new_password = str(payload.get("new_password", ""))
    if len(new_password) < 8:
        raise HTTPException(400, "新密码至少 8 位")
    user.password_hash = hash_password(new_password)
    db.commit()
    return {"ok": True}
