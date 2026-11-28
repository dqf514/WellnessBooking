import json
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import case, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .membership_service import find_available_voucher
from .models import AppSettings, Booking, CardProduct, ClassSession, Course, ExperienceVoucher, Member, MemberCard, MemberCardShare, Transaction
from .utils import add_days, json_loads, session_datetime, today

ACTIVE_BOOKING_STATUSES = {"booked", "checked_in", "completed", "no_show"}

# 健康评估也是一种课程：名称里带「健康评估 / 体测 / Assessment」的产品或课程都按评估类别处理，
# 这样前台把评估类产品归到团课或私教类别时，评估课照样可以消课。
ASSESSMENT_KEYWORDS = ("健康评估", "体测", "assessment", "wellness assessment")
CATEGORY_LABELS = {"group": "团课", "private": "私教", "assessment": "评估", "workshop": "工作坊", "training": "培训课", "enterprise": "企业课", "all": "全部课程"}


def active_booking_count(session: ClassSession) -> int:
    return sum(1 for item in session.bookings if item.status in ACTIVE_BOOKING_STATUSES and item.deleted_at is None)


def looks_like_assessment(*texts: str) -> bool:
    joined = " ".join(str(text) for text in texts if text).lower()
    return any(keyword.lower() in joined for keyword in ASSESSMENT_KEYWORDS)


def product_categories(product: CardProduct | None) -> set[str]:
    """卡产品能用于哪些课程类别：产品自身类别 + 按名称识别出的评估类。"""
    if not product:
        return set()
    categories = {product.category} if product.category else set()
    if looks_like_assessment(product.name, product.name_en):
        categories.add("assessment")
    return categories


def session_categories(course: Course) -> list[str]:
    """本节课可消耗的课程类别（按优先级）。团课形式的健康评估优先用评估卡，其次才用团课卡。"""
    if course.course_type == "group" and looks_like_assessment(course.name, course.name_en):
        return ["assessment", "group"]
    return [course.course_type]


def _benefit_type_for(card: MemberCard, categories: list[str]) -> str:
    """本次要扣的分项权益类别；没有匹配的分项权益时返回空串（扣卡的总次数）。"""
    benefits = json_loads(card.benefits_json, [])
    best = ""
    best_rank = len(categories) + 1
    for benefit in benefits:
        benefit_type = str(benefit.get("course_type", ""))
        if not benefit_type:
            continue
        if benefit_type in categories:
            rank = categories.index(benefit_type)
        elif benefit_type == "all":
            rank = len(categories)
        else:
            rank = len(categories) + 1
        if rank < best_rank:
            best_rank = rank
            best = benefit_type
    return best


def _card_quantity_for(card: MemberCard, categories: list[str]) -> int | None:
    benefits = json_loads(card.benefits_json, [])
    benefit_type = _benefit_type_for(card, categories)
    if benefit_type:
        for benefit in benefits:
            if benefit.get("course_type") == benefit_type:
                return int(benefit.get("remaining", benefit.get("quantity", 0)))
    if product_categories(card.product) & set(categories):
        return card.remaining_sessions
    return -1


def _card_usable(card: MemberCard, categories: list[str], on_date: str) -> bool:
    if card.deleted_at is not None or card.status != "active":
        return False
    if not card.start_pending:
        # 起止日期留空表示没有设置有效期，不按过期处理；开卡日期待定的卡等首次签到时自动开卡。
        if card.expires_on and card.expires_on < on_date:
            return False
        if card.starts_on and card.starts_on > on_date:
            return False
    if card.frozen_until and card.frozen_until >= on_date:
        # 请假 / 停卡只在冻结区间内停用权益：冻结开始日之前、结束日之后照常可用。
        if not card.frozen_from or card.frozen_from <= on_date:
            return False
    quantity = _card_quantity_for(card, categories)
    return quantity is None or quantity > 0


def _category_rank(card: MemberCard, categories: list[str]) -> int:
    """卡与本节课的贴合度：数字越小越优先用于消课。"""
    own = product_categories(card.product)
    for index, category in enumerate(categories):
        if category in own:
            return index
    benefits = json_loads(card.benefits_json, [])
    for index, category in enumerate(categories):
        for benefit in benefits:
            if benefit.get("course_type") in {category, "all"}:
                return index
    return len(categories)


def find_available_card(db: Session, member: Member, categories: list[str], on_date: str) -> MemberCard | None:
    filters = [MemberCard.status == "active", or_(MemberCard.start_pending.is_(True), MemberCard.expires_on == "", MemberCard.expires_on >= on_date), MemberCard.deleted_at.is_(None)]
    own = db.query(MemberCard).filter(MemberCard.member_id == member.id, *filters).all()
    shared = db.query(MemberCard).join(MemberCardShare, MemberCardShare.card_id == MemberCard.id).filter(MemberCardShare.member_id == member.id, MemberCardShare.deleted_at.is_(None), *filters).all()
    # 已开卡的卡优先使用，开卡日期待定的卡排到最后，避免提前把待定卡打开；类别越贴合本节课的越优先。
    ordered = sorted({card.id: card for card in [*own, *shared]}.values(), key=lambda item: (bool(item.start_pending), _category_rank(item, categories), item.expires_on or "9999-12-31", item.id))
    for card in ordered:
        if _card_usable(card, categories, on_date):
            return card
    return None


def has_available_entitlement(db: Session, member: Member, categories: list[str], on_date: str) -> bool:
    return bool(find_available_card(db, member, categories, on_date) or find_available_voucher(db, member, categories, on_date))


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
    if public and session.course.price > 0 and not has_available_entitlement(db, member, session_categories(session.course), session.session_date):
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


def _consume(db: Session, card: MemberCard, categories: list[str], benefit_type: str = "") -> None:
    benefits = json_loads(card.benefits_json, [])
    remaining_sessions = card.remaining_sessions
    changed = False
    if benefit_type:
        for benefit in benefits:
            if benefit.get("course_type") == benefit_type:
                remaining = int(benefit.get("remaining", benefit.get("quantity", 0)))
                if remaining <= 0:
                    raise HTTPException(400, "会员卡对应权益次数不足")
                benefit["remaining"] = remaining - 1
                changed = True
                break
    if not changed:
        if not (product_categories(card.product) & set(categories)):
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


def _restore(db: Session, card: MemberCard, categories: list[str], benefit_type: str = "", plain: bool = False) -> None:
    benefits = json_loads(card.benefits_json, [])
    remaining_sessions = card.remaining_sessions
    changed = False
    if not plain:
        target = benefit_type or _benefit_type_for(card, categories)
        for benefit in benefits:
            if target and benefit.get("course_type") == target:
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


def _card_reject_reason(card: MemberCard, categories: list[str], on_date: str) -> str:
    """这张卡为什么不能用于本节课；返回空串表示卡本身没有问题。"""
    if card.status != "active":
        return "已停用"
    if not card.start_pending:
        if card.expires_on and card.expires_on < on_date:
            return f"已于 {card.expires_on} 到期"
        if card.starts_on and card.starts_on > on_date:
            return f"{card.starts_on} 才生效"
    if card.frozen_until and card.frozen_until >= on_date and (not card.frozen_from or card.frozen_from <= on_date):
        return "停卡冻结中"
    quantity = _card_quantity_for(card, categories)
    if quantity == -1:
        category = card.product.category if card.product else ""
        return f"卡类别「{CATEGORY_LABELS.get(category, category or '未知')}」不适用于本节课"
    if quantity is not None and quantity <= 0:
        return "剩余次数不足"
    return ""


def _no_entitlement_hint(db: Session, member: Member, categories: list[str], on_date: str) -> str:
    """消课失败时给出可执行的提示：列出会员现有卡以及被拒原因。"""
    text = "会员无可用卡、体验券或对应权益不足，请先购卡/续卡"
    hints = []
    cards = db.query(MemberCard).filter(MemberCard.member_id == member.id, MemberCard.deleted_at.is_(None)).order_by(MemberCard.id).all()
    for card in cards:
        reason = _card_reject_reason(card, categories, on_date)
        if reason:
            name = card.product.name if card.product else "会员卡"
            hints.append(f"{name}（{reason}）")
    if hints:
        text += f"。会员现有卡：{'；'.join(hints[:4])}"
    return text


def consume_booking(db: Session, booking: Booking) -> None:
    if booking.consumed:
        return
    categories = session_categories(booking.session.course)
    on_date = booking.session.session_date
    card = db.get(MemberCard, booking.member_card_id) if booking.member_card_id else None
    if not card or not _card_usable(card, categories, on_date):
        card = find_available_card(db, booking.member, categories, on_date)
    if card:
        if card.start_pending:
            _open_pending_card(db, card, on_date, booking)
        elif card.starts_on and card.starts_on > on_date:
            previous_start = card.starts_on
            card.starts_on = on_date
            days = (datetime.fromisoformat(previous_start) - datetime.fromisoformat(on_date)).days
            card.expires_on = add_days(card.expires_on, -days)
        benefit_type = _benefit_type_for(card, categories)
        _consume(db, card, categories, benefit_type)
        booking.member_card_id = card.id
        booking.consumed_type = f"benefit:{benefit_type}" if benefit_type else "card"
    else:
        voucher = db.get(ExperienceVoucher, booking.experience_voucher_id) if booking.experience_voucher_id else find_available_voucher(db, booking.member, categories, on_date)
        if not voucher or voucher.status != "active" or voucher.expires_on < on_date or voucher.course_type not in set(categories) | {"all"}:
            raise HTTPException(400, _no_entitlement_hint(db, booking.member, categories, on_date))
        _consume_voucher(db, voucher)
        booking.experience_voucher_id = voucher.id
        booking.consumed_type = "voucher"
    booking.consumed = True


def restore_consumption(db: Session, booking: Booking) -> None:
    if not booking.consumed:
        return
    categories = session_categories(booking.session.course)
    consumed_type = booking.consumed_type or ""
    if booking.member_card:
        if consumed_type.startswith("benefit:"):
            _restore(db, booking.member_card, categories, consumed_type[len("benefit:"):])
        elif consumed_type == "card":
            _restore(db, booking.member_card, categories, plain=True)
        else:
            _restore(db, booking.member_card, categories)
        _revert_pending_card(db, booking.member_card, booking)
    if booking.experience_voucher:
        _restore_voucher(db, booking.experience_voucher)
    booking.consumed = False
    booking.consumed_type = ""


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
