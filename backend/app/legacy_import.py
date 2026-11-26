"""勤鸟运动 SaaS（vip.rocketbird.cn）历史数据导入。

把勤鸟导出的 CSV 映射进本系统：会员、会员卡 / 体验券、团课排期与签到、
私教排课与消课、交易流水、会员档案记录与操作日志。

约定：
- 所有实体都写入 external_id（勤鸟原始主键或可复现的组合键），重复导入按它幂等跳过；
- 卡种、状态、支付方式、营收口径一律换算成本系统现有字典；
- 私教按实际消课确认营收（kind=consumption），团课卡购卡时确认，年卡按有效期均摊。
"""

import csv
import hashlib
import json
import re
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from html import unescape
from pathlib import Path

from sqlalchemy import or_
from sqlalchemy.orm import Session

from .finance_service import resolve_purchase_revenue_mode
from .name_normalizer import split_bilingual
from .models import (
    Booking,
    CardProduct,
    ClassSession,
    Course,
    ExperienceVoucher,
    Member,
    MemberCard,
    MemberRecord,
    OperationLog,
    Room,
    Teacher,
    Transaction,
)

SOURCE_NAME = "勤鸟运动 SaaS（vip.rocketbird.cn）"

# 参与幂等判定的表：外部 ID → 实体 id。
EXTERNAL_ID_MODELS = {
    "cards": MemberCard,
    "vouchers": ExperienceVoucher,
    "sessions": ClassSession,
    "bookings": Booking,
    "transactions": Transaction,
    "records": MemberRecord,
    "logs": OperationLog,
}

# 预约唯一索引覆盖的状态（同一会员同一节课只能有一条活跃预约）。
ACTIVE_BOOKING_STATUSES = ("booked", "checked_in", "completed", "no_show")


def _occ_key(base: str, number: int) -> str:
    """同一个 base 的第 n 次出现，外部 ID 固定可复现；超长时用摘要收敛到 64 位内。"""
    raw = f"{base}:{number}"
    if len(raw) <= 64:
        return raw
    return f"{base[:47]}:{hashlib.sha1(raw.encode('utf-8')).hexdigest()[:16]}"

# 课程名匹配用的前缀长度：勤鸟各表里的课程名被截断成不同长度，取前 12 个字即可对齐。
NAME_KEY_LEN = 12

# 卡种映射：勤鸟卡产品 → 本系统产品类别。
PRODUCT_CATEGORY = {
    "团课周卡": "group",
    "团课月卡": "group",
    "团课季卡": "group",
    "半年卡": "group",
    "会员年卡": "group",
    "单节次卡": "group",
    "月卡（10节限定）": "group",
    "太极五次课-团课": "group",
    "音钵疗愈五次课": "group",
    "音钵疗愈五次课套餐-大众点评": "group",
    "测试": "group",
    "音昱听堂月卡套餐": "annual",
    "音昱听堂季卡会籍套餐": "annual",
    "音昱听堂年卡会籍套餐": "annual",
    "1:1私教": "private",
    "1:1私教（90分钟）": "private",
    "10节1:1私教课": "private",
    "悬浮疗愈": "private",
    "悬浮疗愈（初次体验）": "private",
    "TCM": "private",
    "运动康复私教": "private",
    "白医生中医养生咨询": "private",
    "量子时光波咨询": "private",
    "量子时光波咨询（三十分钟）": "private",
    "健康评估": "assessment",
    "音昱水中天健康评估": "assessment",
    "健康餐": "workshop",
    "黑金超光子嫩肤（苏州音昱水中天）": "workshop",
    "合一文化节门票": "workshop",
    "庆祝人生主题活动门票": "workshop",
}

# 勤鸟同一张卡在不同表里的别名，统一到标准卡名。
PRODUCT_ALIASES = {
    "月卡": "团课月卡",
    "年卡": "会员年卡",
    "团课年卡": "会员年卡",
    "私教卡": "1:1私教",
    "邀请体验-测试": "邀请单次体验卡",
    "TCM test": "TCM",
    "体质咨询与健康评估（大众点评）": "健康评估",
    "悬浮疗愈+下午茶（初次体验）": "悬浮疗愈（初次体验）",
    "Zozo Test": "太极五次课-团课",
}

# 标准卡名 → (有效天数, 总次数)。总次数为 None 表示周期内不限次。
PRODUCT_DEFAULT = {
    "团课周卡": (7, None),
    "团课月卡": (30, None),
    "团课季卡": (90, None),
    "半年卡": (182, None),
    "会员年卡": (365, None),
    "单节次卡": (30, 1),
    "月卡（10节限定）": (90, 10),
    "太极五次课-团课": (90, 5),
    "音钵疗愈五次课": (90, 5),
    "音钵疗愈五次课套餐-大众点评": (90, 5),
    "测试": (365, None),
    "音昱听堂月卡套餐": (30, None),
    "音昱听堂季卡会籍套餐": (90, None),
    "音昱听堂年卡会籍套餐": (365, None),
    "1:1私教": (365, 20),
    "1:1私教（90分钟）": (365, 5),
    "10节1:1私教课": (365, 10),
    "悬浮疗愈": (365, 8),
    "悬浮疗愈（初次体验）": (90, 1),
    "TCM": (90, 1),
    "运动康复私教": (365, 10),
    "白医生中医养生咨询": (365, 10),
    "量子时光波咨询": (90, 3),
    "量子时光波咨询（三十分钟）": (90, 1),
    "健康评估": (90, 2),
    "音昱水中天健康评估": (90, 1),
    "健康餐": (90, 1),
    "黑金超光子嫩肤（苏州音昱水中天）": (90, 1),
    "合一文化节门票": (30, 1),
    "庆祝人生主题活动门票": (30, 1),
    "邀请单次体验卡": (30, 1),
}

def _canonical_product(name: str) -> str:
    """卡名归一：先过别名表，再把中英文混排拆开，结果与卡产品表里的 name 保持一致。"""
    canonical = PRODUCT_ALIASES.get(str(name or "").strip(), str(name or "").strip())
    return split_bilingual(canonical)[0]


def _apply_bilingual(entity, display: str, english: str) -> None:
    """把已经存库的中英文混排名称拆到 name / name_en 两个字段。

    已经填过英文名的记录（例如系统预置资料）保留原有英文名，只纠正中文名。
    """
    if not display or display == entity.name:
        return
    entity.name = display
    if english and not entity.name_en:
        entity.name_en = english


def _explicit_names(row: dict, prefix: str, raw: str) -> tuple[str, str]:
    """优先用适配包给出的中英文两列，没有再按原文拆分。

    适配包在课种、教室、教练、卡产品四张表里补了「XX中文名 / XX英文名」，
    这样即使原文写法特殊，也能得到确定的中英文名。
    """
    zh = " ".join(str(row.get(f"{prefix}中文名", "") or "").split())
    en = " ".join(str(row.get(f"{prefix}英文名", "") or "").split())
    if zh:
        return zh, en
    return split_bilingual(raw)


# 勤鸟支付方式 → 本系统结账方式。未知渠道保留原文，前端按原文展示。
PAYMENT_METHODS = {
    "现金": "cash",
    "刷卡": "pos",
    "支付宝": "alipay",
    "微信": "wechat",
}

# 勤鸟业务类型 → 本系统流水类型。
TRANSACTION_KINDS = {
    "购卡": "purchase",
    "购私教": "purchase",
    "续卡": "purchase",
    "续私教": "purchase",
    "换卡（升卡）": "upgrade",
    "销卡": "refund",
    "商品退款": "refund",
    "请假": "manual",
    "转卡（入）": "manual",
    "卡拆分": "manual",
    "商品售卖": "purchase",
}

# 勤鸟来源方式 → 本系统预约来源。
BOOKING_SOURCES = {"0": "admin", "1": "admin", "2": "member", "3": "admin"}

COUNT_RE = re.compile(r"^(\d+)\s*次")
DAYS_RE = re.compile(r"^(\d+)\s*天")
FREEZE_RE = re.compile(r"请假开始时间[：:]\s*(\d{4}-\d{2}-\d{2}).*?请假周期[：:]\s*(\d+)")
FREEZE_END_RE = re.compile(r"请假结束时间[：:]\s*(\d{4}-\d{2}-\d{2})")
FREEZE_CARD_RE = re.compile(r"会员卡类型[：:]\s*([^；;，,]+)")
HTML_TAG_RE = re.compile(r"<[^>]+>")


def _read_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return [{key: (value if value is not None else "") for key, value in row.items()} for row in csv.DictReader(handle)]


def _norm(value: str) -> str:
    text = unescape(str(value or "")).replace("&amp;", "&").replace("&nbsp;", " ")
    return " ".join(text.split()).strip().lower()


def _name_key(value: str) -> str:
    """课程 / 教室名的匹配键：取归一化后的前若干个字符，避开勤鸟各表截断长度不同的问题。"""
    return _norm(value)[:NAME_KEY_LEN]


def _plain(value: str, limit: int = 2000) -> str:
    text = HTML_TAG_RE.sub(" ", unescape(str(value or "")))
    return " ".join(text.split())[:limit]


def _float(value, default: float = 0.0) -> float:
    try:
        return round(float(str(value).strip() or default), 2)
    except (TypeError, ValueError):
        return default


def _int(value, default: int = 0) -> int:
    try:
        return int(float(str(value).strip() or default))
    except (TypeError, ValueError):
        return default


def _count(value) -> int | None:
    match = COUNT_RE.match(str(value or "").strip())
    return int(match.group(1)) if match else None


def _days(value) -> int | None:
    match = DAYS_RE.match(str(value or "").strip())
    return int(match.group(1)) if match else None


def _date(value) -> str:
    text = str(value or "").strip()
    if not text or text in {"未知", "-", "--", "null", "0000-00-00"}:
        return ""
    return text[:10] if re.match(r"^\d{4}-\d{2}-\d{2}", text) else ""


def _moment(value) -> datetime | None:
    text = str(value or "").strip()
    if not text or text in {"未知", "0000-00-00"}:
        return None
    for pattern in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, pattern)
        except ValueError:
            continue
    return None


def _defaults(model) -> dict:
    """取出模型里所有默认值，批量写入时保证字段齐全。"""
    values: dict = {}
    for column in model.__table__.columns:
        default = column.default
        if default is None:
            continue
        arg = getattr(default, "arg", None)
        if arg is None:
            continue
        if not callable(arg):
            values[column.name] = arg
            continue
        # SQLAlchemy 会把可调用默认值包装成带上下文的函数，这里统一按无上下文调用。
        try:
            values[column.name] = arg(None)
        except TypeError:
            values[column.name] = arg()
    return values


class RocketbirdImporter:
    """勤鸟导出数据导入器。"""

    def __init__(self, db: Session, source_dir: str | Path, *, dry_run: bool = False, include_logs: bool = True) -> None:
        self.db = db
        self.dir = Path(source_dir)
        self.dry_run = dry_run
        self.include_logs = include_logs
        self.report: dict = {
            "source": SOURCE_NAME,
            "directory": str(self.dir),
            "dry_run": dry_run,
            "tables": {},
            "warnings": [],
            "notes": [],
        }
        self.members: dict[str, Member] = {}
        self.cards: dict[int, MemberCard] = {}
        self.vouchers: dict[int, ExperienceVoucher] = {}
        self.products: dict[str, CardProduct] = {}
        self.products_by_name: dict[str, CardProduct] = {}
        self.courses: dict[str, Course] = {}
        self.courses_by_key: dict[str, Course] = {}
        self.teachers: dict[str, Teacher] = {}
        self.teachers_by_name: dict[str, Teacher] = {}
        self.rooms_by_key: dict[str, Room] = {}
        # 课种 → 勤鸟原文名：拆分中英文后仍要用原文做模糊匹配，否则签到表里的截断名匹配不上。
        self.course_raw_names: dict[int, str] = {}
        self.sessions_by_key: dict[str, list[tuple[datetime, datetime, ClassSession]]] = {}
        self.sessions_by_date: dict[str, list[tuple[datetime, datetime, ClassSession]]] = {}
        self.synthetic_by_key: dict[tuple[str, str], list[tuple[datetime, datetime, ClassSession]]] = {}
        self.private_room: Room | None = None
        self.placeholder_teacher: Teacher | None = None
        self._counter: dict[str, int] = {}
        self._known_cache: dict[str, dict[str, int]] = {}
        self._booking_pairs: set[tuple[int, int]] | None = None

    # —— 基础工具 ——

    def csv(self, name: str) -> list[dict]:
        return _read_csv(self.dir / name)

    def _track(self, table: str, created: int = 0, skipped: int = 0, read: int = 0) -> None:
        entry = self.report["tables"].setdefault(table, {"read": 0, "created": 0, "skipped": 0})
        entry["read"] += read
        entry["created"] += created
        entry["skipped"] += skipped

    def _warn(self, message: str) -> None:
        if message not in self.report["warnings"]:
            self.report["warnings"].append(message)

    def _note(self, message: str) -> None:
        if message not in self.report["notes"]:
            self.report["notes"].append(message)

    def _occ(self, base: str) -> int:
        """同一组合键下的出现序号。

        CSV 行序固定，所以同一个组合键的序号在每次导入中都一样——外部 ID 才是
        可复现的（重复导入靠它认出「这条已经导过了」）。
        """
        self._counter[base] = self._counter.get(base, 0) + 1
        return self._counter[base]

    def _known(self, kind: str) -> dict[str, int]:
        """库里已存在的外部 ID（external_id → 实体 id），首次用到时整表载入。"""
        cache = self._known_cache.get(kind)
        if cache is None:
            model = EXTERNAL_ID_MODELS[kind]
            cache = {
                value: row_id
                for row_id, value in self.db.query(model.id, model.external_id).filter(model.external_id != "")
            }
            self._known_cache[kind] = cache
        return cache

    def _claim(self, kind: str, external_id: str) -> bool:
        """占用一个外部 ID；返回 False 表示库里已经有了，这一条应当跳过。"""
        if not external_id:
            return True
        known = self._known(kind)
        if external_id in known:
            return False
        known[external_id] = 0
        return True

    def _known_booking_pairs(self) -> set[tuple[int, int]]:
        """库里已有的「课 × 会员」活跃预约组合，用来挡住重复预约。"""
        if self._booking_pairs is None:
            rows = self.db.query(Booking.session_id, Booking.member_id).filter(Booking.status.in_(ACTIVE_BOOKING_STATUSES))
            self._booking_pairs = {(session_id, member_id) for session_id, member_id in rows}
        return self._booking_pairs

    def _flush(self) -> None:
        self.db.flush()

    # —— 入口 ——

    def run(self) -> dict:
        self._normalize_catalogue()
        self._import_rooms()
        self._import_teachers()
        self._import_courses()
        self._import_products()
        self._import_members()
        self._import_member_cards()
        self._import_cards_from_purchases()
        self._import_group_sessions()
        self._import_group_bookings()
        self._import_private()
        self._import_transactions()
        self._import_records()
        self._import_logs()
        if not self.dry_run:
            self.db.commit()
        return self.report

    # —— 基础资料 ——

    def _normalize_catalogue(self) -> None:
        """把库里已有的资料名称统一拆成中文名 + 英文名。

        覆盖系统预置资料与旧版导入留下的混排名称；拆分只把英文挪到英文名字段，
        文字本身不作改动。重名时跳过，避免与既有资料撞车。
        """
        changed = 0
        for model in (Course, Room, Teacher):
            for row in self.db.query(model).all():
                display, english = split_bilingual(row.name)
                if not display or display == row.name:
                    continue
                if self.db.query(model).filter(model.name == display, model.id != row.id).first() is not None:
                    continue
                row.name = display
                if english and not row.name_en:
                    row.name_en = english
                changed += 1
        for row in self.db.query(CardProduct).all():
            canonical = PRODUCT_ALIASES.get(row.name.strip(), row.name.strip())
            display, english = split_bilingual(canonical)
            if not display or display == row.name:
                continue
            if self.db.query(CardProduct).filter(CardProduct.name == display, CardProduct.id != row.id).first() is not None:
                continue
            row.name = display
            if english and not row.name_en:
                row.name_en = english
            changed += 1
        if changed:
            self._flush()
            self._note(f"整理资料名称 {changed} 条：中文名与英文名分开存放")

    def _import_rooms(self) -> None:
        rows = self.csv("classrooms.csv")
        created = skipped = 0
        for row in rows:
            raw_name = " ".join(row.get("教室名称", "").split())
            # 「谈天说地 3 Connection 3」这类中英文混排的名字拆开：中文进 name，英文进 name_en。
            name, name_en = _explicit_names(row, "教室", raw_name)
            external_id = row.get("教室ID", "").strip()
            if not name:
                continue
            existing = None
            if external_id:
                existing = self.db.query(Room).filter(Room.external_id == external_id, Room.external_id != "").first()
            if existing is None:
                existing = self.db.query(Room).filter(Room.name == raw_name).first()
            if existing is None and name != raw_name:
                existing = self.db.query(Room).filter(Room.name == name).first()
            if existing is not None:
                skipped += 1
                if not existing.external_id and external_id:
                    existing.external_id = external_id
                # 旧库里存的是混排名，重新导入时顺手拆开。
                if existing.name == raw_name and name != raw_name:
                    existing.name = name
                    existing.name_en = name_en
            else:
                existing = Room(
                    name=name,
                    name_en=name_en,
                    capacity=max(1, _int(row.get("允许人数"), 10)),
                    external_id=external_id,
                    floor="1F",
                    sort_order=0,
                    color="#2f6b5b",
                    active=True,
                )
                self.db.add(existing)
                self._flush()
                created += 1
            # 匹配键同时登记原始名与拆分后的名字，其他表引用教室时两种写法都能命中。
            self.rooms_by_key[_name_key(raw_name)] = existing
            if name != raw_name:
                self.rooms_by_key[_name_key(name)] = existing
        self._track("教室资料", created, skipped, len(rows))

    def _import_teachers(self) -> None:
        rows = self.csv("staff_coaches.csv")
        created = skipped = 0
        for row in rows:
            raw_name = " ".join(row.get("姓名", "").split())
            # 「Lisa Tang 汤双双」拆成中文名与英文名，界面上不再中英文混排。
            name, name_en = _explicit_names(row, "教练", raw_name)
            external_id = row.get("ID", "").strip()
            if not name:
                continue
            existing = None
            if external_id:
                existing = self.db.query(Teacher).filter(Teacher.external_id == external_id, Teacher.external_id != "").first()
            if existing is None:
                existing = self.db.query(Teacher).filter(Teacher.name == raw_name).first()
            if existing is None and name != raw_name:
                existing = self.db.query(Teacher).filter(Teacher.name == name).first()
            if existing is not None:
                skipped += 1
                if not existing.external_id and external_id:
                    existing.external_id = external_id
                if existing.name == raw_name and name != raw_name:
                    existing.name = name
                    existing.name_en = name_en
            else:
                existing = Teacher(
                    name=name,
                    name_en=name_en,
                    phone=row.get("手机号", "").strip(),
                    gender=row.get("性别", "").strip(),
                    specialties=row.get("专长", "").strip()[:300],
                    specialties_en="",
                    bio=_plain(row.get("课程简介", "")),
                    bio_en="",
                    image_url=row.get("头像", "").strip(),
                    visible=True,
                    active=True,
                    external_id=external_id,
                    legacy_position=row.get("职位", "").strip(),
                    legacy_teacher_type=row.get("教练类型", "").strip(),
                )
                self.db.add(existing)
                self._flush()
                created += 1
            self.teachers[external_id] = existing
            # 教练名可能被排课表按原文引用，原始名与拆分后的名字都登记一份。
            self.teachers_by_name[_norm(raw_name)] = existing
            if name != raw_name:
                self.teachers_by_name[_norm(name)] = existing
            if name_en:
                self.teachers_by_name[_norm(name_en)] = existing
        self._track("教练", created, skipped, len(rows))

    def _import_courses(self) -> None:
        rows = self.csv("class_types.csv")
        created = skipped = 0
        for row in rows:
            raw_name = _plain(row.get("课程名称", ""), 160)
            # 「瑜伽拉伸与声音共振 Yogic Stretch & Sound Resonance」拆成中文名与英文名。
            name, name_en = _explicit_names(row, "课程", raw_name)
            external_id = row.get("课程ID", "").strip()
            if not name:
                continue
            existing = None
            if external_id:
                existing = self.db.query(Course).filter(Course.external_id == external_id, Course.external_id != "").first()
            if existing is None:
                existing = self.db.query(Course).filter(Course.name == raw_name).first()
            if existing is None and name != raw_name:
                existing = self.db.query(Course).filter(Course.name == name).first()
            if existing is not None:
                skipped += 1
                if not existing.external_id and external_id:
                    existing.external_id = external_id
                if existing.name == raw_name and name != raw_name:
                    existing.name = name
                    existing.name_en = name_en
            else:
                existing = Course(
                    course_type="group",
                    name=name,
                    name_en=name_en,
                    description=_plain(row.get("简介", "")),
                    description_en="",
                    duration_minutes=max(1, _int(row.get("时长(分钟)"), 60)),
                    price=_float(row.get("单节价格")),
                    color="#2f6b5b",
                    active=True,
                    external_id=external_id,
                )
                self.db.add(existing)
                self._flush()
                created += 1
            self.courses[external_id] = existing
            self.course_raw_names[existing.id] = raw_name
            # 排课与签到表里的课程名是勤鸟截断后的原文，原始名与拆分名都要能查到。
            self.courses_by_key[_name_key(raw_name)] = existing
            if name != raw_name:
                self.courses_by_key[_name_key(name)] = existing
        self._track("课种", created, skipped, len(rows))

    def _product_specs(self) -> dict[str, dict]:
        specs: dict[str, dict] = {}
        for row in self.csv("card_products.csv"):
            name = row.get("卡名称", "").strip()
            if not name:
                continue
            specs[name] = {
                "external_id": row.get("卡ID", "").strip(),
                "card_type": row.get("卡类型", "").strip(),
                "count": row.get("次数/天数", "").strip(),
                "price": _float(row.get("售价")),
                "sale": row.get("售卖状态", "").strip(),
                "trial": row.get("体验卡", "").strip() == "是",
                "description": _plain(row.get("说明", ""), 500),
                "name_zh": row.get("卡中文名", "").strip(),
                "name_en": row.get("卡英文名", "").strip(),
            }
        for row in self.csv("member_cards.csv"):
            name = row.get("卡课名称", "").strip()
            if name and name not in specs:
                specs[name] = {
                    "external_id": row.get("卡课ID", "").strip(),
                    "card_type": row.get("卡类型", "").strip(),
                    "count": row.get("总计", "").strip(),
                    "price": _float(row.get("金额")),
                    "sale": "",
                    "trial": row.get("是否体验卡", "").strip() == "是",
                    "description": "",
                    "name_zh": row.get("卡中文名", "").strip(),
                    "name_en": row.get("卡英文名", "").strip(),
                }
        for row in self.csv("contract_orders.csv"):
            name = row.get("卡课名称", "").strip()
            if name and name not in specs:
                specs[name] = {
                    "external_id": "",
                    "card_type": "",
                    "count": "",
                    "price": _float(row.get("金额")),
                    "sale": "",
                    "trial": False,
                    "description": "",
                    "name_zh": row.get("卡中文名", "").strip(),
                    "name_en": row.get("卡英文名", "").strip(),
                }
        return specs

    def _import_products(self) -> None:
        specs = self._product_specs()
        created = skipped = 0
        for raw_name, spec in specs.items():
            canonical = PRODUCT_ALIASES.get(raw_name, raw_name)
            # 「合一文化节门票 At One Festival」「健康评估Assessment」这类混排卡名拆开。
            explicit_zh = " ".join(str(spec.get("name_zh", "") or "").split())
            explicit_en = " ".join(str(spec.get("name_en", "") or "").split())
            if explicit_zh:
                canonical, name_en = explicit_zh, explicit_en
            else:
                canonical, name_en = split_bilingual(canonical)
            if canonical == "储值卡":
                self._note("储值卡：本系统没有储值卡概念，未建卡产品（勤鸟卡ID 608480，无会员持卡记录）。")
                skipped += 1
                continue
            category = PRODUCT_CATEGORY.get(canonical) or self._guess_category(canonical, spec.get("card_type", ""))
            validity, total = PRODUCT_DEFAULT.get(canonical, (None, None))
            if validity is None:
                validity = _days(spec.get("count")) or 30
            if total is None and canonical not in PRODUCT_DEFAULT:
                total = _count(spec.get("count"))
            if category == "private" and not total:
                total = None
            benefits = "[]"
            if category == "annual":
                # 会籍套餐按天给到团课权益，与本系统「年度身心套餐」的写法保持一致。
                benefits = json.dumps([{"course_type": "group", "quantity": int(validity)}], ensure_ascii=False)
            existing = None
            if spec["external_id"]:
                existing = self.db.query(CardProduct).filter(CardProduct.external_id == spec["external_id"], CardProduct.external_id != "").first()
            if existing is None:
                # 旧库里可能存的是混排原名，两种写法都查一次。
                existing = self.db.query(CardProduct).filter(or_(CardProduct.name == canonical, CardProduct.name == raw_name)).first()
            if existing is not None:
                skipped += 1
                if not existing.external_id and spec["external_id"]:
                    existing.external_id = spec["external_id"]
                if existing.name != canonical and existing.name in {raw_name, canonical}:
                    existing.name = canonical
                    existing.name_en = name_en
                elif not existing.name_en and name_en:
                    existing.name_en = name_en
            else:
                existing = CardProduct(
                    name=canonical,
                    name_en=name_en,
                    category=category,
                    price=spec["price"],
                    original_price=spec["price"],
                    validity_days=max(1, int(validity)),
                    total_sessions=total,
                    benefits_json=benefits,
                    description=spec.get("description", ""),
                    description_en="",
                    online_sale=spec.get("sale") == "在售" and spec["price"] > 0,
                    active=True,
                    external_id=spec["external_id"],
                    legacy_card_type=spec.get("card_type", ""),
                )
                self.db.add(existing)
                self._flush()
                created += 1
            self.products[spec["external_id"] or canonical] = existing
            self.products_by_name[_norm(canonical)] = existing
            self.products_by_name[_norm(raw_name)] = existing
        self._track("卡产品", created, skipped, len(specs))

    def _guess_category(self, name: str, card_type: str) -> str:
        if "健康评估" in name or "Assessment" in name:
            return "assessment"
        if card_type == "私教课":
            return "private"
        if card_type == "期限卡":
            return "group"
        if "会籍" in name or "套餐" in name:
            return "annual"
        if "私教" in name:
            return "private"
        return "group"

    # —— 会员 ——

    def _import_members(self) -> None:
        rows = self.csv("members.csv")
        created = skipped = 0
        source_map = {"手机注册": "线上注册", "朋友介绍": "朋友推荐", "会籍带客": "教练推荐"}
        for row in rows:
            external_id = row.get("用户ID", "").strip()
            name = " ".join(row.get("姓名", "").split())
            phone = row.get("手机号", "").strip()
            if not external_id or not name:
                continue
            existing = self.db.query(Member).filter(Member.external_id == external_id, Member.external_id != "").first()
            if existing is None and phone:
                same = self.db.query(Member).filter(Member.phone == phone).first()
                if same is not None:
                    self._warn(f"会员「{name}」手机号 {phone} 已存在，改为绑定勤鸟 ID {external_id}。")
                    same.external_id = external_id
                    same.legacy_category = row.get("会员分类", "").strip()
                    same.legacy_customer_level = row.get("客户级别", "").strip()
                    self.members[external_id] = same
                    skipped += 1
                    continue
            if existing is not None:
                skipped += 1
                if not existing.external_id:
                    existing.external_id = external_id
            else:
                registered = _moment(row.get("注册/建档时间", ""))
                existing = Member(
                    name=name,
                    name_en="",
                    phone=phone,
                    gender=row.get("性别", "").strip(),
                    id_number=row.get("身份证号", "").strip(),
                    birth_date=_date(row.get("生日", "")),
                    source=source_map.get(row.get("客户来源", "").strip(), row.get("客户来源", "").strip()),
                    photo_url=row.get("头像URL", "").strip(),
                    notes=_plain(row.get("备注", ""), 1000),
                    active=row.get("是否启用", "是").strip() != "否",
                    external_id=external_id,
                    legacy_category=row.get("会员分类", "").strip(),
                    legacy_customer_level=row.get("客户级别", "").strip(),
                    created_at=registered or datetime.now(),
                )
                self.db.add(existing)
                self._flush()
                created += 1
            self.members[external_id] = existing
        self._track("会员总表", created, skipped, len(rows))

    # —— 会员卡 ——

    def _freeze_periods(self) -> dict[tuple[str, str], tuple[str, str]]:
        """从勤鸟「请假」操作记录里取停卡区间：会员 + 卡名 → (开始, 结束)。"""
        periods: dict[tuple[str, str], tuple[str, str]] = {}
        for row in self.csv("operating_records.csv"):
            if row.get("操作类型", "").strip() != "请假":
                continue
            detail = row.get("详情", "") + " " + row.get("描述", "")
            match = FREEZE_RE.search(detail)
            if not match:
                continue
            start = match.group(1)
            end_match = FREEZE_END_RE.search(detail)
            if end_match:
                end = end_match.group(1)
            else:
                end = (datetime.fromisoformat(start) + timedelta(days=max(0, int(match.group(2)) - 1))).strftime("%Y-%m-%d")
            card_match = FREEZE_CARD_RE.search(detail)
            card_name = card_match.group(1).strip() if card_match else ""
            periods[(row.get("会员ID", "").strip(), card_name)] = (start, end)
        return periods

    def _import_member_cards(self) -> None:
        rows = self.csv("member_cards.csv")
        created = skipped = 0
        freezes = self._freeze_periods()
        known_cards = self._known("cards")
        known_vouchers = self._known("vouchers")
        for row in rows:
            member_key = row.get("用户ID", "").strip()
            member = self.members.get(member_key)
            if member is None:
                skipped += 1
                continue
            raw_name = row.get("卡课名称", "").strip()
            canonical = _canonical_product(raw_name)
            card_ref = row.get("卡课ID", "").strip()
            product = self._product_for(card_ref, raw_name)
            if product is None:
                skipped += 1
                continue
            purchased = _date(row.get("购卡/成交时间", ""))
            status_text = row.get("状态", "").strip()
            total_text = row.get("总计", "").strip()
            remaining_text = row.get("剩余", "").strip()
            starts_on = _date(row.get("激活时间", ""))
            expires_on = _date(row.get("到期时间", ""))
            start_pending = status_text == "未激活"
            trial = row.get("是否体验卡", "").strip() == "是"
            if trial:
                base = f"voucher:{member_key}:{card_ref}:{purchased}"
                external_id = _occ_key(base, self._occ(base))
                if external_id in known_vouchers:
                    voucher_id = known_vouchers[external_id]
                    existing = self.db.get(ExperienceVoucher, voucher_id) if voucher_id else None
                    if existing is not None:
                        self.vouchers[existing.id] = existing
                    skipped += 1
                    continue
                known_vouchers[external_id] = 0
                remaining = _count(remaining_text) or 0
                voucher = ExperienceVoucher(
                    member_id=member.id,
                    course_type="group",
                    total_sessions=_count(total_text) or 1,
                    remaining_sessions=remaining,
                    expires_on=expires_on,
                    status="active" if remaining > 0 and (not expires_on or expires_on >= datetime.now().strftime("%Y-%m-%d")) else "expired",
                    note=f"勤鸟历史体验卡（{raw_name}）",
                    issued_by="历史数据导入",
                    version=0,
                    external_id=external_id,
                    created_at=datetime.now(),
                )
                self.db.add(voucher)
                self._flush()
                self.vouchers[voucher.id] = voucher
                known_vouchers[external_id] = voucher.id
                created += 1
                continue
            card_type = row.get("卡类型", "").strip()
            unlimited = card_type == "期限卡" or total_text.endswith("天")
            total_sessions = None if unlimited else (_count(total_text) if _count(total_text) is not None else product.total_sessions)
            remaining_sessions = None if unlimited else (_count(remaining_text) if _count(remaining_text) is not None else total_sessions)
            status = "used" if status_text == "已用完" else "active"
            frozen_from = frozen_until = ""
            if status_text == "请假中":
                period = freezes.get((member_key, raw_name)) or freezes.get((member_key, canonical))
                if period:
                    frozen_from, frozen_until = period
            base = f"card:{member_key}:{card_ref}:{purchased}"
            number = self._occ(base)
            external_id = _occ_key(base, number)
            if external_id in known_cards:
                card_id = known_cards[external_id]
                existing = self.db.get(MemberCard, card_id) if card_id else None
                if existing is not None:
                    self.cards[existing.id] = existing
                skipped += 1
                continue
            known_cards[external_id] = 0
            card = MemberCard(
                member_id=member.id,
                product_id=product.id,
                card_no=self._card_no(member_key, card_ref, purchased, number),
                purchase_price=_float(row.get("金额")),
                purchased_at=purchased,
                starts_on="" if start_pending else starts_on,
                expires_on="" if start_pending else expires_on,
                total_sessions=total_sessions,
                remaining_sessions=remaining_sessions,
                benefits_json=product.benefits_json if product.benefits_json else "[]",
                status=status,
                frozen_from=frozen_from,
                frozen_until=frozen_until,
                is_renewal=False,
                start_pending=start_pending,
                opened_booking_id=0,
                note=_plain(f"勤鸟历史卡 · {row.get('来源', '').strip()} {row.get('备注', '').strip()} {row.get('上课教练', '').strip()}".strip(), 500),
                version=0,
                external_id=external_id,
                legacy_card_type=card_type,
                legacy_status=status_text,
                legacy_source=row.get("来源", "").strip(),
                legacy_total=total_text,
                legacy_remaining=remaining_text,
            )
            self.db.add(card)
            self._flush()
            self.cards[card.id] = card
            known_cards[external_id] = card.id
            created += 1
        self._track("会员卡明细", created, skipped, len(rows))

    def _card_no(self, member_key: str, card_ref: str, purchased: str, number: int) -> str:
        """卡号要唯一又要可复现：由「会员 + 卡课 + 购买日 + 同组序号」拼出来。"""
        stamp = purchased.replace("-", "") or "00000000"
        tail = f"{stamp}{number:03d}"
        head = f"RB{member_key}{card_ref}"
        return f"{head[: max(1, 40 - len(tail))]}{tail}"

    def _product_for(self, product_id: str, name: str) -> CardProduct | None:
        if product_id and product_id in self.products:
            return self.products[product_id]
        canonical = _canonical_product(name)
        product = self.products_by_name.get(_norm(canonical))
        if product is not None:
            return product
        return self.products_by_name.get(_norm(name.strip()))

    # —— 按购卡流水补建会员卡 ——

    def _import_cards_from_purchases(self) -> None:
        """勤鸟的会员卡明细没有覆盖全部购卡订单，这里按流水补齐缺失的卡。"""
        created = skipped = read = 0
        owned: dict[tuple[int, int], list[MemberCard]] = {}
        for card in self.cards.values():
            owned.setdefault((card.member_id, card.product_id), []).append(card)
        known_cards = self._known("cards")
        for row in self.csv("finance_flow.csv"):
            business = row.get("业务类型", "").strip()
            if business not in {"购卡", "购私教", "续卡", "续私教", "换卡（升卡）"}:
                continue
            read += 1
            member_key = row.get("会员ID", "").strip()
            member = self.members.get(member_key)
            if member is None:
                skipped += 1
                continue
            raw_name = row.get("卡课名称", "").strip()
            product = self._product_for("", raw_name)
            if product is None:
                skipped += 1
                continue
            day = _date(row.get("交易时间", ""))
            flow_key = row.get("流水ID", "").strip() or row.get("流水号", "").strip()
            if flow_key:
                external_id = f"cardx:{flow_key}"
                card_no = f"RBX{flow_key}"[:40]
            else:
                base = f"cardx:{member_key}:{raw_name}:{day}"
                number = self._occ(base)
                external_id = _occ_key(base, number)
                card_no = f"RBX{member_key}{day.replace('-', '')}{number:03d}"[:40]
            if external_id in known_cards:
                card_id = known_cards[external_id]
                existing = self.db.get(MemberCard, card_id) if card_id else None
                if existing is not None:
                    owned.setdefault((existing.member_id, existing.product_id), []).append(existing)
                skipped += 1
                continue
            if any(card.purchased_at == day for card in owned.get((member.id, product.id), [])):
                skipped += 1
                continue
            known_cards[external_id] = 0
            validity, total = PRODUCT_DEFAULT.get(product.name, (product.validity_days, product.total_sessions))
            unlimited = product.legacy_card_type == "期限卡" or total is None
            card = MemberCard(
                member_id=member.id,
                product_id=product.id,
                card_no=card_no,
                purchase_price=_float(row.get("金额")),
                purchased_at=day,
                starts_on=day,
                expires_on=(datetime.fromisoformat(day) + timedelta(days=max(1, int(validity)))).strftime("%Y-%m-%d") if day else "",
                total_sessions=None if unlimited else total,
                remaining_sessions=None if unlimited else total,
                benefits_json=product.benefits_json if product.benefits_json else "[]",
                status="active",
                frozen_from="",
                frozen_until="",
                is_renewal=business in {"续卡", "续私教"},
                start_pending=False,
                opened_booking_id=0,
                note=f"按勤鸟购卡流水补建（{business} · {row.get('流水号', '').strip()}）",
                version=0,
                external_id=external_id,
                legacy_card_type=product.legacy_card_type,
                legacy_status="按流水补建",
                legacy_source=business,
                legacy_total=f"{total}次" if total else "",
                legacy_remaining=f"{total}次" if total else "",
            )
            self.db.add(card)
            self._flush()
            self.cards[card.id] = card
            known_cards[external_id] = card.id
            owned.setdefault((member.id, product.id), []).append(card)
            created += 1
        if created:
            self._note(f"按购卡流水补建会员卡 {created} 张（勤鸟「会员卡明细」未覆盖的部分订单）。")
        self._track("补建会员卡", created, skipped, read)

    # —— 团课排期 ——

    def _import_group_sessions(self) -> None:
        marks = self.csv("class_marks.csv")
        signs = {row.get("排期ID", "").strip(): row for row in self.csv("coach_signs.csv")}
        created = skipped = 0
        for row in marks:
            external_id = row.get("排期ID", "").strip()
            sign = signs.get(external_id, {})
            name = _plain(row.get("课程名称", ""), 160)
            start = _moment(row.get("开始时间", ""))
            end = _moment(row.get("结束时间", "")) or (start + timedelta(hours=1) if start else None)
            if not external_id or not start or not end:
                skipped += 1
                continue
            existing = self.db.query(ClassSession).filter(ClassSession.external_id == external_id, ClassSession.external_id != "").first()
            if existing is not None:
                skipped += 1
                self._register_session(existing, name, start, end)
                continue
            course = self._course_for(sign.get("课程ID", "").strip(), name, "group")
            teacher = self._teacher_for(sign.get("排课教练ID", "").strip(), sign.get("排课教练", "") or row.get("教练", ""))
            room = self._room_for(row.get("教室", ""))
            session = ClassSession(
                course_id=course.id,
                teacher_id=teacher.id,
                room_id=room.id,
                session_date=start.strftime("%Y-%m-%d"),
                start_time=start.strftime("%H:%M"),
                end_time=end.strftime("%H:%M"),
                capacity=max(1, _int(row.get("可预约人数"), 1)),
                status="cancelled" if row.get("状态", "1").strip() == "0" else ("scheduled" if start > datetime.now() else "completed"),
                notes=f"勤鸟排期 #{external_id}",
                reserved_count=max(0, _int(row.get("已预约人数"))),
                external_id=external_id,
            )
            self.db.add(session)
            self._flush()
            self._register_session(session, name, start, end)
            created += 1
        self._track("团课排课", created, skipped, len(marks))

    def _register_session(self, session: ClassSession, name: str, start: datetime, end: datetime) -> None:
        for key in {_name_key(name), _name_key(session.course.name if session.course else "")}:
            if key:
                self.sessions_by_key.setdefault(key, []).append((start, end, session))
        self.sessions_by_date.setdefault(start.strftime("%Y-%m-%d"), []).append((start, end, session))

    def _course_for(self, external_id: str, name: str, course_type: str) -> Course:
        if external_id and external_id in self.courses:
            return self.courses[external_id]
        key = _name_key(name)
        course = self.courses_by_key.get(key)
        if course is not None:
            return course
        clean = " ".join(str(name or "").split())
        display, name_en = split_bilingual(clean)
        if external_id:
            course = self.db.query(Course).filter(Course.external_id == external_id, Course.external_id != "").first()
            if course is not None:
                self.courses[external_id] = course
                if course.name == clean:
                    # 库里的名字还是混排的，拆成中文名 + 英文名。
                    _apply_bilingual(course, display, name_en)
                    self.course_raw_names[course.id] = clean
                self.courses_by_key[_name_key(course.name)] = course
                self.courses_by_key[key] = course
                return course
        for candidate in (clean, display):
            if not candidate:
                continue
            course = self.db.query(Course).filter(Course.name == candidate).first()
            if course is not None:
                _apply_bilingual(course, display, name_en)
                self.courses_by_key[key] = course
                self.courses_by_key[_name_key(display)] = course
                return course
        course = Course(
            course_type=course_type,
            name=display or name or f"历史课程 {external_id}",
            name_en=name_en,
            description="勤鸟历史课程",
            description_en="",
            duration_minutes=60,
            price=0,
            color="#2f6b5b",
            active=True,
            external_id=external_id,
        )
        self.db.add(course)
        self._flush()
        self.courses[external_id] = course
        self.courses_by_key[key] = course
        self.courses_by_key[_name_key(display)] = course
        return course

    def _teacher_for(self, external_id: str, name: str, alternate_id: str = "") -> Teacher:
        for candidate in (external_id, alternate_id):
            if candidate and candidate in self.teachers:
                return self.teachers[candidate]
        key = _norm(name)
        if key and key in self.teachers_by_name:
            return self.teachers_by_name[key]
        clean = " ".join((name or "").split())
        display, name_en = split_bilingual(clean)
        for candidate in (external_id, alternate_id):
            if not candidate:
                continue
            teacher = self.db.query(Teacher).filter(Teacher.external_id == candidate, Teacher.external_id != "").first()
            if teacher is not None:
                self.teachers[candidate] = teacher
                if teacher.name == clean:
                    _apply_bilingual(teacher, display, name_en)
                if clean:
                    self.teachers_by_name[_norm(clean)] = teacher
                if display:
                    self.teachers_by_name[_norm(display)] = teacher
                return teacher
        for candidate in (clean, display):
            if not candidate:
                continue
            teacher = self.db.query(Teacher).filter(Teacher.name == candidate).first()
            if teacher is not None:
                _apply_bilingual(teacher, display, name_en)
                self.teachers_by_name[key] = teacher
                self.teachers_by_name[_norm(display)] = teacher
                return teacher
        teacher = Teacher(
            name=display or clean or f"历史教练 {external_id or '未知'}",
            name_en=name_en,
            phone="",
            gender="",
            specialties="",
            specialties_en="",
            bio="勤鸟历史教练",
            bio_en="",
            image_url="",
            visible=True,
            active=True,
            external_id=external_id or alternate_id,
        )
        self.db.add(teacher)
        self._flush()
        if external_id:
            self.teachers[external_id] = teacher
        if alternate_id and alternate_id not in self.teachers:
            self.teachers[alternate_id] = teacher
        if key:
            self.teachers_by_name[key] = teacher
        if display:
            self.teachers_by_name[_norm(display)] = teacher
        return teacher

    def _room_for(self, name: str) -> Room:
        key = _name_key(name)
        room = self.rooms_by_key.get(key)
        if room is not None:
            return room
        clean = " ".join(str(name or "").split()) or "历史教室"
        display, name_en = split_bilingual(clean)
        room = None
        for candidate in (clean, display):
            if not candidate:
                continue
            room = self.db.query(Room).filter(Room.name == candidate).first()
            if room is not None:
                break
        if room is None:
            room = Room(
                name=display or clean,
                name_en=name_en,
                capacity=10,
                floor="1F",
                sort_order=0,
                color="#2f6b5b",
                active=True,
                external_id="",
            )
            self.db.add(room)
            self._flush()
        else:
            _apply_bilingual(room, display, name_en)
        self.rooms_by_key[key] = room
        self.rooms_by_key[_name_key(display)] = room
        return room

    def _private_room(self) -> Room:
        if self.private_room is not None:
            return self.private_room
        name, name_en = split_bilingual("私教室 Private Studio")
        room = self.db.query(Room).filter(Room.name.in_([name, "私教室 Private Studio"])).first()
        if room is None:
            room = Room(name=name, name_en=name_en, capacity=2, floor="1F", sort_order=0, color="#41677a", active=True, external_id="")
            self.db.add(room)
            self._flush()
        else:
            room.name = name
            room.name_en = name_en
        self.private_room = room
        return room

    def _placeholder(self) -> Teacher:
        if self.placeholder_teacher is not None:
            return self.placeholder_teacher
        teacher = self.db.query(Teacher).filter(Teacher.name == "历史教练（待补充）").first()
        if teacher is None:
            teacher = Teacher(name="历史教练（待补充）", name_en="", phone="", gender="", specialties="", specialties_en="", bio="勤鸟历史排期未记录教练", bio_en="", image_url="", visible=True, active=True, external_id="")
            self.db.add(teacher)
            self._flush()
        self.placeholder_teacher = teacher
        return teacher

    # —— 团课签到 ——

    def _match_session(self, name: str, when: datetime) -> ClassSession | None:
        key = _name_key(name)
        best = None
        best_delta = None
        for start, end, session in self.sessions_by_key.get(key, []):
            if start - timedelta(hours=3) <= when <= end + timedelta(hours=3):
                delta = abs((when - start).total_seconds())
                if best_delta is None or delta < best_delta:
                    best, best_delta = session, delta
        if best is not None:
            return best
        best = None
        best_ratio = 0.0
        for start, end, session in self.sessions_by_date.get(when.strftime("%Y-%m-%d"), []):
            if not (start - timedelta(hours=6) <= when <= end + timedelta(hours=6)):
                continue
            # 与课种的中文名、勤鸟原文名分别比一次，取相似度更高的一边。
            ratio = 0.0
            for candidate in {session.course.name if session.course else "", self.course_raw_names.get(session.course_id, "")}:
                if candidate:
                    ratio = max(ratio, SequenceMatcher(None, key, _name_key(candidate)).ratio())
            if ratio > best_ratio:
                best, best_ratio = session, ratio
        if best is not None and best_ratio >= 0.6:
            return best
        return None

    def _synthetic_session(self, name: str, when: datetime, teacher_name: str = "") -> ClassSession:
        key = _name_key(name)
        day = when.strftime("%Y-%m-%d")
        for start, end, session in self.synthetic_by_key.get((key, day), []):
            if start - timedelta(hours=6) <= when <= end + timedelta(hours=6):
                return session
        course_type = "group" if key in self.courses_by_key else "private"
        course = self._course_for("", _plain(name, 160) or "历史课程", course_type)
        teacher = self._teacher_for("", teacher_name) if teacher_name.strip() else self._placeholder()
        room = self._room_for("") if course_type == "group" else self._private_room()
        start = when.replace(minute=0, second=0, microsecond=0)
        end = start + timedelta(minutes=max(30, course.duration_minutes or 60))
        external_id = f"rbsyn:{day}{start.strftime('%H%M')}:{key[:8]}"
        session = self.db.query(ClassSession).filter(ClassSession.external_id == external_id, ClassSession.external_id != "").first()
        if session is None:
            session = ClassSession(
                course_id=course.id,
                teacher_id=teacher.id,
                room_id=room.id,
                session_date=day,
                start_time=start.strftime("%H:%M"),
                end_time=end.strftime("%H:%M"),
                capacity=20,
                status="scheduled" if start > datetime.now() else "completed",
                notes="勤鸟历史签到（排期未导出，按签到时间补建）",
                reserved_count=0,
                external_id=external_id,
            )
            self.db.add(session)
            self._flush()
        self._register_session(session, course.name, start, end)
        self.synthetic_by_key.setdefault((key, day), []).append((start, end, session))
        return session

    def _import_group_bookings(self) -> None:
        rows = self.csv("sign_logs.csv")
        cards_by_member: dict[tuple[int, str], list[MemberCard]] = {}
        for card in self.cards.values():
            product = card.product
            if product is None:
                continue
            cards_by_member.setdefault((card.member_id, _norm(product.name)), []).append(card)
        for value in cards_by_member.values():
            value.sort(key=lambda item: (item.purchased_at, item.id))
        vouchers_by_member: dict[int, list[ExperienceVoucher]] = {}
        for voucher in self.vouchers.values():
            vouchers_by_member.setdefault(voucher.member_id, []).append(voucher)

        created = skipped = 0
        pending: list[dict] = []
        known_bookings = self._known("bookings")
        # 库里已有的「课 × 会员」组合先占位，重复导入时同一条签到不会被建第二次。
        seen: set[tuple[int, int]] = self._known_booking_pairs()
        for row in rows:
            member = self.members.get(row.get("会员ID", "").strip())
            when = _moment(row.get("签到时间", ""))
            if member is None or when is None:
                skipped += 1
                continue
            course_name = _plain(row.get("课程名称", ""), 160)
            session = self._match_session(course_name, when)
            if session is None:
                session = self._synthetic_session(course_name, when, row.get("教练", ""))
            if (session.id, member.id) in seen:
                skipped += 1
                continue
            seen.add((session.id, member.id))
            sign_id = row.get("签到ID", "").strip()
            if sign_id:
                external_id = f"sign:{sign_id}"
            else:
                base = f"sign:{row.get('会员ID', '').strip()}:{row.get('签到时间', '').strip()}:{course_name}"
                external_id = _occ_key(base, self._occ(base))
            if external_id in known_bookings:
                skipped += 1
                continue
            known_bookings[external_id] = 0
            card_name = row.get("卡课名称", "").strip()
            canonical = _canonical_product(card_name)
            card = None
            voucher = None
            if canonical == "邀请单次体验卡":
                pool = vouchers_by_member.get(member.id, [])
                voucher = next((item for item in pool if (item.remaining_sessions or 0) > 0), None)
            else:
                pool = cards_by_member.get((member.id, _norm(canonical)), [])
                if pool:
                    earlier = [item for item in pool if item.purchased_at and item.purchased_at <= when.strftime("%Y-%m-%d")]
                    card = earlier[-1] if earlier else pool[0]
            no_show = row.get("是否爽约", "").strip() == "是"
            pending.append({
                **_defaults(Booking),
                "session_id": session.id,
                "member_id": member.id,
                "member_card_id": card.id if card else None,
                "experience_voucher_id": voucher.id if voucher else None,
                "status": "no_show" if no_show else "completed",
                "source": BOOKING_SOURCES.get(row.get("来源方式", "").strip(), "admin"),
                "booked_at": when,
                "checked_in_at": None if no_show else when,
                "completed_at": None if no_show else when,
                "consumed": bool(card or voucher) and not no_show,
                "notes": _plain(f"勤鸟历史签到 · 卡：{card_name} · 消耗：{row.get('消耗', '').strip()} · 来源方式：{row.get('来源方式', '').strip()} · 状态：{row.get('状态', '').strip()}", 500),
                "external_id": external_id,
                "legacy_source": row.get("来源方式", "").strip(),
                "deleted_at": None,
                "deleted_by": "",
                "deleted_state_json": "{}",
            })
            created += 1
        if pending:
            self.db.bulk_insert_mappings(Booking, pending)
            self._flush()
        self._track("会员签到", created, skipped, len(rows))

    # —— 私教排课与消课 ——

    def _import_private(self) -> None:
        schedules = self.csv("pt_schedules.csv")
        signs = self.csv("pt_sign_logs.csv")
        by_member: dict[str, list[dict]] = {}
        for row in signs:
            by_member.setdefault(row.get("会员ID", "").strip(), []).append(row)
        created = skipped = 0
        consumption_skipped = 0
        consumption_rows: list[dict] = []
        known_sessions = self._known("sessions")
        known_bookings = self._known("bookings")
        known_transactions = self._known("transactions")
        booking_pairs = self._known_booking_pairs()
        for row in schedules:
            member_key = row.get("会员ID", "").strip()
            member = self.members.get(member_key)
            start = _moment(row.get("开始时间", ""))
            if member is None or start is None:
                skipped += 1
                continue
            schedule_id = row.get("排课ID", "").strip()
            session_ext = f"pt:{schedule_id}"
            session = None
            if session_ext in known_sessions:
                session = self.db.query(ClassSession).filter(ClassSession.external_id == session_ext, ClassSession.external_id != "").first()
            if session is None:
                end = _moment(row.get("结束时间", "")) or (start + timedelta(minutes=60))
                course_name = _plain(row.get("课程", ""), 160) or "私教课"
                canonical = _canonical_product(course_name)
                category = PRODUCT_CATEGORY.get(canonical, "private")
                course_type = "assessment" if category == "assessment" else "private"
                course = self._course_for("", course_name, course_type)
                teacher = self._teacher_for(row.get("教练ID", "").strip(), row.get("教练", ""))
                room = self._private_room()
                session = ClassSession(
                    course_id=course.id,
                    teacher_id=teacher.id,
                    room_id=room.id,
                    session_date=start.strftime("%Y-%m-%d"),
                    start_time=start.strftime("%H:%M"),
                    end_time=end.strftime("%H:%M"),
                    capacity=1,
                    status="scheduled" if start > datetime.now() else "completed",
                    notes=f"勤鸟私教排课 #{schedule_id}",
                    reserved_count=1,
                    external_id=session_ext,
                )
                self.db.add(session)
                self._flush()
                known_sessions[session_ext] = session.id
            booking_ext = f"pt:{schedule_id}"
            if booking_ext in known_bookings or (session.id, member.id) in booking_pairs:
                if f"ptconsume:{schedule_id}" in known_transactions:
                    consumption_skipped += 1
                skipped += 1
                continue
            known_bookings[booking_ext] = 0
            booking_pairs.add((session.id, member.id))
            course_name = _plain(row.get("课程", ""), 160) or "私教课"
            canonical = _canonical_product(course_name)
            card = self._card_by_product(member_key, row.get("卡ID", "").strip(), canonical)
            sign = self._match_private_sign(by_member.get(member_key, []), start)
            consumed = sign is not None
            if consumed:
                status = "completed"
            elif start > datetime.now():
                status = "booked"
            else:
                status = "no_show"
            booking = Booking(
                session_id=session.id,
                member_id=member.id,
                member_card_id=card.id if card else None,
                experience_voucher_id=None,
                status=status,
                source="admin",
                booked_at=_moment(row.get("预约时间", "")) or start,
                checked_in_at=_moment(sign.get("消课时间", "")) if sign else None,
                completed_at=_moment(sign.get("消课时间", "")) if sign else None,
                consumed=consumed,
                notes=_plain(f"勤鸟私教排课 · 教练：{row.get('教练', '').strip()} · 消耗课时：{row.get('消耗课时', '').strip()} · 剩余课时：{row.get('剩余课时', '').strip()}", 500),
                external_id=booking_ext,
                legacy_source="教练端",
            )
            self.db.add(booking)
            self._flush()
            known_bookings[booking_ext] = booking.id
            if consumed and card is not None and card.purchase_price > 0 and card.total_sessions:
                amount = round(card.purchase_price / card.total_sessions, 2)
                consume_ext = f"ptconsume:{schedule_id}"
                if consume_ext in known_transactions:
                    consumption_skipped += 1
                else:
                    known_transactions[consume_ext] = 0
                    consumption_rows.append({
                        **_defaults(Transaction),
                        "member_id": member.id,
                        "member_card_id": card.id,
                        "product_id": card.product_id,
                        "booking_id": booking.id,
                        "category": "private",
                        "kind": "consumption",
                        "amount": amount,
                        "payment_method": "fitness_member",
                        "status": "paid",
                        "cash_basis": False,
                        "revenue_mode": "immediate",
                        "revenue_start_on": "",
                        "revenue_days": 0,
                        "revenue_sequence": 1,
                        "created_by": "历史数据导入",
                        "occurred_at": _moment(sign.get("消课时间", "")) if sign else start,
                        "note": f"{course_name} · 勤鸟历史消课",
                        "external_id": consume_ext,
                        "legacy_flow_no": "",
                        "legacy_business_type": "私教消课",
                        "legacy_contract_no": "",
                        "deleted_at": None,
                        "deleted_by": "",
                        "deleted_state_json": "{}",
                        "is_renewal": False,
                        "redemption_code": None,
                        "redeemed_at": None,
                        "cancelled_at": None,
                        "cancelled_by": "",
                    })
            created += 1
        if consumption_rows:
            self.db.bulk_insert_mappings(Transaction, consumption_rows)
            self._flush()
        self._track("私教排课", created, skipped, len(schedules))
        self._track("私教消课营收", len(consumption_rows), consumption_skipped, len(signs))

    def _match_private_sign(self, rows: list[dict], start: datetime) -> dict | None:
        best = None
        best_delta = None
        for row in rows:
            moment = _moment(row.get("消课时间", "")) or _moment(row.get("开始日期", ""))
            if moment is None:
                continue
            delta = abs((moment - start).total_seconds())
            if delta <= 6 * 3600 and (best_delta is None or delta < best_delta):
                best, best_delta = row, delta
        return best

    def _card_by_product(self, member_key: str, product_id: str, canonical: str) -> MemberCard | None:
        member = self.members.get(member_key)
        if member is None:
            return None
        for card in self.cards.values():
            if card.member_id != member.id:
                continue
            product = card.product
            if product is None:
                continue
            if product_id and product.external_id == product_id:
                return card
            if _norm(product.name) == _norm(canonical):
                return card
        return None

    # —— 交易流水 ——

    def _import_transactions(self) -> None:
        rows = self.csv("finance_flow.csv")
        orders = {row.get("合同编号", "").strip(): row for row in self.csv("contract_orders.csv")}
        received = {row.get("流水单号", "").strip() for row in self.csv("receive_logs.csv") if row.get("流水单号", "").strip()}
        created = skipped = 0
        pending: list[dict] = []
        known_transactions = self._known("transactions")
        for row in rows:
            external_id = row.get("流水ID", "").strip()
            if not external_id:
                skipped += 1
                continue
            if external_id in known_transactions:
                skipped += 1
                continue
            known_transactions[external_id] = 0
            business = row.get("业务类型", "").strip()
            kind = TRANSACTION_KINDS.get(business, "manual")
            amount = _float(row.get("金额"))
            if kind == "refund":
                amount = -abs(amount)
            member = self.members.get(row.get("会员ID", "").strip())
            card_name = row.get("卡课名称", "").strip()
            product = self._product_for("", card_name)
            if product is None:
                category = "private" if business in {"购私教", "续私教"} else "group"
            else:
                category = product.category
            card = self._transaction_card(member, card_name, _date(row.get("交易时间", "")))
            contract_no = row.get("合同编号", "").strip()
            order = orders.get(contract_no, {})
            revenue_mode = "none"
            revenue_start = ""
            revenue_days = 0
            if kind in {"purchase", "upgrade", "refund"} and product is not None:
                revenue_mode = resolve_purchase_revenue_mode(self.db, product)
            if revenue_mode == "amortized" and product is not None:
                revenue_start = (card.starts_on if card and card.starts_on else _date(row.get("交易时间", "")))
                revenue_days = max(1, product.validity_days)
            payment_raw = row.get("支付方式", "").strip().split(":")[0].strip()
            if not payment_raw:
                payment_raw = order.get("支付方式", "").strip().split(":")[0].strip()
            payment_method = PAYMENT_METHODS.get(payment_raw, payment_raw or "现金")
            advisor = row.get("业绩归属", "").strip()
            advisor_name = re.split(r"[（(,，]", advisor)[0].strip()
            note = _plain(f"{row.get('描述', '').strip()} · 业绩归属：{advisor} · 成交方式：{order.get('成交方式', '').strip()} · 销售：{order.get('销售人员', '').strip()}", 800)
            pending.append({
                **_defaults(Transaction),
                "member_id": member.id if member else None,
                "member_card_id": card.id if card else None,
                "product_id": product.id if product else None,
                "booking_id": None,
                "category": category,
                "kind": kind,
                "amount": amount,
                "payment_method": payment_method,
                "status": "paid",
                "cash_basis": bool(row.get("流水号", "").strip() and row.get("流水号", "").strip() in received),
                "revenue_mode": revenue_mode,
                "revenue_start_on": revenue_start,
                "revenue_days": revenue_days,
                "revenue_sequence": 0,
                "created_by": advisor_name or "历史数据导入",
                "occurred_at": _moment(row.get("交易时间", "")) or datetime.now(),
                "note": note,
                "external_id": external_id,
                "legacy_flow_no": row.get("流水号", "").strip(),
                "legacy_business_type": business,
                "legacy_contract_no": contract_no,
                "deleted_at": None,
                "deleted_by": "",
                "deleted_state_json": "{}",
                "is_renewal": business in {"续卡", "续私教"},
                "redemption_code": None,
                "redeemed_at": None,
                "cancelled_at": None,
                "cancelled_by": "",
            })
            created += 1
        if pending:
            self.db.bulk_insert_mappings(Transaction, pending)
            self._flush()
        self._track("业务流水", created, skipped, len(rows))
        self._note("勤鸟「收银流水」按流水号并入业务流水的现金口径（cash_basis），不单独建表，避免现金实收重复计算。")

    def _transaction_card(self, member: Member | None, card_name: str, day: str) -> MemberCard | None:
        if member is None:
            return None
        canonical = _canonical_product(card_name)
        pool = [card for card in self.cards.values() if card.member_id == member.id and card.product is not None and _norm(card.product.name) == _norm(canonical)]
        if not pool:
            return None
        same_day = [card for card in pool if card.purchased_at == day]
        if same_day:
            return sorted(same_day, key=lambda item: item.id)[0]
        earlier = [card for card in pool if card.purchased_at and card.purchased_at <= day]
        if earlier:
            return sorted(earlier, key=lambda item: (item.purchased_at, item.id))[-1]
        return sorted(pool, key=lambda item: (item.purchased_at, item.id))[0]

    # —— 会员档案记录与操作日志 ——

    def _import_records(self) -> None:
        created = skipped = read = 0
        pending: list[dict] = []
        known_records = self._known("records")

        def add(member: Member | None, title: str, content: str, when: str, external_id: str) -> None:
            nonlocal created, skipped, read
            read += 1
            if member is None:
                skipped += 1
                return
            if external_id in known_records:
                skipped += 1
                return
            known_records[external_id] = 0
            pending.append({
                **_defaults(MemberRecord),
                "member_id": member.id,
                "teacher_id": None,
                "record_type": "note",
                "title": title[:160],
                "content": content,
                "record_date": when,
                "created_at": _moment(when) or datetime.now(),
                "external_id": external_id,
                "deleted_at": None,
                "deleted_by": "",
                "deleted_state_json": "{}",
            })
            created += 1

        for row in self.csv("operating_records.csv"):
            member = self.members.get(row.get("会员ID", "").strip())
            base = f"rec:op:{row.get('会员ID', '').strip()}:{row.get('时间', '').strip()}:{row.get('操作类型', '').strip()}"
            add(
                member,
                f"历史{row.get('操作类型', '操作').strip()}",
                _plain(f"{row.get('描述', '').strip()} {row.get('详情', '').strip()} 操作人：{row.get('操作人', '').strip()} 订单号：{row.get('订单号', '').strip()}", 1500),
                _date(row.get("时间", "")),
                _occ_key(base, self._occ(base)),
            )
        for row in self.csv("agreements.csv"):
            member = self.members.get(row.get("user_id", "").strip())
            record_id = row.get("id", "").strip()
            base = f"rec:agr:{row.get('user_id', '').strip()}:{row.get('agreement_name', '').strip()}:{row.get('create_time', '').strip()}"
            add(
                member,
                f"历史协议 · {row.get('agreement_name', '').strip()}",
                _plain(f"来源：{row.get('source', '').strip()} 链接：{row.get('agreement_url', '').strip()}", 800),
                _date(row.get("create_time", "")),
                f"rec:agr:{record_id}" if record_id else _occ_key(base, self._occ(base)),
            )
        for row in self.csv("audit_consents.csv"):
            member = self.members.get(row.get("会员ID", "").strip())
            record_id = row.get("记录ID", "").strip()
            base = f"rec:consent:{row.get('会员ID', '').strip()}:{row.get('协议名称', '').strip()}:{row.get('同意时间', '').strip()}"
            add(
                member,
                f"历史协议同意 · {row.get('协议名称', '').strip()}",
                _plain(f"场景：{row.get('场景', '').strip()} 版本：{row.get('协议版本', '').strip()} 同意时间：{row.get('同意时间', '').strip()}", 500),
                _date(row.get("同意时间", "")),
                f"rec:consent:{record_id}" if record_id else _occ_key(base, self._occ(base)),
            )
        for row in self.csv("miss_punitive.csv"):
            member = self.members.get(row.get("会员ID", "").strip())
            until = _date(row.get("惩罚到期时间", ""))
            if member is not None and until and until > datetime.now().strftime("%Y-%m-%d"):
                member.no_show_blocked_until = until
            record_id = row.get("记录ID", "").strip()
            base = f"rec:punish:{row.get('会员ID', '').strip()}:{row.get('最近一次爽约', '').strip()}"
            add(
                member,
                "历史爽约惩罚",
                _plain(f"团课爽约 {row.get('团课爽约次数', '').strip()} 次 · 周期内 {row.get('周期内爽约次数', '').strip()} 次 · 最近一次 {row.get('最近一次爽约', '').strip()} · 惩罚至 {until}", 500),
                _date(row.get("最近一次爽约", "")),
                f"rec:punish:{record_id}" if record_id else _occ_key(base, self._occ(base)),
            )
        if pending:
            self.db.bulk_insert_mappings(MemberRecord, pending)
            self._flush()
        self._track("会员档案记录", created, skipped, read)

    def _import_logs(self) -> None:
        if not self.include_logs:
            self._note("操作日志（uplog_*）按参数跳过，未导入。")
            return
        created = skipped = 0
        logs: list[dict] = []
        known_logs = self._known("logs")
        read = 0
        for name in ("uplog_other.csv", "uplog_update.csv", "uplog_export.csv", "uplog_followup.csv", "uplog_stopcard.csv", "uplog_delete.csv"):
            for row in self.csv(name):
                read += 1
                member_key = row.get("会员ID", "").strip()
                operator = row.get("操作人", "").strip() or row.get("跟进人", "").strip() or "历史系统"
                action = (row.get("类型", "") or row.get("操作类型", "") or name.replace(".csv", ""))[:60]
                record_id = row.get("记录ID", "").strip()
                base = f"log:{name}:{member_key}:{row.get('时间', '').strip()}:{operator}:{action}"
                external_id = f"log:{name}:{record_id}" if record_id else _occ_key(base, self._occ(base))
                if external_id in known_logs:
                    skipped += 1
                    continue
                known_logs[external_id] = 0
                logs.append({
                    **_defaults(OperationLog),
                    "actor_user_id": None,
                    "actor_username": operator[:80],
                    "actor_role": "legacy",
                    "category": "legacy",
                    "action": action,
                    "entity": "member" if member_key else "",
                    "entity_id": member_key,
                    "detail_json": json.dumps({"描述": row.get("描述", "").strip(), "会员": row.get("会员", "").strip()}, ensure_ascii=False),
                    "created_at": _moment(row.get("时间", "")) or datetime.now(),
                    "external_id": external_id,
                })
                created += 1
        if logs:
            self.db.bulk_insert_mappings(OperationLog, logs)
            self._flush()
        self._track("操作日志", created, skipped, read)


def import_rocketbird(db: Session, source_dir: str | Path, *, dry_run: bool = False, include_logs: bool = True) -> dict:
    """把勤鸟导出数据导入当前数据库，返回导入报告。"""
    importer = RocketbirdImporter(db, source_dir, dry_run=dry_run, include_logs=include_logs)
    return importer.run()
