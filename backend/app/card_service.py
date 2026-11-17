import json
import random
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .finance_service import default_revenue_mode
from .models import CardProduct, Member, MemberCard, Transaction
from .utils import add_days, today


def issue_card(db: Session, *, member: Member, product: CardProduct, price: float, payment_method: str, starts_on: str = "", note: str = "", record_transaction: bool = True, record_cash: bool = True, revenue_mode: str = "legacy", created_by: str = "") -> MemberCard:
    if not product.active:
        raise HTTPException(400, "该卡课产品已停用")
    start = starts_on or today()
    card = MemberCard(
        member_id=member.id,
        product_id=product.id,
        card_no=f"MC{datetime.now().strftime('%y%m%d')}{random.randint(10000, 99999)}",
        purchase_price=price,
        purchased_at=today(),
        starts_on=start,
        expires_on=add_days(start, max(1, product.validity_days)),
        total_sessions=product.total_sessions,
        remaining_sessions=product.total_sessions,
        benefits_json=json.dumps([{**item, "remaining": int(item.get("remaining", item.get("quantity", 0)))} for item in json.loads(product.benefits_json or "[]")], ensure_ascii=False),
        note=note,
    )
    db.add(card)
    db.flush()
    if record_transaction:
        mode = revenue_mode or default_revenue_mode(product)
        db.add(Transaction(
            member_id=member.id,
            member_card_id=card.id,
            product_id=product.id,
            category=product.category,
            kind="purchase",
            amount=price,
            payment_method=payment_method,
            status="paid",
            cash_basis=record_cash,
            revenue_mode=mode,
            revenue_start_on=start if mode == "amortized" else "",
            revenue_days=product.validity_days if mode == "amortized" else 0,
            created_by=created_by,
            note=note or product.name,
        ))
    return card
