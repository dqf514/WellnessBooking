import hashlib
import os
import random
import re
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .config import SMS_DEV_CODE, SMS_DEV_MODE
from .log_util import sms_log
from .models import AppSettings, Booking, ClassSession, SmsOtpCode, SmsSendLog, SmsSettings
from .security import hash_otp
from .sms_gateway import send_sms_batch

DEFAULT_BOOKING = "尊敬的{name}，您已预约{course}：{date} {time}，教室{room}，预约编号{id}。如需取消请在开课前操作。"
DEFAULT_CANCEL = "尊敬的{name}，您于{date} {time}的{course}预约（编号{id}）已取消。"
DEFAULT_REMINDER = "尊敬的{name}，提醒您预约的{course}将于{date} {time}开始，教室{room}，请提前到场。"


def get_settings(db: Session) -> SmsSettings:
    row = db.get(SmsSettings, 1)
    if row:
        return row
    row = SmsSettings(id=1, template_booking=DEFAULT_BOOKING, template_cancel=DEFAULT_CANCEL, template_reminder=DEFAULT_REMINDER)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def password_md5(row: SmsSettings) -> str:
    raw = (row.password_md5 or "").strip() or os.environ.get("SMS_XINXINYUN_PASSWORD_MD5", "").strip()
    if re.fullmatch(r"[a-fA-F0-9]{32}", raw):
        return raw.lower()
    return hashlib.md5(raw.encode("utf-8")).hexdigest() if raw else ""


def sp_id(row: SmsSettings) -> str:
    return (row.sp_id or "").strip() or os.environ.get("SMS_XINXINYUN_SP_ID", "").strip()


def _provider_error(result: dict) -> str | None:
    if result.get("failed_data"):
        return "failed_data"
    if result.get("code") is None:
        return "missing_code"
    if str(result.get("code")) != "0":
        return "code_not_zero"
    return None


def deliver(db: Session, *, purpose: str, phone: str, content: str, booking_id: int | None = None) -> dict:
    row = get_settings(db)
    if not row.enabled:
        sms_log(db, purpose=purpose, phone=phone, content=content, status="blocked", reason="sms_disabled", booking_id=booking_id)
        db.commit()
        return {"sent": False, "reason": "sms_disabled"}
    sp = sp_id(row)
    pwd = password_md5(row)
    if not sp or not pwd:
        sms_log(db, purpose=purpose, phone=phone, content=content, status="blocked", reason="sms_not_configured", booking_id=booking_id)
        db.commit()
        return {"sent": False, "reason": "sms_not_configured"}
    try:
        result = send_sms_batch(sp_id=sp, password_md5=pwd, mobiles=phone, content=content, send_url=row.send_url)
        error = _provider_error(result)
        sms_log(db, purpose=purpose, phone=phone, content=content, status="failed" if error else "sent", reason=error or "ok", booking_id=booking_id, provider=result)
        db.commit()
        return {"sent": not error, "reason": error or "ok", "provider": result}
    except Exception as exc:
        sms_log(db, purpose=purpose, phone=phone, content=content, status="failed", reason="exception", booking_id=booking_id, provider={"error": str(exc)})
        db.commit()
        return {"sent": False, "reason": "exception", "error": str(exc)}


def send_otp(db: Session, *, phone: str, purpose: str) -> dict:
    now = datetime.now()
    latest = db.query(SmsOtpCode).filter(SmsOtpCode.phone == phone, SmsOtpCode.purpose == purpose).order_by(SmsOtpCode.id.desc()).first()
    if latest and (now - latest.created_at).total_seconds() < 60:
        wait = max(1, int(60 - (now - latest.created_at).total_seconds()))
        raise HTTPException(429, f"发送过于频繁，请 {wait} 秒后再试")
    code = SMS_DEV_CODE if SMS_DEV_MODE and not get_settings(db).enabled else "".join(random.choice("0123456789") for _ in range(6))
    content = f"{get_settings(db).signature_prefix}验证码：{code}，5分钟内有效。如非本人操作请忽略。"
    result = deliver(db, purpose=purpose, phone=phone, content=content)
    if get_settings(db).enabled and not result["sent"]:
        raise HTTPException(502, "验证码发送失败，请检查短信配置或稍后重试")
    db.query(SmsOtpCode).filter(SmsOtpCode.phone == phone, SmsOtpCode.purpose == purpose, SmsOtpCode.used_at.is_(None)).update({"used_at": now})
    db.add(SmsOtpCode(phone=phone, purpose=purpose, code_hash=hash_otp(code), expires_at=now + timedelta(minutes=5), created_at=now))
    db.commit()
    response = {"ok": True, "message": "验证码已发送" if get_settings(db).enabled else "本地演示验证码已生成", "dev_mode": not get_settings(db).enabled and SMS_DEV_MODE}
    if response["dev_mode"]:
        response["dev_code"] = code
    return response


def verify_otp(db: Session, *, phone: str, purpose: str, code: str) -> None:
    row = db.query(SmsOtpCode).filter(SmsOtpCode.phone == phone, SmsOtpCode.purpose == purpose, SmsOtpCode.used_at.is_(None)).order_by(SmsOtpCode.id.desc()).first()
    if not row or row.expires_at < datetime.now() or row.attempts >= 5:
        raise HTTPException(400, "验证码错误或已过期")
    row.attempts += 1
    if row.code_hash != hash_otp(code.strip()):
        db.commit()
        raise HTTPException(400, "验证码错误或已过期")
    row.used_at = datetime.now()
    db.commit()


def _render(template: str, booking: Booking) -> str:
    session = booking.session
    values = {"name": booking.member.name, "course": session.course.name, "date": session.session_date, "time": session.start_time, "room": session.room.name, "teacher": session.teacher.name, "id": str(booking.id)}

    class SafeDict(dict):
        def __missing__(self, key):
            return ""

    return re.sub(r"\s+", " ", template.format_map(SafeDict(values))).strip()


def notify_booking(db: Session, booking: Booking, cancelled: bool = False, reminder: bool = False) -> dict:
    settings = get_settings(db)
    if cancelled and not settings.notify_cancel:
        return {"sent": False, "reason": "notify_cancel_disabled"}
    if reminder and not settings.notify_reminder:
        return {"sent": False, "reason": "notify_reminder_disabled"}
    if not cancelled and not reminder and not settings.notify_booking:
        return {"sent": False, "reason": "notify_booking_disabled"}
    template = settings.template_cancel if cancelled else settings.template_reminder if reminder else settings.template_booking
    fallback = DEFAULT_CANCEL if cancelled else DEFAULT_REMINDER if reminder else DEFAULT_BOOKING
    template = re.sub(r"^【[^】]*】\s*", "", (template or fallback).strip())
    content = f"{settings.signature_prefix}{_render(template, booking)}"
    return deliver(db, purpose="booking_cancel" if cancelled else "class_reminder" if reminder else "booking_success", phone=booking.member.phone, content=content, booking_id=booking.id)


def send_due_reminders(db: Session) -> int:
    settings = db.get(AppSettings, 1)
    hours = settings.reminder_hours if settings else 24
    now = datetime.now()
    end = now + timedelta(hours=hours)
    rows = db.query(Booking).join(ClassSession).filter(Booking.status == "booked").all()
    sent = 0
    for booking in rows:
        starts = datetime.fromisoformat(f"{booking.session.session_date}T{booking.session.start_time}:00")
        if not now <= starts <= end:
            continue
        exists = db.query(SmsSendLog).filter(SmsSendLog.booking_id == booking.id, SmsSendLog.purpose == "class_reminder", SmsSendLog.status.in_(["sent", "blocked"])).first()
        if exists:
            continue
        result = notify_booking(db, booking, reminder=True)
        if result.get("sent"):
            sent += 1
    return sent
