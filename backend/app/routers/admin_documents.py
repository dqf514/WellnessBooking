import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..config import UPLOAD_DIR
from ..database import get_db
from ..deps import require_read, require_staff
from ..log_util import audit
from ..models import Member, MemberDocument, User
from ..utils import dt

router = APIRouter(prefix="/api/admin", tags=["member-documents"])
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".doc", ".docx", ".xls", ".xlsx", ".csv"}


def document_dict(row: MemberDocument) -> dict:
    return {"id": row.id, "category": row.category, "original_name": row.original_name, "content_type": row.content_type, "size_bytes": row.size_bytes, "uploaded_by": row.uploaded_by, "created_at": dt(row.created_at)}


@router.get("/members/{member_id}/documents")
def list_documents(member_id: int, category: str = "", db: Session = Depends(get_db), _: User = Depends(require_read)):
    if not db.get(Member, member_id):
        raise HTTPException(404, "会员不存在")
    query = db.query(MemberDocument).filter(MemberDocument.member_id == member_id)
    if category:
        query = query.filter(MemberDocument.category == category)
    rows = query.order_by(MemberDocument.id.desc()).all()
    return {"items": [document_dict(row) for row in rows]}


@router.post("/members/{member_id}/documents")
def upload_document(member_id: int, file: UploadFile = File(...), category: str = Form("contract"), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    if not db.get(Member, member_id):
        raise HTTPException(404, "会员不存在")
    if category not in {"contract", "assessment"}:
        raise HTTPException(400, "资料类别不合法")
    original_name = Path(file.filename or "").name
    extension = Path(original_name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, "支持 PDF、图片、Word、Excel 或 CSV 文件")
    raw = file.file.read(12 * 1024 * 1024 + 1)
    if len(raw) > 12 * 1024 * 1024:
        raise HTTPException(400, "单个文件不能超过 12MB")
    if not raw:
        raise HTTPException(400, "文件不能为空")
    stored_name = f"member-{member_id}-{uuid.uuid4().hex}{extension}"
    (UPLOAD_DIR / stored_name).write_bytes(raw)
    row = MemberDocument(member_id=member_id, category=category, original_name=original_name, stored_name=stored_name, content_type=file.content_type or "application/octet-stream", size_bytes=len(raw), uploaded_by=user.username)
    db.add(row)
    db.flush()
    audit(db, user, "member_document", "upload", "member_document", row.id, {"member_id": member_id, "category": category, "original_name": original_name, "size_bytes": len(raw)})
    db.commit()
    return document_dict(row)


@router.get("/documents/{document_id}/download")
def download_document(document_id: int, db: Session = Depends(get_db), _: User = Depends(require_read)):
    row = db.get(MemberDocument, document_id)
    if not row:
        raise HTTPException(404, "文件不存在")
    path = UPLOAD_DIR / row.stored_name
    if not path.exists():
        raise HTTPException(404, "文件已被移除")
    return FileResponse(path, media_type=row.content_type, filename=row.original_name)
