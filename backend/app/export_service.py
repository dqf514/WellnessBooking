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

# 卡种统计页的排序与中文名：年卡/组合套餐排最前，其次团课、私教、评估。
CATEGORY_ORDER = {"annual": 0, "package": 1, "group": 2, "private": 3, "assessment": 4, "workshop": 5, "training": 6}
CATEGORY_LABELS = {"group": "团课", "private": "私教", "assessment": "评估", "annual": "年卡/组合套餐", "package": "年卡/组合套餐", "workshop": "工作坊", "training": "培训课"}
# 会员列表按卡种排序时的档位：年卡/组合套餐 → 团课 → 私教/评估 → 未开卡。
CATEGORY_SORT_ORDER = {"annual": 0, "package": 0, "group": 1, "private": 2, "assessment": 2}


def _active_cards(member: Member, today: str) -> list[MemberCard]:
    # 开卡日期待定的卡没有到期日，同样算作有效卡。
    return [card for card in member.cards if card.deleted_at is None and card.status == "active" and (card.start_pending or card.expires_on >= today)]


def _member_cards(member: Member) -> list[MemberCard]:
    """会员名下所有未删除的卡（含已过期），用于判断是否真的买过卡。"""
    return [card for card in member.cards if card.deleted_at is None]


# 卡种分组：私教含评估，年卡/组合套餐含旧 package 类别，与财务口径保持一致。
CATEGORY_FILTERS = {"group": {"group"}, "private": {"private", "assessment"}, "assessment": {"assessment"}, "annual": {"annual", "package"}, "package": {"annual", "package"}}


def _wanted_categories(values: list[str]) -> set[str]:
    wanted: set[str] = set()
    for item in values:
        wanted |= CATEGORY_FILTERS.get(item, {item})
    return wanted


def filter_members_by_cards(rows: list[Member], categories: list[str] | None, only_card_holders: bool) -> list[Member]:
    """按卡种/是否购卡过滤会员：导出与列表共用同一套口径。"""
    wanted = _wanted_categories([item for item in (categories or []) if item])
    if not wanted and not only_card_holders:
        return rows
    result = []
    for row in rows:
        cards = _member_cards(row)
        if only_card_holders and not cards:
            continue
        if wanted and not any(card.product and card.product.category in wanted for card in cards):
            continue
        result.append(row)
    return result


def _card_names(cards: list[MemberCard]) -> str:
    """导出用的卡种清单：正常卡优先、同名卡不重复，已失效的标注出来。"""
    current = datetime.now().strftime("%Y-%m-%d")
    seen: set[int] = set()
    names: list[str] = []
    for card in sorted(cards, key=lambda item: (item.status != "active", -(item.purchase_price or 0), item.id)):
        if not card.product or card.product.id in seen:
            continue
        seen.add(card.product.id)
        expired = card.status != "active" or (not card.start_pending and (card.expires_on or "") < current)
        names.append(f"{card.product.name}（已失效）" if expired else card.product.name)
    return "、".join(names)


def primary_card(member: Member) -> MemberCard | None:
    """主卡：优先正常有效卡，其次购卡金额最高的卡；用于排序与卡种统计。"""
    current = datetime.now().strftime("%Y-%m-%d")
    cards = [card for card in _member_cards(member) if card.product]
    if not cards:
        return None
    def key(card: MemberCard):
        active = card.status == "active" and (card.start_pending or (card.expires_on or "") >= current)
        return (0 if active else 1, -(card.purchase_price or 0), card.expires_on or "", card.id)
    return sorted(cards, key=key)[0]


def member_card_sort_key(member: Member) -> tuple:
    """按卡种分组、组内按卡值从高到低排序，最后按姓名。"""
    card = primary_card(member)
    if not card or not card.product:
        return (99, 0.0, member.name or "", member.id)
    return (CATEGORY_SORT_ORDER.get(card.product.category, 90), -(card.purchase_price or 0), member.name or "", member.id)


def member_card_stats(rows: list[Member]) -> list[dict]:
    """每种会员卡各有多少位会员（按人计，同一人同卡种只算一次）。"""
    counts: dict[int, dict] = {}
    for row in rows:
        seen: set[int] = set()
        for card in _member_cards(row):
            if not card.product or card.product.id in seen:
                continue
            seen.add(card.product.id)
            item = counts.setdefault(card.product.id, {"product_id": card.product.id, "name": card.product.name, "name_en": card.product.name_en, "category": card.product.category, "count": 0})
            item["count"] += 1
    return sorted(counts.values(), key=lambda item: (CATEGORY_SORT_ORDER.get(item["category"], 90), -item["count"], item["name"]))


def _member_years(member: Member) -> str:
    if not member.created_at:
        return ""
    days = max(0, (datetime.now() - member.created_at).days)
    if days < 365:
        return f"{days} 天"
    return f"{round(days / 365)} 年"


def _scope_members(db: Session, scope: str, month: str, categories: list[str] | None = None, only_card_holders: bool = False) -> tuple[list[Member], str]:
    """按导出范围筛选会员，并返回中文范围说明。"""
    today = datetime.now().strftime("%Y-%m-%d")
    rows = db.query(Member).filter(Member.deleted_at.is_(None)).order_by(Member.id).all()
    if scope == "new":
        month = month or today[:7]
        start, end = f"{month}-01", _month_end(month)
        rows = [row for row in rows if row.created_at and start <= row.created_at.strftime("%Y-%m-%d") <= end]
        return filter_members_by_cards(rows, categories, only_card_holders), f"{month} 新进会员"
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
        return filter_members_by_cards(result, categories, only_card_holders), f"{month} 未续会会员"
    return filter_members_by_cards(rows, categories, only_card_holders), "全部会员"


def _month_end(month: str) -> str:
    year, mon = (int(part) for part in month.split("-")[:2])
    return f"{year:04d}-{mon:02d}-31"


def build_member_workbook(db: Session, scope: str = "all", month: str = "", categories: list[str] | None = None, only_card_holders: bool = False) -> bytes:
    """生成会员列表工作簿：中文表头、会员照片直接嵌入单元格，并附卡种统计页。"""
    rows, _title = _scope_members(db, scope, month, categories, only_card_holders)
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
    stats: dict[tuple[str, str], int] = {}
    for offset, member in enumerate(rows):
        row_index = offset + 2
        cards = _member_cards(member)
        for card in cards:
            if card.product:
                key = (card.product.category, card.product.name)
                stats[key] = stats.get(key, 0) + 1
        card_names = _card_names(cards)
        total = sum(card.purchase_price for card in cards)
        purchased = min((card.purchased_at for card in cards if card.purchased_at), default="")
        expires = max((card.expires_on for card in cards if card.expires_on), default="")
        if not expires and any(card.start_pending for card in cards):
            expires = "待开卡"
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
    _append_card_stats_sheet(workbook, stats, rows)
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _append_card_stats_sheet(workbook: Workbook, stats: dict[tuple[str, str], int], rows: list[Member]) -> None:
    """附一页卡种统计：每种会员卡各有多少位会员。"""
    sheet = workbook.create_sheet(title="卡种统计")
    headers = ["卡种", "会员卡名称", "会员人数"]
    for index, header in enumerate(headers, start=1):
        cell = sheet.cell(row=1, column=index, value=header)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = BORDER
        sheet.column_dimensions[get_column_letter(index)].width = [16, 28, 12][index - 1]
    sheet.row_dimensions[1].height = 26
    ordered = sorted(stats.items(), key=lambda item: (CATEGORY_ORDER.get(item[0][0], 9), -item[1], item[0][1]))
    for offset, ((category, name), count) in enumerate(ordered):
        row_index = offset + 2
        for index, value in enumerate([CATEGORY_LABELS.get(category, category), name, count], start=1):
            cell = sheet.cell(row=row_index, column=index, value=value)
            cell.font = BODY_FONT
            cell.border = BORDER
            cell.alignment = Alignment(horizontal="center" if index in {1, 3} else "left", vertical="center")
    total_row = len(ordered) + 2
    for index, value in enumerate(["合计", "", len(rows)], start=1):
        cell = sheet.cell(row=total_row, column=index, value=value)
        cell.font = Font(name="微软雅黑", size=10, bold=True)
        cell.border = BORDER
        cell.alignment = Alignment(horizontal="center" if index in {1, 3} else "left", vertical="center")
    sheet.freeze_panes = "A2"


def build_table_workbook(sheet_title: str, headers: list[str], rows: list[list], widths: list[int] | None = None) -> bytes:
    """生成通用报表工作簿：首行表头 + 数据行。"""
    return build_sheets_workbook([{"title": sheet_title, "headers": headers, "rows": rows, "widths": widths}])


def build_sheets_workbook(sheets: list[dict]) -> bytes:
    """生成多页工作簿：每页含表头与数据行，页签名称不超过 31 字。"""
    workbook = Workbook()
    workbook.remove(workbook.active)
    for index, sheet_data in enumerate(sheets):
        title = (sheet_data.get("title") or f"表{index + 1}")[:31]
        sheet = workbook.create_sheet(title=title)
        headers = sheet_data.get("headers") or []
        rows = sheet_data.get("rows") or []
        widths = sheet_data.get("widths")
        for column, header in enumerate(headers, start=1):
            cell = sheet.cell(row=1, column=column, value=header)
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = BORDER
            sheet.column_dimensions[get_column_letter(column)].width = (widths[column - 1] if widths and column <= len(widths) else 14)
        sheet.row_dimensions[1].height = 26
        for offset, row in enumerate(rows):
            for column, value in enumerate(row, start=1):
                cell = sheet.cell(row=offset + 2, column=column, value=value)
                cell.font = BODY_FONT
                cell.border = BORDER
                cell.alignment = Alignment(vertical="center", wrap_text=isinstance(value, str) and len(value) > 12)
                if isinstance(value, float):
                    cell.number_format = "#,##0.00"
        sheet.freeze_panes = "A2"
    if not workbook.sheetnames:
        workbook.create_sheet("报表")
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
