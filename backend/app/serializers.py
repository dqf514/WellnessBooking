from .models import Booking, CardProduct, ClassSession, Course, Member, MemberCard, Room, Teacher, Transaction, User
from .utils import dt, json_loads, today


def user_dict(row: User) -> dict:
    return {"id": row.id, "username": row.username, "full_name": row.full_name, "phone": row.phone or "", "role": row.role, "active": row.active, "created_at": dt(row.created_at)}


def member_dict(row: Member, include_cards: bool = False) -> dict:
    data = {"id": row.id, "name": row.name, "name_en": row.name_en, "phone": row.phone, "gender": row.gender, "id_number": row.id_number, "birth_date": row.birth_date, "source": row.source, "advisor_id": row.advisor_id, "advisor_name": row.advisor.full_name if row.advisor else "", "emergency_phone": row.emergency_phone, "wechat": row.wechat, "notes": row.notes, "no_show_blocked_until": row.no_show_blocked_until, "active": row.active, "created_at": dt(row.created_at)}
    if include_cards:
        data["cards"] = [card_dict(card) for card in sorted(row.cards, key=lambda item: item.id, reverse=True) if card.deleted_at is None]
    return data


def teacher_dict(row: Teacher) -> dict:
    return {"id": row.id, "user_id": row.user_id, "name": row.name, "name_en": row.name_en, "phone": row.phone, "gender": row.gender, "specialties": row.specialties, "specialties_en": row.specialties_en, "bio": row.bio, "bio_en": row.bio_en, "image_url": row.image_url, "visible": row.visible, "active": row.active}


def room_dict(row: Room) -> dict:
    return {"id": row.id, "name": row.name, "name_en": row.name_en, "capacity": row.capacity, "floor": row.floor, "sort_order": row.sort_order, "color": row.color, "active": row.active}


def course_dict(row: Course) -> dict:
    return {"id": row.id, "course_type": row.course_type, "name": row.name, "name_en": row.name_en, "description": row.description, "description_en": row.description_en, "duration_minutes": row.duration_minutes, "price": row.price, "color": row.color, "image_url": row.image_url, "active": row.active}


def product_dict(row: CardProduct) -> dict:
    return {"id": row.id, "name": row.name, "name_en": row.name_en, "category": row.category, "price": row.price, "original_price": row.original_price, "validity_days": row.validity_days, "total_sessions": row.total_sessions, "benefits": json_loads(row.benefits_json, []), "description": row.description, "description_en": row.description_en, "online_sale": row.online_sale, "active": row.active}


def card_dict(row: MemberCard) -> dict:
    expired = bool(row.expires_on and row.expires_on < today())
    shares = [share for share in getattr(row, "shares", []) if share.deleted_at is None]
    return {"id": row.id, "member_id": row.member_id, "product_id": row.product_id, "product_name": row.product.name, "product_name_en": row.product.name_en, "category": row.product.category, "card_no": row.card_no, "purchase_price": row.purchase_price, "purchased_at": row.purchased_at, "starts_on": row.starts_on, "expires_on": row.expires_on, "total_sessions": row.total_sessions, "remaining_sessions": row.remaining_sessions, "benefits": json_loads(row.benefits_json, []), "status": "expired" if expired and row.status == "active" else row.status, "frozen_until": row.frozen_until, "note": row.note, "shared_with": [{"id": share.member_id, "name": share.member.name, "phone": share.member.phone} for share in shares]}


def session_dict(row: ClassSession, detailed: bool = False) -> dict:
    occupied = row.reserved_count
    data = {"id": row.id, "course_id": row.course_id, "teacher_id": row.teacher_id, "room_id": row.room_id, "session_date": row.session_date, "start_time": row.start_time, "end_time": row.end_time, "capacity": row.capacity, "status": row.status, "notes": row.notes, "booked_count": occupied, "available": max(0, row.capacity - occupied), "course": course_dict(row.course), "teacher": teacher_dict(row.teacher), "room": room_dict(row.room)}
    if detailed:
        data["bookings"] = [booking_dict(booking, include_session=False) for booking in sorted(row.bookings, key=lambda item: (item.status == "cancelled", item.booked_at), reverse=False) if booking.deleted_at is None]
    return data


def booking_dict(row: Booking, include_session: bool = True) -> dict:
    data = {"id": row.id, "session_id": row.session_id, "member_id": row.member_id, "member": member_dict(row.member), "member_card_id": row.member_card_id, "card_name": row.member_card.product.name if row.member_card else "免费体验券" if row.experience_voucher_id else "", "experience_voucher_id": row.experience_voucher_id, "status": row.status, "source": row.source, "booked_at": dt(row.booked_at), "cancelled_at": dt(row.cancelled_at), "cancelled_by": row.cancelled_by, "checked_in_at": dt(row.checked_in_at), "completed_at": dt(row.completed_at), "consumed": row.consumed, "notes": row.notes}
    if include_session:
        data["session"] = session_dict(row.session)
    return data


def transaction_dict(row: Transaction) -> dict:
    return {"id": row.id, "member_id": row.member_id, "member_name": row.member.name if row.member else "", "member_card_id": row.member_card_id, "product_id": row.product_id, "product_name": row.product.name if row.product else "", "product_name_en": row.product.name_en if row.product else "", "category": row.category, "kind": row.kind, "amount": row.amount, "payment_method": row.payment_method, "status": row.status, "occurred_at": dt(row.occurred_at), "note": row.note, "redemption_code": row.redemption_code, "redeemed_at": dt(row.redeemed_at)}
