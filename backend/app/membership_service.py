from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .models import ExperienceVoucher, Member, MemberReminder
from .utils import dt, today

# 获客来源的常用选项：按健身与康养场馆的常见渠道整理，后台改为下拉选择。
MEMBER_SOURCE_OPTIONS = [
    "到店路过",
    "朋友推荐",
    "教练推荐",
    "老会员复购",
    "线上注册",
    "小红书",
    "抖音",
    "微信公众号/视频号",
    "微信朋友圈/社群",
    "搜索引擎",
    "大众点评",
    "美团团购",
    "异业合作",
    "企业团建",
    "活动/体验课",
    "其他",
]
SOURCE_OTHER = "其他"
SOURCE_PREFIX = f"{SOURCE_OTHER} · "


def normalize_member_source(value) -> str:
    """获客来源是有限选项，这里只做空白与长度规整，保留历史自定义写法。"""
    source = str(value or "").strip()
    if len(source) > 20:
        raise HTTPException(400, "获客来源不能超过 20 个字")
    return source


def split_member_source(source: str) -> tuple[str, str]:
    """把“其他 · 说明”这类来源拆成（选项，说明）两部分。"""
    value = (source or "").strip()
    if value.startswith(SOURCE_PREFIX):
        return SOURCE_OTHER, value[len(SOURCE_PREFIX):].strip()
    return value, ""


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


def find_available_voucher(db: Session, member: Member, course_types: list[str] | str, on_date: str) -> ExperienceVoucher | None:
    """查找可用体验券：course_types 可传多个类别（健康评估等课程会带上备用类别）。"""
    values = [course_types] if isinstance(course_types, str) else list(course_types)
    values = list(dict.fromkeys([*values, "all"]))
    return db.query(ExperienceVoucher).filter(ExperienceVoucher.member_id == member.id, ExperienceVoucher.status == "active", ExperienceVoucher.course_type.in_(values), ExperienceVoucher.expires_on >= on_date, ExperienceVoucher.remaining_sessions > 0, ExperienceVoucher.deleted_at.is_(None)).order_by(ExperienceVoucher.expires_on, ExperienceVoucher.id).first()
