import csv
import io
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from ..config import BACKUP_DIR, DATABASE_URL, DATA_DIR
from ..database import SessionLocal, engine, get_db
from ..deps import require_admin
from ..log_util import audit
from ..models import BackupPlanSettings, Booking, Member, Transaction, User
from ..utils import dt, valid_phone

router = APIRouter(prefix="/api/admin/maintenance", tags=["maintenance"])


def _database_path() -> Path:
    prefix = "sqlite:///"
    if not DATABASE_URL.startswith(prefix) or ":memory:" in DATABASE_URL:
        raise HTTPException(501, "当前备份工具仅支持 SQLite 文件数据库")
    return Path(DATABASE_URL[len(prefix):])


def create_backup() -> Path:
    source = _database_path()
    if not source.exists():
        raise HTTPException(500, "数据库文件不存在")
    target = BACKUP_DIR / f"wellness-backup-{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.db"
    source_connection = sqlite3.connect(str(source), timeout=30)
    target_connection = sqlite3.connect(str(target))
    try:
        source_connection.backup(target_connection)
    finally:
        target_connection.close()
        source_connection.close()
    return target


def _backup_plan(db: Session) -> BackupPlanSettings:
    row = db.get(BackupPlanSettings, 1)
    if not row:
        row = BackupPlanSettings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def cleanup_backups(keep_last: int) -> None:
    files = sorted(BACKUP_DIR.glob("wellness-backup-*.db"), key=lambda path: path.stat().st_mtime, reverse=True)
    for path in files[max(1, min(keep_last, 3650)):]:
        path.unlink(missing_ok=True)


def _csv(filename: str, fieldnames: list[str], rows: list[dict]) -> StreamingResponse:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    data = buffer.getvalue().encode("utf-8-sig")
    return StreamingResponse(io.BytesIO(data), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("/backup-db")
def backup_now(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    path = create_backup()
    cleanup_backups(_backup_plan(db).keep_last)
    audit(db, user, "maintenance", "backup_db", "database", detail={"filename": path.name, "size": path.stat().st_size})
    db.commit()
    return {"ok": True, "filename": path.name, "size_bytes": path.stat().st_size, "message": "数据库已一致性备份"}


@router.get("/backups")
def list_backups(_: User = Depends(require_admin)):
    items = [{"filename": path.name, "size_bytes": path.stat().st_size, "modified_at": datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")} for path in BACKUP_DIR.glob("*.db") if path.is_file()]
    return {"items": sorted(items, key=lambda item: item["modified_at"], reverse=True)}


@router.get("/backups/download")
def download_backup(filename: str = Query(...), _: User = Depends(require_admin)):
    if Path(filename).name != filename or not filename.endswith(".db"):
        raise HTTPException(400, "文件名不合法")
    path = BACKUP_DIR / filename
    if not path.exists():
        raise HTTPException(404, "备份文件不存在")
    return FileResponse(path, media_type="application/octet-stream", filename=filename)


def _validate_sqlite(path: Path) -> None:
    if path.stat().st_size < 100:
        raise HTTPException(400, "数据库文件无效")
    with path.open("rb") as handle:
        if handle.read(16) != b"SQLite format 3\x00":
            raise HTTPException(400, "仅支持有效的 SQLite 数据库")
    connection = sqlite3.connect(str(path))
    try:
        result = connection.execute("PRAGMA integrity_check").fetchone()
        if not result or result[0] != "ok":
            raise HTTPException(400, "数据库完整性校验失败")
        if not connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='members'").fetchone():
            raise HTTPException(400, "这不是 Wellness 系统数据库")
    finally:
        connection.close()


def _restore(path: Path, actor: User) -> str:
    _validate_sqlite(path)
    before = create_backup()
    target = _database_path()
    engine.dispose()
    for suffix in ("-wal", "-shm"):
        Path(f"{target}{suffix}").unlink(missing_ok=True)
    shutil.copy2(path, target)
    db = SessionLocal()
    try:
        audit(db, actor, "maintenance", "restore_db", "database", detail={"source": path.name, "before_backup": before.name})
        db.commit()
    finally:
        db.close()
    return before.name


@router.post("/restore-db/from-backup")
def restore_backup(filename: str = Query(...), db: Session = Depends(get_db), user: User = Depends(require_admin)):
    if Path(filename).name != filename or not filename.endswith(".db"):
        raise HTTPException(400, "文件名不合法")
    path = BACKUP_DIR / filename
    if not path.exists():
        raise HTTPException(404, "备份文件不存在")
    db.close()
    before = _restore(path, user)
    return {"ok": True, "before_backup": before, "message": "数据库已恢复，请重新登录并重启后端服务"}


@router.post("/restore-db/upload")
def restore_upload(file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(require_admin)):
    if not file.filename or not file.filename.lower().endswith(".db"):
        raise HTTPException(400, "请上传 .db 文件")
    raw = file.file.read(101 * 1024 * 1024)
    if len(raw) > 100 * 1024 * 1024:
        raise HTTPException(400, "备份文件不能超过 100MB")
    path = BACKUP_DIR / f"restore-upload-{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    path.write_bytes(raw)
    db.close()
    before = _restore(path, user)
    return {"ok": True, "before_backup": before, "message": "上传数据库已恢复，请重新登录并重启后端服务"}


@router.get("/backup-plan")
def get_backup_plan(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    row = _backup_plan(db)
    return {"enabled": row.enabled, "daily_time_hm": row.daily_time_hm, "keep_last": row.keep_last, "last_run_date": row.last_run_date}


@router.put("/backup-plan")
def put_backup_plan(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_admin)):
    row = _backup_plan(db)
    hm = str(payload.get("daily_time_hm", row.daily_time_hm))
    try:
        parsed = datetime.strptime(hm, "%H:%M")
    except ValueError:
        raise HTTPException(400, "时间格式应为 HH:MM") from None
    row.enabled = bool(payload.get("enabled", row.enabled))
    row.daily_time_hm = parsed.strftime("%H:%M")
    row.keep_last = max(1, min(3650, int(payload.get("keep_last", row.keep_last))))
    audit(db, user, "maintenance", "update_backup_plan", "backup_plan", 1, payload)
    db.commit()
    cleanup_backups(row.keep_last)
    return {"ok": True, "enabled": row.enabled, "daily_time_hm": row.daily_time_hm, "keep_last": row.keep_last, "last_run_date": row.last_run_date}


@router.get("/export/{kind}.csv")
def export_csv(kind: str, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    if kind == "members":
        rows = [{"id": row.id, "name": row.name, "name_en": row.name_en, "phone": row.phone, "gender": row.gender, "birth_date": row.birth_date, "source": row.source, "wechat": row.wechat, "emergency_phone": row.emergency_phone, "notes": row.notes, "created_at": dt(row.created_at)} for row in db.query(Member).order_by(Member.id).all()]
        fields = ["id", "name", "name_en", "phone", "gender", "birth_date", "source", "wechat", "emergency_phone", "notes", "created_at"]
    elif kind == "bookings":
        rows = [{"id": row.id, "member": row.member.name, "phone": row.member.phone, "course": row.session.course.name, "teacher": row.session.teacher.name, "room": row.session.room.name, "date": row.session.session_date, "start_time": row.session.start_time, "end_time": row.session.end_time, "status": row.status, "source": row.source, "booked_at": dt(row.booked_at), "cancelled_at": dt(row.cancelled_at), "cancelled_by": row.cancelled_by} for row in db.query(Booking).order_by(Booking.id).all()]
        fields = ["id", "member", "phone", "course", "teacher", "room", "date", "start_time", "end_time", "status", "source", "booked_at", "cancelled_at", "cancelled_by"]
    elif kind == "transactions":
        rows = [{"id": row.id, "member": row.member.name if row.member else "", "category": row.category, "kind": row.kind, "amount": row.amount, "payment_method": row.payment_method, "status": row.status, "occurred_at": dt(row.occurred_at), "note": row.note, "redemption_code": row.redemption_code} for row in db.query(Transaction).order_by(Transaction.id).all()]
        fields = ["id", "member", "category", "kind", "amount", "payment_method", "status", "occurred_at", "note", "redemption_code"]
    else:
        raise HTTPException(404, "不支持的导出类型")
    audit(db, user, "maintenance", "export_csv", kind, detail={"rows": len(rows)})
    db.commit()
    return _csv(f"wellness-{kind}-{datetime.now().strftime('%Y%m%d')}.csv", fields, rows)


@router.get("/members-template.csv")
def members_template(_: User = Depends(require_admin)):
    return _csv("members-import-template.csv", ["name", "name_en", "phone", "gender", "birth_date", "source", "wechat", "emergency_phone", "notes"], [{"name": "张三", "name_en": "San Zhang", "phone": "13800000000", "gender": "女", "birth_date": "1990-01-01", "source": "朋友推荐", "wechat": "demo", "emergency_phone": "13900000000", "notes": "示例"}])


@router.post("/members/import.csv")
def import_members(duplicate_strategy: str = Query("skip", pattern="^(skip|update)$"), file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(require_admin)):
    raw = file.file.read(5 * 1024 * 1024 + 1)
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(400, "CSV 文件不能超过 5MB")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "CSV 编码需为 UTF-8") from None
    reader = csv.DictReader(io.StringIO(text))
    created, updated, skipped, errors = 0, 0, 0, []
    allowed = {"name", "name_en", "phone", "gender", "birth_date", "source", "wechat", "emergency_phone", "notes"}
    for line, values in enumerate(reader, start=2):
        data = {key: str(values.get(key, "") or "").strip() for key in allowed}
        try:
            if not data["name"]:
                raise ValueError("姓名不能为空")
            valid_phone(data["phone"])
        except HTTPException as exc:
            errors.append(f"第 {line} 行：{exc.detail}")
            continue
        except ValueError as exc:
            errors.append(f"第 {line} 行：{exc}")
            continue
        row = db.query(Member).filter(Member.phone == data["phone"]).first()
        if row and duplicate_strategy == "skip":
            skipped += 1
            continue
        if row:
            for key, value in data.items():
                setattr(row, key, value)
            updated += 1
        else:
            db.add(Member(**data))
            created += 1
    audit(db, user, "maintenance", "import_members", "member", detail={"created": created, "updated": updated, "skipped": skipped, "errors": errors})
    db.commit()
    return {"ok": True, "created": created, "updated": updated, "skipped": skipped, "error_count": len(errors), "errors": errors[:100]}
