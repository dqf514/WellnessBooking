import json
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


def dt(value: datetime | None) -> str | None:
    return value.strftime("%Y-%m-%d %H:%M:%S") if value else None
