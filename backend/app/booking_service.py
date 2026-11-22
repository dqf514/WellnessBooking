import json
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import case, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .membership_service import find_available_voucher
from .models import AppSettings, Booking, ClassSession, ExperienceVoucher, Member, MemberCard, MemberCardShare, Transaction
from .utils import add_days, json_loads, session_datetime, today

ACTIVE_BOOKING_STATUSES = {"booked", "checked_in", "completed", "no_show"}


def active_booking_count(session: ClassSession) -> int:
    return sum(1 for item in session.bookings if item.status in ACTIVE_BOOKING_STATUSES and item.deleted_at is None)


def _card_quantity_for(card: MemberCard, course_type: str) -> int | None:
    benefits = json_loads(card.benefits_json, [])
    for benefit in benefits:
        if benefit.get("course_type") in {course_type, "all"}:
            return int(benefit.get("remaining", benefit.get("quantity", 0)))
    if card.product.category in {course_type, "all"}:
        return card.remaining_sessions
    return -1


def _card_usable(card: MemberCard, course_type: str, on_date: str) -> bool:
    if card.deleted_at is not None or card.status != "active":
        return False
    if not card.start_pending and (card.expires_on < on_date or card.starts_on > on_date):
        # 开卡日期待定的卡没有有效期，等首次签到时自动开卡，期间照常可用。
        return False
    if card.frozen_until and card.frozen_until >= on_date:
        # 请假 / 停卡只在冻结区间内停用权益：冻结开始日之前、结束日之后照常可用。
        if not card.frozen_from or card.frozen_from <= on_date:
            return False
    quantity = _card_quantity_for(card, course_type)
    return quantity is None or quantity > 0


def find_available_card(db: Session, member: Member, course_type: str, on_date: str) -> MemberCard | None:
    filters = [MemberCard.status == "active", or_(MemberCard.start_pending.is_(True), MemberCard.expires_on >= on_date), MemberCard.deleted_at.is_(None)]
    own = db.query(MemberCard).filter(MemberCard.member_id == member.id, *filters).all()
    shared = db.query(MemberCard).join(MemberCardShare, MemberCardShare.card_id == MemberCard.id).filter(MemberCardShare.member_id == member.id, MemberCardShare.deleted_at.is_(None), *filters).all()
    # 已开卡的卡优先使用，开卡日期待定的卡排到最后，避免提前把待定卡打开。
    for card in sorted({card.id: card for card in [*own, *shared]}.values(), key=lambda item: (bool(item.start_pending), item.expires_on, item.id)):
        if _card_usable(card, course_type, on_date):
            return card
    return None


def has_available_entitlement(db: Session, member: Member, course_type: str, on_date: str) -> bool:
    return bool(find_available_card(db, member, course_type, on_date) or find_available_voucher(db, member, course_type, on_date))


def create_booking(db: Session, *, session: ClassSession, member: Member, source: str, public: bool = False) -> Booking:
    if not member.active or member.deleted_at is not None:
        raise HTTPException(400, "会员账号已停用，请联系前台")
    if session.deleted_at is not None or session.status != "scheduled":
        raise HTTPException(400, "该课程已取消，无法预约")
    if not session.course.active or not session.teacher.active or not session.room.active or session.course.deleted_at or session.teacher.deleted_at or session.room.deleted_at:
        raise HTTPException(400, "课程、教练或教室已停用")
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
    duplicate = db.query(Booking).filter(Booking.session_id == session.id, Booking.member_id == member.id, Booking.status.in_(ACTIVE_BOOKING_STATUSES), Booking.deleted_at.is_(None)).first()
    if duplicate:
        raise HTTPException(400, "该会员已预约此课程")
    if session.reserved_count >= session.capacity:
        raise HTTPException(400, "课程已约满")
    if public and session.course.price > 0 and not has_available_entitlement(db, member, session.course.course_type, session.session_date):
        raise HTTPException(400, "暂无可用会员卡或体验券，请先购卡或联系前台")
    booking = Booking(session_id=session.id, member_id=member.id, source=source)
    try:
        with db.begin_nested():
            claimed = db.query(ClassSession).filter(ClassSession.id == session.id, ClassSession.status == "scheduled", ClassSession.reserved_count < ClassSession.capacity).update({ClassSession.reserved_count: ClassSession.reserved_count + 1}, synchronize_session=False)
            if claimed != 1:
                raise HTTPException(400, "课程已约满")
            db.add(booking)
            db.flush()
    except IntegrityError as exc:
        raise HTTPException(400, "该会员已预约此课程") from exc
    db.refresh(session)
    return booking


def _consume(db: Session, card: MemberCard, course_type: str) -> None:
    benefits = json_loads(card.benefits_json, [])
    remaining_sessions = card.remaining_sessions
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
        if remaining_sessions is not None:
            if remaining_sessions <= 0:
                raise HTTPException(400, "会员卡剩余次数不足")
            remaining_sessions -= 1
    expected_version = card.version or 0
    updated = db.query(MemberCard).filter(MemberCard.id == card.id, or_(MemberCard.version == expected_version, MemberCard.version.is_(None))).update({"remaining_sessions": remaining_sessions, "benefits_json": json.dumps(benefits, ensure_ascii=False), "version": expected_version + 1}, synchronize_session=False)
    if updated != 1:
        raise HTTPException(409, "会员卡权益刚刚发生变更，请刷新后重试")
    card.remaining_sessions = remaining_sessions
    card.benefits_json = json.dumps(benefits, ensure_ascii=False)
    card.version = expected_version + 1


def _restore(db: Session, card: MemberCard, course_type: str) -> None:
    benefits = json_loads(card.benefits_json, [])
    remaining_sessions = card.remaining_sessions
    changed = False
    for benefit in benefits:
        if benefit.get("course_type") in {course_type, "all"}:
            quantity = int(benefit.get("quantity", 0))
            benefit["remaining"] = min(quantity, int(benefit.get("remaining", 0)) + 1)
            changed = True
            break
    if not changed and remaining_sessions is not None:
        remaining_sessions = min(card.total_sessions, remaining_sessions + 1) if card.total_sessions is not None else remaining_sessions + 1
    expected_version = card.version or 0
    updated = db.query(MemberCard).filter(MemberCard.id == card.id, or_(MemberCard.version == expected_version, MemberCard.version.is_(None))).update({"remaining_sessions": remaining_sessions, "benefits_json": json.dumps(benefits, ensure_ascii=False), "version": expected_version + 1}, synchronize_session=False)
    if updated != 1:
        raise HTTPException(409, "会员卡权益刚刚发生变更，请刷新后重试")
    card.remaining_sessions = remaining_sessions
    card.benefits_json = json.dumps(benefits, ensure_ascii=False)
    card.version = expected_version + 1


def _consume_voucher(db: Session, voucher: ExperienceVoucher) -> None:
    voucher_version = voucher.version or 0
    updated = db.query(ExperienceVoucher).filter(ExperienceVoucher.id == voucher.id, or_(ExperienceVoucher.version == voucher_version, ExperienceVoucher.version.is_(None)), ExperienceVoucher.remaining_sessions > 0).update({"remaining_sessions": ExperienceVoucher.remaining_sessions - 1, "version": voucher_version + 1}, synchronize_session=False)
    if updated != 1:
        raise HTTPException(409, "体验券刚刚发生变更，请刷新后重试")
    voucher.remaining_sessions -= 1
    voucher.version = voucher_version + 1


def _restore_voucher(db: Session, voucher: ExperienceVoucher) -> None:
    voucher_version = voucher.version or 0
    updated = db.query(ExperienceVoucher).filter(ExperienceVoucher.id == voucher.id, or_(ExperienceVoucher.version == voucher_version, ExperienceVoucher.version.is_(None))).update({"remaining_sessions": func.min(ExperienceVoucher.total_sessions, ExperienceVoucher.remaining_sessions + 1), "version": voucher_version + 1}, synchronize_session=False)
    if updated != 1:
        raise HTTPException(409, "体验券刚刚发生变更，请刷新后重试")
    voucher.remaining_sessions = min(voucher.total_sessions, voucher.remaining_sessions + 1)
    voucher.version = voucher_version + 1


def _open_pending_card(db: Session, card: MemberCard, on_date: str, booking: Booking) -> None:
    """开卡日期待定的卡在首次签到时自动开卡：起始日为签到当天，有效期按产品天数顺延。"""
    validity = max(1, card.product.validity_days if card.product else 365)
    card.starts_on = on_date
    card.expires_on = add_days(on_date, validity)
    card.start_pending = False
    card.opened_booking_id = booking.id
    transaction = db.query(Transaction).filter(Transaction.member_card_id == card.id, Transaction.kind == "purchase", Transaction.deleted_at.is_(None)).first()
    if transaction and transaction.revenue_mode == "amortized":
        transaction.revenue_start_on = on_date
        transaction.revenue_days = validity


def _revert_pending_card(db: Session, card: MemberCard, booking: Booking) -> None:
    """撤销签到时，如果这张卡是本次签到才开出来的，则退回“开卡日期待定”。"""
    if not card.opened_booking_id or card.opened_booking_id != booking.id:
        return
    card.starts_on = ""
    card.expires_on = ""
    card.start_pending = True
    card.opened_booking_id = 0
    transaction = db.query(Transaction).filter(Transaction.member_card_id == card.id, Transaction.kind == "purchase", Transaction.deleted_at.is_(None)).first()
    if transaction and transaction.revenue_mode == "amortized":
        transaction.revenue_start_on = ""


def consume_booking(db: Session, booking: Booking) -> None:
    if booking.consumed:
        return
    course_type = booking.session.course.course_type
    on_date = booking.session.session_date
    card = db.get(MemberCard, booking.member_card_id) if booking.member_card_id else None
    if not card or not _card_usable(card, course_type, on_date):
        card = find_available_card(db, booking.member, course_type, on_date)
    if card:
        if card.start_pending:
            _open_pending_card(db, card, on_date, booking)
        elif card.starts_on > on_date:
            previous_start = card.starts_on
            card.starts_on = on_date
            days = (datetime.fromisoformat(previous_start) - datetime.fromisoformat(on_date)).days
            card.expires_on = add_days(card.expires_on, -days)
        _consume(db, card, course_type)
        booking.member_card_id = card.id
    else:
        voucher = db.get(ExperienceVoucher, booking.experience_voucher_id) if booking.experience_voucher_id else find_available_voucher(db, booking.member, course_type, on_date)
        if not voucher or voucher.status != "active" or voucher.expires_on < on_date or voucher.course_type not in {course_type, "all"}:
            raise HTTPException(400, "会员无可用卡、体验券或对应权益不足，请先购卡/续卡")
        _consume_voucher(db, voucher)
        booking.experience_voucher_id = voucher.id
    booking.consumed = True


def restore_consumption(db: Session, booking: Booking) -> None:
    if not booking.consumed:
        return
    if booking.member_card:
        _restore(db, booking.member_card, booking.session.course.course_type)
        _revert_pending_card(db, booking.member_card, booking)
    if booking.experience_voucher:
        _restore_voucher(db, booking.experience_voucher)
    booking.consumed = False


def _release_session_slot(db: Session, booking: Booking) -> None:
    db.query(ClassSession).filter(ClassSession.id == booking.session_id).update({ClassSession.reserved_count: case((ClassSession.reserved_count > 0, ClassSession.reserved_count - 1), else_=0)}, synchronize_session=False)
    # 重新读取以同步 ORM 实例；此处不能再自行减一，否则会与上面的 UPDATE 重复扣减导致超卖。
    db.refresh(booking.session)


def transition_booking(db: Session, booking: Booking, action: str, actor_name: str) -> Booking:
    if booking.deleted_at is not None:
        raise HTTPException(400, "该预约已移入回收站，请先由管理员恢复")
    if action == "check_in":
        if booking.status != "booked":
            raise HTTPException(400, "仅待签到预约可签到")
        consume_booking(db, booking)
        booking.status = "completed"
        booking.checked_in_at = datetime.now()
        booking.completed_at = booking.checked_in_at
    elif action == "undo_check_in":
        if booking.status not in {"checked_in", "completed"}:
            raise HTTPException(400, "当前状态不可取消签到")
        restore_consumption(db, booking)
        booking.status = "booked"
        booking.checked_in_at = None
        booking.completed_at = None
    elif action == "complete":
        if booking.status not in {"booked", "checked_in"}:
            raise HTTPException(400, "当前状态不可完成")
        consume_booking(db, booking)
        booking.status = "completed"
        booking.completed_at = datetime.now()
    elif action == "cancel":
        if booking.status in {"cancelled", "no_show"}:
            raise HTTPException(400, "当前状态不可取消")
        restore_consumption(db, booking)
        booking.status = "cancelled"
        booking.cancelled_at = datetime.now()
        booking.cancelled_by = actor_name
        _release_session_slot(db, booking)
    elif action == "no_show":
        if booking.status != "booked":
            raise HTTPException(400, "仅未签到预约可标记爽约")
        booking.status = "no_show"
        settings = db.get(AppSettings, 1)
        days = settings.no_show_block_days if settings else 7
        booking.member.no_show_blocked_until = add_days(today(), days)
    else:
        raise HTTPException(400, "不支持的预约操作")
    if action in {"undo_check_in", "cancel"}:
        from .finance_service import reverse_booking_revenue

        reverse_booking_revenue(db, booking, actor_name)
    db.flush()
    return booking


def reconcile_booking_inventory(db: Session) -> None:
    duplicates = db.query(Booking.session_id, Booking.member_id).filter(Booking.status.in_(ACTIVE_BOOKING_STATUSES), Booking.deleted_at.is_(None)).group_by(Booking.session_id, Booking.member_id).having(func.count(Booking.id) > 1).all()
    for session_id, member_id in duplicates:
        rows = db.query(Booking).filter(Booking.session_id == session_id, Booking.member_id == member_id, Booking.status.in_(ACTIVE_BOOKING_STATUSES), Booking.deleted_at.is_(None)).order_by(Booking.id).all()
        for booking in rows[1:]:
            restore_consumption(db, booking)
            booking.status = "cancelled"
            booking.cancelled_at = datetime.now()
            booking.cancelled_by = "系统清理重复预约"
    for session in db.query(ClassSession).all():
        session.reserved_count = active_booking_count(session)
    db.commit()
