from datetime import datetime
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from fastapi import HTTPException
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Flowable, HRFlowable, Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from .config import UPLOAD_DIR
from .models import AppSettings, ClassSession, Course, Room, RoomReservation, Transaction

pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
FONT = "STSong-Light"
PINE = colors.HexColor("#173f35")
PINE_LIGHT = colors.HexColor("#e8efe9")
GOLD = colors.HexColor("#b89b5e")
CREAM = colors.HexColor("#f7f5ef")
INK = colors.HexColor("#243b33")
MUTED = colors.HexColor("#66776f")
LINE = colors.HexColor("#d9e1da")
WHITE = colors.white
CATEGORY_LABELS = {"group": "团课", "private": "私教/评估", "assessment": "私教/评估", "annual": "年卡/组合套餐", "package": "年卡/组合套餐", "workshop": "工作坊", "training": "培训课", "enterprise": "企业课", "misc": "杂项"}
PAYMENT_LABELS = {"cash": "现金", "pos": "POS 通", "company_qr": "公司二维码", "alipay": "支付宝", "wechat": "微信", "ar": "AR account", "ent": "ENT", "youzan": "有赞", "dianping": "大众点评", "voucher": "券", "stored_card": "储值卡", "fitness_member": "健身会员", "offline_verify": "到店核销"}
KIND_LABELS = {"purchase": "购卡", "upgrade": "升卡", "manual": "手动入账", "refund": "退款", "consumption": "消课营收", "consumption_reversal": "营收冲销"}
STATUS_LABELS = {"paid": "已入账", "pending": "待核销", "cancelled": "已取消", "refunded": "已退款"}


class BrandMark(Flowable):
    def __init__(self, size: float):
        super().__init__()
        self.width = size
        self.height = size
        self.hAlign = "CENTER"

    def draw(self):
        size = self.width
        canvas = self.canv
        canvas.setFillColor(PINE)
        canvas.circle(size / 2, size / 2, size / 2, fill=1, stroke=0)
        canvas.setStrokeColor(WHITE)
        canvas.setLineWidth(max(0.8, size * 0.035))
        canvas.line(size * 0.32, size * 0.27, size * 0.68, size * 0.73)
        canvas.arc(size * 0.22, size * 0.17, size * 0.80, size * 0.85, 25, 120)


def _style(size: float = 9, leading: float | None = None, color=INK, align: int = TA_LEFT) -> ParagraphStyle:
    return ParagraphStyle(name=f"wellness-{size}-{leading}-{align}-{color}", fontName=FONT, fontSize=size, leading=leading or size * 1.45, textColor=color, alignment=align, wordWrap="CJK", splitLongWords=True)


def _p(value, size: float = 8.5, color=INK, align: int = TA_LEFT) -> Paragraph:
    text = "—" if value is None or str(value).strip() == "" else str(value)
    return Paragraph(escape(text).replace("\n", "<br/>"), _style(size, color=color, align=align))


def _money(value: float) -> str:
    return f"¥{value:,.2f}"


def _logo_image(settings: AppSettings | None, width: float, height: float) -> Image | None:
    if not settings or not settings.logo_url:
        return None
    relative = settings.logo_url.split("?", 1)[0].removeprefix("/uploads/").strip("/")
    path = (UPLOAD_DIR / relative).resolve()
    try:
        path.relative_to(UPLOAD_DIR.resolve())
    except ValueError:
        return None
    if not path.is_file():
        return None
    try:
        return Image(path, width=width, height=height)
    except Exception:
        return None


def _brand_header(canvas, doc, settings: AppSettings | None, document_title: str) -> None:
    width, height = landscape(A4)
    canvas.saveState()
    logo_path = None
    if settings and settings.logo_url:
        relative = settings.logo_url.split("?", 1)[0].removeprefix("/uploads/").strip("/")
        candidate = (UPLOAD_DIR / relative).resolve()
        try:
            candidate.relative_to(UPLOAD_DIR.resolve())
            if candidate.is_file():
                logo_path = candidate
        except ValueError:
            pass
    if logo_path:
        canvas.drawImage(ImageReader(str(logo_path)), 14 * mm, height - 18 * mm, 11 * mm, 11 * mm, mask="auto", preserveAspectRatio=True)
    else:
        canvas.setFillColor(PINE)
        canvas.circle(19.5 * mm, height - 12.5 * mm, 5.5 * mm, fill=1, stroke=0)
        canvas.setStrokeColor(WHITE)
        canvas.setLineWidth(1.2)
        canvas.line(17 * mm, height - 15 * mm, 22 * mm, height - 10 * mm)
        canvas.arc(16 * mm, height - 17 * mm, 24 * mm, height - 8 * mm, 25, 120)
    canvas.setFillColor(PINE)
    canvas.setFont(FONT, 13)
    venue = settings.venue_name if settings else "音昱 Wellness"
    canvas.drawString(28 * mm, height - 11.5 * mm, venue)
    canvas.setFillColor(MUTED)
    canvas.setFont(FONT, 6.8)
    canvas.drawString(28 * mm, height - 16 * mm, "OCTAVE · WELLNESS OPERATIONS")
    canvas.setFillColor(PINE)
    canvas.setFont(FONT, 8.5)
    canvas.drawRightString(width - 14 * mm, height - 12 * mm, document_title)
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(1)
    canvas.line(14 * mm, height - 22 * mm, width - 14 * mm, height - 22 * mm)
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(14 * mm, 13 * mm, width - 14 * mm, 13 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont(FONT, 6.8)
    footer = settings.address if settings else "上海市徐汇区建国西路 357 号"
    phone = settings.phone if settings else ""
    canvas.drawString(14 * mm, 8 * mm, f"{footer} · {phone}")
    canvas.drawRightString(width - 14 * mm, 8 * mm, f"第 {doc.page} 页 · {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    canvas.restoreState()


def _summary_flowable(items: list[tuple[str, str]], available_width: float) -> Table:
    cells = []
    for label, value in items:
        cells.append([_p(label, 7.5, MUTED), _p(value, 14, PINE)])
    inner = [Table([[cell[0]], [cell[1]]], style=TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)])) for cell in cells]
    table = Table([inner], colWidths=[available_width / max(1, len(inner))] * len(inner))
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PINE_LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, WHITE),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return table


def _data_table(headers: list[str], rows: list[list], available_width: float, widths: list[float] | None = None) -> Table:
    col_widths = [value * mm for value in widths] if widths else [available_width / len(headers)] * len(headers)
    data = [[_p(value, 8, WHITE) for value in headers]]
    data.extend([_p(value, 8) for value in row] for row in rows)
    if len(data) == 1:
        data.append([_p("当前筛选范围暂无数据", 8.5, MUTED)] + [_p("") for _ in headers[1:]])
    table = Table(data, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), PINE),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    for index in range(1, len(data)):
        if index % 2 == 0:
            style.append(("BACKGROUND", (0, index), (-1, index), CREAM))
    table.setStyle(TableStyle(style))
    return table


def branded_table_pdf(*, title: str, subtitle: str, settings: AppSettings | None, summary: list[tuple[str, str]] | None = None, sections: list[dict]) -> bytes:
    output = BytesIO()
    page_size = landscape(A4)
    width, _ = page_size
    left = right = 14 * mm
    available_width = width - left - right
    doc = SimpleDocTemplate(output, pagesize=page_size, leftMargin=left, rightMargin=right, topMargin=29 * mm, bottomMargin=18 * mm, title=title, author="音昱 Wellness", subject=subtitle)
    story = [_p(title, 20, PINE), Spacer(1, 2 * mm), _p(subtitle, 9, MUTED), Spacer(1, 5 * mm)]
    if summary:
        story.extend([_summary_flowable(summary, available_width), Spacer(1, 6 * mm)])
    for section_index, section in enumerate(sections):
        if section_index and section.get("new_page"):
            story.append(PageBreak())
        heading = [_p(section["title"], 13, PINE), Spacer(1, 1.5 * mm), HRFlowable(width="100%", thickness=0.7, color=GOLD), Spacer(1, 3 * mm)]
        story.extend(heading)
        story.append(_data_table(section["headers"], section.get("rows", []), available_width, section.get("widths")))
        story.append(Spacer(1, 7 * mm))
    doc.build(story, onFirstPage=lambda canvas, current: _brand_header(canvas, current, settings, title), onLaterPages=lambda canvas, current: _brand_header(canvas, current, settings, title))
    return output.getvalue()


def entry_type_label(row: Transaction) -> str:
    if row.kind == "consumption_reversal":
        return "营收冲销"
    mode = row.revenue_mode or "legacy"
    cash = bool(row.cash_basis)
    if mode == "legacy":
        product = row.product
        annual = bool(product and product.category in {"annual", "package", "group"} and product.validity_days == 365)
        if annual:
            return "流水+营收（每日均摊）" if cash else "营收（每日均摊）"
        if row.category == "private" and row.kind in {"purchase", "upgrade"}:
            return "流水" if cash else "—"
        return "流水+营收" if cash else "营收"
    if mode == "amortized":
        return "流水+营收（每日均摊）" if cash else "营收（每日均摊）"
    if mode == "immediate":
        return "流水+营收" if cash else "营收"
    return "流水" if cash else "—"


def receipt_pdf(row: Transaction, settings: AppSettings | None) -> bytes:
    output = BytesIO()
    doc = SimpleDocTemplate(output, pagesize=(75 * mm, 145 * mm), leftMargin=6 * mm, rightMargin=6 * mm, topMargin=5 * mm, bottomMargin=5 * mm, title=f"Wellness 账单 #{row.id}", author="Octave Wellness")
    story = []
    logo = _logo_image(settings, 13 * mm, 13 * mm)
    if logo:
        story.extend([logo, Spacer(1, 1 * mm)])
    else:
        story.extend([BrandMark(11 * mm), Spacer(1, 1 * mm)])
    story.extend([
        _p("OCTAVE", 11, PINE, TA_CENTER),
        _p("健康管理  Wellness", 12, PINE, TA_CENTER),
        Spacer(1, 2 * mm),
        HRFlowable(width="100%", thickness=0.6, color=PINE),
        Spacer(1, 2 * mm),
        _p(f"账单编号  #{row.id}", 7.5, MUTED),
        _p(f"日期  {row.occurred_at.strftime('%Y-%m-%d')}    时间  {row.occurred_at.strftime('%H:%M')}", 8.5),
        Spacer(1, 2 * mm),
    ])
    item = row.product.name if row.product else KIND_LABELS.get(row.kind, row.kind)
    item_table = Table([
        [_p("入账项目", 8, MUTED), _p("金额", 8, MUTED, TA_RIGHT)],
        [_p(f"{CATEGORY_LABELS.get(row.category, row.category)} · {item}", 9), _p(_money(row.amount), 10, PINE, TA_RIGHT)],
        [_p(entry_type_label(row), 8.5, PINE), _p("")],
    ], colWidths=[41 * mm, 20 * mm])
    item_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    story.extend([item_table, HRFlowable(width="100%", thickness=0.4, color=LINE), Spacer(1, 1.5 * mm)])
    if row.member:
        story.append(_p(f"客户姓名  {row.member.name}", 8.5))
    story.extend([
        _p(f"结账方式  {PAYMENT_LABELS.get(row.payment_method, row.payment_method)}", 8.5),
        _p(f"备注  {row.note or '—'}", 8),
        _p(f"入账人  {row.created_by or '历史入账'}", 8.5),
        Spacer(1, 1.5 * mm),
        HRFlowable(width="100%", thickness=0.4, color=LINE),
        Spacer(1, 1.5 * mm),
    ])
    net = row.amount / 1.06
    tax = row.amount - net
    story.extend([
        _p(f"合计（已包含税）  {_money(row.amount)}", 9.5, PINE),
        _p(f"去税金额  {_money(net)}", 8.5),
        _p(f"增值税（6%）  {_money(tax)}", 8.5),
        Spacer(1, 3 * mm),
        _p("签字 Signature：________________", 8.5),
        Spacer(1, 2.5 * mm),
        HRFlowable(width="100%", thickness=0.4, color=LINE),
        Spacer(1, 1.5 * mm),
        _p("音昱听堂", 8, PINE, TA_CENTER),
        _p(settings.address if settings else "上海市徐汇区建国西路 357 号", 7, MUTED, TA_CENTER),
        _p(settings.phone if settings else "", 7.5, MUTED, TA_CENTER),
    ])
    doc.build(story)
    return output.getvalue()


def room_overview_pdf(db: Session, day: str, floor: str, settings: AppSettings | None) -> bytes:
    room_query = db.query(Room).filter(Room.active.is_(True), Room.deleted_at.is_(None))
    if floor:
        room_query = room_query.filter(Room.floor == floor)
    rooms = room_query.order_by(Room.floor, Room.sort_order, Room.id).all()
    sessions = db.query(ClassSession).join(Course).filter(ClassSession.session_date == day, ClassSession.status == "scheduled", ClassSession.deleted_at.is_(None)).order_by(ClassSession.start_time, ClassSession.id).all()
    reservations = db.query(RoomReservation).filter(RoomReservation.reservation_date == day, RoomReservation.status == "active", RoomReservation.deleted_at.is_(None)).order_by(RoomReservation.start_time, RoomReservation.id).all()
    room_ids = {room.id for room in rooms}
    rows = []
    for session in sessions:
        if session.room_id not in room_ids:
            continue
        rows.append([session.course.name, CATEGORY_LABELS.get(session.course.course_type, session.course.course_type), f"{session.start_time}–{session.end_time}", session.teacher.name, f"{session.room.name} · {session.room.floor}", f"{session.reserved_count}/{session.capacity}", session.notes])
    for reservation in reservations:
        if reservation.room_id not in room_ids:
            continue
        usage = {"internal": "内部使用", "company": "公司活动", "enterprise": "企业活动"}.get(reservation.usage_type, reservation.usage_type)
        rows.append([reservation.title, usage, f"{reservation.start_time}–{reservation.end_time}", "—", f"{reservation.room.name} · {reservation.room.floor}", "—", reservation.notes])
    rows.sort(key=lambda row: (row[2], row[4], row[0]))
    subtitle = f"安排日期：{day}    楼层：{floor or '全部楼层'}    共 {len(rows)} 项课程 / 活动"
    return branded_table_pdf(title="教室安排总览", subtitle=subtitle, settings=settings, summary=[("课程 / 活动", str(len(rows))), ("教室数量", str(len(rooms))), ("首项开始", rows[0][2].split("–")[0] if rows else "—"), ("导出日期", datetime.now().strftime("%Y-%m-%d"))], sections=[{"title": "课程与活动安排", "headers": ["课程 / 活动名称", "类型", "时间", "教练", "教室", "预约人数", "备注"], "rows": rows, "widths": [52, 23, 29, 28, 38, 22, 77]}])


def transactions_pdf(rows: list[Transaction], date_from: str, date_to: str, category: str, settings: AppSettings | None) -> bytes:
    data = []
    for row in rows:
        data.append([f"#{row.id}\n{row.occurred_at.strftime('%Y-%m-%d %H:%M')}", row.member.name if row.member else "非会员", CATEGORY_LABELS.get(row.category, row.category), KIND_LABELS.get(row.kind, row.kind), entry_type_label(row), PAYMENT_LABELS.get(row.payment_method, row.payment_method), _money(row.amount), STATUS_LABELS.get(row.status, row.status), row.note])
    cash = round(sum(row.amount for row in rows if row.cash_basis and row.status in {"paid", "refunded"}), 2)
    revenue_only = round(sum(row.amount for row in rows if not row.cash_basis and row.revenue_mode == "immediate" and row.status in {"paid", "refunded"}), 2)
    subtitle = f"统计范围：{date_from or '最早'} 至 {date_to or '当前'}    类别：{CATEGORY_LABELS.get(category, category or '全部')}"
    return branded_table_pdf(title="财务流水明细", subtitle=subtitle, settings=settings, summary=[("记录数量", f"{len(rows)} 笔"), ("现金实收", _money(cash)), ("即时营收（仅营收）", _money(revenue_only))], sections=[{"title": "流水与营收入账记录", "headers": ["编号 / 时间", "会员", "类别", "业务", "入账类型", "结账方式", "金额", "状态", "备注"], "rows": data, "widths": [29, 22, 24, 20, 32, 24, 25, 20, 93]}])


def report_pdf(data: dict, settings: AppSettings | None) -> bytes:
    summary = data["summary"]
    summary_items = [("确认营收", _money(summary["revenue"])), ("现金实收", _money(summary["cash_received"])), ("开课 / 取消", f"{summary['sessions']} / {summary['cancelled_sessions']}"), ("实际上课人次", str(summary["attendees"]))]
    sections = [
        {"title": "流水与营收分类汇总", "headers": ["类别", "现金实收", "确认营收"], "rows": [[CATEGORY_LABELS.get(key, key), _money(next((item["value"] for item in data["cash_by_category"] if item["label"] == key), 0)), _money(next((item["value"] for item in data["revenue_by_category"] if item["label"] == key), 0))] for key in dict.fromkeys([item["label"] for item in data["cash_by_category"]] + [item["label"] for item in data["revenue_by_category"]])], "widths": [89, 90, 90]},
        {"title": "课程经营数据", "headers": ["课程", "排课数", "取消数", "取消率", "预约人次", "上课人次", "参与率"], "rows": [[row["label"], row["sessions"], row["cancelled"], f"{round(row['cancelled'] / row['sessions'] * 100) if row['sessions'] else 0}%", row["bookings"], row["attendees"], f"{round(row['attendees'] / row['bookings'] * 100) if row['bookings'] else 0}%"] for row in data["course_stats"]], "widths": [85, 28, 28, 28, 34, 34, 32], "new_page": True},
        {"title": "教练课时统计", "headers": ["教练", "排课数", "课时", "上课人次", "取消数", "开课率"], "rows": [[row["label"], row["sessions"], f"{row['hours']} 小时", row["attendees"], row["cancelled"], f"{round((row['sessions'] - row['cancelled']) / row['sessions'] * 100) if row['sessions'] else 0}%"] for row in data["teacher_stats"]], "widths": [79, 35, 40, 40, 35, 40]},
        {"title": "教室使用统计", "headers": ["教室", "使用小时", "内部使用小时", "使用率", "统计口径"], "rows": [[row["room_name"], row["used_hours"], row["internal_hours"], f"{row['utilization']}%", "每日 07:00–20:00"] for row in data["room_usage"]], "widths": [70, 42, 47, 35, 75]},
        {"title": "到课时段分布", "headers": ["开始时段", "到课人次", "星期", "到课人次"], "rows": [[f"{hour['label']}:00", hour["value"], ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][index], data["weekday"][index]["value"]] for index, hour in enumerate(data["hour"]) for index in [index % 7]], "widths": [70, 64, 70, 65]},
    ]
    subtitle = f"统计范围：{data['range']['from']} 至 {data['range']['to']}    年卡/套餐均摊营收：{_money(data['amortized_revenue'])}    私教/评估营收：{_money(data['private_recognized_revenue'])}"
    return branded_table_pdf(title="经营分析报表", subtitle=subtitle, settings=settings, summary=summary_items, sections=sections)
