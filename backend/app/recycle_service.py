import json
import logging
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import UPLOAD_DIR
from .log_util import audit
from .models import (
    ApiKey,
    Booking,
    CardProduct,
    ClassSession,
    Course,
    ExperienceVoucher,
    Member,
    MemberCard,
    MemberCardShare,
    MemberDocument,
    MemberRecord,
    MemberReminder,
    Room,
    RoomReservation,
    Teacher,
    Transaction,
    User,
)
from .utils import dt, json_loads, overlaps, today

logger = logging.getLogger(__name__)
RETENTION_DAYS = 180
FRONTDESK_RESOURCES = {"members", "cards", "bookings", "sessions", "room-reservations", "records", "documents", "reminders", "vouchers", "shares"}
FINANCE_RESOURCES = {"products", "transactions"}
ADMIN_RESOURCES = {"users", "teachers", "rooms", "courses", "api-keys"}
RESOURCE_MODELS = {
    "users": User,
    "members": Member,
    "teachers": Teacher,
    "rooms": Room,
    "courses": Course,
    "sessions": ClassSession,
    "products": CardProduct,
    "cards": MemberCard,
    "bookings": Booking,
    "shares": MemberCardShare,
    "vouchers": ExperienceVoucher,
    "reminders": MemberReminder,
    "room-reservations": RoomReservation,
    "records": MemberRecord,
    "documents": MemberDocument,
    "transactions": Transaction,
    "api-keys": ApiKey,
}
RESOURCE_LABELS = {
    "users": "员工账号",
    "members": "会员档案",
    "teachers": "教练",
    "rooms": "教室",
    "courses": "课程",
    "sessions": "排课",
    "products": "卡课产品",
    "cards": "会员卡",
    "bookings": "已取消预约",
    "shares": "共享关系",
    "vouchers": "体验券",
    "reminders": "会员提醒",
    "room-reservations": "教室占用",
    "records": "会员记录",
    "documents": "合同 / 评估附件",
    "transactions": "手工入账",
    "api-keys": "API Key",
}


def resource_model(resource: str):
    model = RESOURCE_MODELS.get(resource)
    if not model:
        raise HTTPException(404, "回收站资源类型不存在")
    return model


def _check_write_role(resource: str, user: User) -> None:
    if user.role == "admin":
        return
    allowed = (resource in FRONTDESK_RESOURCES and user.role == "frontdesk") or (resource in FINANCE_RESOURCES and user.role == "finance")
    if not allowed:
        raise HTTPException(403, "当前角色无权删除此类型数据")


def _title(resource: str, row) -> str:
    if resource == "users":
        return f"{row.full_name or row.username} · {row.username}"
    if resource == "members":
        return f"{row.name} · {row.phone}"
    if resource in {"teachers", "rooms", "courses", "products", "api-keys"}:
        return row.name
    if resource == "sessions":
        return f"{row.course.name} · {row.session_date} {row.start_time}"
    if resource == "cards":
        return f"{row.card_no} · {row.product.name}"
    if resource == "bookings":
        return f"{row.member.name} · {row.session.course.name} {row.session.session_date}"
    if resource == "shares":
        return f"{row.card.card_no} → {row.member.name}"
    if resource == "vouchers":
        return f"{row.member.name} · {row.course_type}体验券 {row.remaining_sessions}/{row.total_sessions} 次"
    if resource == "reminders":
        return f"{row.member.name} · {row.content[:60]}"
    if resource == "room-reservations":
        return f"{row.title} · {row.reservation_date} {row.start_time}"
    if resource == "records":
        return f"{row.title} · {row.record_date}"
    if resource == "documents":
        return row.original_name
    if resource == "transactions":
        return f"手工入账 #{row.id} · ¥{row.amount:.2f}"
    return f"#{row.id}"


def _subtitle(resource: str, row) -> str:
    if resource == "documents":
        return f"{row.category} · {row.size_bytes} bytes"
    if resource == "sessions":
        return f"{row.teacher.name} · {row.room.name}"
    if resource == "cards":
        return row.member.name
    if resource == "bookings":
        return f"原状态：{row.status}"
    if resource == "transactions":
        return row.note
    if resource == "api-keys":
        return row.key_prefix
    return RESOURCE_LABELS[resource]


def recycle_dict(resource: str, row) -> dict:
    now = datetime.now()
    purge_after = row.deleted_at + timedelta(days=RETENTION_DAYS)
    return {
        "id": row.id,
        "resource": resource,
        "resource_label": RESOURCE_LABELS[resource],
        "title": _title(resource, row),
        "subtitle": _subtitle(resource, row),
        "deleted_at": dt(row.deleted_at),
        "deleted_by": row.deleted_by,
        "days_in_recycle": max(0, (now - row.deleted_at).days),
        "purge_after": dt(purge_after),
        "can_purge": now >= purge_after,
    }


def list_recycle(db: Session, resource: str = "", q: str = "") -> dict:
    resources = [resource] if resource else list(RESOURCE_MODELS)
    if resource:
        resource_model(resource)
    items = []
    for key in resources:
        model = resource_model(key)
        rows = db.query(model).filter(model.deleted_at.is_not(None)).order_by(model.deleted_at.desc()).all()
        items.extend(recycle_dict(key, row) for row in rows)
    if q.strip():
        term = q.strip().lower()
        items = [item for item in items if term in f"{item['title']} {item['subtitle']} {item['deleted_by']} {item['resource_label']}".lower()]
    items.sort(key=lambda item: item["deleted_at"], reverse=True)
    return {"items": items[:500], "total": len(items), "retention_days": RETENTION_DAYS}


def _validate_delete(db: Session, resource: str, row, user: User) -> None:
    if resource == "users":
        if row.id == user.id:
            raise HTTPException(400, "不能删除当前登录账号")
        if row.role == "admin" and row.active:
            other_admins = db.query(User).filter(User.id != row.id, User.role == "admin", User.active.is_(True), User.deleted_at.is_(None)).count()
            if not other_admins:
                raise HTTPException(400, "至少需要保留一个有效管理员账号")
    if resource == "members":
        active = db.query(Booking).filter(Booking.member_id == row.id, Booking.status.in_(["booked", "checked_in"]), Booking.deleted_at.is_(None)).count()
        if active:
            raise HTTPException(400, "该会员仍有未消课预约，请先取消或完成相关预约")
    if resource in {"courses", "teachers", "rooms"}:
        field = {"courses": ClassSession.course_id, "teachers": ClassSession.teacher_id, "rooms": ClassSession.room_id}[resource]
        future = db.query(ClassSession).filter(field == row.id, ClassSession.session_date >= today(), ClassSession.status == "scheduled", ClassSession.deleted_at.is_(None)).count()
        if future:
            raise HTTPException(400, "今天或未来仍有正常排课，请先调整相关课程")
    if resource == "cards":
        active = db.query(Booking).filter(Booking.member_card_id == row.id, Booking.status.in_(["booked", "checked_in"]), Booking.deleted_at.is_(None)).count()
        if active:
            raise HTTPException(400, "该卡仍关联未消课预约，请先处理预约")
    if resource == "sessions":
        active = db.query(Booking).filter(Booking.session_id == row.id, Booking.status.in_(["booked", "checked_in", "completed", "no_show"]), Booking.deleted_at.is_(None)).count()
        if active:
            raise HTTPException(400, "该排课仍有有效预约或到课历史，不能移入回收站")
    if resource == "bookings" and row.status != "cancelled":
        raise HTTPException(400, "仅已取消预约可移入回收站；其他记录请使用对应业务操作")
    if resource == "transactions" and row.kind != "manual":
        raise HTTPException(400, "购买、升卡和退款流水属于审计凭据，请使用退款或冲销流程，不能删除")


def _validate_restore(db: Session, resource: str, row, state: dict) -> None:
    member_id = getattr(row, "member_id", None)
    if resource != "members" and member_id:
        member = db.get(Member, member_id)
        if not member or member.deleted_at is not None:
            raise HTTPException(400, "所属会员仍在回收站，请先恢复会员档案")
    if resource == "cards" and row.member.deleted_at is not None:
        raise HTTPException(400, "请先恢复会员卡所属会员")
    if resource == "shares":
        duplicate = db.query(MemberCardShare).filter(MemberCardShare.id != row.id, MemberCardShare.card_id == row.card_id, MemberCardShare.member_id == row.member_id, MemberCardShare.deleted_at.is_(None)).first()
        if duplicate:
            raise HTTPException(400, "相同的有效共享关系已存在")
    if resource == "sessions" and state.get("status", row.status) == "scheduled":
        if not row.course.active or not row.teacher.active or not row.room.active or row.course.deleted_at or row.teacher.deleted_at or row.room.deleted_at:
            raise HTTPException(400, "课程、教练或教室已停用，不能恢复为正常排课")
        conflicts = db.query(ClassSession).filter(ClassSession.id != row.id, ClassSession.session_date == row.session_date, ClassSession.status == "scheduled", ClassSession.deleted_at.is_(None)).all()
        for other in conflicts:
            if other.room_id == row.room_id or other.teacher_id == row.teacher_id:
                if overlaps(row.start_time, row.end_time, other.start_time, other.end_time):
                    raise HTTPException(409, "恢复排课会与现有课程冲突")
        reservations = db.query(RoomReservation).filter(RoomReservation.room_id == row.room_id, RoomReservation.reservation_date == row.session_date, RoomReservation.status == "active", RoomReservation.deleted_at.is_(None)).all()
        if any(overlaps(row.start_time, row.end_time, item.start_time, item.end_time) for item in reservations):
            raise HTTPException(409, "恢复排课会与教室占用冲突")
    if resource == "room-reservations" and state.get("status", row.status) == "active":
        if not row.room.active or row.room.deleted_at is not None:
            raise HTTPException(400, "所属教室已停用，不能恢复教室占用")
        sessions = db.query(ClassSession).filter(ClassSession.room_id == row.room_id, ClassSession.session_date == row.reservation_date, ClassSession.status == "scheduled", ClassSession.deleted_at.is_(None)).all()
        if any(overlaps(row.start_time, row.end_time, item.start_time, item.end_time) for item in sessions):
            raise HTTPException(409, "恢复教室占用会与现有课程冲突")
        reservations = db.query(RoomReservation).filter(RoomReservation.id != row.id, RoomReservation.room_id == row.room_id, RoomReservation.reservation_date == row.reservation_date, RoomReservation.status == "active", RoomReservation.deleted_at.is_(None)).all()
        if any(overlaps(row.start_time, row.end_time, item.start_time, item.end_time) for item in reservations):
            raise HTTPException(409, "恢复教室占用会与其他占用冲突")


def move_to_recycle(db: Session, resource: str, entity_id: int, user: User):
    model = resource_model(resource)
    _check_write_role(resource, user)
    row = db.get(model, entity_id)
    if not row or row.deleted_at is not None:
        raise HTTPException(404, "数据不存在或已在回收站")
    _validate_delete(db, resource, row, user)
    title = _title(resource, row)
    state = {key: getattr(row, key) for key in ("active", "status", "visible") if hasattr(row, key)}
    row.deleted_state_json = json.dumps(state, ensure_ascii=False)
    row.deleted_at = datetime.now()
    row.deleted_by = user.username
    if hasattr(row, "active"):
        row.active = False
    if resource in {"sessions", "room-reservations", "cards", "vouchers"}:
        row.status = "cancelled"
    audit(db, user, "recycle_bin", "move_to_recycle", resource, entity_id, {"title": title, "purge_after": dt(row.deleted_at + timedelta(days=RETENTION_DAYS))})
    db.commit()
    return {"ok": True, "item": recycle_dict(resource, row), "message": "已移入回收站，可由管理员恢复"}


def restore_from_recycle(db: Session, resource: str, entity_id: int, user: User):
    model = resource_model(resource)
    row = db.get(model, entity_id)
    if not row or row.deleted_at is None:
        raise HTTPException(404, "回收站中不存在该数据")
    state = json_loads(row.deleted_state_json, {})
    _validate_restore(db, resource, row, state)
    for key, value in state.items():
        setattr(row, key, value)
    row.deleted_at = None
    row.deleted_by = ""
    row.deleted_state_json = "{}"
    audit(db, user, "recycle_bin", "restore", resource, entity_id, {"title": _title(resource, row)})
    db.commit()
    return {"ok": True, "message": "已恢复到原业务模块"}


def permanently_delete(db: Session, resource: str, entity_id: int, user: User):
    model = resource_model(resource)
    row = db.get(model, entity_id)
    if not row or row.deleted_at is None:
        raise HTTPException(404, "回收站中不存在该数据")
    earliest = row.deleted_at + timedelta(days=RETENTION_DAYS)
    if datetime.now() < earliest:
        raise HTTPException(400, f"删除满 {RETENTION_DAYS} 天后才可彻底删除，可删除时间：{dt(earliest)}")
    title = _title(resource, row)
    stored_name = row.stored_name if resource == "documents" else ""
    try:
        audit(db, user, "recycle_bin", "permanent_delete", resource, entity_id, {"title": title, "deleted_at": dt(row.deleted_at)})
        db.delete(row)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "仍有关联业务数据，请先将相关附件、卡或记录移入回收站并分别处理") from exc
    if stored_name:
        path = Path(UPLOAD_DIR) / stored_name
        try:
            path.unlink(missing_ok=True)
        except OSError:
            logger.warning("回收站记录已彻底删除，但附件文件移除失败：%s", path)
    return {"ok": True, "message": "已彻底删除，此操作不可恢复"}
