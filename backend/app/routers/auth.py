from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session
from starlette.requests import Request

from ..captcha_service import new_captcha, verify_captcha
from ..database import get_db
from ..deps import get_current_user
from ..log_util import audit
from ..mfa_service import consume, create_challenge, mask_phone, take_challenge
from ..models import AppSettings, User
from ..security import create_access_token, hash_password, verify_password
from ..serializers import user_dict
from ..sms_service import send_otp, verify_otp
from ..utils import clean_payload, valid_phone

PROFILE_FIELDS = {"full_name", "phone"}

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _captcha_required(db: Session) -> bool:
    settings = db.get(AppSettings, 1)
    return True if settings is None else bool(settings.captcha_enabled)


def _mfa_enabled(db: Session) -> bool:
    settings = db.get(AppSettings, 1)
    return False if settings is None else bool(settings.mfa_enabled)


@router.get("/captcha")
def captcha():
    """员工登录图片验证码：返回 captcha_id 与 base64 图片，一次一用、5 分钟过期。"""
    return new_captcha()


@router.post("/login")
def login(payload: dict = Body(...), db: Session = Depends(get_db)):
    username = str(payload.get("username", "")).strip()
    if _captcha_required(db):
        if not verify_captcha(str(payload.get("captcha_id", "")), str(payload.get("captcha_text", ""))):
            raise HTTPException(400, "图片验证码错误或已过期，请点击图片刷新")
    user = db.query(User).filter(User.username == username).first()
    if not user or not user.active or not verify_password(str(payload.get("password", "")), user.password_hash):
        raise HTTPException(400, "用户名或密码错误")
    if _mfa_enabled(db):
        return _start_mfa(db, user)
    return {"access_token": create_access_token(f"staff:{user.id}", user.role), "user": user_dict(user)}


def _start_mfa(db: Session, user: User) -> dict:
    """口令校验通过后的短信二次验证：下发验证码并生成一次性挑战令牌。"""
    phone = (user.phone or "").strip()
    if not phone:
        raise HTTPException(400, "该账号未绑定手机号，无法完成二次验证，请联系管理员")
    result = send_otp(db, phone=phone, purpose="staff_mfa")
    token = create_challenge(user.id, phone)
    response = {"mfa_required": True, "mfa_token": token, "phone_masked": mask_phone(phone)}
    if result.get("dev_code"):
        response["dev_code"] = result["dev_code"]
    return response


@router.post("/login-mfa")
def login_mfa(payload: dict = Body(...), db: Session = Depends(get_db)):
    token = str(payload.get("mfa_token", "")).strip()
    challenge = take_challenge(token)
    if not challenge:
        raise HTTPException(400, "二次验证已过期，请重新登录")
    verify_otp(db, phone=challenge["phone"], purpose="staff_mfa", code=str(payload.get("code", "")))
    consume(token)
    user = db.get(User, challenge["user_id"])
    if not user or not user.active:
        raise HTTPException(400, "账号不可用，请联系管理员")
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
def me(request: Request, user: User = Depends(get_current_user)):
    if getattr(request.state, "auth_kind", "jwt") != "jwt":
        raise HTTPException(403, "员工身份信息仅支持登录会话查询")
    return user_dict(user)


@router.patch("/me")
def update_me(request: Request, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if getattr(request.state, "auth_kind", "jwt") != "jwt":
        raise HTTPException(403, "个人资料仅支持登录会话修改")
    data = clean_payload(payload, PROFILE_FIELDS)
    if "full_name" in data:
        full_name = str(data["full_name"]).strip()
        if not full_name:
            raise HTTPException(400, "姓名不能为空")
        user.full_name = full_name
    if "phone" in data:
        phone = str(data["phone"]).strip()
        if phone:
            valid_phone(phone)
            duplicate = db.query(User).filter(User.phone == phone, User.id != user.id, User.deleted_at.is_(None)).first()
            if duplicate:
                raise HTTPException(400, "该手机号已被其他员工账号使用")
        user.phone = phone or None
    audit(db, user, "account", "update_profile", "user", user.id, {key: value for key, value in data.items()})
    db.commit()
    return user_dict(user)


@router.post("/change-password")
def change_password(request: Request, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if getattr(request.state, "auth_kind", "jwt") != "jwt":
        raise HTTPException(403, "API Key 不能用于修改登录密码")
    if not verify_password(str(payload.get("old_password", "")), user.password_hash):
        raise HTTPException(400, "原密码不正确")
    new_password = str(payload.get("new_password", ""))
    if len(new_password) < 8:
        raise HTTPException(400, "新密码至少 8 位")
    if verify_password(new_password, user.password_hash):
        raise HTTPException(400, "新密码不能与原密码相同")
    user.password_hash = hash_password(new_password)
    audit(db, user, "account", "change_password", "user", user.id)
    db.commit()
    return {"ok": True}
