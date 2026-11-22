import random
import uuid
from datetime import date, datetime

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, Response, UploadFile
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session, joinedload

from ..booking_service import create_booking, transition_booking
from ..database import get_db
from ..deps import _payload, bearer, get_current_member
from ..log_util import audit
from ..membership_service import voucher_dict
from ..models import AppSettings, Booking, CardProduct, ClassSession, Course, ExperienceVoucher, Member, MemberCard, MemberCardShare, Teacher, Transaction
from ..security import create_access_token
from ..serializers import booking_dict, card_dict, course_dict, member_dict, product_dict, session_dict, teacher_dict, transaction_dict
from ..sms_service import notify_booking, send_otp, verify_otp
from ..upload_service import remove_upload, save_image
from ..utils import add_days, as_int, clean_payload, session_datetime, today, valid_date, valid_phone

router = APIRouter(prefix="/api/public", tags=["public"])


def optional_member(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> Member | None:
    """公开接口可选地识别会员令牌：带了会员令牌就回传“已预约”标记，没有也能匿名浏览。"""
    if credentials is None:
        return None
    try:
        payload = _payload(credentials)
    except HTTPException:
        return None
    subject = str(payload.get("sub", ""))
    if not subject.startswith("member:"):
        return None
    member = db.get(Member, int(subject.split(":", 1)[1]))
    if not member or not member.active or member.deleted_at is not None:
        return None
    return member


def _unique_redemption_code(db: Session) -> str:
    """电子码是唯一列，随机数撞码会直接导致 500，这里先做一次去重。"""
    for _ in range(20):
        code = f"YY{datetime.now().strftime('%y%m%d')}{random.randint(100000, 999999)}"
        if not db.query(Transaction.id).filter(Transaction.redemption_code == code).first():
            return code
    return f"YY{datetime.now().strftime('%y%m%d')}{uuid.uuid4().hex[:10].upper()}"


@router.get("/bootstrap")
def bootstrap(db: Session = Depends(get_db)):
    settings = db.get(AppSettings, 1)
    courses = db.query(Course).filter(Course.active.is_(True)).order_by(Course.id).all()
    teachers = db.query(Teacher).filter(Teacher.active.is_(True), Teacher.visible.is_(True)).order_by(Teacher.id).all()
    products = db.query(CardProduct).filter(CardProduct.active.is_(True)).order_by(CardProduct.price).all()
    return {
        "venue": {"name": settings.venue_name, "name_en": settings.venue_name_en, "address": settings.address, "address_en": settings.address_en, "phone": settings.phone, "logo_url": settings.logo_url, "favicon_url": settings.favicon_url, "booking_cutoff_minutes": settings.booking_cutoff_minutes},
        "courses": [course_dict(row) for row in courses],
        "teachers": [teacher_dict(row) for row in teachers],
        "products": [product_dict(row) for row in products],
    }


@router.get("/sessions")
def public_sessions(date_from: str = Query(default=""), date_to: str = Query(default=""), course_type: str = Query(default=""), db: Session = Depends(get_db), member: Member | None = Depends(optional_member)):
    start = valid_date(date_from or today())
    end = valid_date(date_to or add_days(start, 6))
    if end < start or (datetime.fromisoformat(end) - datetime.fromisoformat(start)).days > 31:
        raise HTTPException(400, "查询范围不合法，单次最多 31 天")
    query = db.query(ClassSession).options(joinedload(ClassSession.course), joinedload(ClassSession.teacher), joinedload(ClassSession.room), joinedload(ClassSession.bookings)).filter(ClassSession.session_date >= start, ClassSession.session_date <= end, ClassSession.status == "scheduled", ClassSession.deleted_at.is_(None))
    if course_type:
        query = query.join(Course).filter(Course.course_type == course_type)
    rows = query.order_by(ClassSession.session_date, ClassSession.start_time).all()
    booked_ids: set[int] = set()
    if member is not None:
        booked_ids = {row[0] for row in db.query(Booking.session_id).filter(Booking.member_id == member.id, Booking.status == "booked", Booking.deleted_at.is_(None)).all()}
    return {"items": [{**session_dict(row), "booked": row.id in booked_ids} for row in rows]}


@router.post("/auth/send-code")
def member_send_code(payload: dict = Body(...), db: Session = Depends(get_db)):
    phone = valid_phone(str(payload.get("phone", "")))
    return send_otp(db, phone=phone, purpose="member_login")


@router.post("/auth/login")
def member_login(payload: dict = Body(...), db: Session = Depends(get_db)):
    phone = valid_phone(str(payload.get("phone", "")))
    verify_otp(db, phone=phone, purpose="member_login", code=str(payload.get("code", "")))
    member = db.query(Member).filter(Member.phone == phone).first()
    if not member:
        name = str(payload.get("name", "")).strip() or f"会员{phone[-4:]}"
        member = Member(name=name, phone=phone, source="线上注册")
        db.add(member)
        db.commit()
        db.refresh(member)
    if not member.active:
        raise HTTPException(403, "会员账号已停用，请联系前台")
    return {"access_token": create_access_token(f"member:{member.id}", "member"), "member": member_dict(member)}


@router.get("/me")
def member_me(db: Session = Depends(get_db), member: Member = Depends(get_current_member)):
    bookings = db.query(Booking).filter(Booking.member_id == member.id, Booking.deleted_at.is_(None)).order_by(Booking.booked_at.desc()).all()
    transactions = db.query(Transaction).filter(Transaction.member_id == member.id, Transaction.deleted_at.is_(None)).order_by(Transaction.occurred_at.desc()).all()
    shared = db.query(MemberCard).join(MemberCardShare, MemberCardShare.card_id == MemberCard.id).filter(MemberCardShare.member_id == member.id, MemberCardShare.deleted_at.is_(None), MemberCard.deleted_at.is_(None)).all()
    vouchers = db.query(ExperienceVoucher).filter(ExperienceVoucher.member_id == member.id, ExperienceVoucher.status == "active", ExperienceVoucher.deleted_at.is_(None)).all()
    return {"member": member_dict(member), "cards": [card_dict(card) for card in [*member.cards, *shared]], "vouchers": [voucher_dict(row) for row in vouchers], "bookings": [booking_dict(row) for row in bookings], "transactions": [transaction_dict(row) for row in transactions]}


@router.patch("/me/profile")
def member_update_profile(payload: dict = Body(...), db: Session = Depends(get_db), member: Member = Depends(get_current_member)):
    """会员自助维护姓名与生日；手机号变更走原号 + 新号双验证码流程。"""
    data = clean_payload(payload, {"name", "birth_date"})
    changes: dict = {}
    if "name" in data:
        name = str(data["name"] or "").strip()
        if not name:
            raise HTTPException(400, "姓名不能为空")
        if len(name) > 40:
            raise HTTPException(400, "姓名不能超过 40 个字")
        changes["name"] = name
    if "birth_date" in data:
        value = str(data["birth_date"] or "").strip()
        if not value:
            changes["birth_date"] = ""
        else:
            valid_date(value, "出生日期")
            birth = date.fromisoformat(value)
            if birth > date.today():
                raise HTTPException(400, "出生日期不能晚于今天")
            if (date.today() - birth).days > 365 * 120:
                raise HTTPException(400, "出生日期超出合理范围")
            changes["birth_date"] = value
    if not changes:
        raise HTTPException(400, "没有需要更新的内容")
    for key, value in changes.items():
        setattr(member, key, value)
    audit(db, None, "member", "update_profile", "member", member.id, changes)
    db.commit()
    db.refresh(member)
    return member_dict(member)


@router.post("/me/photo")
def member_upload_photo(file: UploadFile = File(...), db: Session = Depends(get_db), member: Member = Depends(get_current_member)):
    """会员自助上传照片（支持手机直接拍照）。"""
    previous = member.photo_url
    member.photo_url = save_image(file, "members", f"member-{member.id}")
    audit(db, None, "member", "upload_photo", "member", member.id, {"method": "member_self_service"})
    db.commit()
    remove_upload(previous, "members")
    return member_dict(member)


@router.delete("/me/photo")
def member_delete_photo(db: Session = Depends(get_db), member: Member = Depends(get_current_member)):
    previous = member.photo_url
    member.photo_url = ""
    audit(db, None, "member", "delete_photo", "member", member.id, {"method": "member_self_service"})
    db.commit()
    remove_upload(previous, "members")
    return member_dict(member)


@router.post("/me/phone/code")
def member_phone_code(payload: dict = Body(...), db: Session = Depends(get_db), member: Member = Depends(get_current_member)):
    """换手机号要两步验证：先验证原手机号，再验证新手机号。"""
    purpose = str(payload.get("purpose", "")).strip()
    phone = valid_phone(str(payload.get("phone", "")))
    if purpose == "current":
        if phone != member.phone:
            raise HTTPException(400, "原手机号与当前绑定号码不一致")
        return send_otp(db, phone=phone, purpose="member_phone_current")
    if purpose == "new":
        if phone == member.phone:
            raise HTTPException(400, "新手机号不能与当前号码相同")
        if db.query(Member).filter(Member.phone == phone, Member.id != member.id, Member.deleted_at.is_(None)).first():
            raise HTTPException(400, "该手机号已被其他会员使用")
        return send_otp(db, phone=phone, purpose="member_phone_new")
    raise HTTPException(400, "不支持的验证码用途")


@router.post("/me/phone")
def member_change_phone(payload: dict = Body(...), db: Session = Depends(get_db), member: Member = Depends(get_current_member)):
    """两段验证码都通过后才换号，避免只凭短信验证码被他人顶号。"""
    new_phone = valid_phone(str(payload.get("new_phone", "")))
    if new_phone == member.phone:
        raise HTTPException(400, "新手机号不能与当前号码相同")
    if db.query(Member).filter(Member.phone == new_phone, Member.id != member.id, Member.deleted_at.is_(None)).first():
        raise HTTPException(400, "该手机号已被其他会员使用")
    verify_otp(db, phone=member.phone, purpose="member_phone_current", code=str(payload.get("current_code", "")))
    verify_otp(db, phone=new_phone, purpose="member_phone_new", code=str(payload.get("new_code", "")))
    old_phone = member.phone
    member.phone = new_phone
    audit(db, None, "member", "change_phone", "member", member.id, {"old_phone": f"{old_phone[:3]}****{old_phone[-4:]}", "new_phone": f"{new_phone[:3]}****{new_phone[-4:]}"})
    db.commit()
    db.refresh(member)
    return member_dict(member)


@router.post("/bookings")
def member_create_booking(payload: dict = Body(...), db: Session = Depends(get_db), member: Member = Depends(get_current_member)):
    session = db.get(ClassSession, as_int(payload.get("session_id", 0), "课程"))
    if not session:
        raise HTTPException(404, "课程不存在")
    booking = create_booking(db, session=session, member=member, source="public", public=True)
    db.commit()
    db.refresh(booking)
    notify_booking(db, booking)
    return booking_dict(booking)


@router.delete("/bookings/{booking_id}")
def member_cancel_booking(booking_id: int, db: Session = Depends(get_db), member: Member = Depends(get_current_member)):
    booking = db.query(Booking).filter(Booking.id == booking_id, Booking.member_id == member.id, Booking.deleted_at.is_(None)).first()
    if not booking:
        raise HTTPException(404, "预约不存在")
    if booking.status not in {"booked", "checked_in"}:
        raise HTTPException(400, "当前预约不可取消")
    if session_datetime(booking.session.session_date, booking.session.start_time) <= datetime.now():
        raise HTTPException(400, "课程已开始，无法自主取消")
    transition_booking(db, booking, "cancel", "会员自主取消")
    db.commit()
    notify_booking(db, booking, cancelled=True)
    return booking_dict(booking)


@router.get("/bookings/{booking_id}/calendar.ics")
def booking_calendar(booking_id: int, db: Session = Depends(get_db), member: Member = Depends(get_current_member)):
    booking = db.query(Booking).filter(Booking.id == booking_id, Booking.member_id == member.id, Booking.deleted_at.is_(None)).first()
    if not booking:
        raise HTTPException(404, "预约不存在")
    session = booking.session
    start = f"{session.session_date.replace('-', '')}T{session.start_time.replace(':', '')}00"
    end = f"{session.session_date.replace('-', '')}T{session.end_time.replace(':', '')}00"
    settings = db.get(AppSettings, 1)
    content = "\r\n".join(["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Yinyu Wellness//Booking//CN", "BEGIN:VEVENT", f"UID:booking-{booking.id}@yinyu.local", f"DTSTART:{start}", f"DTEND:{end}", f"SUMMARY:{session.course.name}", f"LOCATION:{settings.address}", f"DESCRIPTION:教练 {session.teacher.name} · {session.room.name}", "END:VEVENT", "END:VCALENDAR", ""])
    return Response(content=content.encode("utf-8"), media_type="text/calendar", headers={"Content-Disposition": f"attachment; filename=booking-{booking.id}.ics"})


@router.post("/orders")
def create_order(payload: dict = Body(...), db: Session = Depends(get_db), member: Member = Depends(get_current_member)):
    product = db.get(CardProduct, as_int(payload.get("product_id", 0), "卡课产品"))
    if not product or not product.active:
        raise HTTPException(404, "卡课产品不存在")
    if not product.online_sale or product.price > 5000:
        raise HTTPException(400, "该产品请联前台购买")
    code = _unique_redemption_code(db)
    from ..finance_service import default_revenue_mode

    mode = default_revenue_mode(product)
    row = Transaction(member_id=member.id, product_id=product.id, category=product.category, kind="purchase", amount=product.price, payment_method="offline_verify", status="pending", revenue_mode=mode, revenue_start_on=today() if mode == "amortized" else "", revenue_days=product.validity_days if mode == "amortized" else 0, note=f"线上申请 {product.name}，到店核验后开卡", redemption_code=code)
    db.add(row)
    db.flush()
    audit(db, None, "finance", "create_order", "transaction", row.id, {"member_id": member.id, "product_id": product.id, "method": "member_self_service"})
    db.commit()
    db.refresh(row)
    return transaction_dict(row)


@router.delete("/orders/{order_id}")
def cancel_order(order_id: int, db: Session = Depends(get_db), member: Member = Depends(get_current_member)):
    order = db.query(Transaction).filter(Transaction.id == order_id, Transaction.member_id == member.id, Transaction.deleted_at.is_(None)).first()
    if not order:
        raise HTTPException(404, "购卡申请不存在")
    if order.status != "pending":
        raise HTTPException(400, "仅待核销的购卡申请可以取消")
    now = datetime.now()
    claimed = db.query(Transaction).filter(Transaction.id == order.id, Transaction.member_id == member.id, Transaction.status == "pending").update({"status": "cancelled", "cancelled_at": now, "cancelled_by": "会员自主取消"}, synchronize_session=False)
    if claimed != 1:
        raise HTTPException(409, "订单状态刚刚发生变化，请刷新后重试")
    order.status = "cancelled"
    order.cancelled_at = now
    order.cancelled_by = "会员自主取消"
    audit(db, None, "finance", "cancel_order", "transaction", order.id, {"member_id": member.id, "method": "member_self_service"})
    db.commit()
    return transaction_dict(order)
