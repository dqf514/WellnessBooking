import json
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..card_service import issue_card
from ..database import get_db
from ..deps import require_finance, require_finance_view, require_products_view, require_products_write, require_reports, require_revenue
from ..finance_service import create_consumption_revenue, normalized_category, recognized_revenue, resolve_entry_options, resolve_purchase_revenue_mode, resolve_revenue_details, system_revenue_mode
from ..log_util import audit
from ..models import Booking, CardProduct, ClassSession, Member, Room, RoomReservation, Transaction, User
from ..recycle_service import move_to_recycle
from ..serializers import product_dict, transaction_dict
from ..utils import as_float, as_int, clean_payload, minutes, today, valid_benefits, valid_date

router = APIRouter(prefix="/api/admin", tags=["admin-finance"])
PRODUCT_FIELDS = {"name", "name_en", "category", "price", "original_price", "validity_days", "total_sessions", "description", "description_en", "online_sale", "active"}
TRANSACTION_CATEGORIES = {"group", "private", "annual", "workshop", "training", "enterprise", "misc", "assessment", "package"}
MANUAL_FIELDS = {"member_id", "category", "amount", "payment_method", "note", "record_cash", "revenue_mode", "revenue_start_on", "revenue_days"}


def query_transactions(db: Session, date_from: str = "", date_to: str = "", category: str = "", member_id: int = 0) -> list[Transaction]:
    query = db.query(Transaction).filter(Transaction.deleted_at.is_(None))
    if date_from:
        query = query.filter(Transaction.occurred_at >= datetime.fromisoformat(f"{valid_date(date_from)}T00:00:00"))
    if date_to:
        query = query.filter(Transaction.occurred_at <= datetime.fromisoformat(f"{valid_date(date_to)}T23:59:59"))
    if category:
        categories = {"private": ["private", "assessment"], "annual": ["annual", "package"]}.get(category, [category])
        query = query.filter(Transaction.category.in_(categories))
    if member_id:
        query = query.filter(Transaction.member_id == member_id)
    return query.order_by(Transaction.occurred_at.desc(), Transaction.id.desc()).limit(1000).all()


@router.get("/products")
def list_products(db: Session = Depends(get_db), _: User = Depends(require_products_view)):
    rows = db.query(CardProduct).filter(CardProduct.deleted_at.is_(None)).order_by(CardProduct.id).all()
    order = {"group": 0, "private": 1, "assessment": 1, "annual": 2, "package": 2, "workshop": 3, "training": 4}
    rows.sort(key=lambda row: (order.get(row.category, 99), row.id))
    return {"items": [product_dict(row) for row in rows]}


@router.get("/revenue-policy")
def revenue_policy(product_id: int = Query(0), db: Session = Depends(get_db), _: User = Depends(require_revenue)):
    """购卡营收口径由系统设置统一决定，这里把当前口径告诉前端，前台不再逐单勾选。"""
    system = system_revenue_mode(db)
    product = db.get(CardProduct, product_id) if product_id else None
    effective = resolve_purchase_revenue_mode(db, product) if product else ("immediate" if system == "auto" else system)
    return {"system": system, "effective": effective, "validity_days": product.validity_days if product else 0}


@router.post("/products")
def create_product(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_products_write)):
    data = clean_payload(payload, PRODUCT_FIELDS)
    if not str(data.get("name", "")).strip():
        raise HTTPException(400, "产品名称不能为空")
    if as_float(data.get("price", 0), "价格") < 0 or as_int(data.get("validity_days", 0), "有效天数") < 1:
        raise HTTPException(400, "价格或有效期不合法")
    if "original_price" in data and as_float(data["original_price"], "原价") < 0:
        raise HTTPException(400, "原价不能为负数")
    if data.get("total_sessions") is not None and as_int(data["total_sessions"], "总次数") < 0:
        raise HTTPException(400, "总次数不能为负数")
    data["category"] = normalized_category(str(data.get("category", "group")))
    row = CardProduct(**data, benefits_json=json.dumps(valid_benefits(payload.get("benefits", [])), ensure_ascii=False))
    db.add(row)
    db.flush()
    audit(db, user, "product", "create", "card_product", row.id, payload)
    db.commit()
    return product_dict(row)


@router.patch("/products/{product_id}")
def update_product(product_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_products_write)):
    row = db.get(CardProduct, product_id)
    if not row or row.deleted_at is not None:
        raise HTTPException(404, "产品不存在")
    changes = clean_payload(payload, PRODUCT_FIELDS)
    if "category" in changes:
        changes["category"] = normalized_category(str(changes["category"]))
    if "name" in changes and not str(changes["name"]).strip():
        raise HTTPException(400, "产品名称不能为空")
    if "price" in changes and as_float(changes["price"], "价格") < 0:
        raise HTTPException(400, "价格不能为负数")
    if "original_price" in changes and changes["original_price"] is not None and as_float(changes["original_price"], "原价") < 0:
        raise HTTPException(400, "原价不能为负数")
    if "validity_days" in changes and as_int(changes["validity_days"], "有效天数") < 1:
        raise HTTPException(400, "有效天数至少为 1 天")
    if "total_sessions" in changes and changes["total_sessions"] is not None and as_int(changes["total_sessions"], "总次数") < 0:
        raise HTTPException(400, "总次数不能为负数")
    for key, value in changes.items():
        setattr(row, key, value)
    if "benefits" in payload:
        row.benefits_json = json.dumps(valid_benefits(payload["benefits"]), ensure_ascii=False)
    audit(db, user, "product", "update", "card_product", product_id, payload)
    db.commit()
    return product_dict(row)


@router.get("/transactions")
def list_transactions(date_from: str = Query(""), date_to: str = Query(""), category: str = Query(""), member_id: int = Query(0), db: Session = Depends(get_db), _: User = Depends(require_finance_view)):
    rows = query_transactions(db, date_from, date_to, category, member_id)
    return {"items": [transaction_dict(row) for row in rows], "total_amount": round(sum(row.amount for row in rows if row.cash_basis and row.status in {"paid", "refunded"}), 2)}


@router.post("/transactions/manual")
def manual_transaction(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_finance)):
    amount = round(as_float(payload.get("amount", 0), "入账金额"), 2)
    if amount == 0:
        raise HTTPException(400, "入账金额不能为 0")
    member_id = payload.get("member_id") or None
    if member_id and not db.get(Member, int(member_id)):
        raise HTTPException(404, "会员不存在")
    category = normalized_category(str(payload.get("category", "misc")))
    if category not in TRANSACTION_CATEGORIES:
        raise HTTPException(400, "入账类别不合法")
    record_cash, revenue_mode = resolve_entry_options(payload)
    revenue_start_on, revenue_days = resolve_revenue_details(payload, revenue_mode, today(), 365)
    row = Transaction(member_id=member_id, category=category, kind="manual", amount=amount, payment_method=str(payload.get("payment_method", "cash")), status="paid", cash_basis=record_cash, revenue_mode=revenue_mode, revenue_start_on=revenue_start_on, revenue_days=revenue_days, created_by=user.full_name or user.username, note=str(payload.get("note", "")))
    db.add(row)
    db.flush()
    audit(db, user, "finance", "manual_entry", "transaction", row.id, payload)
    db.commit()
    return transaction_dict(row)


@router.patch("/transactions/{transaction_id}")
def update_manual_transaction(transaction_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_finance)):
    row = db.get(Transaction, transaction_id)
    if not row or row.kind != "manual" or row.status != "paid" or row.deleted_at is not None:
        raise HTTPException(404, "手工入账不存在或已不可编辑")
    changes = clean_payload(payload, MANUAL_FIELDS)
    if "amount" in changes:
        changes["amount"] = round(as_float(changes["amount"], "入账金额"), 2)
        if changes["amount"] == 0:
            raise HTTPException(400, "入账金额不能为 0")
    member_id = changes.get("member_id", row.member_id) or None
    if member_id:
        member = db.get(Member, int(member_id))
        if not member or member.deleted_at is not None:
            raise HTTPException(404, "会员不存在")
    changes["member_id"] = member_id
    if "category" in changes:
        changes["category"] = normalized_category(str(changes["category"]))
        if changes["category"] not in TRANSACTION_CATEGORIES:
            raise HTTPException(400, "入账类别不合法")
    options = {"record_cash": changes.get("record_cash", row.cash_basis), "revenue_mode": changes.get("revenue_mode", row.revenue_mode)}
    record_cash, revenue_mode = resolve_entry_options(options)
    revenue_start_on, revenue_days = resolve_revenue_details({"revenue_start_on": changes.get("revenue_start_on", row.revenue_start_on), "revenue_days": changes.get("revenue_days", row.revenue_days)}, revenue_mode, today(), 365)
    changes.pop("record_cash", None)
    changes.update({"cash_basis": record_cash, "revenue_mode": revenue_mode, "revenue_start_on": revenue_start_on, "revenue_days": revenue_days})
    for key, value in changes.items():
        setattr(row, key, value)
    audit(db, user, "finance", "update_manual_entry", "transaction", transaction_id, changes)
    db.commit()
    return transaction_dict(row)


@router.delete("/transactions/{transaction_id}")
def delete_manual_transaction(transaction_id: int, db: Session = Depends(get_db), user: User = Depends(require_finance)):
    return move_to_recycle(db, "transactions", transaction_id, user)


@router.post("/transactions/{transaction_id}/refund")
def refund_transaction(transaction_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_finance)):
    original = db.get(Transaction, transaction_id)
    if not original or original.status != "paid" or original.amount <= 0 or original.kind not in {"purchase", "upgrade", "manual"} or original.deleted_at is not None:
        raise HTTPException(400, "该流水不可退款")
    amount = as_float(payload.get("amount", original.amount), "退款金额")
    if amount <= 0 or amount > original.amount:
        raise HTTPException(400, "退款金额不合法")
    original.status = "refunded"
    refund = Transaction(member_id=original.member_id, member_card_id=original.member_card_id, product_id=original.product_id, category=original.category, kind="refund", amount=-amount, payment_method=original.payment_method, status="paid", cash_basis=original.cash_basis, revenue_mode=original.revenue_mode, revenue_start_on=original.revenue_start_on, revenue_days=original.revenue_days, created_by=user.full_name or user.username, note=f"退款原单 #{original.id}：{payload.get('note', '')}")
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
def redeem_order(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_revenue)):
    code = str(payload.get("redemption_code", "")).strip().upper()
    order = db.query(Transaction).filter(Transaction.redemption_code == code, Transaction.deleted_at.is_(None)).first()
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
    order.created_by = user.full_name or user.username
    if order.revenue_mode == "amortized":
        order.revenue_start_on = card.starts_on
        order.revenue_days = product.validity_days
    audit(db, user, "finance", "redeem_order", "transaction", order.id, {"card_id": card.id})
    db.commit()
    return {"ok": True, "card_id": card.id, "order": transaction_dict(order)}


@router.post("/bookings/{booking_id}/revenue")
def post_booking_revenue(booking_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_revenue)):
    booking = db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(404, "预约不存在")
    row = create_consumption_revenue(db, booking=booking, amount=as_float(payload.get("amount", 0), "入账金额"), payment_method=str(payload.get("payment_method", "fitness_member")), note=str(payload.get("note", "")), user=user)
    try:
        db.flush()
        audit(db, user, "finance", "consumption_revenue", "transaction", row.id, {"booking_id": booking_id, "amount": row.amount, "payment_method": row.payment_method})
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "该预约已入营收，请勿重复入账")
    return transaction_dict(row)


def build_report(db: Session, start: str, end: str) -> dict:
    sessions = db.query(ClassSession).filter(ClassSession.session_date >= start, ClassSession.session_date <= end, ClassSession.deleted_at.is_(None)).all()
    session_ids = [row.id for row in sessions]
    bookings = db.query(Booking).filter(Booking.session_id.in_(session_ids), Booking.deleted_at.is_(None)).all() if session_ids else []
    revenue = recognized_revenue(db, start, end)
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
    rooms = db.query(Room).filter(Room.deleted_at.is_(None)).order_by(Room.floor, Room.sort_order, Room.id).all()
    reservations = db.query(RoomReservation).filter(RoomReservation.reservation_date >= start, RoomReservation.reservation_date <= end, RoomReservation.status == "active", RoomReservation.deleted_at.is_(None)).all()
    days = (datetime.fromisoformat(end) - datetime.fromisoformat(start)).days + 1
    room_usage = []
    for room in rooms:
        used_sessions = [row for row in sessions if row.room_id == room.id and row.status == "scheduled"]
        used_reservations = [row for row in reservations if row.room_id == room.id]
        used_minutes = sum(minutes(row.end_time) - minutes(row.start_time) for row in used_sessions) + sum(minutes(row.end_time) - minutes(row.start_time) for row in used_reservations)
        internal_minutes = sum(minutes(row.end_time) - minutes(row.start_time) for row in used_reservations if row.usage_type == "internal")
        room_usage.append({"room_id": room.id, "room_name": room.name, "room_name_en": room.name_en, "used_hours": round(used_minutes / 60, 1), "internal_hours": round(internal_minutes / 60, 1), "utilization": round(used_minutes / max(1, days * 13 * 60) * 100, 1)})
    return {
        "range": {"from": start, "to": end},
        "summary": {"revenue": revenue["recognized"], "cash_received": revenue["cash_received"], "sessions": len(sessions), "cancelled_sessions": len([row for row in sessions if row.status == "cancelled"]), "attendees": len([row for row in bookings if row.status in {"checked_in", "completed"}]), "booking_count": len([row for row in bookings if row.status != "cancelled"]), "cancelled_bookings": len([row for row in bookings if row.status == "cancelled"])},
        "amortized_revenue": revenue["annual"],
        "private_recognized_revenue": revenue["private"],
        "revenue_by_category": revenue["by_category"],
        "cash_by_category": revenue["cash_by_category"],
        "course_stats": [{"label": key, "label_en": course_names_en.get(key, ""), **value} for key, value in sorted(course_stats.items(), key=lambda item: item[1]["attendees"], reverse=True)],
        "teacher_stats": [{"label": key, "label_en": teacher_names_en.get(key, ""), **value, "hours": round(value["minutes"] / 60, 1)} for key, value in sorted(teacher_stats.items(), key=lambda item: item[1]["minutes"], reverse=True)],
        "weekday": [{"label": key, "value": weekday.get(key, 0)} for key in range(7)],
        "hour": [{"label": key, "value": hour.get(key, 0)} for key in sorted(set(list(hour.keys()) + [f"{value:02d}" for value in range(7, 22)]))],
        "room_usage": room_usage,
    }


@router.get("/reports")
def reports(date_from: str = Query(""), date_to: str = Query(""), db: Session = Depends(get_db), _: User = Depends(require_reports)):
    start = valid_date(date_from or today()[:8] + "01", "开始日期")
    end = valid_date(date_to or today(), "结束日期")
    if end < start:
        raise HTTPException(400, "开始日期不能晚于结束日期")
    return build_report(db, start, end)
