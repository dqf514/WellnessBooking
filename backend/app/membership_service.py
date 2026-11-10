from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from .models import ExperienceVoucher, Member, MemberReminder
from .utils import dt, today


def voucher_dict(row: ExperienceVoucher) -> dict:
    return {"id": row.id, "member_id": row.member_id, "course_type": row.course_type, "total_sessions": row.total_sessions, "remaining_sessions": row.remaining_sessions, "expires_on": row.expires_on, "status": row.status, "note": row.note, "issued_by": row.issued_by, "created_at": dt(row.created_at)}


def reminder_dict(row: MemberReminder) -> dict:
    return {"id": row.id, "member_id": row.member_id, "content": row.content, "remind_on": row.remind_on, "active": row.active, "created_by": row.created_by, "created_at": dt(row.created_at)}


def due_reminders(db: Session, member: Member) -> list[str]:
    current = datetime.fromisoformat(today()).date()
    alerts = [row.content for row in db.query(MemberReminder).filter(MemberReminder.member_id == member.id, MemberReminder.active.is_(True), MemberReminder.deleted_at.is_(None)).order_by(MemberReminder.remind_on, MemberReminder.id).all() if not row.remind_on or row.remind_on <= today()]
    if member.birth_date:
        try:
            birth = datetime.fromisoformat(member.birth_date).date()
            birthday = birth.replace(year=current.year)
            if birthday < current:
                birthday = birthday.replace(year=current.year + 1)
            days = (birthday - current).days
            if days <= 7:
                alerts.append(f"会员生日：{birthday.isoformat()}（{'今天生日' if days == 0 else f'还有 {days} 天'}）")
        except ValueError:
            pass
    return alerts


def find_available_voucher(db: Session, member: Member, course_type: str, on_date: str) -> ExperienceVoucher | None:
    return db.query(ExperienceVoucher).filter(ExperienceVoucher.member_id == member.id, ExperienceVoucher.status == "active", ExperienceVoucher.course_type.in_([course_type, "all"]), ExperienceVoucher.expires_on >= on_date, ExperienceVoucher.remaining_sessions > 0, ExperienceVoucher.deleted_at.is_(None)).order_by(ExperienceVoucher.expires_on, ExperienceVoucher.id).first()
