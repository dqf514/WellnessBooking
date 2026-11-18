from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_catalog_view, require_finance_view, require_reports
from ..models import AppSettings, Transaction, User
from ..pdf_service import receipt_pdf, report_pdf, room_overview_pdf, transactions_pdf
from ..utils import today, valid_date
from .admin_finance import build_report, query_transactions

router = APIRouter(prefix="/api/admin", tags=["admin-exports"])


def _pdf(content: bytes, filename: str) -> Response:
    return Response(content=content, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"})


@router.get("/rooms/overview.pdf")
def export_room_overview(date: str = Query(""), floor: str = Query(""), db: Session = Depends(get_db), _: User = Depends(require_catalog_view)):
    day = valid_date(date or today(), "查看日期")
    content = room_overview_pdf(db, day, floor, db.get(AppSettings, 1))
    return _pdf(content, f"wellness-rooms-{day}.pdf")


@router.get("/transactions.pdf")
def export_transactions(date_from: str = Query(""), date_to: str = Query(""), category: str = Query(""), member_id: int = Query(0), db: Session = Depends(get_db), _: User = Depends(require_finance_view)):
    start = valid_date(date_from, "开始日期") if date_from else ""
    end = valid_date(date_to, "结束日期") if date_to else ""
    if start and end and end < start:
        raise HTTPException(400, "开始日期不能晚于结束日期")
    rows = query_transactions(db, start, end, category, member_id)
    content = transactions_pdf(rows, start, end, category, db.get(AppSettings, 1))
    return _pdf(content, f"wellness-transactions-{start or 'all'}-{end or today()}.pdf")


@router.get("/reports.pdf")
def export_report(date_from: str = Query(""), date_to: str = Query(""), db: Session = Depends(get_db), _: User = Depends(require_reports)):
    start = valid_date(date_from or today()[:8] + "01", "开始日期")
    end = valid_date(date_to or today(), "结束日期")
    if end < start:
        raise HTTPException(400, "开始日期不能晚于结束日期")
    content = report_pdf(build_report(db, start, end), db.get(AppSettings, 1))
    return _pdf(content, f"wellness-report-{start}-{end}.pdf")


@router.get("/transactions/{transaction_id}/receipt.pdf")
def export_receipt(transaction_id: int, db: Session = Depends(get_db), _: User = Depends(require_finance_view)):
    row = db.get(Transaction, transaction_id)
    if not row or row.deleted_at is not None:
        raise HTTPException(404, "入账记录不存在")
    if row.status not in {"paid", "refunded"}:
        raise HTTPException(400, "待核销或已取消记录不能打印账单")
    return _pdf(receipt_pdf(row, db.get(AppSettings, 1)), f"wellness-receipt-{row.id}.pdf")
