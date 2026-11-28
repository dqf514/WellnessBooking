"""会员卡状态口径：全系统统一的一套卡片状态判断。

会员列表、会员档案、筛选与导出都从这里取状态，避免各页面各写一套判断。
显示状态共 7 种：

    active   正常    —— 在有效期内且还有剩余次数
    pending  未激活  —— 开卡日期待定，首次签到后自动激活
    expired  已过期  —— 已过到期日
    used_up  已用完  —— 限次卡剩余次数为 0
    void     已销卡  —— 已作废
    upgraded 已升卡  —— 已转卡给别的会员
    frozen   已冻结  —— 停卡中
"""

from sqlalchemy import and_, or_
from sqlalchemy.sql.elements import ColumnElement

from .models import MemberCard
from .utils import today

ACTIVE = "active"
PENDING = "pending"
EXPIRED = "expired"
USED_UP = "used_up"
VOID = "void"
UPGRADED = "upgraded"
FROZEN = "frozen"

CARD_DISPLAY_STATUSES = [ACTIVE, PENDING, EXPIRED, USED_UP, VOID, UPGRADED, FROZEN]

CARD_DISPLAY_LABELS = {
    ACTIVE: "正常",
    PENDING: "未激活",
    EXPIRED: "已过期",
    USED_UP: "已用完",
    VOID: "已销卡",
    UPGRADED: "已升卡",
    FROZEN: "已冻结",
}

# 会员列表与会员档案的持卡状态筛选项（多选）。
CARD_FILTER_STATUSES = [ACTIVE, PENDING, EXPIRED, USED_UP]


def card_display_status(card: MemberCard) -> str:
    """卡片的显示状态：先看卡状态，再看是否激活、是否过期、次数是否用完。"""
    status = card.status or "active"
    if status == "cancelled":
        return VOID
    if status == "upgraded":
        return UPGRADED
    if status == "frozen":
        return FROZEN
    if status == "used":
        # 勤鸟历史数据里的“已用完”卡片，导入时状态就是 used。
        return USED_UP
    if card.start_pending:
        return PENDING
    if card.expires_on and card.expires_on < today():
        return EXPIRED
    if card.total_sessions is not None and (card.remaining_sessions or 0) <= 0:
        return USED_UP
    return ACTIVE


def card_status_condition(status: str) -> ColumnElement | None:
    """与 card_display_status 对应的 SQL 条件，用于把筛选下推到数据库。"""
    current = today()
    alive = and_(MemberCard.status == "active", MemberCard.deleted_at.is_(None))
    pending = and_(alive, MemberCard.start_pending.is_(True))
    not_pending = and_(alive, ~MemberCard.start_pending.is_(True))
    has_expiry = and_(MemberCard.expires_on.isnot(None), MemberCard.expires_on != "")
    not_expired = or_(~has_expiry, MemberCard.expires_on >= current)
    if status == ACTIVE:
        return and_(not_pending, not_expired, or_(MemberCard.total_sessions.is_(None), MemberCard.remaining_sessions > 0))
    if status == PENDING:
        return pending
    if status == EXPIRED:
        return and_(not_pending, has_expiry, MemberCard.expires_on < current)
    if status == USED_UP:
        return or_(
            and_(MemberCard.status == "used", MemberCard.deleted_at.is_(None)),
            and_(not_pending, not_expired, MemberCard.total_sessions.isnot(None), MemberCard.remaining_sessions <= 0),
        )
    return None
