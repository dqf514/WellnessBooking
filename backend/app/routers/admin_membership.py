from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from ..card_service import issue_card
from ..database import get_db
from ..deps import require_staff
from ..log_util import audit
from ..membership_service import reminder_dict, voucher_dict
from ..models import Booking, CardProduct, ExperienceVoucher, Member, MemberCard, MemberCardShare, MemberReminder, Transaction, User
from ..recycle_service import move_to_recycle
from ..serializers import card_dict
from ..utils import add_days, today, valid_date

router = APIRouter(prefix="/api/admin", tags=["member-benefits"])


def _active_card(db: Session, card_id: int) -> MemberCard:
    card = db.get(MemberCard, card_id)
    if not card or card.status != "active" or card.deleted_at is not None:
        raise HTTPException(400, "仅正常会员卡可执行此操作")
    return card


@router.post("/cards/{card_id}/upgrade")
def upgrade_card(card_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    card = _active_card(db, card_id)
    product = db.get(CardProduct, int(payload.get("product_id", 0)))
    if not product or not product.active:
        raise HTTPException(404, "升级产品不存在或已停用")
    if product.id == card.product_id:
        raise HTTPException(400, "请选择不同的升级产品")
    if product.category != card.product.category and "annual" not in {product.category, card.product.category}:
        raise HTTPException(400, "仅支持同类别卡课升级")
    difference = float(payload.get("price", max(0, product.price - card.purchase_price)))
    if difference < 0:
        raise HTTPException(400, "补差金额不能为负数")
    old_no = card.card_no
    card.status = "upgraded"
    card.note = f"已升级为 {product.name}；{payload.get('note', '')}".strip("；")
    card.version += 1
    new_card = issue_card(db, member=card.member, product=product, price=product.price, payment_method=str(payload.get("payment_method", "wechat")), starts_on=str(payload.get("starts_on") or today()), note=f"由原卡 {old_no} 补差升级", record_transaction=False)
    db.add(Transaction(member_id=card.member_id, member_card_id=new_card.id, product_id=product.id, category=product.category, kind="upgrade", amount=difference, payment_method=str(payload.get("payment_method", "wechat")), status="paid", note=f"原卡 {old_no} 升级为 {product.name}"))
    audit(db, user, "member_card", "upgrade", "member_card", card_id, {"new_card_id": new_card.id, "difference": difference})
    db.commit()
    return {"old_card": card_dict(card), "card": card_dict(new_card), "difference": difference}


@router.post("/cards/{card_id}/transfer")
def transfer_card(card_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    card = _active_card(db, card_id)
    target = db.get(Member, int(payload.get("target_member_id", 0)))
    if not target or not target.active or target.deleted_at is not None or target.id == card.member_id:
        raise HTTPException(400, "请选择有效的接收会员")
    pending = db.query(Booking).filter(Booking.member_card_id == card.id, Booking.consumed.is_(False), Booking.status.in_(["booked", "checked_in"]), Booking.deleted_at.is_(None)).count()
    if pending:
        raise HTTPException(400, "该卡仍关联未消课预约，请先取消或调整原会员预约")
    previous = card.member.name
    card.member_id = target.id
    card.note = f"由 {previous} 转入；{payload.get('note', '')}".strip("；")
    card.version += 1
    audit(db, user, "member_card", "transfer", "member_card", card_id, {"from_member": previous, "to_member_id": target.id})
    db.commit()
    return card_dict(card)


@router.post("/cards/{card_id}/share")
def share_card(card_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    card = _active_card(db, card_id)
    target = db.get(Member, int(payload.get("target_member_id", 0)))
    if not target or not target.active or target.deleted_at is not None or target.id == card.member_id:
        raise HTTPException(400, "请选择有效的共享会员")
    if db.query(MemberCardShare).filter(MemberCardShare.card_id == card.id, MemberCardShare.member_id == target.id, MemberCardShare.deleted_at.is_(None)).first():
        raise HTTPException(400, "该卡已共享给此会员")
    share = MemberCardShare(card_id=card.id, member_id=target.id, created_by=user.username)
    db.add(share)
    audit(db, user, "member_card", "share", "member_card", card_id, {"target_member_id": target.id})
    db.commit()
    return card_dict(card)


@router.delete("/cards/{card_id}/shares/{member_id}")
def unshare_card(card_id: int, member_id: int, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    share = db.query(MemberCardShare).filter(MemberCardShare.card_id == card_id, MemberCardShare.member_id == member_id, MemberCardShare.deleted_at.is_(None)).first()
    if not share:
        raise HTTPException(404, "共享关系不存在")
    pending = db.query(Booking).filter(Booking.member_card_id == card_id, Booking.member_id == member_id, Booking.consumed.is_(False), Booking.status.in_(["booked", "checked_in"]), Booking.deleted_at.is_(None)).count()
    if pending:
        raise HTTPException(400, "共享会员仍有关联预约，请先取消后再移除共享")
    return move_to_recycle(db, "shares", share.id, user)


@router.post("/members/{member_id}/reminders")
def create_reminder(member_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    if not (member := db.get(Member, member_id)) or member.deleted_at is not None:
        raise HTTPException(404, "会员不存在")
    content = str(payload.get("content", "")).strip()
    if not content:
        raise HTTPException(400, "提醒内容不能为空")
    raw_date = str(payload.get("remind_on", "")).strip()
    remind_on = valid_date(raw_date, "提醒日期") if raw_date else ""
    row = MemberReminder(member_id=member_id, content=content, remind_on=remind_on, created_by=user.username)
    db.add(row)
    db.flush()
    audit(db, user, "member", "create_reminder", "member_reminder", row.id, {"member_id": member_id})
    db.commit()
    return reminder_dict(row)


@router.patch("/reminders/{reminder_id}")
def update_reminder(reminder_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    row = db.get(MemberReminder, reminder_id)
    if not row or row.deleted_at is not None:
        raise HTTPException(404, "提醒不存在")
    if "active" in payload:
        row.active = bool(payload["active"])
    if "content" in payload and str(payload["content"]).strip():
        row.content = str(payload["content"]).strip()
    audit(db, user, "member", "update_reminder", "member_reminder", reminder_id, payload)
    db.commit()
    return reminder_dict(row)


@router.post("/members/{member_id}/vouchers")
def create_voucher(member_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    if not (member := db.get(Member, member_id)) or member.deleted_at is not None:
        raise HTTPException(404, "会员不存在")
    course_type = str(payload.get("course_type", "group"))
    if course_type not in {"all", "group", "private", "assessment", "workshop", "training"}:
        raise HTTPException(400, "体验券课程类别不合法")
    quantity = int(payload.get("quantity", 1))
    if not 1 <= quantity <= 100:
        raise HTTPException(400, "体验次数需在 1-100 之间")
    expires_on = valid_date(str(payload.get("expires_on") or add_days(today(), 30)), "有效期")
    if expires_on < today():
        raise HTTPException(400, "体验券有效期不能早于今天")
    row = ExperienceVoucher(member_id=member_id, course_type=course_type, total_sessions=quantity, remaining_sessions=quantity, expires_on=expires_on, note=str(payload.get("note", "")), issued_by=user.username)
    db.add(row)
    db.flush()
    audit(db, user, "member", "issue_voucher", "experience_voucher", row.id, {"member_id": member_id, "course_type": course_type, "quantity": quantity})
    db.commit()
    return voucher_dict(row)


@router.patch("/vouchers/{voucher_id}")
def update_voucher(voucher_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    row = db.get(ExperienceVoucher, voucher_id)
    if not row or row.deleted_at is not None:
        raise HTTPException(404, "体验券不存在")
    if "status" in payload:
        if payload["status"] not in {"active", "cancelled"}:
            raise HTTPException(400, "体验券状态不合法")
        row.status = payload["status"]
    audit(db, user, "member", "update_voucher", "experience_voucher", voucher_id, payload)
    db.commit()
    return voucher_dict(row)
