from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_reports
from ..export_service import build_sheets_workbook
from ..models import User
from ..report_service import CATEGORY_LABELS, build_report_table, report_options
from ..utils import today, valid_date
from .admin_finance import build_report

router = APIRouter(prefix="/api/admin", tags=["admin-reports"])


def _xlsx(content: bytes, filename: str) -> Response:
    return Response(content=content, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"})


def _list_param(value: str) -> list[str]:
    return [item for item in (part.strip() for part in (value or "").split(",")) if item]


def _table(db: Session, dataset: str, dimensions: str, metrics: str, date_from: str, date_to: str, **filters):
    start = valid_date(date_from or today()[:8] + "01", "开始日期")
    end = valid_date(date_to or today(), "结束日期")
    if end < start:
        raise HTTPException(400, "开始日期不能晚于结束日期")
    try:
        return build_report_table(db, dataset=dataset, dimensions=_list_param(dimensions), metrics=_list_param(metrics), start=start, end=end, filters=filters)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/reports/options")
def report_center_options(db: Session = Depends(get_db), _: User = Depends(require_reports)):
    """报表中心可选项：数据集、可分组维度、可统计指标与预设报表类型。"""
    return report_options()


@router.get("/reports/table")
def report_table(dataset: str = Query("transactions"), dimensions: str = Query(""), metrics: str = Query(""), date_from: str = Query(""), date_to: str = Query(""), category: str = Query(""), advisor: str = Query(""), teacher: str = Query(""), course_type: str = Query(""), payment: str = Query(""), member_id: int = Query(0), keyword: str = Query(""), db: Session = Depends(get_db), _: User = Depends(require_reports)):
    """按维度分组统计指标：所有报表类型共用同一套引擎。"""
    return _table(db, dataset, dimensions, metrics, date_from, date_to, category=category, advisor=advisor, teacher=teacher, course_type=course_type, payment=payment, member_id=member_id, keyword=keyword)


@router.get("/reports/table.xlsx")
def report_table_xlsx(dataset: str = Query("transactions"), dimensions: str = Query(""), metrics: str = Query(""), date_from: str = Query(""), date_to: str = Query(""), category: str = Query(""), advisor: str = Query(""), teacher: str = Query(""), course_type: str = Query(""), payment: str = Query(""), member_id: int = Query(0), keyword: str = Query(""), db: Session = Depends(get_db), _: User = Depends(require_reports)):
    """导出任意报表的 Excel：表头为中文，末行合计。"""
    data = _table(db, dataset, dimensions, metrics, date_from, date_to, category=category, advisor=advisor, teacher=teacher, course_type=course_type, payment=payment, member_id=member_id, keyword=keyword)
    headers = [column["label"] for column in data["columns"]]
    rows = [[record.get(column["key"], "") for column in data["columns"]] for record in data["rows"]]
    if data["columns"] and data["rows"]:
        totals = ["合计"] + [data["totals"].get(column["key"], "") for column in data["columns"][1:]]
        rows.append(totals)
    widths = [16] * len(headers)
    content = build_sheets_workbook([{"title": data["dataset_name"], "headers": headers, "rows": rows, "widths": widths}])
    filename = f"wellness-report-{data['dataset']}-{date_from or 'all'}-{date_to or today()}.xlsx"
    return _xlsx(content, filename)


@router.get("/reports.xlsx")
def report_overview_xlsx(date_from: str = Query(""), date_to: str = Query(""), db: Session = Depends(get_db), _: User = Depends(require_reports)):
    """导出经营总览 Excel：多页签含总览指标、分类汇总、课程与教练统计、教室使用率。"""
    start = valid_date(date_from or today()[:8] + "01", "开始日期")
    end = valid_date(date_to or today(), "结束日期")
    if end < start:
        raise HTTPException(400, "开始日期不能晚于结束日期")
    data = build_report(db, start, end)
    summary = data["summary"]
    categories = list(dict.fromkeys([item["label"] for item in data["cash_by_category"]] + [item["label"] for item in data["revenue_by_category"]]))
    sheets = [
        {"title": "经营总览", "headers": ["指标", "数值"], "rows": [
            ["统计区间", f"{start} ~ {end}"], ["确认营收", summary["revenue"]], ["现金实收", summary["cash_received"]],
            ["其中每日均摊营收", data["amortized_revenue"]], ["其中私教/评估营收", data["private_recognized_revenue"]],
            ["开课数", summary["sessions"]], ["取消课数", summary["cancelled_sessions"]], ["预约人次", summary["booking_count"]],
            ["取消预约", summary["cancelled_bookings"]], ["上课人次", summary["attendees"]],
        ], "widths": [22, 18]},
        {"title": "分类汇总", "headers": ["类别", "现金实收", "确认营收"], "rows": [
            [CATEGORY_LABELS.get(category, category),
             next((item["value"] for item in data["cash_by_category"] if item["label"] == category), 0),
             next((item["value"] for item in data["revenue_by_category"] if item["label"] == category), 0)]
            for category in categories
        ], "widths": [18, 16, 16]},
        {"title": "课程统计", "headers": ["课程", "排课数", "取消数", "预约人次", "上课人次"], "rows": [
            [item["label"], item["sessions"], item["cancelled"], item["bookings"], item["attendees"]] for item in data["course_stats"]
        ], "widths": [26, 10, 10, 12, 12]},
        {"title": "教练统计", "headers": ["教练", "排课数", "课时", "上课人次", "取消数"], "rows": [
            [item["label"], item["sessions"], item["hours"], item["attendees"], item["cancelled"]] for item in data["teacher_stats"]
        ], "widths": [18, 10, 10, 12, 10]},
        {"title": "教室使用率", "headers": ["教室", "使用小时", "内部小时", "使用率%"], "rows": [
            [item["room_name"], item["used_hours"], item["internal_hours"], item["utilization"]] for item in data["room_usage"]
        ], "widths": [18, 12, 12, 10]},
    ]
    content = build_sheets_workbook(sheets)
    return _xlsx(content, f"wellness-overview-{start}-{end}.xlsx")
