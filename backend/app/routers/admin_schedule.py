import uuid
from pathlib import Path

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from ..booking_service import create_booking, transition_booking
from ..config import UPLOAD_DIR
from ..database import get_db
from ..deps import require_admin, require_read, require_staff
from ..log_util import audit
from ..membership_service import due_reminders
from ..models import Booking, ClassSession, Course, Member, Room, RoomReservation, Teacher, User
from ..serializers import booking_dict, course_dict, room_dict, session_dict, teacher_dict
from ..sms_service import notify_booking
from ..utils import add_days, clean_payload, minutes, overlaps, today, valid_date, valid_time

router = APIRouter(prefix="/api/admin", tags=["admin-schedule"])
SESSION_FIELDS = {"course_id", "teacher_id", "room_id", "session_date", "start_time", "end_time", "capacity", "status", "notes"}
ROOM_FIELDS = {"name", "name_en", "capacity", "floor", "sort_order", "color", "active"}


def _session_query(db: Session):
    return db.query(ClassSession).options(joinedload(ClassSession.course), joinedload(ClassSession.teacher), joinedload(ClassSession.room), joinedload(ClassSession.bookings).joinedload(Booking.member))


def _validate_session(db: Session, data: dict, exclude_id: int | None = None) -> None:
    valid_date(str(data.get("session_date", "")), "上课日期")
    valid_time(str(data.get("start_time", "")), "开始时间")
    valid_time(str(data.get("end_time", "")), "结束时间")
    if minutes(data["end_time"]) <= minutes(data["start_time"]):
        raise HTTPException(400, "结束时间必须晚于开始时间")
    if int(data.get("capacity", 0)) < 1:
        raise HTTPException(400, "可约人数至少为 1")
    course = db.get(Course, int(data.get("course_id", 0)))
    teacher = db.get(Teacher, int(data.get("teacher_id", 0)))
    room = db.get(Room, int(data.get("room_id", 0)))
    if not course or not teacher or not room:
        raise HTTPException(400, "课程、教练或教室不存在")
    if not course.active or not teacher.active or not room.active:
        raise HTTPException(400, "课程、教练或教室已停用")
    if exclude_id:
        current = db.get(ClassSession, exclude_id)
        if current and int(data["capacity"]) < current.reserved_count:
            raise HTTPException(400, f"容量不能低于已预约人数 {current.reserved_count}")
    conflicts = db.query(ClassSession).filter(ClassSession.session_date == data["session_date"], ClassSession.status == "scheduled", or_(ClassSession.room_id == data["room_id"], ClassSession.teacher_id == data["teacher_id"]))
    if exclude_id:
        conflicts = conflicts.filter(ClassSession.id != exclude_id)
    for row in conflicts.all():
        if overlaps(data["start_time"], data["end_time"], row.start_time, row.end_time):
            reason = "教室" if row.room_id == data["room_id"] else "教练"
            raise HTTPException(409, f"{reason}时间冲突：{row.course.name} {row.start_time}-{row.end_time}")
    room_bookings = db.query(RoomReservation).filter(RoomReservation.room_id == data["room_id"], RoomReservation.reservation_date == data["session_date"], RoomReservation.status == "active").all()
    for row in room_bookings:
        if overlaps(data["start_time"], data["end_time"], row.start_time, row.end_time):
            raise HTTPException(409, f"教室已被“{row.title}”占用")


def _validate_room_reservation(db: Session, room: Room, day: str, start: str, end: str, exclude_id: int | None = None) -> None:
    for row in db.query(ClassSession).filter(ClassSession.room_id == room.id, ClassSession.session_date == day, ClassSession.status == "scheduled").all():
        if overlaps(start, end, row.start_time, row.end_time):
            raise HTTPException(409, f"与课程 {row.course.name} 冲突")
    query = db.query(RoomReservation).filter(RoomReservation.room_id == room.id, RoomReservation.reservation_date == day, RoomReservation.status == "active")
    if exclude_id:
        query = query.filter(RoomReservation.id != exclude_id)
    for row in query.all():
        if overlaps(start, end, row.start_time, row.end_time):
            raise HTTPException(409, f"与预约 {row.title} 冲突")


@router.get("/sessions")
def list_sessions(date_from: str = Query(""), date_to: str = Query(""), detailed: bool = Query(False), course_type: str = Query(""), db: Session = Depends(get_db), _: User = Depends(require_read)):
    start = valid_date(date_from or today())
    end = valid_date(date_to or add_days(start, 6))
    query = _session_query(db).filter(ClassSession.session_date >= start, ClassSession.session_date <= end)
    if course_type:
        query = query.join(Course).filter(Course.course_type.in_(course_type.split(",")))
    rows = query.order_by(ClassSession.session_date, ClassSession.start_time).all()
    return {"items": [session_dict(row, detailed=detailed) for row in rows]}


@router.post("/sessions")
def create_session(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    data = clean_payload(payload, SESSION_FIELDS)
    _validate_session(db, data)
    row = ClassSession(**data)
    db.add(row)
    db.flush()
    audit(db, user, "schedule", "create", "class_session", row.id, data)
    db.commit()
    db.refresh(row)
    return session_dict(row, detailed=True)


@router.post("/private-bookings")
def create_private_booking(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    member = db.get(Member, int(payload.get("member_id", 0)))
    course = db.get(Course, int(payload.get("course_id", 0)))
    if not member or not course or course.course_type not in {"private", "assessment"}:
        raise HTTPException(400, "请选择有效的会员和私教服务")
    data = clean_payload(payload, SESSION_FIELDS)
    data["capacity"] = 1
    data["status"] = "scheduled"
    _validate_session(db, data)
    session = ClassSession(**data)
    db.add(session)
    db.flush()
    booking = create_booking(db, session=session, member=member, source="admin")
    booking.notes = str(payload.get("notes", ""))
    audit(db, user, "booking", "create_private", "booking", booking.id, {"session_id": session.id, "member_id": member.id})
    db.commit()
    notify_booking(db, booking)
    return {"session": session_dict(session), "booking": booking_dict(booking)}


@router.patch("/sessions/{session_id}")
def update_session(session_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    row = db.get(ClassSession, session_id)
    if not row:
        raise HTTPException(404, "排课不存在")
    current = {key: getattr(row, key) for key in SESSION_FIELDS}
    current.update(clean_payload(payload, SESSION_FIELDS))
    _validate_session(db, current, exclude_id=session_id)
    for key, value in clean_payload(payload, SESSION_FIELDS).items():
        setattr(row, key, value)
    audit(db, user, "schedule", "update", "class_session", session_id, payload)
    db.commit()
    return session_dict(row, detailed=True)


@router.delete("/sessions/{session_id}")
def cancel_session(session_id: int, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    row = db.get(ClassSession, session_id)
    if not row:
        raise HTTPException(404, "排课不存在")
    row.status = "cancelled"
    affected = []
    for booking in row.bookings:
        if booking.status in {"booked", "checked_in"}:
            transition_booking(db, booking, "cancel", user.username)
            affected.append(booking)
    audit(db, user, "schedule", "cancel", "class_session", session_id, {"cancelled_bookings": len(affected)})
    db.commit()
    for booking in affected:
        notify_booking(db, booking, cancelled=True)
    return {"ok": True, "cancelled_bookings": len(affected)}


@router.delete("/sessions/{session_id}/permanent")
def delete_session(session_id: int, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    row = db.get(ClassSession, session_id)
    if not row:
        raise HTTPException(404, "排课不存在")
    if db.query(Booking).filter(Booking.session_id == session_id).count():
        raise HTTPException(400, "该排课已有预约记录，请使用“取消课程”保留业务与财务历史")
    db.delete(row)
    audit(db, user, "schedule", "delete", "class_session", session_id)
    db.commit()
    return {"ok": True}


@router.post("/sessions/copy-week")
def copy_week(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    target = valid_date(str(payload.get("week_start", "")), "目标周日期")
    source = add_days(target, -7)
    rows = db.query(ClassSession).filter(ClassSession.session_date >= source, ClassSession.session_date <= add_days(source, 6), ClassSession.status == "scheduled").all()
    created, skipped = 0, []
    for source_row in rows:
        data = {key: getattr(source_row, key) for key in SESSION_FIELDS}
        data["session_date"] = add_days(source_row.session_date, 7)
        data["status"] = "scheduled"
        duplicate = db.query(ClassSession).filter(ClassSession.course_id == data["course_id"], ClassSession.teacher_id == data["teacher_id"], ClassSession.room_id == data["room_id"], ClassSession.session_date == data["session_date"], ClassSession.start_time == data["start_time"]).first()
        if duplicate:
            skipped.append(f"{data['session_date']} {data['start_time']} 已存在")
            continue
        try:
            _validate_session(db, data)
        except HTTPException as exc:
            skipped.append(f"{data['session_date']} {data['start_time']}：{exc.detail}")
            continue
        db.add(ClassSession(**data))
        created += 1
    audit(db, user, "schedule", "copy_week", "class_session", detail={"source_week": source, "target_week": target, "created": created, "skipped": skipped})
    db.commit()
    return {"ok": True, "created": created, "skipped": skipped}


@router.post("/sessions/{session_id}/bookings")
def admin_create_booking(session_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    session = db.get(ClassSession, session_id)
    member = db.get(Member, int(payload.get("member_id", 0)))
    if not session or not member:
        raise HTTPException(404, "课程或会员不存在")
    booking = create_booking(db, session=session, member=member, source="admin")
    booking.notes = str(payload.get("notes", ""))
    audit(db, user, "booking", "create", "booking", booking.id, {"session_id": session_id, "member_id": member.id})
    db.commit()
    notify_booking(db, booking)
    return booking_dict(booking)


@router.post("/bookings/{booking_id}/{action}")
def booking_action(booking_id: int, action: str, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    booking = db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(404, "预约不存在")
    transition_booking(db, booking, action, user.username)
    audit(db, user, "booking", action, "booking", booking_id, {"member_id": booking.member_id, "session_id": booking.session_id})
    alerts = due_reminders(db, booking.member) if action == "check_in" else []
    db.commit()
    if action == "cancel":
        notify_booking(db, booking, cancelled=True)
    return {**booking_dict(booking), "member_reminders": alerts}


@router.get("/rooms/overview")
def room_overview(date: str = Query(""), floor: str = Query(""), db: Session = Depends(get_db), _: User = Depends(require_read)):
    day = valid_date(date or today())
    query = db.query(Room).filter(Room.active.is_(True))
    if floor:
        query = query.filter(Room.floor == floor)
    rooms = query.order_by(Room.floor, Room.sort_order, Room.id).all()
    sessions = db.query(ClassSession).filter(ClassSession.session_date == day, ClassSession.status == "scheduled").order_by(ClassSession.start_time).all()
    reservations = db.query(RoomReservation).filter(RoomReservation.reservation_date == day, RoomReservation.status == "active").all()
    return {"date": day, "rooms": [{**room_dict(room), "sessions": [session_dict(row) for row in sessions if row.room_id == room.id], "reservations": [{"id": row.id, "room_id": row.room_id, "title": row.title, "reservation_date": row.reservation_date, "start_time": row.start_time, "end_time": row.end_time, "usage_type": row.usage_type, "notes": row.notes} for row in reservations if row.room_id == room.id]} for room in rooms]}


@router.post("/room-reservations")
def reserve_room(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    room = db.get(Room, int(payload.get("room_id", 0)))
    if not room:
        raise HTTPException(404, "教室不存在")
    day = valid_date(str(payload.get("reservation_date", "")), "预约日期")
    start = valid_time(str(payload.get("start_time", "")), "开始时间")
    end = valid_time(str(payload.get("end_time", "")), "结束时间")
    if minutes(end) <= minutes(start):
        raise HTTPException(400, "结束时间必须晚于开始时间")
    repeat = max(1, min(52, int(payload.get("repeat_weeks", 1))))
    title = str(payload.get("title", "")).strip()
    if not title:
        raise HTTPException(400, "预约用途不能为空")
    created, skipped = 0, []
    for index in range(repeat):
        current_day = add_days(day, index * 7)
        try:
            _validate_room_reservation(db, room, current_day, start, end)
        except HTTPException as exc:
            skipped.append(f"{current_day} {exc.detail}")
            continue
        db.add(RoomReservation(room_id=room.id, title=title, reservation_date=current_day, start_time=start, end_time=end, usage_type=str(payload.get("usage_type", "internal")), notes=str(payload.get("notes", "")), created_by=user.username))
        created += 1
    audit(db, user, "room", "reserve", "room", room.id, {"created": created, "repeat_weeks": repeat, "skipped": skipped})
    db.commit()
    return {"ok": True, "created": created, "skipped": skipped}


@router.patch("/room-reservations/{reservation_id}")
def update_room_reservation(reservation_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    row = db.get(RoomReservation, reservation_id)
    if not row:
        raise HTTPException(404, "教室预约不存在")
    room = db.get(Room, int(payload.get("room_id", row.room_id)))
    if not room:
        raise HTTPException(404, "教室不存在")
    day = valid_date(str(payload.get("reservation_date", row.reservation_date)), "预约日期")
    start = valid_time(str(payload.get("start_time", row.start_time)), "开始时间")
    end = valid_time(str(payload.get("end_time", row.end_time)), "结束时间")
    if minutes(end) <= minutes(start):
        raise HTTPException(400, "结束时间必须晚于开始时间")
    title = str(payload.get("title", row.title)).strip()
    if not title:
        raise HTTPException(400, "预约用途不能为空")
    _validate_room_reservation(db, room, day, start, end, reservation_id)
    row.room_id = room.id
    row.reservation_date = day
    row.start_time = start
    row.end_time = end
    row.title = title
    row.usage_type = str(payload.get("usage_type", row.usage_type))
    row.notes = str(payload.get("notes", row.notes))
    audit(db, user, "room", "update_reservation", "room_reservation", reservation_id, payload)
    db.commit()
    return {"ok": True}


@router.delete("/room-reservations/{reservation_id}")
def cancel_room_reservation(reservation_id: int, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    row = db.get(RoomReservation, reservation_id)
    if not row:
        raise HTTPException(404, "教室预约不存在")
    row.status = "cancelled"
    audit(db, user, "room", "cancel_reservation", "room_reservation", reservation_id)
    db.commit()
    return {"ok": True}


@router.post("/courses")
def create_course(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_admin)):
    allowed = {"course_type", "name", "name_en", "description", "description_en", "duration_minutes", "price", "color", "image_url", "active"}
    row = Course(**clean_payload(payload, allowed))
    db.add(row)
    db.flush()
    audit(db, user, "catalog", "create", "course", row.id)
    db.commit()
    return course_dict(row)


@router.patch("/courses/{course_id}")
def update_course(course_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_admin)):
    row = db.get(Course, course_id)
    if not row:
        raise HTTPException(404, "课程不存在")
    allowed = {"course_type", "name", "name_en", "description", "description_en", "duration_minutes", "price", "color", "image_url", "active"}
    for key, value in clean_payload(payload, allowed).items():
        setattr(row, key, value)
    audit(db, user, "catalog", "update", "course", course_id, payload)
    db.commit()
    return course_dict(row)


@router.post("/rooms")
def create_room(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_admin)):
    data = clean_payload(payload, ROOM_FIELDS)
    data["sort_order"] = int(data.get("sort_order", db.query(Room).count()))
    row = Room(**data)
    db.add(row)
    db.flush()
    audit(db, user, "catalog", "create", "room", row.id)
    db.commit()
    return room_dict(row)


@router.patch("/rooms/{room_id}")
def update_room(room_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_admin)):
    row = db.get(Room, room_id)
    if not row:
        raise HTTPException(404, "教室不存在")
    for key, value in clean_payload(payload, ROOM_FIELDS).items():
        setattr(row, key, value)
    audit(db, user, "catalog", "update", "room", room_id, payload)
    db.commit()
    return room_dict(row)


@router.post("/rooms/reorder")
def reorder_rooms(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_admin)):
    ids = [int(value) for value in payload.get("room_ids", [])]
    rooms = db.query(Room).filter(Room.id.in_(ids)).all() if ids else []
    if len(rooms) != len(set(ids)) or len(ids) != db.query(Room).count():
        raise HTTPException(400, "请提交完整的教室排序")
    positions = {room_id: index for index, room_id in enumerate(ids)}
    for room in rooms:
        room.sort_order = positions[room.id]
    audit(db, user, "catalog", "reorder", "room", detail={"room_ids": ids})
    db.commit()
    return {"ok": True}


@router.post("/teachers")
def create_teacher(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_admin)):
    allowed = {"user_id", "name", "name_en", "phone", "gender", "specialties", "specialties_en", "bio", "bio_en", "image_url", "visible", "active"}
    row = Teacher(**clean_payload(payload, allowed))
    db.add(row)
    db.flush()
    audit(db, user, "catalog", "create", "teacher", row.id)
    db.commit()
    return teacher_dict(row)


@router.patch("/teachers/{teacher_id}")
def update_teacher(teacher_id: int, payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_admin)):
    row = db.get(Teacher, teacher_id)
    if not row:
        raise HTTPException(404, "教练不存在")
    allowed = {"user_id", "name", "name_en", "phone", "gender", "specialties", "specialties_en", "bio", "bio_en", "image_url", "visible", "active"}
    for key, value in clean_payload(payload, allowed).items():
        setattr(row, key, value)
    audit(db, user, "catalog", "update", "teacher", teacher_id, payload)
    db.commit()
    return teacher_dict(row)


@router.post("/teachers/{teacher_id}/photo")
def upload_teacher_photo(teacher_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(require_admin)):
    row = db.get(Teacher, teacher_id)
    if not row:
        raise HTTPException(404, "教练不存在")
    raw = file.file.read(4 * 1024 * 1024 + 1)
    if len(raw) > 4 * 1024 * 1024:
        raise HTTPException(400, "教练照片不能超过 4MB")
    extension = Path(file.filename or "").suffix.lower()
    valid = (extension == ".png" and raw.startswith(b"\x89PNG\r\n\x1a\n")) or (extension in {".jpg", ".jpeg"} and raw.startswith(b"\xff\xd8")) or (extension == ".webp" and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP")
    if not valid:
        raise HTTPException(400, "仅支持 PNG、JPG 或 WebP 照片")
    directory = UPLOAD_DIR / "teachers"
    directory.mkdir(parents=True, exist_ok=True)
    stored_name = f"teacher-{teacher_id}-{uuid.uuid4().hex}{extension}"
    (directory / stored_name).write_bytes(raw)
    row.image_url = f"/uploads/teachers/{stored_name}"
    audit(db, user, "catalog", "upload_photo", "teacher", teacher_id, {"size_bytes": len(raw)})
    db.commit()
    return teacher_dict(row)
