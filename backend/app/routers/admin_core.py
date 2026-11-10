from datetime import datetime

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from ..card_service import issue_card
from ..database import get_db
from ..deps import require_read, require_staff
from ..finance_service import recognized_revenue
from ..log_util import audit
from ..membership_service import due_reminders, reminder_dict, voucher_dict
from ..models import Booking, CardProduct, ClassSession, Course, ExperienceVoucher, Member, MemberCard, MemberCardShare, MemberRecord, MemberReminder, Room, Teacher, Transaction, User
from ..serializers import booking_dict, card_dict, course_dict, member_dict, product_dict, room_dict, session_dict, teacher_dict, transaction_dict, user_dict
from ..utils import add_days, clean_payload, today, valid_date, valid_phone

router = APIRouter(prefix="/api/admin", tags=["admin-core"])
MEMBER_FIELDS = {"name", "name_en", "phone", "gender", "id_number", "birth_date", "source", "advisor_id", "emergency_phone", "wechat", "notes", "active"}


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), _: User = Depends(require_read)):
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
def meta(db: Session = Depends(get_db), _: User = Depends(require_read)):
    return {
        "courses": [course_dict(row) for row in db.query(Course).filter(Course.deleted_at.is_(None)).order_by(Course.course_type, Course.id).all()],
        "rooms": [room_dict(row) for row in db.query(Room).filter(Room.deleted_at.is_(None)).order_by(Room.floor, Room.sort_order, Room.id).all()],
        "teachers": [teacher_dict(row) for row in db.query(Teacher).filter(Teacher.deleted_at.is_(None)).order_by(Teacher.id).all()],
        "products": [product_dict(row) for row in db.query(CardProduct).filter(CardProduct.deleted_at.is_(None)).order_by(CardProduct.id).all()],
        "users": [user_dict(row) for row in db.query(User).filter(User.deleted_at.is_(None)).order_by(User.id).all()],
    }


@router.get("/members")
def list_members(q: str = Query(""), category: str = Query(""), active_only: bool = Query(False), db: Session = Depends(get_db), _: User = Depends(require_read)):
    query = db.query(Member).options(joinedload(Member.advisor), joinedload(Member.cards).joinedload(MemberCard.product)).filter(Member.deleted_at.is_(None))
    if q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(or_(Member.name.like(term), Member.name_en.like(term), Member.phone.like(term)))
    if active_only:
        query = query.filter(Member.active.is_(True))
    rows = query.order_by(Member.id.desc()).all()
    if category:
        rows = [row for row in rows if any(card.product.category == category and card.status == "active" and card.deleted_at is None for card in row.cards)]
    return {"items": [member_dict(row, include_cards=True) for row in rows], "total": len(rows)}


@router.post("/members")
def create_member(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    data = clean_payload(payload, MEMBER_FIELDS)
    name = str(data.get("name", "")).strip()
    if not name:
        raise HTTPException(400, "会员姓名不能为空")
    phone = valid_phone(str(data.get("phone", "")))
    if db.query(Member).filter(Member.phone == phone).first():
        raise HTTPException(400, "该手机号已存在会员档案")
    data.update({"name": name, "phone": phone})
    row = Member(**data)
    db.add(row)
    db.flush()
    audit(db, user, "member", "create", "member", row.id, {"name": name, "phone": phone})
    db.commit()
    db.refresh(row)
    return member_dict(row, include_cards=True)


@router.get("/members/{member_id}")
def get_member(member_id: int, db: Session = Depends(get_db), _: User = Depends(require_read)):
    row = db.get(Member, member_id)
    if not row or row.deleted_at is not None:
        raise HTTPException(404, "会员不存在")
    bookings = db.query(Booking).filter(Booking.member_id == member_id, Booking.deleted_at.is_(None)).order_by(Booking.booked_at.desc()).all()
    records = db.query(MemberRecord).filter(MemberRecord.member_id == member_id, MemberRecord.deleted_at.is_(None)).order_by(MemberRecord.record_date.desc()).all()
    transactions = db.query(Transaction).filter(Transaction.member_id == member_id, Transaction.deleted_at.is_(None)).order_by(Transaction.occurred_at.desc()).all()
    vouchers = db.query(ExperienceVoucher).filter(ExperienceVoucher.member_id == member_id, ExperienceVoucher.deleted_at.is_(None)).order_by(ExperienceVoucher.id.desc()).all()
    reminders = db.query(MemberReminder).filter(MemberReminder.member_id == member_id, MemberReminder.active.is_(True), MemberReminder.deleted_at.is_(None)).order_by(MemberReminder.remind_on, MemberReminder.id).all()
    shared_cards = db.query(MemberCard).join(MemberCardShare, MemberCardShare.card_id == MemberCard.id).filter(MemberCardShare.member_id == member_id, MemberCardShare.deleted_at.is_(None), MemberCard.deleted_at.is_(None)).all()
    return {**member_dict(row, include_cards=True), "shared_cards": [card_dict(card) for card in shared_cards], "bookings": [booking_dict(item) for item in bookings], "records": [{"id": item.id, "record_type": item.record_type, "title": item.title, "content": item.content, "record_date": item.record_date, "teacher_name": item.teacher.name if item.teacher else ""} for item in records], "transactions": [transaction_dict(item) for item in transactions], "vouchers": [voucher_dict(item) for item in vouchers], "reminders": [reminder_dict(item) for item in reminders], "reminder_alerts": due_reminders(db, row)}


@router.patch("/members/{member_id}")
def update_member(member_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    row = db.get(Member, member_id)
    if not row or row.deleted_at is not None:
        raise HTTPException(404, "会员不存在")
    data = clean_payload(payload, MEMBER_FIELDS)
    if "phone" in data:
        data["phone"] = valid_phone(str(data["phone"]))
        existed = db.query(Member).filter(Member.phone == data["phone"], Member.id != member_id).first()
        if existed:
            raise HTTPException(400, "该手机号已被其他会员使用")
    for key, value in data.items():
        setattr(row, key, value)
    audit(db, user, "member", "update", "member", member_id, data)
    db.commit()
    return member_dict(row, include_cards=True)


@router.post("/members/{member_id}/cards")
def purchase_card(member_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    member = db.get(Member, member_id)
    product = db.get(CardProduct, int(payload.get("product_id", 0)))
    if not member or member.deleted_at is not None or not product or product.deleted_at is not None:
        raise HTTPException(404, "会员或卡课产品不存在")
    price = float(payload.get("price", product.price))
    if price < 0:
        raise HTTPException(400, "购买价格不能为负数")
    starts_on = valid_date(str(payload.get("starts_on") or today()), "开卡日期")
    card = issue_card(db, member=member, product=product, price=price, payment_method=str(payload.get("payment_method", "cash")), starts_on=starts_on, note=str(payload.get("note", "")))
    audit(db, user, "member_card", "purchase", "member_card", card.id, {"member_id": member_id, "product_id": product.id, "price": price})
    db.commit()
    return card_dict(card)


@router.patch("/cards/{card_id}")
def update_card(card_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    card = db.get(MemberCard, card_id)
    if not card or card.deleted_at is not None:
        raise HTTPException(404, "会员卡不存在")
    action = str(payload.get("action", ""))
    if action == "extend":
        days = int(payload.get("days", 0))
        if days == 0 or abs(days) > 3650:
            raise HTTPException(400, "延期天数需在 -3650 至 3650 之间且不能为 0")
        card.expires_on = add_days(card.expires_on, days)
        card.note = str(payload.get("note", card.note))
    elif action == "freeze":
        frozen_until = valid_date(str(payload.get("frozen_until", "")), "冻结截止日期")
        card.frozen_until = frozen_until
        card.status = "active"
    elif action in {"unfreeze", "activate"}:
        card.frozen_until = ""
        card.status = "active"
    elif action == "cancel":
        card.status = "cancelled"
    elif action == "adjust":
        if "remaining_sessions" in payload:
            card.remaining_sessions = max(0, int(payload["remaining_sessions"]))
        if "benefits" in payload:
            import json
            card.benefits_json = json.dumps(payload["benefits"], ensure_ascii=False)
        card.note = str(payload.get("note", card.note))
    else:
        raise HTTPException(400, "不支持的卡操作")
    card.version += 1
    audit(db, user, "member_card", action, "member_card", card_id, payload)
    db.commit()
    return card_dict(card)


@router.post("/cards/batch-extend")
def batch_extend_cards(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    days = int(payload.get("days", 0))
    if days <= 0 or days > 365:
        raise HTTPException(400, "批量延期天数需在 1 至 365 之间")
    rows = db.query(MemberCard).filter(MemberCard.status == "active", MemberCard.expires_on >= today(), MemberCard.deleted_at.is_(None)).all()
    for card in rows:
        card.expires_on = add_days(card.expires_on, days)
        card.version += 1
    audit(db, user, "member_card", "batch_extend", "member_card", detail={"days": days, "count": len(rows), "note": payload.get("note", "")})
    db.commit()
    return {"ok": True, "updated": len(rows)}


def _record_dict(row: MemberRecord) -> dict:
    return {"id": row.id, "record_type": row.record_type, "title": row.title, "content": row.content, "record_date": row.record_date, "teacher_id": row.teacher_id, "teacher_name": row.teacher.name if row.teacher else ""}


@router.post("/members/{member_id}/records")
def add_member_record(member_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    member = db.get(Member, member_id)
    if not member or member.deleted_at is not None:
        raise HTTPException(404, "会员不存在")
    row = MemberRecord(member_id=member_id, teacher_id=payload.get("teacher_id"), record_type=str(payload.get("record_type", "note")), title=str(payload.get("title", "")).strip(), content=str(payload.get("content", "")), record_date=valid_date(str(payload.get("record_date") or today()), "记录日期"))
    if not row.title:
        raise HTTPException(400, "记录标题不能为空")
    db.add(row)
    db.flush()
    audit(db, user, "member_record", "create", "member_record", row.id)
    db.commit()
    return _record_dict(row)


@router.get("/records/{record_id}")
def get_member_record(record_id: int, db: Session = Depends(get_db), _: User = Depends(require_read)):
    row = db.get(MemberRecord, record_id)
    if not row or row.deleted_at is not None:
        raise HTTPException(404, "会员记录不存在")
    return _record_dict(row)


@router.patch("/records/{record_id}")
def update_member_record(record_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    row = db.get(MemberRecord, record_id)
    if not row or row.deleted_at is not None:
        raise HTTPException(404, "会员记录不存在")
    changes = clean_payload(payload, {"teacher_id", "record_type", "title", "content", "record_date"})
    if "title" in changes and not str(changes["title"]).strip():
        raise HTTPException(400, "记录标题不能为空")
    if "record_date" in changes:
        changes["record_date"] = valid_date(str(changes["record_date"]), "记录日期")
    for key, value in changes.items():
        setattr(row, key, value)
    audit(db, user, "member_record", "update", "member_record", record_id, changes)
    db.commit()
    return _record_dict(row)


@router.get("/no-shows")
def no_shows(db: Session = Depends(get_db), _: User = Depends(require_read)):
    rows = db.query(Booking).filter(Booking.status == "no_show", Booking.deleted_at.is_(None)).order_by(Booking.booked_at.desc()).all()
    return {"items": [booking_dict(row) for row in rows]}


@router.post("/members/{member_id}/clear-no-show")
def clear_no_show(member_id: int, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    member = db.get(Member, member_id)
    if not member or member.deleted_at is not None:
        raise HTTPException(404, "会员不存在")
    member.no_show_blocked_until = ""
    audit(db, user, "member", "clear_no_show_penalty", "member", member_id)
    db.commit()
    return {"ok": True}
