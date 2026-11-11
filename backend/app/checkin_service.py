import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from .booking_service import transition_booking
from .config import JWT_SECRET
from .log_util import audit
from .membership_service import due_reminders
from .models import Booking, ClassSession, Member, User
from .serializers import booking_dict, member_dict, session_dict
from .utils import session_datetime, today

CHECK_IN_CODE_TTL_SECONDS = 60
CHECK_IN_CODE_REFRESH_SECONDS = 30
CHECK_IN_EARLY_MINUTES = 30
MEMBER_CODE_PREFIX = "YYM1"
SESSION_CODE_PREFIX = "YYS1"


def _base64_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _base64_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _signature(prefix: str, payload: str) -> str:
    key = f"{JWT_SECRET}:check-in:{prefix}".encode("utf-8")
    return _base64_encode(hmac.new(key, payload.encode("ascii"), hashlib.sha256).digest())


def _issue_code(prefix: str, identity: dict) -> dict:
    expires_at = int(time.time()) + CHECK_IN_CODE_TTL_SECONDS
    payload = _base64_encode(json.dumps({**identity, "exp": expires_at, "nonce": secrets.token_urlsafe(8)}, separators=(",", ":")).encode("utf-8"))
    return {
        "token": f"{prefix}.{payload}.{_signature(prefix, payload)}",
        "expires_at": expires_at,
        "expires_in": CHECK_IN_CODE_TTL_SECONDS,
        "refresh_after": CHECK_IN_CODE_REFRESH_SECONDS,
    }


def _read_code(token: str, prefix: str) -> dict:
    try:
        actual_prefix, payload, signature = token.strip().split(".")
        if actual_prefix != prefix or not hmac.compare_digest(signature, _signature(prefix, payload)):
            raise ValueError
        data = json.loads(_base64_decode(payload))
        if not isinstance(data.get("exp"), int) or not isinstance(data.get("nonce"), str):
            raise ValueError
    except (ValueError, TypeError, json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(400, "签到码无效，请扫描系统内生成的最新二维码") from None
    if data["exp"] < int(time.time()):
        raise HTTPException(400, "签到码已过期，请刷新二维码后重试")
    return data


def issue_member_check_in_code(member: Member) -> dict:
    return _issue_code(MEMBER_CODE_PREFIX, {"mid": member.id})


def issue_session_check_in_code(session: ClassSession) -> dict:
    assert_check_in_window(session)
    return {**_issue_code(SESSION_CODE_PREFIX, {"sid": session.id}), "session": session_dict(session)}


def check_in_window(session: ClassSession) -> tuple[datetime, datetime]:
    return (
        session_datetime(session.session_date, session.start_time) - timedelta(minutes=CHECK_IN_EARLY_MINUTES),
        session_datetime(session.session_date, session.end_time),
    )


def check_in_window_open(session: ClassSession) -> bool:
    if session.deleted_at is not None or session.status != "scheduled":
        return False
    opens_at, closes_at = check_in_window(session)
    return opens_at <= datetime.now() <= closes_at


def assert_check_in_window(session: ClassSession) -> None:
    if session.deleted_at is not None or session.status != "scheduled":
        raise HTTPException(400, "课程已取消，无法扫码签到")
    opens_at, closes_at = check_in_window(session)
    now = datetime.now()
    if now < opens_at:
        raise HTTPException(400, f"签到将于 {opens_at.strftime('%H:%M')} 开放，请在开课前 30 分钟内扫码")
    if now > closes_at:
        raise HTTPException(400, "课程已结束，扫码签到已关闭，请联系前台处理")


def _complete_check_in(db: Session, booking: Booking, *, method: str, actor: User | None) -> dict:
    assert_check_in_window(booking.session)
    already_checked_in = booking.status in {"checked_in", "completed"}
    if not already_checked_in:
        if booking.status != "booked":
            raise HTTPException(400, "当前预约状态不可签到")
        transition_booking(db, booking, "check_in", actor.username if actor else f"member:{booking.member_id}")
        audit(db, actor, "booking", "qr_check_in", "booking", booking.id, {"member_id": booking.member_id, "session_id": booking.session_id, "method": method})
    reminders = due_reminders(db, booking.member) if actor else []
    db.commit()
    return {**booking_dict(booking), "already_checked_in": already_checked_in, "check_in_method": method, "member_reminders": reminders}


def scan_member_code(db: Session, token: str, actor: User, session_id: int | None = None) -> dict:
    data = _read_code(token, MEMBER_CODE_PREFIX)
    member = db.get(Member, data.get("mid", 0))
    if not member or not member.active or member.deleted_at is not None:
        raise HTTPException(404, "会员不存在或已停用")
    rows = db.query(Booking).join(ClassSession).options(
        joinedload(Booking.session).joinedload(ClassSession.course),
        joinedload(Booking.session).joinedload(ClassSession.teacher),
        joinedload(Booking.session).joinedload(ClassSession.room),
        joinedload(Booking.member),
    ).filter(
        Booking.member_id == member.id,
        Booking.deleted_at.is_(None),
        Booking.status.in_(["booked", "checked_in", "completed"]),
        ClassSession.session_date == today(),
        ClassSession.deleted_at.is_(None),
        ClassSession.status == "scheduled",
    ).order_by(ClassSession.start_time, Booking.id).all()
    eligible = [booking for booking in rows if check_in_window_open(booking.session)]
    if session_id is not None:
        booking = next((item for item in eligible if item.session_id == session_id), None)
        if not booking:
            raise HTTPException(404, "该会员没有此课程的可签到预约")
        return _complete_check_in(db, booking, method="member_code", actor=actor)
    pending = [booking for booking in eligible if booking.status == "booked"]
    if len(pending) > 1:
        return {"requires_selection": True, "member": member_dict(member), "choices": [booking_dict(booking) for booking in pending]}
    if pending:
        return _complete_check_in(db, pending[0], method="member_code", actor=actor)
    completed = [booking for booking in eligible if booking.status in {"checked_in", "completed"}]
    if completed:
        latest = max(completed, key=lambda booking: booking.checked_in_at or booking.booked_at)
        return _complete_check_in(db, latest, method="member_code", actor=actor)
    raise HTTPException(400, "未找到当前时段的可签到预约，请核对课程时间或到预约名单处理")


def scan_session_code(db: Session, token: str, member: Member) -> dict:
    data = _read_code(token, SESSION_CODE_PREFIX)
    session = db.get(ClassSession, data.get("sid", 0))
    if not session or session.deleted_at is not None:
        raise HTTPException(404, "课程不存在")
    booking = db.query(Booking).filter(
        Booking.session_id == session.id,
        Booking.member_id == member.id,
        Booking.deleted_at.is_(None),
        Booking.status.in_(["booked", "checked_in", "completed"]),
    ).order_by(Booking.id).first()
    if not booking:
        raise HTTPException(400, "您没有该课程的可签到预约，请先预约或联系前台")
    return _complete_check_in(db, booking, method="session_code", actor=None)
