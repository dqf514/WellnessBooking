import json
import random
import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .finance_service import default_revenue_mode
from .models import CardProduct, Member, MemberCard, Transaction
from .utils import add_days, json_loads, today


def _unique_card_no(db: Session) -> str:
    """卡号是唯一列，随机数撞码会直接导致 500，这里先做一次去重。"""
    for _ in range(20):
        code = f"MC{datetime.now().strftime('%y%m%d')}{random.randint(10000, 99999)}"
        if not db.query(MemberCard.id).filter(MemberCard.card_no == code).first():
            return code
    return f"MC{datetime.now().strftime('%y%m%d')}{uuid.uuid4().hex[:10].upper()}"


def _product_benefits(product: CardProduct) -> list[dict]:
    """读取产品分项权益；历史脏数据跳过，避免开卡时整单失败。"""
    raw = json_loads(product.benefits_json, [])
    if not isinstance(raw, list):
        return []
    benefits = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            quantity = int(item.get("remaining", item.get("quantity", 0)))
        except (TypeError, ValueError):
            continue
        benefits.append({**item, "remaining": quantity})
    return benefits


def issue_card(db: Session, *, member: Member, product: CardProduct, price: float, payment_method: str, starts_on: str = "", note: str = "", record_transaction: bool = True, record_cash: bool = True, revenue_mode: str = "legacy", created_by: str = "", is_renewal: bool = False) -> MemberCard:
    if not product.active:
        raise HTTPException(400, "该卡课产品已停用")
    start = starts_on or today()
    card = MemberCard(
        member_id=member.id,
        product_id=product.id,
        card_no=_unique_card_no(db),
        purchase_price=price,
        purchased_at=today(),
        starts_on=start,
        expires_on=add_days(start, max(1, product.validity_days)),
        total_sessions=product.total_sessions,
        remaining_sessions=product.total_sessions,
        benefits_json=json.dumps(_product_benefits(product), ensure_ascii=False),
        is_renewal=is_renewal,
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
            is_renewal=is_renewal,
            note=note or product.name,
        ))
    return card
