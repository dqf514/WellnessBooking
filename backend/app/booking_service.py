from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .models import AppSettings, Booking, ClassSession, Member, MemberCard
from .utils import add_days, json_loads, session_datetime, today

ACTIVE_BOOKING_STATUSES = {"booked", "checked_in", "completed", "no_show"}


def active_booking_count(session: ClassSession) -> int:
    return sum(1 for item in session.bookings if item.status in ACTIVE_BOOKING_STATUSES)


def _card_quantity_for(card: MemberCard, course_type: str) -> int | None:
    benefits = json_loads(card.benefits_json, [])
    for benefit in benefits:
        if benefit.get("course_type") in {course_type, "all"}:
            remaining = int(benefit.get("remaining", benefit.get("quantity", 0)))
            return remaining
    if card.product.category in {course_type, "all"}:
        return card.remaining_sessions
    return -1


def find_available_card(db: Session, member: Member, course_type: str, on_date: str) -> MemberCard | None:
    cards = db.query(MemberCard).filter(MemberCard.member_id == member.id, MemberCard.status == "active", MemberCard.expires_on >= on_date).order_by(MemberCard.expires_on.asc(), MemberCard.id.asc()).all()
    for card in cards:
        if card.frozen_until and card.frozen_until >= on_date:
            continue
        quantity = _card_quantity_for(card, course_type)
        if quantity is None or quantity > 0:
            return card
    return None


def create_booking(db: Session, *, session: ClassSession, member: Member, source: str, public: bool = False) -> Booking:
    if session.status != "scheduled":
        raise HTTPException(400, "该课程已取消，无法预约")
    starts = session_datetime(session.session_date, session.start_time)
    if starts <= datetime.now():
        raise HTTPException(400, "课程已开始，无法预约")
    if public:
        settings = db.get(AppSettings, 1)
        cutoff = settings.booking_cutoff_minutes if settings else 120
        if starts <= datetime.now() + timedelta(minutes=cutoff):
            raise HTTPException(400, f"开课前 {cutoff // 60} 小时内请联前台预约")
        if member.no_show_blocked_until and member.no_show_blocked_until >= today():
            raise HTTPException(400, f"爽约限制至 {member.no_show_blocked_until}，请联系前台")
    duplicate = db.query(Booking).filter(Booking.session_id == session.id, Booking.member_id == member.id, Booking.status.in_(ACTIVE_BOOKING_STATUSES)).first()
    if duplicate:
        raise HTTPException(400, "该会员已预约此课程")
    if active_booking_count(session) >= session.capacity:
        raise HTTPException(400, "课程已约满")
    if public and session.course.price > 0 and not find_available_card(db, member, session.course.course_type, session.session_date):
        raise HTTPException(400, "暂无可用会员卡，请先购卡或联系前台")
    booking = Booking(session_id=session.id, member_id=member.id, source=source)
    db.add(booking)
    db.flush()
    return booking


def _consume(card: MemberCard, course_type: str) -> None:
    benefits = json_loads(card.benefits_json, [])
    changed = False
    for benefit in benefits:
        if benefit.get("course_type") in {course_type, "all"}:
            remaining = int(benefit.get("remaining", benefit.get("quantity", 0)))
            if remaining <= 0:
                raise HTTPException(400, "会员卡对应权益次数不足")
            benefit["remaining"] = remaining - 1
            changed = True
            break
    if not changed:
        if card.product.category not in {course_type, "all"}:
            raise HTTPException(400, "会员卡不适用于该课程")
        if card.remaining_sessions is not None:
            if card.remaining_sessions <= 0:
                raise HTTPException(400, "会员卡剩余次数不足")
            card.remaining_sessions -= 1
    import json
    card.benefits_json = json.dumps(benefits, ensure_ascii=False)


def _restore(card: MemberCard, course_type: str) -> None:
    benefits = json_loads(card.benefits_json, [])
    changed = False
    for benefit in benefits:
        if benefit.get("course_type") in {course_type, "all"}:
            benefit["remaining"] = int(benefit.get("remaining", 0)) + 1
            changed = True
            break
    if not changed and card.remaining_sessions is not None:
        card.remaining_sessions += 1
    import json
    card.benefits_json = json.dumps(benefits, ensure_ascii=False)


def consume_booking(db: Session, booking: Booking) -> None:
    if booking.consumed:
        return
    course_type = booking.session.course.course_type
    on_date = booking.session.session_date
    card = db.get(MemberCard, booking.member_card_id) if booking.member_card_id else None
    if not card or card.status != "active":
        card = find_available_card(db, booking.member, course_type, on_date)
    if not card:
        raise HTTPException(400, "会员无可用卡或对应权益不足，请先购卡/续卡")
    if not card.starts_on or card.starts_on > on_date:
        card.starts_on = on_date
    _consume(card, course_type)
    booking.member_card_id = card.id
    booking.consumed = True


def transition_booking(db: Session, booking: Booking, action: str, actor_name: str) -> Booking:
    if action == "check_in":
        if booking.status != "booked":
            raise HTTPException(400, "仅待签到预约可签到")
        consume_booking(db, booking)
        booking.status = "checked_in"
        booking.checked_in_at = datetime.now()
    elif action == "undo_check_in":
        if booking.status != "checked_in":
            raise HTTPException(400, "当前状态不可取消签到")
        if booking.member_card and booking.consumed:
            _restore(booking.member_card, booking.session.course.course_type)
        booking.consumed = False
        booking.status = "booked"
        booking.checked_in_at = None
    elif action == "complete":
        if booking.status not in {"booked", "checked_in"}:
            raise HTTPException(400, "当前状态不可完成")
        consume_booking(db, booking)
        booking.status = "completed"
        booking.completed_at = datetime.now()
    elif action == "cancel":
        if booking.status in {"cancelled", "completed", "no_show"}:
            raise HTTPException(400, "当前状态不可取消")
        if booking.member_card and booking.consumed:
            _restore(booking.member_card, booking.session.course.course_type)
        booking.consumed = False
        booking.status = "cancelled"
        booking.cancelled_at = datetime.now()
        booking.cancelled_by = actor_name
    elif action == "no_show":
        if booking.status != "booked":
            raise HTTPException(400, "仅未签到预约可标记爽约")
        booking.status = "no_show"
        settings = db.get(AppSettings, 1)
        days = settings.no_show_block_days if settings else 7
        booking.member.no_show_blocked_until = add_days(today(), days)
    else:
        raise HTTPException(400, "不支持的预约操作")
    db.flush()
    return booking
