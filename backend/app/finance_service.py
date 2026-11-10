from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from .models import Booking, ClassSession, Course, MemberCard, Transaction


def recognized_revenue(db: Session, start: str, end: str) -> dict:
    range_start = datetime.fromisoformat(start).date()
    range_end = datetime.fromisoformat(end).date()
    transactions = db.query(Transaction).filter(Transaction.occurred_at >= datetime.fromisoformat(f"{start}T00:00:00"), Transaction.occurred_at <= datetime.fromisoformat(f"{end}T23:59:59"), Transaction.status.in_(["paid", "refunded"])).all()
    revenue = defaultdict(float)
    annual_revenue = 0.0
    for row in transactions:
        card = db.get(MemberCard, row.member_card_id) if row.member_card_id else None
        product = card.product if card else row.product
        annual = bool(product and product.category in {"annual", "package", "group"} and product.validity_days == 365)
        if annual:
            validity = max(1, product.validity_days)
            amortization_start = datetime.fromisoformat(card.starts_on).date() if card and card.starts_on else row.occurred_at.date()
            overlap_start = max(range_start, amortization_start)
            overlap_end = min(range_end, amortization_start + timedelta(days=validity - 1))
            days = max(0, (overlap_end - overlap_start).days + 1)
            amount = row.amount / validity * days
            annual_revenue += amount
            revenue["annual"] += amount
        elif row.category == "private" and row.product_id and row.kind in {"purchase", "upgrade"}:
            continue
        else:
            revenue[row.category] += row.amount
    private_revenue = 0.0
    consumed = db.query(Booking).join(ClassSession).join(Course).filter(ClassSession.session_date >= start, ClassSession.session_date <= end, Course.course_type == "private", Booking.consumed.is_(True), Booking.status.in_(["checked_in", "completed"])).all()
    for booking in consumed:
        card = booking.member_card
        if not card or card.product.category != "private" or not card.total_sessions:
            continue
        amount = card.purchase_price / card.total_sessions
        private_revenue += amount
        revenue["private"] += amount
    return {"cash_received": round(sum(row.amount for row in transactions), 2), "recognized": round(sum(revenue.values()), 2), "annual": round(annual_revenue, 2), "private": round(private_revenue, 2), "by_category": [{"label": key, "value": round(value, 2)} for key, value in sorted(revenue.items())]}
