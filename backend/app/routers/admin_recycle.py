from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_interactive_admin, require_read
from ..models import User
from ..recycle_service import list_recycle, move_to_recycle, permanently_delete, restore_from_recycle

router = APIRouter(prefix="/api/admin/recycle", tags=["recycle-bin"])


@router.get("")
def recycle_items(resource: str = Query(""), q: str = Query(""), db: Session = Depends(get_db), _: User = Depends(require_interactive_admin)):
    return list_recycle(db, resource=resource, q=q)


@router.delete("/{resource}/{entity_id}")
def delete_item(resource: str, entity_id: int, db: Session = Depends(get_db), user: User = Depends(require_read)):
    return move_to_recycle(db, resource, entity_id, user)


@router.post("/{resource}/{entity_id}/restore")
def restore_item(resource: str, entity_id: int, db: Session = Depends(get_db), user: User = Depends(require_interactive_admin)):
    return restore_from_recycle(db, resource, entity_id, user)


@router.delete("/{resource}/{entity_id}/permanent")
def purge_item(resource: str, entity_id: int, db: Session = Depends(get_db), user: User = Depends(require_interactive_admin)):
    return permanently_delete(db, resource, entity_id, user)
