"""勤鸟历史数据导入接口：上传导出压缩包或指定服务器目录，导入历史数据。"""

import shutil
import uuid
import zipfile
from pathlib import Path

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..config import DATA_DIR
from ..database import get_db
from ..deps import require_interactive_admin
from ..legacy_import import import_rocketbird
from ..log_util import audit
from ..models import User

router = APIRouter(prefix="/api/admin", tags=["data-import"])
IMPORT_DIR = DATA_DIR / "imports"
MAX_UPLOAD_BYTES = 200 * 1024 * 1024
REQUIRED_FILES = ("members.csv", "member_cards.csv", "sign_logs.csv", "finance_flow.csv")


def _safe_extract(archive: zipfile.ZipFile, target: Path) -> None:
    """解压时逐个校验路径，避免出现 ../ 之类的目录穿越。"""
    for item in archive.infolist():
        name = item.filename.replace("\\", "/")
        if name.startswith("/") or ".." in Path(name).parts:
            raise HTTPException(400, "压缩包内包含非法路径")
        destination = (target / name).resolve()
        if not str(destination).startswith(str(target.resolve())):
            raise HTTPException(400, "压缩包内包含非法路径")
    archive.extractall(target)


def _locate_csv_dir(root: Path) -> Path:
    """在解压目录里找到真正放着 CSV 的那一层。"""
    if all((root / name).exists() for name in REQUIRED_FILES):
        return root
    candidates = [item for item in root.rglob("*") if item.is_dir() and all((item / name).exists() for name in REQUIRED_FILES)]
    if not candidates:
        raise HTTPException(400, "压缩包里没有找到勤鸟导出文件（至少需要 members.csv、member_cards.csv、sign_logs.csv、finance_flow.csv）")
    return sorted(candidates, key=lambda item: len(item.parts))[0]


def _run(db: Session, source: Path, *, dry_run: bool, include_logs: bool, user: User) -> dict:
    report = import_rocketbird(db, source, dry_run=dry_run, include_logs=include_logs)
    if dry_run:
        db.rollback()
    else:
        audit(db, user, "data_import", "import_rocketbird", "legacy_import", 0, {"source": str(source), "tables": report["tables"]})
        db.commit()
    return report


@router.post("/import/rocketbird/upload")
def import_rocketbird_upload(file: UploadFile = File(...), dry_run: bool = Form(False), include_logs: bool = Form(True), db: Session = Depends(get_db), user: User = Depends(require_interactive_admin)):
    original_name = Path(file.filename or "").name
    if not original_name.lower().endswith(".zip"):
        raise HTTPException(400, "请上传勤鸟导出目录的 ZIP 压缩包")
    raw = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "压缩包不能超过 200MB")
    if not raw:
        raise HTTPException(400, "文件不能为空")
    target = IMPORT_DIR / f"{uuid.uuid4().hex}"
    target.mkdir(parents=True, exist_ok=True)
    archive_path = target / original_name
    archive_path.write_bytes(raw)
    try:
        with zipfile.ZipFile(archive_path) as archive:
            _safe_extract(archive, target / "data")
        source = _locate_csv_dir(target / "data")
        report = _run(db, source, dry_run=dry_run, include_logs=include_logs, user=user)
    except zipfile.BadZipFile as exc:
        raise HTTPException(400, "压缩包无法解析，请重新打包后再试") from exc
    finally:
        # 解压出来的临时目录体积可达数百 MB，导入结束（含异常）后必须清掉。
        shutil.rmtree(target, ignore_errors=True)
    return report


@router.post("/import/rocketbird/path")
def import_rocketbird_path(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_interactive_admin)):
    source = Path(str(payload.get("path", ""))).expanduser()
    if not source.exists() or not source.is_dir():
        raise HTTPException(400, "目录不存在")
    if not all((source / name).exists() for name in REQUIRED_FILES):
        raise HTTPException(400, "目录里没有找到勤鸟导出文件（至少需要 members.csv、member_cards.csv、sign_logs.csv、finance_flow.csv）")
    return _run(db, source, dry_run=bool(payload.get("dry_run")), include_logs=payload.get("include_logs", True) is not False, user=user)
