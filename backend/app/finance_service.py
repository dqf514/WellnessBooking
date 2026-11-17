from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import Booking, CardProduct, ClassSession, Course, MemberCard, Transaction, User
from .utils import valid_date

REVENUE_MODES = {"none", "immediate", "amortized"}
CATEGORY_ORDER = {"group": 0, "private": 1, "annual": 2, "workshop": 3, "training": 4, "enterprise": 5, "misc": 6}


def normalized_category(value: str) -> str:
    return {"assessment": "private", "package": "annual"}.get(value, value)


def default_revenue_mode(product: CardProduct) -> str:
    if product.category in {"private", "assessment"}:
        return "none"
    if product.category in {"annual", "package"} or product.validity_days == 365:
        return "amortized"
    return "immediate"


def resolve_entry_options(payload: dict, product: CardProduct | None = None) -> tuple[bool, str]:
    raw_cash = payload.get("record_cash", True)
    record_cash = raw_cash if isinstance(raw_cash, bool) else str(raw_cash).lower() not in {"0", "false", "no", "off"}
    revenue_mode = str(payload.get("revenue_mode") or (default_revenue_mode(product) if product else "immediate"))
    if revenue_mode not in REVENUE_MODES:
        raise HTTPException(400, "请选择有效的营收方式")
    if product and product.category in {"private", "assessment"} and revenue_mode != "none":
        raise HTTPException(400, "私教/评估购卡仅入流水，营收请在实际消课后入账")
    if not record_cash and revenue_mode == "none":
        raise HTTPException(400, "入流水和入营收至少需要选择一项")
    return record_cash, revenue_mode


def resolve_revenue_details(payload: dict, revenue_mode: str, starts_on: str = "", days: int = 0) -> tuple[str, int]:
    if revenue_mode != "amortized":
        return "", 0
    start = valid_date(str(payload.get("revenue_start_on") or starts_on), "营收均摊开始日期")
    validity = int(payload.get("revenue_days") or days or 0)
    if not 1 <= validity <= 3650:
        raise HTTPException(400, "营收均摊天数需在 1 至 3650 天之间")
    return start, validity


def _in_range(value: datetime, start: str, end: str) -> bool:
    return datetime.fromisoformat(f"{start}T00:00:00") <= value <= datetime.fromisoformat(f"{end}T23:59:59")


def _amortized_amount(row: Transaction, card: MemberCard | None, product: CardProduct | None, start: str, end: str) -> float:
    start_value = row.revenue_start_on or (card.starts_on if card and card.starts_on else row.occurred_at.date().isoformat())
    validity = row.revenue_days or (product.validity_days if product else 0)
    if validity < 1:
        return 0.0
    range_start = datetime.fromisoformat(start).date()
    range_end = datetime.fromisoformat(end).date()
    amortization_start = datetime.fromisoformat(start_value).date()
    overlap_start = max(range_start, amortization_start)
    overlap_end = min(range_end, amortization_start + timedelta(days=validity - 1))
    days = max(0, (overlap_end - overlap_start).days + 1)
    return row.amount / validity * days


def recognized_revenue(db: Session, start: str, end: str) -> dict:
    transactions = db.query(Transaction).filter(Transaction.status.in_(["paid", "refunded"]), Transaction.deleted_at.is_(None)).all()
    revenue = defaultdict(float)
    cash_revenue = defaultdict(float)
    annual_revenue = 0.0
    private_revenue = 0.0
    cash_received = 0.0

    def add_revenue(category: str, amount: float, amortized: bool = False) -> None:
        nonlocal annual_revenue, private_revenue
        normalized = normalized_category(category)
        revenue[normalized] += amount
        if normalized == "private":
            private_revenue += amount
        if amortized:
            annual_revenue += amount

    for row in transactions:
        card = db.get(MemberCard, row.member_card_id) if row.member_card_id else None
        product = card.product if card else row.product
        if row.cash_basis and _in_range(row.occurred_at, start, end):
            cash_received += row.amount
            cash_revenue[normalized_category(row.category)] += row.amount
        mode = row.revenue_mode or "legacy"
        if mode == "immediate":
            if _in_range(row.occurred_at, start, end):
                add_revenue(row.category, row.amount)
        elif mode == "amortized":
            add_revenue(row.category, _amortized_amount(row, card, product, start, end), amortized=True)
        elif mode == "none":
            continue
        else:
            annual = bool(product and product.category in {"annual", "package", "group"} and product.validity_days == 365)
            if annual:
                add_revenue(row.category, _amortized_amount(row, card, product, start, end), amortized=True)
            elif row.category == "private" and row.product_id and row.kind in {"purchase", "upgrade"}:
                continue
            elif _in_range(row.occurred_at, start, end):
                add_revenue(row.category, row.amount)

    revenue_booking_ids = {row[0] for row in db.query(Transaction.booking_id).filter(Transaction.booking_id.isnot(None), Transaction.deleted_at.is_(None)).all()}
    explicit_card_ids = {row[0] for row in db.query(Transaction.member_card_id).filter(Transaction.member_card_id.isnot(None), Transaction.kind.in_(["purchase", "upgrade"]), Transaction.revenue_mode != "legacy", Transaction.deleted_at.is_(None)).all()}
    consumed = db.query(Booking).join(ClassSession).join(Course).filter(
        ClassSession.session_date >= start,
        ClassSession.session_date <= end,
        ClassSession.deleted_at.is_(None),
        Course.course_type.in_(["private", "assessment"]),
        Booking.consumed.is_(True),
        Booking.status.in_(["checked_in", "completed"]),
        Booking.deleted_at.is_(None),
    ).all()
    for booking in consumed:
        if booking.id in revenue_booking_ids or booking.member_card_id in explicit_card_ids:
            continue
        card = booking.member_card
        if not card or card.product.category not in {"private", "assessment"} or not card.total_sessions:
            continue
        add_revenue("private", card.purchase_price / card.total_sessions)

    ordered = sorted(revenue.items(), key=lambda item: (CATEGORY_ORDER.get(item[0], 99), item[0]))
    ordered_cash = sorted(cash_revenue.items(), key=lambda item: (CATEGORY_ORDER.get(item[0], 99), item[0]))
    return {
        "cash_received": round(cash_received, 2),
        "recognized": round(sum(revenue.values()), 2),
        "annual": round(annual_revenue, 2),
        "private": round(private_revenue, 2),
        "by_category": [{"label": key, "value": round(value, 2)} for key, value in ordered],
        "cash_by_category": [{"label": key, "value": round(value, 2)} for key, value in ordered_cash],
    }


def create_consumption_revenue(db: Session, *, booking: Booking, amount: float, payment_method: str, note: str, user: User) -> Transaction:
    if booking.deleted_at is not None or booking.status not in {"checked_in", "completed"} or not booking.consumed:
        raise HTTPException(400, "仅已签到消课的私教/评估预约可入营收")
    if booking.session.course.course_type not in {"private", "assessment"}:
        raise HTTPException(400, "仅私教/评估预约支持消课营收")
    value = round(float(amount), 2)
    if value <= 0:
        raise HTTPException(400, "营收金额必须大于 0")
    existing = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(Transaction.booking_id == booking.id, Transaction.kind.in_(["consumption", "consumption_reversal"]), Transaction.status == "paid", Transaction.deleted_at.is_(None)).scalar()
    if float(existing) > 0:
        raise HTTPException(409, "该预约已入营收，请勿重复入账")
    sequence = db.query(func.count(Transaction.id)).filter(Transaction.booking_id == booking.id, Transaction.kind == "consumption", Transaction.deleted_at.is_(None)).scalar() + 1
    card = booking.member_card
    row = Transaction(
        booking_id=booking.id,
        member_id=booking.member_id,
        member_card_id=booking.member_card_id,
        product_id=card.product_id if card else None,
        category="private",
        kind="consumption",
        amount=value,
        payment_method=payment_method,
        status="paid",
        cash_basis=False,
        revenue_mode="immediate",
        revenue_sequence=sequence,
        created_by=user.full_name or user.username,
        note=note.strip() or f"{booking.session.course.name} · {booking.session.session_date} 消课营收",
    )
    db.add(row)
    return row


def reverse_booking_revenue(db: Session, booking: Booking, actor_name: str) -> Transaction | None:
    rows = db.query(Transaction).filter(Transaction.booking_id == booking.id, Transaction.kind.in_(["consumption", "consumption_reversal"]), Transaction.status == "paid", Transaction.deleted_at.is_(None)).all()
    amount = round(sum(row.amount for row in rows), 2)
    if amount <= 0:
        return None
    original = next((row for row in sorted(rows, key=lambda item: item.id, reverse=True) if row.kind == "consumption"), None)
    if not original:
        return None
    row = Transaction(
        booking_id=booking.id,
        member_id=booking.member_id,
        member_card_id=original.member_card_id,
        product_id=original.product_id,
        category="private",
        kind="consumption_reversal",
        amount=-amount,
        payment_method=original.payment_method,
        status="paid",
        cash_basis=False,
        revenue_mode="immediate",
        revenue_sequence=original.revenue_sequence,
        created_by=actor_name,
        note=f"取消签到，冲销营收原单 #{original.id}",
    )
    db.add(row)
    return row
