"""会员群发通知：创建发送计划、群发短信，到点由计划任务自动发出。"""
import json
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .models import Member, MemberCard, MemberNotice
from .sms_service import deliver, get_settings

SCOPE_LABELS = {"all": "全部会员", "card_holders": "已购卡客户", "selected": "指定会员"}


def notice_dict(row: MemberNotice) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "content": row.content,
        "send_on": row.send_on,
        "scope": row.scope,
        "scope_label": SCOPE_LABELS.get(row.scope, row.scope),
        "member_ids": json.loads(row.member_ids or "[]"),
        "status": row.status,
        "sent_count": row.sent_count,
        "failed_count": row.failed_count,
        "created_by": row.created_by,
        "created_at": row.created_at.strftime("%Y-%m-%d %H:%M") if row.created_at else "",
        "sent_at": row.sent_at.strftime("%Y-%m-%d %H:%M") if row.sent_at else "",
    }


def _target_members(db: Session, notice: MemberNotice) -> list[Member]:
    """按范围取收件人：全部会员 / 已购卡客户 / 指定会员。"""
    query = db.query(Member).filter(Member.deleted_at.is_(None), Member.active.is_(True))
    if notice.scope == "selected":
        ids = [int(item) for item in json.loads(notice.member_ids or "[]") if str(item).isdigit()]
        if not ids:
            return []
        return query.filter(Member.id.in_(ids)).all()
    if notice.scope == "card_holders":
        holders = db.query(MemberCard.member_id).filter(MemberCard.deleted_at.is_(None)).distinct()
        return query.filter(Member.id.in_(holders)).all()
    return query.all()


def send_notice(db: Session, notice: MemberNotice) -> dict:
    """把通知群发给收件人，并把发送结果写回通知记录。

    短信通道未启用或未配置账号时不做无谓的群发：保留计划状态并给出明确提示，
    等通道开启后仍可按计划发出。
    """
    settings = get_settings(db)
    members = _target_members(db, notice)
    sent = 0
    failed = 0
    blocked_reason = ""
    for member in members:
        content = f"{settings.signature_prefix}{notice.content}".strip()
        result = deliver(db, purpose="notice", phone=member.phone, content=content)
        if result.get("sent"):
            sent += 1
        else:
            failed += 1
            blocked_reason = blocked_reason or str(result.get("reason") or "")
    if members and sent == 0 and blocked_reason in {"sms_disabled", "sms_not_configured"}:
        notice.sent_count = 0
        notice.failed_count = failed
        notice.status = "scheduled"
        db.commit()
        raise HTTPException(400, "短信通道未启用或未配置账号，通知未发出；请先在「系统设置 → 短信通知」开启真实发送")
    notice.sent_count = sent
    notice.failed_count = failed
    notice.status = "sent"
    notice.sent_at = datetime.now()
    db.commit()
    return {"total": len(members), "sent": sent, "failed": failed}


def send_due_notices(db: Session) -> int:
    """计划任务：把到期的通知计划发出去（每天 00:00 之后首次轮询即触发）。"""
    today = datetime.now().strftime("%Y-%m-%d")
    rows = db.query(MemberNotice).filter(MemberNotice.status == "scheduled", MemberNotice.send_on <= today).order_by(MemberNotice.id).all()
    count = 0
    for row in rows:
        try:
            send_notice(db, row)
            count += 1
        except HTTPException:
            # 通道未开启等情况保留计划，等条件具备后再发。
            db.rollback()
    return count
