from datetime import datetime

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from ..card_service import issue_card
from ..database import get_db
from ..deps import require_read, require_staff
from ..log_util import audit
from ..models import Booking, CardProduct, ClassSession, Member, MemberCard, MemberRecord, Transaction, User
from ..serializers import booking_dict, card_dict, course_dict, member_dict, product_dict, room_dict, session_dict, teacher_dict, transaction_dict, user_dict
from ..utils import add_days, clean_payload, dt, today, valid_date, valid_phone
from ..models import Course, Room, Teacher

router = APIRouter(prefix="/api/admin", tags=["admin-core"])

MEMBER_FIELDS = {"name", "name_en", "phone", "gender", "id_number", "birth_date", "source", "advisor_id", "emergency_phone", "wechat", "notes", "active"}


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), _: User = Depends(require_read)):
    day = today()
    month = day[:7]
    sessions = db.query(ClassSession).filter(ClassSession.session_date == day).order_by(ClassSession.start_time).all()
    bookings = db.query(Booking).join(ClassSession).filter(ClassSession.session_date == day).all()
    revenue = sum(row.amount for row in db.query(Transaction).filter(Transaction.status.in_(["paid", "refunded"]), Transaction.occurred_at >= datetime.fromisoformat(f"{month}-01T00:00:00")).all())
    return {
        "today_sessions": len([row for row in sessions if row.status == "scheduled"]),
        "today_bookings": len([row for row in bookings if row.status in {"booked", "checked_in", "completed"}]),
        "checked_in": len([row for row in bookings if row.status in {"checked_in", "completed"}]),
        "active_members": db.query(Member).filter(Member.active.is_(True)).count(),
        "new_members": db.query(Member).filter(Member.created_at >= datetime.fromisoformat(f"{month}-01T00:00:00")).count(),
        "month_revenue": revenue,
        "upcoming": [session_dict(row) for row in sessions[:8]],
        "recent_bookings": [booking_dict(row) for row in sorted(bookings, key=lambda item: item.booked_at, reverse=True)[:8]],
    }


@router.get("/meta")
def meta(db: Session = Depends(get_db), _: User = Depends(require_read)):
    return {
        "courses": [course_dict(row) for row in db.query(Course).order_by(Course.course_type, Course.id).all()],
        "rooms": [room_dict(row) for row in db.query(Room).order_by(Room.id).all()],
        "teachers": [teacher_dict(row) for row in db.query(Teacher).order_by(Teacher.id).all()],
        "products": [product_dict(row) for row in db.query(CardProduct).order_by(CardProduct.id).all()],
        "users": [user_dict(row) for row in db.query(User).order_by(User.id).all()],
    }


@router.get("/members")
def list_members(q: str = Query(""), category: str = Query(""), active_only: bool = Query(False), db: Session = Depends(get_db), _: User = Depends(require_read)):
    query = db.query(Member).options(joinedload(Member.advisor), joinedload(Member.cards).joinedload(MemberCard.product))
    if q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(or_(Member.name.like(term), Member.name_en.like(term), Member.phone.like(term)))
    if active_only:
        query = query.filter(Member.active.is_(True))
    rows = query.order_by(Member.id.desc()).all()
    if category:
        rows = [row for row in rows if any(card.product.category == category and card.status == "active" for card in row.cards)]
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
    if not row:
        raise HTTPException(404, "会员不存在")
    bookings = db.query(Booking).filter(Booking.member_id == member_id).order_by(Booking.booked_at.desc()).all()
    records = db.query(MemberRecord).filter(MemberRecord.member_id == member_id).order_by(MemberRecord.record_date.desc()).all()
    transactions = db.query(Transaction).filter(Transaction.member_id == member_id).order_by(Transaction.occurred_at.desc()).all()
    return {**member_dict(row, include_cards=True), "bookings": [booking_dict(item) for item in bookings], "records": [{"id": item.id, "record_type": item.record_type, "title": item.title, "content": item.content, "record_date": item.record_date, "teacher_name": item.teacher.name if item.teacher else ""} for item in records], "transactions": [transaction_dict(item) for item in transactions]}


@router.patch("/members/{member_id}")
def update_member(member_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    row = db.get(Member, member_id)
    if not row:
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
    if not member or not product:
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
    if not card:
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
    elif action == "unfreeze":
        card.frozen_until = ""
    elif action in {"activate", "cancel"}:
        card.status = "active" if action == "activate" else "cancelled"
    elif action == "adjust":
        if "remaining_sessions" in payload:
            card.remaining_sessions = max(0, int(payload["remaining_sessions"]))
        if "benefits" in payload:
            import json
            card.benefits_json = json.dumps(payload["benefits"], ensure_ascii=False)
        card.note = str(payload.get("note", card.note))
    else:
        raise HTTPException(400, "不支持的卡操作")
    audit(db, user, "member_card", action, "member_card", card_id, payload)
    db.commit()
    return card_dict(card)


@router.post("/cards/batch-extend")
def batch_extend_cards(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    days = int(payload.get("days", 0))
    if days <= 0 or days > 365:
        raise HTTPException(400, "批量延期天数需在 1 至 365 之间")
    rows = db.query(MemberCard).filter(MemberCard.status == "active", MemberCard.expires_on >= today()).all()
    for card in rows:
        card.expires_on = add_days(card.expires_on, days)
    audit(db, user, "member_card", "batch_extend", "member_card", detail={"days": days, "count": len(rows), "note": payload.get("note", "")})
    db.commit()
    return {"ok": True, "updated": len(rows)}


@router.post("/members/{member_id}/records")
def add_member_record(member_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    if not db.get(Member, member_id):
        raise HTTPException(404, "会员不存在")
    row = MemberRecord(member_id=member_id, teacher_id=payload.get("teacher_id"), record_type=str(payload.get("record_type", "note")), title=str(payload.get("title", "")).strip(), content=str(payload.get("content", "")), record_date=valid_date(str(payload.get("record_date") or today()), "记录日期"))
    if not row.title:
        raise HTTPException(400, "记录标题不能为空")
    db.add(row)
    db.flush()
    audit(db, user, "member_record", "create", "member_record", row.id)
    db.commit()
    return {"id": row.id, "record_type": row.record_type, "title": row.title, "content": row.content, "record_date": row.record_date}


@router.get("/no-shows")
def no_shows(db: Session = Depends(get_db), _: User = Depends(require_read)):
    rows = db.query(Booking).filter(Booking.status == "no_show").order_by(Booking.booked_at.desc()).all()
    return {"items": [booking_dict(row) for row in rows]}


@router.post("/members/{member_id}/clear-no-show")
def clear_no_show(member_id: int, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    member = db.get(Member, member_id)
    if not member:
        raise HTTPException(404, "会员不存在")
    member.no_show_blocked_until = ""
    audit(db, user, "member", "clear_no_show_penalty", "member", member_id)
    db.commit()
    return {"ok": True}
