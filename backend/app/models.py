from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(120), default="")
    phone: Mapped[str | None] = mapped_column(String(32), unique=True, nullable=True)
    role: Mapped[str] = mapped_column(String(24), default="viewer", index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Member(Base, TimestampMixin):
    __tablename__ = "members"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    name_en: Mapped[str] = mapped_column(String(120), default="")
    phone: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    gender: Mapped[str] = mapped_column(String(16), default="")
    id_number: Mapped[str] = mapped_column(String(64), default="")
    birth_date: Mapped[str] = mapped_column(String(10), default="")
    source: Mapped[str] = mapped_column(String(80), default="")
    advisor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    emergency_phone: Mapped[str] = mapped_column(String(32), default="")
    wechat: Mapped[str] = mapped_column(String(80), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    no_show_blocked_until: Mapped[str] = mapped_column(String(10), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    advisor: Mapped[User | None] = relationship()
    cards: Mapped[list["MemberCard"]] = relationship(back_populates="member")


class Teacher(Base, TimestampMixin):
    __tablename__ = "teachers"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str] = mapped_column(String(120), default="")
    phone: Mapped[str] = mapped_column(String(32), default="")
    gender: Mapped[str] = mapped_column(String(16), default="")
    specialties: Mapped[str] = mapped_column(String(300), default="")
    specialties_en: Mapped[str] = mapped_column(String(300), default="")
    bio: Mapped[str] = mapped_column(Text, default="")
    bio_en: Mapped[str] = mapped_column(Text, default="")
    image_url: Mapped[str] = mapped_column(String(600), default="")
    visible: Mapped[bool] = mapped_column(Boolean, default=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Room(Base, TimestampMixin):
    __tablename__ = "rooms"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str] = mapped_column(String(120), default="")
    capacity: Mapped[int] = mapped_column(Integer, default=10)
    color: Mapped[str] = mapped_column(String(20), default="#2f6b5b")
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Course(Base, TimestampMixin):
    __tablename__ = "courses"
    id: Mapped[int] = mapped_column(primary_key=True)
    course_type: Mapped[str] = mapped_column(String(24), index=True)
    name: Mapped[str] = mapped_column(String(160))
    name_en: Mapped[str] = mapped_column(String(160), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    description_en: Mapped[str] = mapped_column(Text, default="")
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    price: Mapped[float] = mapped_column(Float, default=0)
    color: Mapped[str] = mapped_column(String(20), default="#2f6b5b")
    image_url: Mapped[str] = mapped_column(String(600), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class ClassSession(Base, TimestampMixin):
    __tablename__ = "class_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.id"), index=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id"), index=True)
    session_date: Mapped[str] = mapped_column(String(10), index=True)
    start_time: Mapped[str] = mapped_column(String(5))
    end_time: Mapped[str] = mapped_column(String(5))
    capacity: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(20), default="scheduled", index=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    reserved_count: Mapped[int] = mapped_column(Integer, default=0)

    course: Mapped[Course] = relationship()
    teacher: Mapped[Teacher] = relationship()
    room: Mapped[Room] = relationship()
    bookings: Mapped[list["Booking"]] = relationship(back_populates="session")


class CardProduct(Base, TimestampMixin):
    __tablename__ = "card_products"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    name_en: Mapped[str] = mapped_column(String(160), default="")
    category: Mapped[str] = mapped_column(String(24), index=True)
    price: Mapped[float] = mapped_column(Float, default=0)
    original_price: Mapped[float] = mapped_column(Float, default=0)
    validity_days: Mapped[int] = mapped_column(Integer, default=30)
    total_sessions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    benefits_json: Mapped[str] = mapped_column(Text, default="[]")
    description: Mapped[str] = mapped_column(Text, default="")
    description_en: Mapped[str] = mapped_column(Text, default="")
    online_sale: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class MemberCard(Base, TimestampMixin):
    __tablename__ = "member_cards"
    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("card_products.id"))
    card_no: Mapped[str] = mapped_column(String(40), unique=True)
    purchase_price: Mapped[float] = mapped_column(Float, default=0)
    purchased_at: Mapped[str] = mapped_column(String(10), index=True)
    starts_on: Mapped[str] = mapped_column(String(10), default="")
    expires_on: Mapped[str] = mapped_column(String(10), index=True)
    total_sessions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    remaining_sessions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    benefits_json: Mapped[str] = mapped_column(Text, default="[]")
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    frozen_until: Mapped[str] = mapped_column(String(10), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    version: Mapped[int] = mapped_column(Integer, default=0)

    member: Mapped[Member] = relationship(back_populates="cards")
    product: Mapped[CardProduct] = relationship()


class Booking(Base):
    __tablename__ = "bookings"
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("class_sessions.id"), index=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    member_card_id: Mapped[int | None] = mapped_column(ForeignKey("member_cards.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="booked", index=True)
    source: Mapped[str] = mapped_column(String(20), default="admin")
    booked_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_by: Mapped[str] = mapped_column(String(80), default="")
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str] = mapped_column(Text, default="")

    session: Mapped[ClassSession] = relationship(back_populates="bookings")
    member: Mapped[Member] = relationship()
    member_card: Mapped[MemberCard | None] = relationship()


class RoomReservation(Base, TimestampMixin):
    __tablename__ = "room_reservations"
    id: Mapped[int] = mapped_column(primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    reservation_date: Mapped[str] = mapped_column(String(10), index=True)
    start_time: Mapped[str] = mapped_column(String(5))
    end_time: Mapped[str] = mapped_column(String(5))
    usage_type: Mapped[str] = mapped_column(String(24), default="internal")
    notes: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_by: Mapped[str] = mapped_column(String(80), default="")
    room: Mapped[Room] = relationship()


class MemberRecord(Base):
    __tablename__ = "member_records"
    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    teacher_id: Mapped[int | None] = mapped_column(ForeignKey("teachers.id"), nullable=True)
    record_type: Mapped[str] = mapped_column(String(24), index=True)
    title: Mapped[str] = mapped_column(String(160))
    content: Mapped[str] = mapped_column(Text, default="")
    record_date: Mapped[str] = mapped_column(String(10), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    teacher: Mapped[Teacher | None] = relationship()


class MemberDocument(Base):
    __tablename__ = "member_documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    original_name: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(255), unique=True)
    content_type: Mapped[str] = mapped_column(String(100), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_by: Mapped[str] = mapped_column(String(80), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int | None] = mapped_column(ForeignKey("members.id"), nullable=True, index=True)
    member_card_id: Mapped[int | None] = mapped_column(ForeignKey("member_cards.id"), nullable=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("card_products.id"), nullable=True)
    category: Mapped[str] = mapped_column(String(24), index=True)
    kind: Mapped[str] = mapped_column(String(24), default="purchase", index=True)
    amount: Mapped[float] = mapped_column(Float)
    payment_method: Mapped[str] = mapped_column(String(40), default="cash")
    status: Mapped[str] = mapped_column(String(20), default="paid", index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)
    note: Mapped[str] = mapped_column(Text, default="")
    redemption_code: Mapped[str | None] = mapped_column(String(30), unique=True, nullable=True)
    redeemed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    member: Mapped[Member | None] = relationship()
    product: Mapped[CardProduct | None] = relationship()


class AppSettings(Base):
    __tablename__ = "app_settings"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    venue_name: Mapped[str] = mapped_column(String(120), default="音昱 Wellness")
    venue_name_en: Mapped[str] = mapped_column(String(120), default="YINYU Wellness")
    address: Mapped[str] = mapped_column(String(300), default="上海市徐汇区建国西路 357 号")
    address_en: Mapped[str] = mapped_column(String(300), default="357 West Jianguo Road, Shanghai")
    phone: Mapped[str] = mapped_column(String(32), default="021-5555-2026")
    logo_url: Mapped[str] = mapped_column(String(600), default="")
    favicon_url: Mapped[str] = mapped_column(String(600), default="")
    booking_cutoff_minutes: Mapped[int] = mapped_column(Integer, default=120)
    no_show_block_days: Mapped[int] = mapped_column(Integer, default=7)
    reminder_hours: Mapped[int] = mapped_column(Integer, default=24)


class SmsSettings(Base):
    __tablename__ = "sms_settings"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    sp_id: Mapped[str] = mapped_column(String(32), default="")
    password_md5: Mapped[str] = mapped_column(String(64), default="")
    send_url: Mapped[str] = mapped_column(String(500), default="https://sms.shxinxinyun.com/api/send-sms-batch")
    balance_url: Mapped[str] = mapped_column(String(500), default="https://sms.shxinxinyun.com/api/balance")
    signature_prefix: Mapped[str] = mapped_column(String(32), default="【音昱上海】")
    notify_booking: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_cancel: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_reminder: Mapped[bool] = mapped_column(Boolean, default=True)
    template_booking: Mapped[str] = mapped_column(Text, default="")
    template_cancel: Mapped[str] = mapped_column(Text, default="")
    template_reminder: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)


class SmsOtpCode(Base):
    __tablename__ = "sms_otp_codes"
    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(32), index=True)
    purpose: Mapped[str] = mapped_column(String(32), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)


class SmsSendLog(Base):
    __tablename__ = "sms_send_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    purpose: Mapped[str] = mapped_column(String(40), index=True)
    phone: Mapped[str] = mapped_column(String(32), default="", index=True)
    booking_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    content: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), index=True)
    reason: Mapped[str] = mapped_column(String(80), default="")
    provider_json: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)


class OperationLog(Base):
    __tablename__ = "operation_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actor_username: Mapped[str] = mapped_column(String(80), default="", index=True)
    actor_role: Mapped[str] = mapped_column(String(24), default="")
    category: Mapped[str] = mapped_column(String(40), default="", index=True)
    action: Mapped[str] = mapped_column(String(60), default="", index=True)
    entity: Mapped[str] = mapped_column(String(40), default="")
    entity_id: Mapped[str] = mapped_column(String(60), default="")
    detail_json: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)


class BackupPlanSettings(Base):
    __tablename__ = "backup_plan_settings"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    daily_time_hm: Mapped[str] = mapped_column(String(5), default="03:00")
    keep_last: Mapped[int] = mapped_column(Integer, default=30)
    last_run_date: Mapped[str] = mapped_column(String(10), default="")
