"""员工手机号占用处理。

背景：`User.phone` 上有数据库级唯一约束（unique=True -> sqlite_autoindex），
唯一约束**包含回收站（软删）里的账号**，而原来的业务校验只查 `deleted_at IS NULL`，
于是「号码被已删除账号占用」时校验放行、数据库拒绝，最终抛 IntegrityError -> 500。

约定（与产品确认一致）：
- 与**正常账号**冲突   -> 友好 400，提示已被谁绑定
- 与**回收站账号**冲突 -> 自动清空对方号码，实现号码转移，不阻断操作
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .models import User
from .utils import valid_phone


def claim_phone(db: Session, phone: str, exclude_id: int | None = None) -> None:
    """占用一个手机号：冲突时按上述约定处理；phone 为空串表示清空，直接放行。"""
    phone = valid_phone(phone) if phone else ""
    if not phone:
        return
    query = db.query(User).filter(User.phone == phone)
    if exclude_id is not None:
        query = query.filter(User.id != exclude_id)

    active_dup = query.filter(User.deleted_at.is_(None)).first()
    if active_dup:
        label = active_dup.full_name or active_dup.username
        raise HTTPException(400, f"该手机号已被 {label}（{active_dup.username}）绑定")

    # 只与回收站里的账号冲突：释放对方号码，完成转移。
    # 必须立即执行 SQL 并 flush——同表多行 UPDATE 的 ORM 提交顺序不保证，
    # 若先更新占用方再释放方，唯一约束会在语句级立刻失败。
    stale_ids = [row.id for row in query.filter(User.deleted_at.is_not(None)).all()]
    if stale_ids:
        db.query(User).filter(User.id.in_(stale_ids)).update({"phone": None}, synchronize_session=False)
        db.flush()
