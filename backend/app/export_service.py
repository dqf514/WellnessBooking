"""Excel 导出服务：会员列表（含照片嵌入）与通用报表工作簿。"""
from datetime import datetime
from io import BytesIO

from openpyxl import Workbook
from openpyxl.drawing.image import Image as ExcelImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session

from .models import Member, MemberCard
from .upload_service import upload_path

HEADER_FILL = PatternFill("solid", fgColor="F0A868")
HEADER_FONT = Font(name="微软雅黑", size=11, bold=True, color="3B2314")
BODY_FONT = Font(name="微软雅黑", size=10)
THIN = Side(style="thin", color="E0D5C8")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
MEMBER_HEADERS = ["会员姓名", "照片", "手机号码", "生日", "性别", "会员卡类别", "合同总金额", "购买时间", "到期时间", "会籍归属", "会员时长", "备注"]
MEMBER_WIDTHS = [12, 10, 15, 12, 6, 26, 13, 12, 12, 10, 10, 28]


def _active_cards(member: Member, today: str) -> list[MemberCard]:
    return [card for card in member.cards if card.deleted_at is None and card.status == "active" and card.expires_on >= today]


def _member_years(member: Member) -> str:
    if not member.created_at:
        return ""
    days = max(0, (datetime.now() - member.created_at).days)
    if days < 365:
        return f"{days} 天"
    return f"{round(days / 365)} 年"


def _scope_members(db: Session, scope: str, month: str) -> tuple[list[Member], str]:
    """按导出范围筛选会员，并返回中文范围说明。"""
    today = datetime.now().strftime("%Y-%m-%d")
    rows = db.query(Member).filter(Member.deleted_at.is_(None)).order_by(Member.id).all()
    if scope == "new":
        month = month or today[:7]
        start, end = f"{month}-01", _month_end(month)
        rows = [row for row in rows if row.created_at and start <= row.created_at.strftime("%Y-%m-%d") <= end]
        return rows, f"{month} 新进会员"
    if scope == "renew_pending":
        month = month or today[:7]
        start, end = f"{month}-01", _month_end(month)
        result = []
        for row in rows:
            cards = _active_cards(row, today)
            expiring = [card for card in cards if start <= (card.expires_on or "") <= end]
            renewed = any(start <= (card.purchased_at or "") <= end for card in row.cards if card.deleted_at is None)
            if expiring and not renewed:
                result.append(row)
        return result, f"{month} 未续会会员"
    return rows, "全部会员"


def _month_end(month: str) -> str:
    year, mon = (int(part) for part in month.split("-")[:2])
    return f"{year:04d}-{mon:02d}-31"


def build_member_workbook(db: Session, scope: str = "all", month: str = "") -> bytes:
    """生成会员列表工作簿：中文表头、会员照片直接嵌入单元格。"""
    rows, _title = _scope_members(db, scope, month)
    today = datetime.now().strftime("%Y-%m-%d")
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "会员列表"
    for index, header in enumerate(MEMBER_HEADERS, start=1):
        cell = sheet.cell(row=1, column=index, value=header)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = BORDER
        sheet.column_dimensions[get_column_letter(index)].width = MEMBER_WIDTHS[index - 1]
    sheet.row_dimensions[1].height = 26
    for offset, member in enumerate(rows):
        row_index = offset + 2
        cards = _active_cards(member, today)
        card_names = "、".join(card.product.name for card in cards if card.product)
        total = sum(card.purchase_price for card in cards)
        purchased = min((card.purchased_at for card in cards if card.purchased_at), default="")
        expires = max((card.expires_on for card in cards if card.expires_on), default="")
        values = [member.name, "", member.phone, member.birth_date, member.gender, card_names or "未开卡", round(total, 2), purchased, expires, member.advisor.full_name if member.advisor else "", _member_years(member), member.notes]
        for index, value in enumerate(values, start=1):
            cell = sheet.cell(row=row_index, column=index, value=value)
            cell.font = BODY_FONT
            cell.border = BORDER
            cell.alignment = Alignment(horizontal="center" if index in {2, 4, 5, 7, 8, 9, 11} else "left", vertical="center")
        sheet.cell(row=row_index, column=7).number_format = "#,##0.00"
        sheet.row_dimensions[row_index].height = 72
        path = upload_path(member.photo_url, "members")
        if path:
            try:
                picture = ExcelImage(str(path))
                picture.width = 48
                picture.height = 48
                sheet.add_image(picture, f"B{row_index}")
            except Exception:  # noqa: BLE001 - 单张照片异常不应中断整表导出
                pass
    sheet.freeze_panes = "A2"
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def build_table_workbook(sheet_title: str, headers: list[str], rows: list[list], widths: list[int] | None = None) -> bytes:
    """生成通用报表工作簿：首行表头 + 数据行。"""
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = sheet_title[:31]
    for index, header in enumerate(headers, start=1):
        cell = sheet.cell(row=1, column=index, value=header)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = BORDER
        sheet.column_dimensions[get_column_letter(index)].width = (widths[index - 1] if widths and index <= len(widths) else 14)
    sheet.row_dimensions[1].height = 26
    for offset, row in enumerate(rows):
        for index, value in enumerate(row, start=1):
            cell = sheet.cell(row=offset + 2, column=index, value=value)
            cell.font = BODY_FONT
            cell.border = BORDER
            cell.alignment = Alignment(vertical="center", wrap_text=isinstance(value, str) and len(value) > 12)
    sheet.freeze_panes = "A2"
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
