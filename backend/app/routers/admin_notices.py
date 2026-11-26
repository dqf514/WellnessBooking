import json

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_members_view, require_members_write
from ..log_util import audit
from ..models import MemberNotice, User
from ..notice_service import notice_dict, send_notice
from ..utils import today, valid_date

router = APIRouter(prefix="/api/admin", tags=["member-notices"])


@router.get("/notices")
def list_notices(db: Session = Depends(get_db), _: User = Depends(require_members_view)):
    """会员群发通知列表：计划中的按发送日期排序，已发送的排在最后。"""
    rows = db.query(MemberNotice).order_by(MemberNotice.send_on.desc(), MemberNotice.id.desc()).all()
    return {"items": [notice_dict(row) for row in rows]}


@router.post("/notices")
def create_notice(payload: dict = Body(...), db: Session = Depends(get_db), user: User = Depends(require_members_write)):
    """新建一条群发通知计划：设置发送日期，到点后由计划任务自动群发。"""
    title = str(payload.get("title") or "").strip()
    content = str(payload.get("content") or "").strip()
    if not title:
        raise HTTPException(400, "通知标题不能为空")
    if not content:
        raise HTTPException(400, "通知内容不能为空")
    if len(content) > 500:
        raise HTTPException(400, "通知内容请控制在 500 字以内")
    scope = str(payload.get("scope") or "all")
    if scope not in {"all", "card_holders", "selected"}:
        raise HTTPException(400, "不支持的通知范围")
    member_ids = [int(item) for item in (payload.get("member_ids") or [])]
    if scope == "selected" and not member_ids:
        raise HTTPException(400, "请至少选择一位会员")
    send_on = valid_date(str(payload.get("send_on") or today()), "发送日期")
    row = MemberNotice(title=title, content=content, send_on=send_on, scope=scope, member_ids=json.dumps(member_ids), created_by=user.username)
    db.add(row)
    db.flush()
    audit(db, user, "notice", "create", "member_notice", row.id, {"send_on": send_on, "scope": scope, "member_count": len(member_ids)})
    db.commit()
    return notice_dict(row)


@router.post("/notices/{notice_id}/send")
def send_now(notice_id: int, db: Session = Depends(get_db), user: User = Depends(require_members_write)):
    """立即群发这条通知。"""
    row = db.get(MemberNotice, notice_id)
    if not row:
        raise HTTPException(404, "通知不存在")
    if row.status == "sent":
        raise HTTPException(400, "这条通知已经发送过了")
    result = send_notice(db, row)
    audit(db, user, "notice", "send", "member_notice", row.id, result)
    return {**notice_dict(row), **result}


@router.post("/notices/{notice_id}/cancel")
def cancel_notice(notice_id: int, db: Session = Depends(get_db), user: User = Depends(require_members_write)):
    """取消还没发出的通知计划。"""
    row = db.get(MemberNotice, notice_id)
    if not row:
        raise HTTPException(404, "通知不存在")
    if row.status == "sent":
        raise HTTPException(400, "已发送的通知不能取消")
    row.status = "cancelled"
    audit(db, user, "notice", "cancel", "member_notice", row.id, {"title": row.title})
    db.commit()
    return notice_dict(row)
