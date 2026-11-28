"""客户档案整包导出：一张 Excel、多张 Sheet，覆盖会员档案页上的全部数据。

档案页的上课记录是分页懒加载的（老会员上千条），页面上一屏看不全，
这里把该会员的资料、会员卡、全部上课记录、私教跟进、体测评估、消费流水、
体验券、提醒与合同资料一次性导出成一份工作簿，方便留档与对账。
"""
from datetime import datetime
from io import BytesIO

from openpyxl.drawing.image import Image as ExcelImage
from sqlalchemy.orm import Session, joinedload

from .card_state import CARD_DISPLAY_LABELS, card_display_status
from .export_service import sheets_to_workbook
from .models import Booking, ClassSession, ExperienceVoucher, Member, MemberCard, MemberCardShare, MemberDocument, MemberRecord, MemberReminder, Transaction
from .pdf_service import KIND_LABELS, PAYMENT_LABELS, STATUS_LABELS
from .report_service import CATEGORY_LABELS as FINANCE_CATEGORY_LABELS
from .upload_service import upload_path
from .utils import dt, json_loads

BOOKING_STATUS_LABELS = {"booked": "待上课", "checked_in": "已签到", "completed": "已消课", "cancelled": "已取消", "no_show": "爽约"}
COURSE_TYPE_LABELS = {"group": "团课", "private": "私教", "assessment": "体测评估", "workshop": "工作坊", "training": "培训课", "enterprise": "企业课"}
CARD_CATEGORY_LABELS = {"group": "团课", "private": "私教", "assessment": "评估", "annual": "年卡/组合套餐", "package": "年卡/组合套餐", "workshop": "工作坊", "training": "培训课"}
RECORD_TYPE_LABELS = {"assessment": "体测评估", "pt_diary": "私教训练日记", "note": "跟进记录"}
VOUCHER_STATUS_LABELS = {"active": "有效", "used": "已用完", "expired": "已过期", "cancelled": "已作废"}
DOCUMENT_CATEGORY_LABELS = {"contract": "合同", "assessment": "体测评估"}

# 档案页的上课记录分两类页签，导出时保持同样的口径；其余课程类型单独成页。
GROUP_COURSE_TYPES = {"group"}
PRIVATE_COURSE_TYPES = {"private", "assessment", "workshop"}


def _card_benefits(card: MemberCard) -> str:
    benefits = json_loads(card.benefits_json, [])
    parts = []
    for item in benefits:
        label = COURSE_TYPE_LABELS.get(item.get("course_type"), item.get("course_type") or "")
        remaining = item.get("remaining")
        quantity = item.get("quantity")
        parts.append(f"{label} {remaining if remaining is not None else quantity}" + (f"/{quantity}" if remaining is not None and quantity is not None else ""))
    return " · ".join(parts)


def _card_row(card: MemberCard, owner: str) -> list:
    return [owner, card.card_no, CARD_CATEGORY_LABELS.get(card.product.category if card.product else "", card.product.category if card.product else ""), card.product.name if card.product else "", card.purchased_at, card.starts_on, card.expires_on, card.purchase_price, card.total_sessions if card.total_sessions is not None else "不限次", card.remaining_sessions if card.remaining_sessions is not None else "", _card_benefits(card), CARD_DISPLAY_LABELS.get(card_display_status(card), card_display_status(card)), f"{card.frozen_from} ~ {card.frozen_until}" if card.frozen_until else "", "、".join(share.member.name for share in getattr(card, "shares", []) if share.deleted_at is None), card.note or ""]


def _course_type(row: Booking) -> str:
    session = row.session
    course = session.course if session else None
    return course.course_type if course else ""


def _booking_rows(rows: list[Booking]) -> list[list]:
    result = []
    for row in rows:
        session = row.session
        course = session.course if session else None
        teacher = session.teacher if session else None
        room = session.room if session else None
        card_name = row.member_card.product.name if row.member_card else ("免费体验券" if row.experience_voucher_id else "")
        result.append([row.id, session.session_date if session else "", session.start_time if session else "", session.end_time if session else "", course.name if course else "", COURSE_TYPE_LABELS.get(course.course_type if course else "", course.course_type if course else ""), teacher.name if teacher else "", room.name if room else "", card_name, BOOKING_STATUS_LABELS.get(row.status, row.status), dt(row.booked_at), dt(row.checked_in_at), dt(row.cancelled_at), "是" if row.consumed else "否", row.source or "", row.notes or ""])
    return result


def _record_rows(rows: list[MemberRecord]) -> list[list]:
    return [[row.id, row.record_date, RECORD_TYPE_LABELS.get(row.record_type, row.record_type), row.title, row.content, row.teacher.name if row.teacher else ""] for row in rows]


def build_member_profile_workbook(db: Session, member: Member) -> bytes:
    """生成客户档案工作簿：一张 Excel、多张 Sheet，含全部上课记录。"""
    own_cards = [card for card in member.cards if card.deleted_at is None]
    shared_cards = db.query(MemberCard).options(joinedload(MemberCard.product), joinedload(MemberCard.member), joinedload(MemberCard.shares)).join(MemberCardShare, MemberCardShare.card_id == MemberCard.id).filter(MemberCardShare.member_id == member.id, MemberCardShare.deleted_at.is_(None), MemberCard.deleted_at.is_(None)).all()
    bookings = db.query(Booking).options(
        joinedload(Booking.session).joinedload(ClassSession.course),
        joinedload(Booking.session).joinedload(ClassSession.teacher),
        joinedload(Booking.session).joinedload(ClassSession.room),
        joinedload(Booking.member_card).joinedload(MemberCard.product),
    ).filter(Booking.member_id == member.id, Booking.deleted_at.is_(None)).order_by(Booking.booked_at.desc(), Booking.id.desc()).all()
    records = db.query(MemberRecord).options(joinedload(MemberRecord.teacher)).filter(MemberRecord.member_id == member.id, MemberRecord.deleted_at.is_(None)).order_by(MemberRecord.record_date.desc(), MemberRecord.id.desc()).all()
    transactions = db.query(Transaction).filter(Transaction.member_id == member.id, Transaction.deleted_at.is_(None)).order_by(Transaction.occurred_at.desc(), Transaction.id.desc()).all()
    vouchers = db.query(ExperienceVoucher).filter(ExperienceVoucher.member_id == member.id, ExperienceVoucher.deleted_at.is_(None)).order_by(ExperienceVoucher.id.desc()).all()
    reminders = db.query(MemberReminder).filter(MemberReminder.member_id == member.id, MemberReminder.deleted_at.is_(None)).order_by(MemberReminder.remind_on, MemberReminder.id).all()
    documents = db.query(MemberDocument).filter(MemberDocument.member_id == member.id, MemberDocument.deleted_at.is_(None)).order_by(MemberDocument.id.desc()).all()

    group_bookings: list[Booking] = []
    private_bookings: list[Booking] = []
    other_bookings: list[Booking] = []
    for row in bookings:
        kind = _course_type(row)
        if kind in GROUP_COURSE_TYPES:
            group_bookings.append(row)
        elif kind in PRIVATE_COURSE_TYPES:
            private_bookings.append(row)
        else:
            other_bookings.append(row)
    assessment_records = [row for row in records if row.record_type == "assessment"]
    followup_records = [row for row in records if row.record_type != "assessment"]

    active_cards = [card for card in own_cards if card_display_status(card) == "active"]
    paid_total = sum(row.amount for row in transactions if row.status in {"paid", "refunded"} and row.amount > 0)
    consumed = sum(1 for row in bookings if row.consumed)
    cancelled = sum(1 for row in bookings if row.status == "cancelled")
    no_show = sum(1 for row in bookings if row.status == "no_show")
    years = ""
    if member.created_at:
        days = max(0, (datetime.now() - member.created_at).days)
        years = f"{days} 天" if days < 365 else f"{round(days / 365)} 年"

    overview = [
        ["会员姓名", member.name or ""], ["英文名", member.name_en or ""], ["手机号", member.phone or ""],
        ["性别", member.gender or ""], ["出生日期", member.birth_date or ""], ["获客来源", member.source or ""],
        ["会籍归属", member.advisor.full_name if member.advisor else ""], ["微信号", member.wechat or ""], ["邮件地址", member.email or ""],
        ["紧急联系", member.emergency_phone or ""], ["建档时间", dt(member.created_at)], ["会员时长", years],
        ["爽约限制至", member.no_show_blocked_until or ""], ["备注", member.notes or ""],
        ["持有卡数", len(own_cards)], ["其中有效卡", len(active_cards)], ["共享卡数", len(shared_cards)],
        ["上课记录总数", len(bookings)], ["已消课次数", consumed], ["取消次数", cancelled], ["爽约次数", no_show],
        ["团课次数", len(group_bookings)], ["私教/评估/工作坊次数", len(private_bookings)],
        ["累计消费金额", round(paid_total, 2)], ["消费流水条数", len(transactions)],
        ["体验券数", len(vouchers)], ["提醒条数", len(reminders)], ["合同与资料数", len(documents)],
        ["导出时间", datetime.now().strftime("%Y-%m-%d %H:%M:%S")],
    ]

    sheets = [
        {"title": "基本信息", "headers": ["项目", "内容"], "rows": overview, "widths": [22, 46]},
        {"title": "会员卡", "headers": ["归属", "卡号", "卡种", "卡名称", "购卡时间", "开卡日", "到期日", "购卡金额", "总次数", "剩余次数", "权益明细", "卡状态", "冻结期间", "共享给", "备注"], "rows": [_card_row(card, "本人") for card in own_cards] + [_card_row(card, f"共享卡（{card.member.name}）") for card in shared_cards], "widths": [16, 26, 14, 22, 12, 12, 12, 11, 9, 9, 30, 10, 20, 18, 20]},
        {"title": "团课预约记录", "headers": ["预约编号", "开课日期", "开始时间", "结束时间", "课程", "课程类型", "教练", "教室", "预约用卡", "状态", "预约时间", "签到时间", "取消时间", "是否消课", "来源", "备注"], "rows": _booking_rows(group_bookings), "widths": [10, 12, 9, 9, 26, 10, 10, 10, 20, 9, 19, 19, 19, 9, 10, 18]},
        {"title": "私教预约记录", "headers": ["预约编号", "开课日期", "开始时间", "结束时间", "课程", "课程类型", "教练", "教室", "预约用卡", "状态", "预约时间", "签到时间", "取消时间", "是否消课", "来源", "备注"], "rows": _booking_rows(private_bookings), "widths": [10, 12, 9, 9, 26, 10, 10, 10, 20, 9, 19, 19, 19, 9, 10, 18]},
        {"title": "其它预约记录", "headers": ["预约编号", "开课日期", "开始时间", "结束时间", "课程", "课程类型", "教练", "教室", "预约用卡", "状态", "预约时间", "签到时间", "取消时间", "是否消课", "来源", "备注"], "rows": _booking_rows(other_bookings), "widths": [10, 12, 9, 9, 26, 10, 10, 10, 20, 9, 19, 19, 19, 9, 10, 18]},
        {"title": "私教跟进记录", "headers": ["记录编号", "记录日期", "记录类型", "标题", "内容", "教练"], "rows": _record_rows(followup_records), "widths": [10, 12, 14, 26, 60, 10]},
        {"title": "体测评估", "headers": ["记录编号", "记录日期", "记录类型", "标题", "内容", "教练"], "rows": _record_rows(assessment_records), "widths": [10, 12, 14, 26, 60, 10]},
        {"title": "消费记录", "headers": ["流水编号", "日期", "类别", "摘要", "支付方式", "金额", "状态", "流水类型", "营收口径", "现金实收", "关联预约", "核销码", "操作人", "备注"], "rows": [[row.id, dt(row.occurred_at), FINANCE_CATEGORY_LABELS.get(row.category, row.category), row.note or (row.product.name if row.product else ""), PAYMENT_LABELS.get(row.payment_method, row.payment_method), row.amount, STATUS_LABELS.get(row.status, row.status), KIND_LABELS.get(row.kind, row.kind), {"none": "不入营收", "immediate": "购卡即确认", "amortized": "按有效期均摊", "legacy": "历史口径"}.get(row.revenue_mode, row.revenue_mode or ""), "是" if row.cash_basis else "否", row.booking_id or "", row.redemption_code or "", row.created_by or "", row.note or ""] for row in transactions], "widths": [10, 19, 14, 26, 12, 10, 10, 12, 14, 9, 10, 18, 10, 24]},
        {"title": "体验券", "headers": ["券编号", "课程类型", "总次数", "剩余次数", "到期日", "状态", "发放人", "发放时间", "备注"], "rows": [[row.id, COURSE_TYPE_LABELS.get(row.course_type, row.course_type), row.total_sessions, row.remaining_sessions, row.expires_on, VOUCHER_STATUS_LABELS.get(row.status, row.status), row.issued_by or "", dt(row.created_at), row.note or ""] for row in vouchers], "widths": [10, 12, 9, 9, 12, 10, 12, 19, 24]},
        {"title": "提醒", "headers": ["提醒编号", "提醒日期", "内容", "状态", "创建人", "创建时间"], "rows": [[row.id, row.remind_on or "随时", row.content, "生效中" if row.active else "已停用", row.created_by or "", dt(row.created_at)] for row in reminders], "widths": [10, 12, 46, 10, 12, 19]},
        {"title": "合同与资料", "headers": ["文件编号", "类别", "文件名", "文件类型", "大小(KB)", "上传人", "上传时间"], "rows": [[row.id, DOCUMENT_CATEGORY_LABELS.get(row.category, row.category), row.original_name, row.content_type, round((row.size_bytes or 0) / 1024, 1), row.uploaded_by or "", dt(row.created_at)] for row in documents], "widths": [10, 12, 34, 26, 11, 12, 19]},
    ]

    workbook = sheets_to_workbook(sheets)
    _embed_photo(workbook, member)
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _embed_photo(workbook, member: Member) -> None:
    """把会员照片放进「基本信息」页右上角，没有照片就跳过。"""
    path = upload_path(member.photo_url, "members")
    if not path:
        return
    try:
        picture = ExcelImage(str(path))
        picture.width = 96
        picture.height = 96
        workbook["基本信息"].add_image(picture, "D1")
    except Exception:  # noqa: BLE001 - 单张照片异常不应中断整份导出
        pass
