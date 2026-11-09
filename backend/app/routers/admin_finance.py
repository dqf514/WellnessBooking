import json
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..card_service import issue_card
from ..database import get_db
from ..deps import require_finance, require_read, require_staff
from ..log_util import audit
from ..models import Booking, CardProduct, ClassSession, Member, Room, RoomReservation, Transaction, User
from ..serializers import product_dict, transaction_dict
from ..utils import add_days, clean_payload, dt, minutes, today, valid_date

router = APIRouter(prefix="/api/admin", tags=["admin-finance"])
PRODUCT_FIELDS = {"name", "name_en", "category", "price", "original_price", "validity_days", "total_sessions", "description", "description_en", "online_sale", "active"}


@router.get("/products")
def list_products(db: Session = Depends(get_db), _: User = Depends(require_read)):
    return {"items": [product_dict(row) for row in db.query(CardProduct).order_by(CardProduct.id).all()]}


@router.post("/products")
def create_product(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_finance)):
    data = clean_payload(payload, PRODUCT_FIELDS)
    if not str(data.get("name", "")).strip():
        raise HTTPException(400, "产品名称不能为空")
    if float(data.get("price", 0)) < 0 or int(data.get("validity_days", 0)) < 1:
        raise HTTPException(400, "价格或有效期不合法")
    row = CardProduct(**data, benefits_json=json.dumps(payload.get("benefits", []), ensure_ascii=False))
    db.add(row)
    db.flush()
    audit(db, user, "product", "create", "card_product", row.id, payload)
    db.commit()
    return product_dict(row)


@router.patch("/products/{product_id}")
def update_product(product_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_finance)):
    row = db.get(CardProduct, product_id)
    if not row:
        raise HTTPException(404, "产品不存在")
    for key, value in clean_payload(payload, PRODUCT_FIELDS).items():
        setattr(row, key, value)
    if "benefits" in payload:
        row.benefits_json = json.dumps(payload["benefits"], ensure_ascii=False)
    audit(db, user, "product", "update", "card_product", product_id, payload)
    db.commit()
    return product_dict(row)


@router.get("/transactions")
def list_transactions(date_from: str = Query(""), date_to: str = Query(""), category: str = Query(""), member_id: int = Query(0), db: Session = Depends(get_db), _: User = Depends(require_read)):
    query = db.query(Transaction)
    if date_from:
        query = query.filter(Transaction.occurred_at >= datetime.fromisoformat(f"{valid_date(date_from)}T00:00:00"))
    if date_to:
        query = query.filter(Transaction.occurred_at <= datetime.fromisoformat(f"{valid_date(date_to)}T23:59:59"))
    if category:
        query = query.filter(Transaction.category == category)
    if member_id:
        query = query.filter(Transaction.member_id == member_id)
    rows = query.order_by(Transaction.occurred_at.desc()).limit(1000).all()
    return {"items": [transaction_dict(row) for row in rows], "total_amount": sum(row.amount for row in rows if row.status in {"paid", "refunded"})}


@router.post("/transactions/manual")
def manual_transaction(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_finance)):
    amount = float(payload.get("amount", 0))
    if amount == 0:
        raise HTTPException(400, "入账金额不能为 0")
    member_id = payload.get("member_id") or None
    if member_id and not db.get(Member, int(member_id)):
        raise HTTPException(404, "会员不存在")
    row = Transaction(member_id=member_id, category=str(payload.get("category", "misc")), kind="manual", amount=amount, payment_method=str(payload.get("payment_method", "cash")), status="paid", note=str(payload.get("note", "")))
    db.add(row)
    db.flush()
    audit(db, user, "finance", "manual_entry", "transaction", row.id, payload)
    db.commit()
    return transaction_dict(row)


@router.post("/transactions/{transaction_id}/refund")
def refund_transaction(transaction_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_finance)):
    original = db.get(Transaction, transaction_id)
    if not original or original.status != "paid" or original.amount <= 0:
        raise HTTPException(400, "该流水不可退款")
    amount = float(payload.get("amount", original.amount))
    if amount <= 0 or amount > original.amount:
        raise HTTPException(400, "退款金额不合法")
    original.status = "refunded"
    refund = Transaction(member_id=original.member_id, member_card_id=original.member_card_id, product_id=original.product_id, category=original.category, kind="refund", amount=-amount, payment_method=original.payment_method, status="paid", note=f"退款原单 #{original.id}：{payload.get('note', '')}")
    if original.member_card_id and amount >= original.amount:
        from ..models import MemberCard
        member_card = db.get(MemberCard, original.member_card_id)
        if member_card:
            member_card.status = "cancelled"
    db.add(refund)
    db.flush()
    audit(db, user, "finance", "refund", "transaction", transaction_id, {"refund_id": refund.id, "amount": amount})
    db.commit()
    return transaction_dict(refund)


@router.post("/orders/redeem")
def redeem_order(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    code = str(payload.get("redemption_code", "")).strip().upper()
    order = db.query(Transaction).filter(Transaction.redemption_code == code).first()
    if not order or order.status != "pending" or not order.product_id or not order.member_id:
        raise HTTPException(404, "待核销电子码不存在")
    claimed = db.query(Transaction).filter(Transaction.id == order.id, Transaction.status == "pending").update({"status": "paid"}, synchronize_session=False)
    if claimed != 1:
        raise HTTPException(404, "待核销电子码不存在")
    member = db.get(Member, order.member_id)
    product = db.get(CardProduct, order.product_id)
    if not member or not product:
        raise HTTPException(404, "会员或卡课产品不存在")
    card = issue_card(db, member=member, product=product, price=order.amount, payment_method=order.payment_method, note=f"电子码 {code} 核销", record_transaction=False)
    order.status = "paid"
    order.member_card_id = card.id
    order.note = f"电子码 {code} 核销"
    order.redeemed_at = datetime.now()
    audit(db, user, "finance", "redeem_order", "transaction", order.id, {"card_id": card.id})
    db.commit()
    return {"ok": True, "card_id": card.id, "order": transaction_dict(order)}


@router.get("/reports")
def reports(date_from: str = Query(""), date_to: str = Query(""), db: Session = Depends(get_db), _: User = Depends(require_read)):
    start = valid_date(date_from or today()[:8] + "01", "开始日期")
    end = valid_date(date_to or today(), "结束日期")
    if end < start:
        raise HTTPException(400, "开始日期不能晚于结束日期")
    sessions = db.query(ClassSession).filter(ClassSession.session_date >= start, ClassSession.session_date <= end).all()
    session_ids = [row.id for row in sessions]
    bookings = db.query(Booking).filter(Booking.session_id.in_(session_ids)).all() if session_ids else []
    transactions = db.query(Transaction).filter(Transaction.occurred_at >= datetime.fromisoformat(f"{start}T00:00:00"), Transaction.occurred_at <= datetime.fromisoformat(f"{end}T23:59:59"), Transaction.status.in_(["paid", "refunded"])).all()
    revenue = defaultdict(float)
    for row in transactions:
        revenue[row.category] += row.amount
    annual_products = {row.id: row for row in db.query(CardProduct).filter(CardProduct.validity_days == 365).all()}
    amortized_revenue = 0.0
    if annual_products:
        annual_rows = db.query(Transaction).filter(Transaction.product_id.in_(annual_products.keys()), Transaction.status.in_(["paid", "refunded"])).all()
        range_start = datetime.fromisoformat(start).date()
        range_end = datetime.fromisoformat(end).date()
        for row in annual_rows:
            product = annual_products.get(row.product_id)
            if not product:
                continue
            amortization_start = row.occurred_at.date()
            overlap_start = max(range_start, amortization_start)
            overlap_end = min(range_end, amortization_start + timedelta(days=product.validity_days - 1))
            overlap_days = max(0, (overlap_end - overlap_start).days + 1)
            amortized_revenue += row.amount / product.validity_days * overlap_days
    course_stats = defaultdict(lambda: {"sessions": 0, "cancelled": 0, "attendees": 0, "bookings": 0})
    teacher_stats = defaultdict(lambda: {"sessions": 0, "minutes": 0, "attendees": 0, "cancelled": 0})
    course_names_en = {}
    teacher_names_en = {}
    weekday = defaultdict(int)
    hour = defaultdict(int)
    for session in sessions:
        course_name = session.course.name
        course_names_en[course_name] = session.course.name_en
        course_stats[course_name]["sessions"] += 1
        course_stats[course_name]["cancelled"] += int(session.status == "cancelled")
        teacher_name = session.teacher.name
        teacher_names_en[teacher_name] = session.teacher.name_en
        teacher_stats[teacher_name]["sessions"] += 1
        teacher_stats[teacher_name]["minutes"] += minutes(session.end_time) - minutes(session.start_time)
        teacher_stats[teacher_name]["cancelled"] += int(session.status == "cancelled")
        related = [row for row in bookings if row.session_id == session.id]
        attendees = len([row for row in related if row.status in {"checked_in", "completed"}])
        course_stats[course_name]["attendees"] += attendees
        course_stats[course_name]["bookings"] += len([row for row in related if row.status != "cancelled"])
        teacher_stats[teacher_name]["attendees"] += attendees
        weekday[datetime.fromisoformat(session.session_date).weekday()] += attendees
        hour[session.start_time[:2]] += attendees
    rooms = db.query(Room).all()
    reservations = db.query(RoomReservation).filter(RoomReservation.reservation_date >= start, RoomReservation.reservation_date <= end, RoomReservation.status == "active").all()
    days = (datetime.fromisoformat(end) - datetime.fromisoformat(start)).days + 1
    room_usage = []
    for room in rooms:
        used_sessions = [row for row in sessions if row.room_id == room.id and row.status == "scheduled"]
        used_reservations = [row for row in reservations if row.room_id == room.id]
        used_minutes = sum(minutes(row.end_time) - minutes(row.start_time) for row in used_sessions) + sum(minutes(row.end_time) - minutes(row.start_time) for row in used_reservations)
        internal_minutes = sum(minutes(row.end_time) - minutes(row.start_time) for row in used_reservations if row.usage_type == "internal")
        room_usage.append({"room_id": room.id, "room_name": room.name, "room_name_en": room.name_en, "used_hours": round(used_minutes / 60, 1), "internal_hours": round(internal_minutes / 60, 1), "utilization": round(used_minutes / max(1, days * 12 * 60) * 100, 1)})
    return {
        "range": {"from": start, "to": end},
        "summary": {"revenue": sum(revenue.values()), "sessions": len(sessions), "cancelled_sessions": len([row for row in sessions if row.status == "cancelled"]), "attendees": len([row for row in bookings if row.status in {"checked_in", "completed"}]), "booking_count": len([row for row in bookings if row.status != "cancelled"]), "cancelled_bookings": len([row for row in bookings if row.status == "cancelled"])},
        "amortized_revenue": round(amortized_revenue, 2),
        "revenue_by_category": [{"label": key, "value": round(value, 2)} for key, value in sorted(revenue.items())],
        "course_stats": [{"label": key, "label_en": course_names_en.get(key, ""), **value} for key, value in sorted(course_stats.items(), key=lambda item: item[1]["attendees"], reverse=True)],
        "teacher_stats": [{"label": key, "label_en": teacher_names_en.get(key, ""), **value, "hours": round(value["minutes"] / 60, 1)} for key, value in sorted(teacher_stats.items(), key=lambda item: item[1]["minutes"], reverse=True)],
        "weekday": [{"label": key, "value": weekday.get(key, 0)} for key in range(7)],
        "hour": [{"label": key, "value": hour.get(key, 0)} for key in sorted(set(list(hour.keys()) + [f"{value:02d}" for value in range(8, 22)]))],
        "room_usage": room_usage,
    }
