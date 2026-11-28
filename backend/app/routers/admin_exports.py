from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session, joinedload, selectinload

from ..database import get_db
from ..deps import require_catalog_view, require_finance_view, require_members_view
from ..export_service import build_member_workbook
from ..member_export_service import build_member_profile_workbook
from ..models import AppSettings, Member, MemberCard, Transaction, User
from ..pdf_service import PAYMENT_LABELS, receipt_pdf, room_overview_pdf, transactions_pdf
from ..utils import today, valid_date
from .admin_finance import finance_totals, query_transactions, split_payment_methods

router = APIRouter(prefix="/api/admin", tags=["admin-exports"])


def _pdf(content: bytes, filename: str) -> Response:
    return Response(content=content, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"})


@router.get("/rooms/overview.pdf")
def export_room_overview(date: str = Query(""), floor: str = Query(""), db: Session = Depends(get_db), _: User = Depends(require_catalog_view)):
    day = valid_date(date or today(), "查看日期")
    content = room_overview_pdf(db, day, floor, db.get(AppSettings, 1))
    return _pdf(content, f"wellness-rooms-{day}.pdf")


@router.get("/transactions.pdf")
def export_transactions(date_from: str = Query(""), date_to: str = Query(""), category: str = Query(""), payment_method: str = Query(""), member_id: int = Query(0), db: Session = Depends(get_db), _: User = Depends(require_finance_view)):
    start = valid_date(date_from, "开始日期") if date_from else ""
    end = valid_date(date_to, "结束日期") if date_to else ""
    if start and end and end < start:
        raise HTTPException(400, "开始日期不能晚于结束日期")
    rows = query_transactions(db, start, end, category, member_id, payment_method)
    totals = finance_totals(db, rows, date_from=start, date_to=end, category=category, member_id=member_id, payment_method=payment_method)
    totals["payment_label"] = "、".join(PAYMENT_LABELS.get(item, item) for item in split_payment_methods(payment_method)) or "全部"
    content = transactions_pdf(rows, start, end, category, db.get(AppSettings, 1), totals)
    return _pdf(content, f"wellness-transactions-{start or 'all'}-{end or today()}.pdf")


@router.get("/export/members.xlsx")
def export_members_xlsx(scope: str = Query("all"), month: str = Query(""), categories: str = Query(""), only_cards: bool = Query(True), db: Session = Depends(get_db), _: User = Depends(require_members_view)):
    """会员列表 Excel 导出：中文表头并嵌入会员照片；scope = all / new / renew_pending。

    categories 支持多选卡种（团课 / 私教 / 年卡-组合套餐），only_cards 只导出真正买过卡的客户。
    """
    if scope not in {"all", "new", "renew_pending"}:
        raise HTTPException(400, "不支持的导出范围")
    wanted = [item for item in categories.split(",") if item]
    content = build_member_workbook(db, scope, month, wanted, only_cards)
    filename = f"wellness-members-{scope}-{month or today()}.xlsx"
    return Response(content=content, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"})


@router.get("/members/{member_id}/export.xlsx")
def export_member_profile_xlsx(member_id: int, db: Session = Depends(get_db), _: User = Depends(require_members_view)):
    """客户档案整包导出：一张 Excel、多张 Sheet，含该会员的全部上课记录。

    档案页的上课记录是分页懒加载的，一屏看不全；这里一次性导出资料、会员卡、
    团课/私教/其它预约记录、私教跟进、体测评估、消费流水、体验券、提醒与合同资料。
    """
    row = db.query(Member).options(
        joinedload(Member.advisor),
        selectinload(Member.cards).joinedload(MemberCard.product),
        selectinload(Member.cards).selectinload(MemberCard.shares),
    ).filter(Member.id == member_id).first()
    if not row or row.deleted_at is not None:
        raise HTTPException(404, "会员不存在")
    content = build_member_profile_workbook(db, row)
    filename = f"wellness-member-{member_id}-{today()}.xlsx"
    return Response(content=content, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"})


@router.get("/transactions/{transaction_id}/receipt.pdf")
def export_receipt(transaction_id: int, db: Session = Depends(get_db), _: User = Depends(require_finance_view)):
    row = db.get(Transaction, transaction_id)
    if not row or row.deleted_at is not None:
        raise HTTPException(404, "入账记录不存在")
    if row.status not in {"paid", "refunded"}:
        raise HTTPException(400, "待核销或已取消记录不能打印账单")
    return _pdf(receipt_pdf(row, db.get(AppSettings, 1)), f"wellness-receipt-{row.id}.pdf")
