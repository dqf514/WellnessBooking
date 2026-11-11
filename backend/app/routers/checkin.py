from fastapi import APIRouter, Body, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ..checkin_service import issue_member_check_in_code, issue_session_check_in_code, scan_member_code, scan_session_code
from ..database import get_db
from ..deps import get_current_member, require_staff
from ..models import ClassSession, Member, User

router = APIRouter(prefix="/api", tags=["check-in"])


@router.get("/public/me/check-in-code")
def member_check_in_code(response: Response, member: Member = Depends(get_current_member)):
    response.headers["Cache-Control"] = "no-store"
    return issue_member_check_in_code(member)


@router.post("/public/check-in/scan")
def member_scan_check_in_code(payload: dict = Body(...), db: Session = Depends(get_db), member: Member = Depends(get_current_member)):
    token = str(payload.get("token", "")).strip()
    if not token:
        raise HTTPException(400, "请扫描课程签到二维码")
    return scan_session_code(db, token, member)


@router.get("/admin/sessions/{session_id}/check-in-code")
def session_check_in_code(session_id: int, response: Response, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    response.headers["Cache-Control"] = "no-store"
    session = db.get(ClassSession, session_id)
    if not session or session.deleted_at is not None:
        raise HTTPException(404, "课程不存在")
    return issue_session_check_in_code(session)


@router.post("/admin/check-in/scan")
def staff_scan_check_in_code(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_staff)):
    token = str(payload.get("token", "")).strip()
    if not token:
        raise HTTPException(400, "请扫描会员签到二维码")
    session_id = payload.get("session_id")
    return scan_member_code(db, token, user, int(session_id) if session_id is not None else None)
