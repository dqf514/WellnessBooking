import json
from datetime import datetime

from sqlalchemy.orm import Session

from .models import OperationLog, SmsSendLog, User


def audit(db: Session, actor: User | None, category: str, action: str, entity: str, entity_id: int | str | None = None, detail: dict | list | str | None = None) -> None:
    db.add(OperationLog(
        actor_user_id=actor.id if actor else None,
        actor_username=actor.username if actor else "system",
        actor_role=actor.role if actor else "system",
        category=category,
        action=action,
        entity=entity,
        entity_id=str(entity_id or ""),
        detail_json=json.dumps(detail, ensure_ascii=False) if detail is not None else "",
        created_at=datetime.now(),
    ))


def sms_log(db: Session, *, purpose: str, phone: str, content: str, status: str, reason: str = "", booking_id: int | None = None, provider: dict | list | str | None = None) -> None:
    db.add(SmsSendLog(
        purpose=purpose,
        phone=phone,
        booking_id=booking_id,
        content=content,
        status=status,
        reason=reason,
        provider_json=json.dumps(provider, ensure_ascii=False) if provider is not None else "",
        created_at=datetime.now(),
    ))
