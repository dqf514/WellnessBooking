import json
import math
import re
from datetime import date, datetime, timedelta

from fastapi import HTTPException

PHONE_RE = re.compile(r"^1\d{10}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def today() -> str:
    return date.today().isoformat()


def add_days(value: str, days: int) -> str:
    return (date.fromisoformat(value) + timedelta(days=days)).isoformat()


def valid_date(value: str, field: str = "日期") -> str:
    value = (value or "").strip()
    if not DATE_RE.match(value):
        raise HTTPException(400, f"{field}格式应为 YYYY-MM-DD")
    try:
        date.fromisoformat(value)
    except ValueError:
        raise HTTPException(400, f"{field}不合法") from None
    return value


def valid_time(value: str, field: str = "时间") -> str:
    value = (value or "").strip()
    if not TIME_RE.match(value):
        raise HTTPException(400, f"{field}格式应为 HH:MM")
    return value


def valid_phone(value: str) -> str:
    value = (value or "").strip()
    if not PHONE_RE.match(value):
        raise HTTPException(400, "手机号格式不正确")
    return value


def minutes(value: str) -> int:
    h, m = value.split(":")
    return int(h) * 60 + int(m)


def overlaps(start_a: str, end_a: str, start_b: str, end_b: str) -> bool:
    return minutes(start_a) < minutes(end_b) and minutes(start_b) < minutes(end_a)


def session_datetime(session_date: str, start_time: str) -> datetime:
    return datetime.fromisoformat(f"{session_date}T{start_time}:00")


def json_loads(value: str, fallback):
    try:
        return json.loads(value or "")
    except (json.JSONDecodeError, TypeError):
        return fallback


def clean_payload(payload: dict, allowed: set[str]) -> dict:
    return {key: value for key, value in payload.items() if key in allowed}


def as_int(value, field: str = "数值", default: int | None = None) -> int:
    """把请求体里的数值安全地转成 int，非法值返回 400 而不是 500。"""
    if value is None or value == "":
        if default is None:
            raise HTTPException(400, f"{field}不能为空")
        return default
    try:
        if isinstance(value, bool):
            raise TypeError
        return int(value)
    except (TypeError, ValueError):
        raise HTTPException(400, f"{field}必须是数字") from None


def as_float(value, field: str = "数值", default: float | None = None) -> float:
    """把请求体里的数值安全地转成 float，拒绝 NaN / Infinity。"""
    if value is None or value == "":
        if default is None:
            raise HTTPException(400, f"{field}不能为空")
        return default
    try:
        if isinstance(value, bool):
            raise TypeError
        number = float(value)
    except (TypeError, ValueError):
        raise HTTPException(400, f"{field}必须是数字") from None
    if not math.isfinite(number):
        raise HTTPException(400, f"{field}必须是有限数字")
    return number


def as_bool(value, field: str = "开关") -> bool:
    """把请求体里的开关安全地转成 bool，避免把字符串 "false" 当成 True。"""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        text = value.strip().lower()
        if text in {"1", "true", "yes", "on"}:
            return True
        if text in {"0", "false", "no", "off", ""}:
            return False
    raise HTTPException(400, f"{field}必须是布尔值")


def valid_benefits(value) -> list[dict]:
    """校验套餐分项权益：必须是 [{course_type, quantity}] 列表，避免后续消费时崩溃。"""
    if value is None:
        return []
    if not isinstance(value, list):
        raise HTTPException(400, "套餐分项权益格式不正确")
    result: list[dict] = []
    for item in value:
        if not isinstance(item, dict):
            raise HTTPException(400, "套餐分项权益格式不正确")
        course_type = str(item.get("course_type", "")).strip()
        if not course_type:
            raise HTTPException(400, "套餐分项权益缺少课程类别")
        quantity = as_int(item.get("quantity"), "权益次数")
        if quantity < 0:
            raise HTTPException(400, "权益次数不能为负数")
        entry = {**item, "course_type": course_type, "quantity": quantity}
        if "remaining" in item:
            remaining = as_int(item.get("remaining"), "权益剩余次数")
            if remaining < 0:
                raise HTTPException(400, "权益剩余次数不能为负数")
            entry["remaining"] = remaining
        result.append(entry)
    return result


def dt(value: datetime | None) -> str | None:
    return value.strftime("%Y-%m-%d %H:%M:%S") if value else None
