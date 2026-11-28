import json
import re
from datetime import datetime

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from ..card_service import issue_card
from ..card_state import card_status_condition
from ..database import get_db
from ..deps import require_cards_write, require_catalog_view, require_dashboard, require_members_view, require_members_write, require_records_write, require_revenue
from ..export_service import CATEGORY_SORT_ORDER
from ..finance_service import CATEGORY_ALIASES, PRODUCT_GROUP_ORDER, recognized_revenue
from ..log_util import audit
from ..membership_service import MEMBER_SOURCE_OPTIONS, due_reminders, normalize_member_source, reminder_dict, voucher_dict
from ..models import Booking, CardProduct, ClassSession, Course, ExperienceVoucher, Member, MemberCard, MemberCardShare, MemberRecord, MemberReminder, Room, Teacher, Transaction, User
from ..permissions import has_capability
from ..serializers import booking_dict, card_dict, course_dict, member_dict, product_dict, profile_booking_dict, room_dict, session_dict, teacher_dict, transaction_dict, user_dict
from ..upload_service import image_size, remove_upload, save_image
from ..utils import add_days, as_bool, as_float, as_int, clean_payload, today, valid_benefits, valid_date, valid_phone

router = APIRouter(prefix="/api/admin", tags=["admin-core"])
MEMBER_FIELDS = {"name", "name_en", "phone", "gender", "id_number", "birth_date", "source", "advisor_id", "emergency_phone", "wechat", "email", "notes", "active"}
# 邮件地址只做基本格式校验，不做域名可达性检查。
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _clean_email(value) -> str:
    """去掉首尾空格并校验邮件地址格式，格式不对时给出中文提示。"""
    text = str(value or "").strip()
    if text and not EMAIL_PATTERN.match(text):
        raise HTTPException(400, "邮件地址格式不正确")
    return text


def _validated_advisor_id(db: Session, value) -> int:
    """会籍归属必须是真实存在的员工账号，避免写入非法外键导致 500。"""
    advisor_id = as_int(value, "会籍归属")
    advisor = db.get(User, advisor_id)
    if not advisor or advisor.deleted_at is not None:
        raise HTTPException(400, "员工账号不存在")
    return advisor.id


def _validated_teacher_id(db: Session, value) -> int:
    """记录所属教练必须存在，避免写入非法外键导致 500。"""
    teacher_id = as_int(value, "教练")
    teacher = db.get(Teacher, teacher_id)
    if not teacher or teacher.deleted_at is not None:
        raise HTTPException(400, "教练不存在")
    return teacher.id


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), _: User = Depends(require_dashboard)):
    day = today()
    month = day[:7]
    sessions = db.query(ClassSession).filter(ClassSession.session_date == day, ClassSession.deleted_at.is_(None)).order_by(ClassSession.start_time).all()
    bookings = db.query(Booking).join(ClassSession).filter(ClassSession.session_date == day, Booking.deleted_at.is_(None), ClassSession.deleted_at.is_(None)).all()
    revenue = recognized_revenue(db, f"{month}-01", day)
    return {
        "today_sessions": len([row for row in sessions if row.status == "scheduled"]),
        "today_bookings": len([row for row in bookings if row.status in {"booked", "checked_in", "completed"}]),
        "checked_in": len([row for row in bookings if row.status in {"checked_in", "completed"}]),
        "active_members": db.query(Member).filter(Member.active.is_(True), Member.deleted_at.is_(None)).count(),
        "new_members": db.query(Member).filter(Member.created_at >= datetime.fromisoformat(f"{month}-01T00:00:00"), Member.deleted_at.is_(None)).count(),
        "month_revenue": revenue["recognized"],
        "month_cash_received": revenue["cash_received"],
        "upcoming": [session_dict(row) for row in sessions[:8]],
        "recent_bookings": [booking_dict(row) for row in sorted(bookings, key=lambda item: item.booked_at, reverse=True)[:8]],
    }


@router.get("/meta")
def meta(db: Session = Depends(get_db), user: User = Depends(require_catalog_view)):
    """下拉框用的基础字典；按角色能力裁剪，避免越权看到产品与员工账号。"""
    role = user.role
    return {
        "courses": [course_dict(row) for row in db.query(Course).filter(Course.deleted_at.is_(None)).order_by(Course.course_type, Course.id).all()],
        "rooms": [room_dict(row) for row in db.query(Room).filter(Room.deleted_at.is_(None)).order_by(Room.floor, Room.sort_order, Room.id).all()],
        "teachers": [teacher_dict(row) for row in db.query(Teacher).filter(Teacher.deleted_at.is_(None)).order_by(Teacher.sort_order, Teacher.id).all()],
        "products": [product_dict(row) for row in sorted(db.query(CardProduct).filter(CardProduct.deleted_at.is_(None)).all(), key=lambda item: (PRODUCT_GROUP_ORDER.get(item.category, 99), item.sort_order or 0, item.id))] if has_capability(role, "products.view") else [],
        "users": [user_dict(row) for row in db.query(User).filter(User.deleted_at.is_(None)).order_by(User.id).all()] if has_capability(role, "settings.view") or has_capability(role, "members.write") else [],
        "member_sources": MEMBER_SOURCE_OPTIONS,
    }


@router.get("/members")
def list_members(q: str = Query(""), category: str = Query(""), card_status: str = Query(""), active_only: bool = Query(False), sort: str = Query("card"), page: int | None = Query(None, ge=1), page_size: int = Query(50, ge=1, le=200), db: Session = Depends(get_db), _: User = Depends(require_members_view)):
    """会员名单：筛选、排序与卡种统计全部下推到数据库，名单上千条也能秒开。"""
    member_ids = select(Member.id).where(Member.deleted_at.is_(None))
    if q.strip():
        term = f"%{q.strip()}%"
        member_ids = member_ids.where(or_(Member.name.like(term), Member.name_en.like(term), Member.phone.like(term)))
    if active_only:
        member_ids = member_ids.where(Member.active.is_(True))
    categories = [item for item in category.split(",") if item]
    if categories:
        wanted: set[str] = set()
        for item in categories:
            wanted.update(CATEGORY_ALIASES.get(item, {item}))
        member_ids = member_ids.where(Member.id.in_(select(MemberCard.member_id).join(CardProduct, MemberCard.product_id == CardProduct.id).where(MemberCard.deleted_at.is_(None), CardProduct.category.in_(wanted))))
    statuses = [item for item in card_status.split(",") if item]
    if statuses:
        # 持卡状态多选：命中任意一项即算匹配。
        clauses = []
        for item in statuses:
            if item == "none":
                clauses.append(~Member.id.in_(select(MemberCard.member_id).where(MemberCard.deleted_at.is_(None))))
                continue
            condition = card_status_condition(item)
            if condition is not None:
                clauses.append(Member.id.in_(select(MemberCard.member_id).where(condition)))
        if clauses:
            member_ids = member_ids.where(or_(*clauses))
    total = db.query(func.count()).select_from(member_ids.subquery()).scalar() or 0
    pages = max(1, (total + page_size - 1) // page_size)
    current = min(page, pages) if page else 1
    ordered_ids = _member_id_order(db, member_ids, sort)
    window_ids = ordered_ids[(current - 1) * page_size: current * page_size] if page else ordered_ids
    rows = db.query(Member).options(joinedload(Member.advisor), joinedload(Member.cards).joinedload(MemberCard.product)).filter(Member.id.in_(window_ids)).all() if window_ids else []
    by_id = {row.id: row for row in rows}
    window = [by_id[member_id] for member_id in window_ids if member_id in by_id]
    return {"items": [member_dict(row, include_cards=True, cards_summary=True) for row in window], "total": total, "page": current, "page_size": page_size, "pages": pages, "card_stats": _card_stats(db, member_ids)}


def _member_id_order(db: Session, member_ids, sort: str) -> list[int]:
    """按所选排序方式返回会员 ID 顺序；只查轻量字段，避免整表 ORM 实例化。"""
    if sort == "name":
        return [row.id for row in db.query(Member.id).filter(Member.id.in_(member_ids)).order_by(Member.name, Member.id).all()]
    if sort == "joined":
        return [row.id for row in db.query(Member.id).filter(Member.id.in_(member_ids)).order_by(Member.created_at.desc(), Member.id.desc()).all()]
    # 按卡种：主卡优先有效卡，其次购卡金额从高到低，与导出排序保持一致。
    current = today()
    card_rows = db.query(MemberCard.member_id, MemberCard.id, MemberCard.status, MemberCard.start_pending, MemberCard.expires_on, MemberCard.purchase_price, CardProduct.category).join(CardProduct, MemberCard.product_id == CardProduct.id).filter(MemberCard.deleted_at.is_(None), MemberCard.member_id.in_(member_ids)).all()
    primary: dict[int, tuple] = {}
    for row in card_rows:
        active = row.status == "active" and (row.start_pending or (row.expires_on or "") >= current)
        key = (0 if active else 1, -(row.purchase_price or 0), row.expires_on or "", row.id)
        previous = primary.get(row.member_id)
        if previous is None or key < previous[0]:
            primary[row.member_id] = (key, row.category, row.purchase_price or 0)
    members = db.query(Member.id, Member.name).filter(Member.id.in_(member_ids)).all()
    members.sort(key=lambda row: (CATEGORY_SORT_ORDER.get(primary.get(row.id, (None, "", 0))[1], 90), -primary.get(row.id, (None, "", 0))[2], row.name or "", row.id))
    return [row.id for row in members]


def _card_stats(db: Session, member_ids) -> list[dict]:
    """卡种人数统计：每种会员卡有多少位会员（按人计，同一人同卡种只算一次）。"""
    rows = db.query(CardProduct.id, CardProduct.name, CardProduct.name_en, CardProduct.category, func.count(func.distinct(MemberCard.member_id))).join(MemberCard, MemberCard.product_id == CardProduct.id).filter(MemberCard.deleted_at.is_(None), MemberCard.member_id.in_(member_ids)).group_by(CardProduct.id, CardProduct.name, CardProduct.name_en, CardProduct.category).all()
    items = [{"product_id": row[0], "name": row[1], "name_en": row[2], "category": row[3], "count": row[4]} for row in rows]
    return sorted(items, key=lambda item: (CATEGORY_SORT_ORDER.get(item["category"], 90), -item["count"], item["name"]))


@router.get("/members/options")
def member_options(q: str = Query(""), active_only: bool = Query(False), limit: int = Query(200, ge=1, le=20000), db: Session = Depends(get_db), _: User = Depends(require_members_view)):
    """下拉选择用的精简会员名单：不含卡课与档案详情，会员上千也能秒开。"""
    query = db.query(Member.id, Member.name, Member.name_en, Member.phone, Member.active).filter(Member.deleted_at.is_(None))
    if q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(or_(Member.name.like(term), Member.name_en.like(term), Member.phone.like(term)))
    if active_only:
        query = query.filter(Member.active.is_(True))
    total = query.count()
    rows = query.order_by(Member.name).limit(limit).all()
    return {"items": [{"id": row.id, "name": row.name, "name_en": row.name_en, "phone": row.phone, "active": row.active} for row in rows], "total": total}


@router.post("/members")
def create_member(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_members_write)):
    data = clean_payload(payload, MEMBER_FIELDS)
    name = str(data.get("name", "")).strip()
    if not name:
        raise HTTPException(400, "会员姓名不能为空")
    phone = valid_phone(str(data.get("phone", "")))
    if db.query(Member).filter(Member.phone == phone).first():
        raise HTTPException(400, "该手机号已存在会员档案")
    data.update({"name": name, "phone": phone})
    if "source" in data:
        data["source"] = normalize_member_source(data["source"])
    if "email" in data:
        data["email"] = _clean_email(data["email"])
    if data.get("advisor_id"):
        data["advisor_id"] = _validated_advisor_id(db, data["advisor_id"])
    row = Member(**data)
    db.add(row)
    db.flush()
    audit(db, user, "member", "create", "member", row.id, {"name": name, "phone": phone})
    db.commit()
    db.refresh(row)
    return member_dict(row, include_cards=True)


@router.post("/members/{member_id}/photo")
def upload_member_photo(member_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(require_members_write)):
    row = db.get(Member, member_id)
    if not row or row.deleted_at is not None:
        raise HTTPException(404, "会员不存在")
    previous = row.photo_url
    row.photo_url = save_image(file, "members", f"member-{member_id}")
    audit(db, user, "member", "upload_photo", "member", member_id, {"size_bytes": image_size(file)})
    db.commit()
    remove_upload(previous, "members")
    return member_dict(row, include_cards=True)


@router.delete("/members/{member_id}/photo")
def delete_member_photo(member_id: int, db: Session = Depends(get_db), user: User = Depends(require_members_write)):
    row = db.get(Member, member_id)
    if not row or row.deleted_at is not None:
        raise HTTPException(404, "会员不存在")
    previous = row.photo_url
    row.photo_url = ""
    audit(db, user, "member", "delete_photo", "member", member_id)
    db.commit()
    remove_upload(previous, "members")
    return member_dict(row, include_cards=True)


@router.get("/members/{member_id}")
def get_member(member_id: int, db: Session = Depends(get_db), _: User = Depends(require_members_view)):
    """会员档案主体：资料、会员卡、体验券与提醒。

    上课记录单独走 GET /members/{id}/bookings 分页接口——老会员有上千条记录，
    一次性返回会把接口撑到几 MB，档案页要等很久才打得开。
    """
    row = db.query(Member).options(
        joinedload(Member.advisor),
        joinedload(Member.cards).joinedload(MemberCard.product),
        joinedload(Member.cards).joinedload(MemberCard.shares).joinedload(MemberCardShare.member),
    ).filter(Member.id == member_id).first()
    if not row or row.deleted_at is not None:
        raise HTTPException(404, "会员不存在")
    records = db.query(MemberRecord).options(joinedload(MemberRecord.teacher)).filter(MemberRecord.member_id == member_id, MemberRecord.deleted_at.is_(None)).order_by(MemberRecord.record_date.desc()).all()
    transactions = db.query(Transaction).filter(Transaction.member_id == member_id, Transaction.deleted_at.is_(None)).order_by(Transaction.occurred_at.desc()).all()
    vouchers = db.query(ExperienceVoucher).filter(ExperienceVoucher.member_id == member_id, ExperienceVoucher.deleted_at.is_(None)).order_by(ExperienceVoucher.id.desc()).all()
    reminders = db.query(MemberReminder).filter(MemberReminder.member_id == member_id, MemberReminder.active.is_(True), MemberReminder.deleted_at.is_(None)).order_by(MemberReminder.remind_on, MemberReminder.id).all()
    shared_cards = db.query(MemberCard).options(joinedload(MemberCard.product), joinedload(MemberCard.shares).joinedload(MemberCardShare.member)).join(MemberCardShare, MemberCardShare.card_id == MemberCard.id).filter(MemberCardShare.member_id == member_id, MemberCardShare.deleted_at.is_(None), MemberCard.deleted_at.is_(None)).all()
    bookings_total = db.query(func.count()).select_from(Booking).where(Booking.member_id == member_id, Booking.deleted_at.is_(None)).scalar() or 0
    return {**member_dict(row, include_cards=True), "shared_cards": [card_dict(card) for card in shared_cards], "bookings": [], "bookings_total": bookings_total, "records": [{"id": item.id, "record_type": item.record_type, "title": item.title, "content": item.content, "record_date": item.record_date, "teacher_name": item.teacher.name if item.teacher else ""} for item in records], "transactions": [transaction_dict(item) for item in transactions], "vouchers": [voucher_dict(item) for item in vouchers], "reminders": [reminder_dict(item) for item in reminders], "reminder_alerts": due_reminders(db, row)}


@router.get("/members/{member_id}/bookings")
def list_member_bookings(member_id: int, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), course_type: str = Query(""), db: Session = Depends(get_db), _: User = Depends(require_members_view)):
    """会员档案的上课记录：分页返回精简行，避免一次几千条把档案接口撑爆。

    `course_type` 支持逗号分隔，例如 group 或 private,assessment,workshop。
    """
    if not db.get(Member, member_id):
        raise HTTPException(404, "会员不存在")
    query = db.query(Booking).filter(Booking.member_id == member_id, Booking.deleted_at.is_(None))
    types = [item for item in course_type.split(",") if item]
    if types:
        query = query.join(ClassSession, Booking.session_id == ClassSession.id).join(Course, ClassSession.course_id == Course.id).filter(Course.course_type.in_(types))
    total = query.count()
    pages = max(1, (total + page_size - 1) // page_size)
    current = min(page, pages)
    rows = query.options(
        joinedload(Booking.session).joinedload(ClassSession.course),
        joinedload(Booking.session).joinedload(ClassSession.teacher),
        joinedload(Booking.member_card).joinedload(MemberCard.product),
    ).order_by(Booking.booked_at.desc(), Booking.id.desc()).offset((current - 1) * page_size).limit(page_size).all()
    return {"items": [profile_booking_dict(row) for row in rows], "total": total, "page": current, "pages": pages, "page_size": page_size}


@router.patch("/members/{member_id}")
def update_member(member_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_members_write)):
    row = db.get(Member, member_id)
    if not row or row.deleted_at is not None:
        raise HTTPException(404, "会员不存在")
    data = clean_payload(payload, MEMBER_FIELDS)
    if "phone" in data:
        data["phone"] = valid_phone(str(data["phone"]))
        existed = db.query(Member).filter(Member.phone == data["phone"], Member.id != member_id).first()
        if existed:
            raise HTTPException(400, "该手机号已被其他会员使用")
    if "advisor_id" in data:
        data["advisor_id"] = _validated_advisor_id(db, data["advisor_id"]) if data["advisor_id"] else None
    if "source" in data:
        data["source"] = normalize_member_source(data["source"])
    if "email" in data:
        data["email"] = _clean_email(data["email"])
    for key, value in data.items():
        setattr(row, key, value)
    audit(db, user, "member", "update", "member", member_id, data)
    db.commit()
    return member_dict(row, include_cards=True)


@router.post("/members/{member_id}/cards")
def purchase_card(member_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_revenue)):
    from ..finance_service import REVENUE_MODES, resolve_entry_options, resolve_purchase_revenue_mode

    member = db.get(Member, member_id)
    product = db.get(CardProduct, int(payload.get("product_id", 0)))
    if not member or member.deleted_at is not None or not product or product.deleted_at is not None:
        raise HTTPException(404, "会员或卡课产品不存在")
    price = as_float(payload.get("price", product.price), "购买价格")
    if price < 0:
        raise HTTPException(400, "购买价格不能为负数")
    # 开卡日期待定：先买卡，之后首次签到当天自动开卡并顺延有效期。
    start_pending = bool(payload.get("start_pending"))
    starts_on = "" if start_pending else valid_date(str(payload.get("starts_on") or today()), "开卡日期")
    # 续卡就是重新购卡：带上续卡标记，便于后续统计续卡人数与续卡金额。
    is_renewal = bool(payload.get("is_renewal"))
    note = str(payload.get("note", ""))
    if is_renewal and not note.startswith("续卡"):
        note = f"续卡 · {note}".strip(" ·")
    # 营收口径默认按系统设置判定，前台可逐单选择「入流水 / 入营收 / 营收每日均摊」。
    policy_mode = resolve_purchase_revenue_mode(db, product)
    requested_mode = str(payload.get("revenue_mode") or "").strip()
    record_cash, revenue_mode = resolve_entry_options(payload, product, revenue_mode=requested_mode if requested_mode in REVENUE_MODES else policy_mode)
    if revenue_mode == "amortized":
        revenue_days = as_int(payload.get("revenue_days") or product.validity_days, "营收均摊天数")
        if not 1 <= revenue_days <= 3650:
            raise HTTPException(400, "营收均摊天数需在 1 至 3650 天之间")
        revenue_start_on = "" if start_pending else valid_date(str(payload.get("revenue_start_on") or starts_on), "营收均摊开始日期")
    else:
        revenue_start_on, revenue_days = "", 0
    card = issue_card(db, member=member, product=product, price=price, payment_method=str(payload.get("payment_method", "cash")), starts_on=starts_on, note=note, record_cash=record_cash, revenue_mode=revenue_mode, created_by=user.full_name or user.username, is_renewal=is_renewal, start_pending=start_pending)
    transaction = db.query(Transaction).filter(Transaction.member_card_id == card.id, Transaction.kind == "purchase").first()
    if transaction:
        transaction.revenue_start_on = revenue_start_on
        transaction.revenue_days = revenue_days
    audit(db, user, "member_card", "purchase", "member_card", card.id, {"member_id": member_id, "product_id": product.id, "price": price, "record_cash": record_cash, "revenue_mode": revenue_mode, "is_renewal": is_renewal, "start_pending": start_pending})
    db.commit()
    return card_dict(card)


@router.patch("/cards/{card_id}")
def update_card(card_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_cards_write)):
    card = db.get(MemberCard, card_id)
    if not card or card.deleted_at is not None:
        raise HTTPException(404, "会员卡不存在")
    if payload.get("version") is not None and as_int(payload["version"], "会员卡版本") != (card.version or 0):
        raise HTTPException(409, "会员卡刚刚发生变更，请刷新后重试")
    action = str(payload.get("action", ""))
    updates: dict = {}
    if action == "extend":
        days = as_int(payload.get("days", 0), "延期天数")
        if days == 0 or abs(days) > 3650:
            raise HTTPException(400, "延期天数需在 -3650 至 3650 之间且不能为 0")
        updates["expires_on"] = add_days(card.expires_on, days)
        updates["note"] = str(payload.get("note", card.note))
    elif action == "edit":
        # 编辑卡：开卡日期、到期日与备注；延期直接改到期日，不再单独做延期动作。
        if "start_pending" in payload:
            pending = bool(payload.get("start_pending"))
            updates["start_pending"] = pending
            if pending:
                updates["starts_on"] = ""
                updates["expires_on"] = ""
                updates["opened_booking_id"] = 0
        if "starts_on" in payload:
            updates["starts_on"] = valid_date(str(payload.get("starts_on") or ""), "开卡日期")
        if "expires_on" in payload:
            updates["expires_on"] = valid_date(str(payload.get("expires_on") or ""), "到期日期")
        if "note" in payload:
            updates["note"] = str(payload.get("note", ""))
        if not updates:
            raise HTTPException(400, "没有需要更新的内容")
        if not updates.get("start_pending") and card.start_pending and updates.get("starts_on"):
            # 待定卡在这里正式开卡：没填到期日就按产品有效期自动顺延。
            validity = max(1, card.product.validity_days if card.product else 365)
            if not updates.get("expires_on"):
                updates["expires_on"] = add_days(updates["starts_on"], validity)
            updates["start_pending"] = False
            updates["opened_booking_id"] = 0
        start_value = updates.get("starts_on", card.starts_on)
        expiry_value = updates.get("expires_on", card.expires_on)
        if start_value and expiry_value and expiry_value < start_value:
            raise HTTPException(400, "到期日期不能早于开卡日期")
    elif action == "freeze":
        frozen_until = valid_date(str(payload.get("frozen_until", "")), "冻结截止日期")
        frozen_from = str(payload.get("frozen_from", "") or "").strip()
        frozen_from = valid_date(frozen_from, "冻结开始日期") if frozen_from else today()
        if frozen_until < frozen_from:
            raise HTTPException(400, "冻结截止日期不能早于冻结开始日期")
        updates["frozen_from"] = frozen_from
        updates["frozen_until"] = frozen_until
        updates["status"] = "active"
    elif action in {"unfreeze", "activate"}:
        updates["frozen_from"] = ""
        updates["frozen_until"] = ""
        updates["status"] = "active"
    elif action == "cancel":
        updates["status"] = "cancelled"
    elif action == "adjust":
        if "remaining_sessions" in payload:
            remaining = max(0, as_int(payload["remaining_sessions"], "剩余次数"))
            if card.total_sessions is not None:
                remaining = min(remaining, card.total_sessions)
            updates["remaining_sessions"] = remaining
        if "benefits" in payload:
            updates["benefits_json"] = json.dumps(valid_benefits(payload["benefits"]), ensure_ascii=False)
        updates["note"] = str(payload.get("note", card.note))
    else:
        raise HTTPException(400, "不支持的卡操作")
    # 使用版本号做乐观锁，避免与并发签到扣次互相覆盖。
    current_version = card.version or 0
    updated = db.query(MemberCard).filter(MemberCard.id == card_id, or_(MemberCard.version == current_version, MemberCard.version.is_(None))).update({**updates, "version": current_version + 1}, synchronize_session=False)
    if updated != 1:
        raise HTTPException(409, "会员卡刚刚发生变更，请刷新后重试")
    db.refresh(card)
    audit(db, user, "member_card", action, "member_card", card_id, payload)
    db.commit()
    return card_dict(card)


@router.post("/cards/batch-extend")
def batch_extend_cards(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_cards_write)):
    days = as_int(payload.get("days", 0), "批量延期天数")
    if days <= 0 or days > 365:
        raise HTTPException(400, "批量延期天数需在 1 至 365 之间")
    rows = db.query(MemberCard).filter(MemberCard.status == "active", MemberCard.expires_on >= today(), MemberCard.deleted_at.is_(None)).all()
    for card in rows:
        card.expires_on = add_days(card.expires_on, days)
        card.version = (card.version or 0) + 1
    audit(db, user, "member_card", "batch_extend", "member_card", detail={"days": days, "count": len(rows), "note": payload.get("note", "")})
    db.commit()
    return {"ok": True, "updated": len(rows)}


def _record_dict(row: MemberRecord) -> dict:
    return {"id": row.id, "record_type": row.record_type, "title": row.title, "content": row.content, "record_date": row.record_date, "teacher_id": row.teacher_id, "teacher_name": row.teacher.name if row.teacher else ""}


@router.post("/members/{member_id}/records")
def add_member_record(member_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_records_write)):
    member = db.get(Member, member_id)
    if not member or member.deleted_at is not None:
        raise HTTPException(404, "会员不存在")
    row = MemberRecord(member_id=member_id, teacher_id=_validated_teacher_id(db, payload["teacher_id"]) if payload.get("teacher_id") else None, record_type=str(payload.get("record_type", "note")), title=str(payload.get("title", "")).strip(), content=str(payload.get("content", "")), record_date=valid_date(str(payload.get("record_date") or today()), "记录日期"))
    if not row.title:
        raise HTTPException(400, "记录标题不能为空")
    db.add(row)
    db.flush()
    audit(db, user, "member_record", "create", "member_record", row.id)
    db.commit()
    return _record_dict(row)


@router.get("/records/{record_id}")
def get_member_record(record_id: int, db: Session = Depends(get_db), _: User = Depends(require_members_view)):
    row = db.get(MemberRecord, record_id)
    if not row or row.deleted_at is not None:
        raise HTTPException(404, "会员记录不存在")
    return _record_dict(row)


@router.patch("/records/{record_id}")
def update_member_record(record_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_records_write)):
    row = db.get(MemberRecord, record_id)
    if not row or row.deleted_at is not None:
        raise HTTPException(404, "会员记录不存在")
    changes = clean_payload(payload, {"teacher_id", "record_type", "title", "content", "record_date"})
    if "title" in changes and not str(changes["title"]).strip():
        raise HTTPException(400, "记录标题不能为空")
    if "record_date" in changes:
        changes["record_date"] = valid_date(str(changes["record_date"]), "记录日期")
    if changes.get("teacher_id"):
        changes["teacher_id"] = _validated_teacher_id(db, changes["teacher_id"])
    elif "teacher_id" in changes:
        changes["teacher_id"] = None
    for key, value in changes.items():
        setattr(row, key, value)
    audit(db, user, "member_record", "update", "member_record", record_id, changes)
    db.commit()
    return _record_dict(row)


@router.get("/no-shows")
def no_shows(db: Session = Depends(get_db), _: User = Depends(require_members_view)):
    rows = db.query(Booking).filter(Booking.status == "no_show", Booking.deleted_at.is_(None)).order_by(Booking.booked_at.desc()).all()
    return {"items": [booking_dict(row) for row in rows]}


@router.post("/members/{member_id}/clear-no-show")
def clear_no_show(member_id: int, db: Session = Depends(get_db), user: User = Depends(require_members_write)):
    member = db.get(Member, member_id)
    if not member or member.deleted_at is not None:
        raise HTTPException(404, "会员不存在")
    member.no_show_blocked_until = ""
    audit(db, user, "member", "clear_no_show_penalty", "member", member_id)
    db.commit()
    return {"ok": True}
