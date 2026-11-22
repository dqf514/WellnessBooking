"""报表中心：多数据集、多维度分组与指标统计，所有报表统一导出 Excel。"""
from collections import defaultdict

from sqlalchemy.orm import Session

from .finance_service import revenue_breakdown
from .models import Booking, ClassSession, Member, Transaction
from .utils import add_days, minutes, today

CATEGORY_LABELS = {"group": "团课", "private": "私教/评估", "assessment": "私教/评估", "annual": "年卡/组合套餐", "package": "年卡/组合套餐", "workshop": "工作坊", "training": "培训课", "enterprise": "企业课", "misc": "杂项"}
PAYMENT_LABELS = {"cash": "现金", "pos": "POS 通", "company_qr": "公司二维码", "alipay": "支付宝", "wechat": "微信", "ar": "AR account", "ent": "ENT", "youzan": "有赞", "dianping": "大众点评", "voucher": "券", "stored_card": "储值卡", "fitness_member": "健身会员", "offline_verify": "到店核销"}
KIND_LABELS = {"purchase": "购买", "upgrade": "升卡", "manual": "手动入账", "refund": "退款", "consumption": "消课营收", "consumption_reversal": "营收冲销"}
REVENUE_MODE_LABELS = {"none": "不入营收", "immediate": "购卡即确认", "amortized": "按有效期均摊", "legacy": "历史口径"}
COURSE_TYPE_LABELS = {"group": "团课", "private": "私教", "assessment": "评估", "all": "不限"}
SESSION_STATUS_LABELS = {"scheduled": "已排课", "cancelled": "已取消", "completed": "已完成"}
BOOKING_STATUS_LABELS = {"booked": "待签到", "checked_in": "已签到", "completed": "已完成", "cancelled": "已取消", "no_show": "爽约"}
EXPIRY_LABELS = {"有效": "有效", "已到期": "已到期", "30天内到期": "30天内到期", "开卡日期待定": "开卡日期待定", "无卡": "未开卡"}


def _dimension(key: str, label: str, label_en: str = "") -> dict:
    return {"key": key, "label": label, "label_en": label_en or label}


def _metric(key: str, label: str, agg: str, fmt: str = "money", label_en: str = "", **extra) -> dict:
    return {"key": key, "label": label, "label_en": label_en or label, "agg": agg, "format": fmt, **extra}


DATASETS: dict[str, dict] = {
    "transactions": {
        "name": "财务流水",
        "name_en": "Transactions",
        "description": "购卡、升卡、退款、手动入账与消课营收，可按月份、类别、产品、会员、顾问、结账方式分组。",
        "dimensions": [
            _dimension("month", "月份", "Month"), _dimension("date", "日期", "Date"), _dimension("category", "类别", "Category"),
            _dimension("product", "产品", "Product"), _dimension("member", "会员", "Member"), _dimension("advisor", "顾问", "Advisor"),
            _dimension("payment", "结账方式", "Payment"), _dimension("kind", "入账类型", "Entry type"),
        ],
        "metrics": [
            _metric("sales_amount", "合同金额", "sum", "money", "Contract amount"),
            _metric("cash_amount", "现金实收", "sum", "money", "Cash received"),
            _metric("recognized", "确认营收", "sum", "money", "Recognized revenue"),
            _metric("refund_amount", "退款金额", "sum", "money", "Refunds"),
            _metric("amount", "流水金额", "sum", "money", "Ledger amount"),
            _metric("orders", "笔数", "count", "number", "Entries"),
            _metric("avg_order", "客单价", "avg", "money", "Average order", source="sales_amount"),
        ],
    },
    "sessions": {
        "name": "课程排课",
        "name_en": "Classes",
        "description": "按课程、教练、教室统计排课数、预约人次、上课人次与出席率。",
        "dimensions": [
            _dimension("month", "月份", "Month"), _dimension("date", "日期", "Date"), _dimension("course", "课程", "Course"),
            _dimension("course_type", "课程类型", "Course type"), _dimension("teacher", "教练", "Teacher"),
            _dimension("room", "教室", "Room"), _dimension("status", "排课状态", "Status"),
        ],
        "metrics": [
            _metric("sessions", "排课数", "count", "number", "Classes"),
            _metric("cancelled", "取消课数", "count", "number", "Cancelled"),
            _metric("bookings", "预约人次", "sum", "number", "Bookings"),
            _metric("attendees", "上课人次", "sum", "number", "Attendees"),
            _metric("hours", "课时", "sum", "number", "Hours"),
            _metric("capacity", "席位", "sum", "number", "Capacity"),
            _metric("attendance_rate", "出席率", "rate", "percent", "Attendance rate", num="attendees", den="bookings"),
        ],
    },
    "bookings": {
        "name": "预约消课",
        "name_en": "Bookings",
        "description": "按会员、课程、教练统计预约、签到、取消与爽约，以及私教消课营收。",
        "dimensions": [
            _dimension("month", "月份", "Month"), _dimension("date", "日期", "Date"), _dimension("course", "课程", "Course"),
            _dimension("teacher", "教练", "Teacher"), _dimension("room", "教室", "Room"), _dimension("member", "会员", "Member"),
            _dimension("course_type", "课程类型", "Course type"), _dimension("status", "预约状态", "Status"),
        ],
        "metrics": [
            _metric("bookings", "预约数", "count", "number", "Bookings"),
            _metric("checked_in", "签到数", "count", "number", "Check-ins"),
            _metric("cancelled", "取消数", "count", "number", "Cancellations"),
            _metric("no_show", "爽约数", "count", "number", "No-shows"),
            _metric("consume_amount", "消课营收", "sum", "money", "Consumption revenue"),
        ],
    },
    "members": {
        "name": "会员经营",
        "name_en": "Members",
        "description": "按顾问、来源、卡类别统计会员数量、新增会员、合同金额与到期情况。",
        "dimensions": [
            _dimension("advisor", "顾问", "Advisor"), _dimension("source", "来源", "Source"), _dimension("gender", "性别", "Gender"),
            _dimension("card_category", "卡类别", "Card category"), _dimension("expiry", "到期状态", "Expiry"), _dimension("member", "会员", "Member"),
        ],
        "metrics": [
            _metric("members", "会员数", "count", "number", "Members"),
            _metric("new_members", "新增会员", "count", "number", "New members"),
            _metric("contract_amount", "合同金额", "sum", "money", "Contract amount"),
            _metric("cards", "有效卡数", "count", "number", "Active cards"),
            _metric("expiring", "到期会员数", "count", "number", "Expiring members"),
        ],
    },
}

REPORT_PRESETS = [
    {"key": "sales", "name": "销售业绩报表", "name_en": "Sales report", "dataset": "transactions", "dimensions": ["advisor", "product"], "metrics": ["sales_amount", "orders", "avg_order"], "description": "按顾问与产品统计合同金额、笔数与客单价，用于销售提成与业绩回顾。"},
    {"key": "finance", "name": "财务报表", "name_en": "Finance report", "dataset": "transactions", "dimensions": ["month", "category"], "metrics": ["cash_amount", "recognized", "refund_amount", "amount", "orders"], "description": "按月份与类别查看现金实收、确认营收、退款与流水笔数。"},
    {"key": "management", "name": "教学管理报表", "name_en": "Management report", "dataset": "sessions", "dimensions": ["teacher"], "metrics": ["sessions", "cancelled", "bookings", "attendees", "hours", "attendance_rate"], "description": "按教练查看排课量、取消情况、上课人次与出席率。"},
    {"key": "executive", "name": "总经理经营报表", "name_en": "Executive report", "dataset": "transactions", "dimensions": ["month"], "metrics": ["sales_amount", "cash_amount", "recognized", "orders"], "description": "按月查看合同金额、现金实收与确认营收趋势，用于经营例会。"},
    {"key": "member", "name": "会员经营报表", "name_en": "Member report", "dataset": "members", "dimensions": ["advisor"], "metrics": ["members", "new_members", "contract_amount", "expiring"], "description": "按顾问查看会员规模、新增会员、合同金额与即将到期会员。"},
]

def _fact_transactions(db: Session, start: str, end: str) -> list[dict]:
    data = revenue_breakdown(db, start, end)
    rows: list[dict] = []
    for item in data["ledger_rows"]:
        rows.append({
            "date": item["date"], "month": item["month"], "category": CATEGORY_LABELS.get(item["category"], item["category"]),
            "product": item["product"] or "未指定产品", "member": item["member"] or "非会员", "advisor": item["advisor"] or "无顾问",
            "payment": PAYMENT_LABELS.get(item["payment"], item["payment"]), "kind": KIND_LABELS.get(item["kind"], item["kind"]),
            "member_id": item["member_id"] if "member_id" in item else 0,
            "amount": round(item["amount"], 2), "cash_amount": round(item["cash_amount"], 2), "recognized": 0.0,
            "sales_amount": round(item["sales_amount"], 2), "refund_amount": round(item["refund_amount"], 2), "orders": 1,
        })
    for item in data["revenue_rows"]:
        rows.append({
            "date": item["date"], "month": item["month"], "category": CATEGORY_LABELS.get(item["category"], item["category"]),
            "product": item["product"] or "未指定产品", "member": item["member"] or "非会员", "advisor": item["advisor"] or "无顾问",
            "payment": PAYMENT_LABELS.get(item["payment"], item["payment"]), "kind": KIND_LABELS.get(item["kind"], item["kind"]),
            "member_id": item["member_id"] if "member_id" in item else 0,
            "amount": 0.0, "cash_amount": 0.0, "recognized": round(item["recognized"], 2),
            "sales_amount": 0.0, "refund_amount": 0.0, "orders": 0,
        })
    return rows


def _fact_sessions(db: Session, start: str, end: str) -> list[dict]:
    sessions = db.query(ClassSession).filter(ClassSession.session_date >= start, ClassSession.session_date <= end, ClassSession.deleted_at.is_(None)).all()
    ids = [row.id for row in sessions]
    bookings = db.query(Booking).filter(Booking.session_id.in_(ids), Booking.deleted_at.is_(None)).all() if ids else []
    grouped = defaultdict(list)
    for row in bookings:
        grouped[row.session_id].append(row)
    rows: list[dict] = []
    for session in sessions:
        related = grouped.get(session.id, [])
        cancelled = int(session.status == "cancelled")
        rows.append({
            "date": session.session_date, "month": session.session_date[:7], "course": session.course.name,
            "course_type": COURSE_TYPE_LABELS.get(session.course.course_type, session.course.course_type),
            "teacher": session.teacher.name, "room": session.room.name,
            "status": SESSION_STATUS_LABELS.get(session.status, session.status),
            "sessions": 1, "cancelled": cancelled,
            "bookings": len([row for row in related if row.status != "cancelled"]),
            "attendees": len([row for row in related if row.status in {"checked_in", "completed"}]),
            "hours": 0.0 if cancelled else round((minutes(session.end_time) - minutes(session.start_time)) / 60, 2),
            "capacity": session.capacity,
        })
    return rows


def _fact_bookings(db: Session, start: str, end: str) -> list[dict]:
    bookings = db.query(Booking).join(ClassSession).filter(
        ClassSession.session_date >= start, ClassSession.session_date <= end,
        ClassSession.deleted_at.is_(None), Booking.deleted_at.is_(None),
    ).all()
    revenue_map: dict[int, float] = defaultdict(float)
    for row in db.query(Transaction).filter(Transaction.booking_id.isnot(None), Transaction.kind.in_(["consumption", "consumption_reversal"]), Transaction.status == "paid", Transaction.deleted_at.is_(None)).all():
        revenue_map[row.booking_id] += row.amount
    rows: list[dict] = []
    for booking in bookings:
        rows.append({
            "date": booking.session.session_date, "month": booking.session.session_date[:7], "course": booking.session.course.name,
            "teacher": booking.session.teacher.name, "room": booking.session.room.name, "member": booking.member.name if booking.member else "非会员",
            "course_type": COURSE_TYPE_LABELS.get(booking.session.course.course_type, booking.session.course.course_type),
            "status": BOOKING_STATUS_LABELS.get(booking.status, booking.status), "member_id": booking.member_id or 0,
            "bookings": 1, "checked_in": int(booking.status in {"checked_in", "completed"}),
            "cancelled": int(booking.status == "cancelled"), "no_show": int(booking.status == "no_show"),
            "consume_amount": round(revenue_map.get(booking.id, 0.0), 2),
        })
    return rows


def _fact_members(db: Session, start: str, end: str) -> list[dict]:
    members = db.query(Member).filter(Member.deleted_at.is_(None)).all()
    current = today()
    rows: list[dict] = []
    for member in members:
        cards = [card for card in member.cards if card.deleted_at is None and card.status == "active"]
        categories = sorted({card.product.category for card in cards if card.product})
        if any(card.start_pending for card in cards):
            expiry = "开卡日期待定"
        elif not cards:
            expiry = "无卡"
        elif any(card.expires_on and card.expires_on < current for card in cards):
            expiry = "已到期"
        elif any(card.expires_on and card.expires_on <= add_days(current, 30) for card in cards):
            expiry = "30天内到期"
        else:
            expiry = "有效"
        created = member.created_at.strftime("%Y-%m-%d") if member.created_at else ""
        rows.append({
            "advisor": member.advisor.full_name if member.advisor else "无顾问", "source": member.source or "未标注",
            "gender": member.gender or "未填写", "card_category": "、".join(CATEGORY_LABELS.get(item, item) for item in categories) if categories else "未开卡",
            "expiry": expiry, "member": member.name, "member_id": member.id,
            "members": 1, "new_members": int(bool(created) and start <= created <= end),
            "contract_amount": round(sum(card.purchase_price for card in cards), 2),
            "cards": len(cards), "expiring": int(expiry in {"已到期", "30天内到期"}),
        })
    return rows


FACT_BUILDERS = {"transactions": _fact_transactions, "sessions": _fact_sessions, "bookings": _fact_bookings, "members": _fact_members}


def _apply_filters(rows: list[dict], filters: dict) -> list[dict]:
    result = rows
    category = str(filters.get("category") or "").strip()
    if category:
        result = [row for row in result if row.get("category") == CATEGORY_LABELS.get(category, category)]
    advisor = str(filters.get("advisor") or "").strip()
    if advisor:
        result = [row for row in result if row.get("advisor") == advisor]
    teacher = str(filters.get("teacher") or "").strip()
    if teacher:
        result = [row for row in result if row.get("teacher") == teacher]
    course_type = str(filters.get("course_type") or "").strip()
    if course_type:
        result = [row for row in result if row.get("course_type") == COURSE_TYPE_LABELS.get(course_type, course_type)]
    member_id = int(filters.get("member_id") or 0)
    if member_id:
        result = [row for row in result if int(row.get("member_id") or 0) == member_id]
    keyword = str(filters.get("keyword") or "").strip()
    if keyword:
        result = [row for row in result if any(keyword in str(row.get(field) or "") for field in ("member", "product", "course", "teacher", "room"))]
    return result


def _metric_value(metric: dict, items: list[dict]) -> float:
    key = metric["key"]
    agg = metric.get("agg", "sum")
    if agg == "count":
        return float(sum(1 for row in items if float(row.get(key, 0) or 0) != 0))
    if agg == "avg":
        source = metric.get("source", key)
        values = [float(row.get(source, 0) or 0) for row in items if float(row.get(source, 0) or 0) != 0]
        return round(sum(values) / len(values), 2) if values else 0.0
    if agg == "rate":
        numerator = sum(float(row.get(metric.get("num", ""), 0) or 0) for row in items)
        denominator = sum(float(row.get(metric.get("den", ""), 0) or 0) for row in items)
        return round(numerator / denominator * 100, 1) if denominator else 0.0
    return round(sum(float(row.get(key, 0) or 0) for row in items), 2)


def build_report_table(db: Session, *, dataset: str, dimensions: list[str], metrics: list[str], start: str, end: str, filters: dict | None = None) -> dict:
    """按维度分组汇总指标，返回可直接渲染与导出的表格结构。"""
    definition = DATASETS.get(dataset)
    if not definition:
        raise ValueError("不支持的数据集")
    available_dimensions = {item["key"] for item in definition["dimensions"]}
    available_metrics = {item["key"]: item for item in definition["metrics"]}
    dims = [key for key in dimensions if key in available_dimensions]
    mets = [available_metrics[key] for key in metrics if key in available_metrics]
    if not mets:
        mets = list(definition["metrics"][:4])
    rows = _apply_filters(FACT_BUILDERS[dataset](db, start, end), filters or {})
    groups: dict[tuple, list[dict]] = {}
    for row in rows:
        key = tuple(str(row.get(dim) or "未分类") for dim in dims)
        groups.setdefault(key, []).append(row)
    table_rows = []
    for key, items in groups.items():
        record = {dim: value for dim, value in zip(dims, key)}
        for metric in mets:
            record[metric["key"]] = _metric_value(metric, items)
        table_rows.append(record)
    if mets:
        primary = mets[0]
        table_rows.sort(key=lambda record: (float(record.get(primary["key"], 0) or 0),), reverse=True)
    totals = {metric["key"]: _metric_value(metric, rows) for metric in mets}
    return {
        "dataset": dataset,
        "dataset_name": definition["name"],
        "columns": (
            [{"key": dim, "label": next(item["label"] for item in definition["dimensions"] if item["key"] == dim), "kind": "dimension"} for dim in dims]
            + [{"key": metric["key"], "label": metric["label"], "kind": "metric", "format": metric.get("format", "number"), "agg": metric.get("agg", "sum")} for metric in mets]
        ),
        "rows": table_rows,
        "totals": totals,
        "row_count": len(rows),
    }


def report_options() -> dict:
    """报表中心可选项：数据集、维度、指标与预设报表类型。"""
    return {
        "datasets": [{"key": key, "name": value["name"], "name_en": value["name_en"], "description": value["description"], "dimensions": value["dimensions"], "metrics": value["metrics"]} for key, value in DATASETS.items()],
        "presets": REPORT_PRESETS,
        "filters": [
            {"key": "category", "label": "类别", "options": [{"value": key, "label": label} for key, label in CATEGORY_LABELS.items()]},
            {"key": "course_type", "label": "课程类型", "options": [{"value": key, "label": label} for key, label in COURSE_TYPE_LABELS.items()]},
        ],
    }
