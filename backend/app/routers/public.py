import random
from datetime import datetime

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session, joinedload

from ..booking_service import create_booking, transition_booking
from ..database import get_db
from ..deps import get_current_member
from ..models import AppSettings, Booking, CardProduct, ClassSession, Course, Member, Teacher, Transaction
from ..security import create_access_token
from ..serializers import booking_dict, card_dict, course_dict, member_dict, product_dict, session_dict, teacher_dict, transaction_dict
from ..sms_service import notify_booking, send_otp, verify_otp
from ..utils import add_days, session_datetime, today, valid_date, valid_phone

router = APIRouter(prefix="/api/public", tags=["public"])


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
def public_sessions(date_from: str = Query(default=""), date_to: str = Query(default=""), course_type: str = Query(default=""), db: Session = Depends(get_db)):
    start = valid_date(date_from or today())
    end = valid_date(date_to or add_days(start, 6))
    if end < start or (datetime.fromisoformat(end) - datetime.fromisoformat(start)).days > 31:
        raise HTTPException(400, "查询范围不合法，单次最多 31 天")
    query = db.query(ClassSession).options(joinedload(ClassSession.course), joinedload(ClassSession.teacher), joinedload(ClassSession.room), joinedload(ClassSession.bookings)).filter(ClassSession.session_date >= start, ClassSession.session_date <= end, ClassSession.status == "scheduled")
    if course_type:
        query = query.join(Course).filter(Course.course_type == course_type)
    rows = query.order_by(ClassSession.session_date, ClassSession.start_time).all()
    return {"items": [session_dict(row) for row in rows]}


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
    bookings = db.query(Booking).filter(Booking.member_id == member.id).order_by(Booking.booked_at.desc()).all()
    transactions = db.query(Transaction).filter(Transaction.member_id == member.id).order_by(Transaction.occurred_at.desc()).all()
    return {"member": member_dict(member), "cards": [card_dict(card) for card in member.cards], "bookings": [booking_dict(row) for row in bookings], "transactions": [transaction_dict(row) for row in transactions]}


@router.post("/bookings")
def member_create_booking(payload: dict = Body(...), db: Session = Depends(get_db), member: Member = Depends(get_current_member)):
    session = db.get(ClassSession, int(payload.get("session_id", 0)))
    if not session:
        raise HTTPException(404, "课程不存在")
    booking = create_booking(db, session=session, member=member, source="public", public=True)
    db.commit()
    db.refresh(booking)
    notify_booking(db, booking)
    return booking_dict(booking)


@router.delete("/bookings/{booking_id}")
def member_cancel_booking(booking_id: int, db: Session = Depends(get_db), member: Member = Depends(get_current_member)):
    booking = db.query(Booking).filter(Booking.id == booking_id, Booking.member_id == member.id).first()
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
    booking = db.query(Booking).filter(Booking.id == booking_id, Booking.member_id == member.id).first()
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
    product = db.get(CardProduct, int(payload.get("product_id", 0)))
    if not product or not product.active:
        raise HTTPException(404, "卡课产品不存在")
    if not product.online_sale or product.price > 5000:
        raise HTTPException(400, "该产品请联前台购买")
    code = f"YY{datetime.now().strftime('%y%m%d')}{random.randint(100000, 999999)}"
    row = Transaction(member_id=member.id, product_id=product.id, category=product.category, kind="purchase", amount=product.price, payment_method="offline_verify", status="pending", note=f"线上申请 {product.name}，到店核验后开卡", redemption_code=code)
    db.add(row)
    db.commit()
    db.refresh(row)
    return transaction_dict(row)
