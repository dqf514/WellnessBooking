"""ICS 日历解析：把 Outlook 会议室日历解析成可导入的占用记录。"""
from datetime import datetime, timedelta

WEEKDAY_INDEX = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}
MAX_EVENTS = 60


def unfold(text: str) -> list[str]:
    """展开 ICS 的续行（以空格或制表符开头的行接在上一行后面）。"""
    lines: list[str] = []
    for raw in (text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw[:1] in {" ", "\t"} and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    return [line.strip() for line in lines if line.strip()]


def _parse_dt(value: str) -> tuple[str, str] | None:
    """解析 DTSTART/DTEND，返回 (日期, 时间)；全天事件的时间为空。"""
    value = value.strip()
    if not value:
        return None
    if "T" not in value:
        if len(value) < 8:
            return None
        return (f"{value[0:4]}-{value[4:6]}-{value[6:8]}", "")
    date_part, _, time_part = value.partition("T")
    if time_part.endswith("Z"):
        time_part = time_part[:-1]
        try:
            moment = datetime.strptime(date_part + time_part[:6], "%Y%m%d%H%M%S") + timedelta(hours=8)
        except ValueError:
            return None
        return (moment.strftime("%Y-%m-%d"), moment.strftime("%H:%M"))
    try:
        moment = datetime.strptime(date_part + time_part[:6], "%Y%m%d%H%M%S")
    except ValueError:
        return None
    return (moment.strftime("%Y-%m-%d"), moment.strftime("%H:%M"))


def _unescape(value: str) -> str:
    return value.replace("\\n", " ").replace("\\N", " ").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\").strip()


def _minutes(time: str) -> int:
    hour, _, minute = time.partition(":")
    return int(hour or 0) * 60 + int(minute or 0)


def _add_minutes(time: str, delta: int) -> str:
    total = (_minutes(time) + delta) % (24 * 60)
    return f"{total // 60:02d}:{total % 60:02d}"


def _repeat_offsets(rrule: str, start_date: str) -> list[int]:
    """展开每周重复规则，返回相对首日的偏移天数（最多 60 条）。"""
    if not rrule:
        return [0]
    parts = dict(item.split("=", 1) for item in rrule.split(";") if "=" in item)
    if parts.get("FREQ", "").upper() != "WEEKLY":
        return [0]
    try:
        interval = max(1, int(parts.get("INTERVAL", "1") or 1))
    except ValueError:
        interval = 1
    try:
        count = int(parts.get("COUNT", "0") or 0)
    except ValueError:
        count = 0
    limit_date = ""
    if parts.get("UNTIL"):
        parsed = _parse_dt(parts["UNTIL"])
        limit_date = parsed[0] if parsed else ""
    bydays = [item.strip().upper() for item in parts.get("BYDAY", "").split(",") if item.strip()]
    base = datetime.strptime(start_date, "%Y-%m-%d")
    offsets: list[int] = []
    for week in range(53):
        week_start = base + timedelta(weeks=week * interval)
        for day in bydays or [""]:
            target = week_start
            if day:
                target = week_start + timedelta(days=(WEEKDAY_INDEX.get(day, 0) - week_start.weekday()) % 7)
                if target < base:
                    continue
            if limit_date and target.strftime("%Y-%m-%d") > limit_date:
                continue
            offsets.append((target - base).days)
            if count and len(offsets) >= count:
                return sorted(set(offsets))
            if len(offsets) >= MAX_EVENTS:
                return sorted(set(offsets))
    return sorted(set(offsets))


def _expand(event: dict) -> list[dict]:
    start_date, start_time = event["start"]
    end_date, end_time = event["end"] or (start_date, "")
    if not start_time:
        start_time = "09:00"
        end_time = end_time or "10:00"
    elif not end_time:
        end_time = _add_minutes(start_time, 60)
    duration = 0
    try:
        duration = (datetime.strptime(end_date, "%Y-%m-%d") - datetime.strptime(start_date, "%Y-%m-%d")).days * 24 * 60 + _minutes(end_time) - _minutes(start_time)
    except ValueError:
        duration = 60
    results = []
    for offset in _repeat_offsets(event["rrule"], start_date):
        day = (datetime.strptime(start_date, "%Y-%m-%d") + timedelta(days=offset)).strftime("%Y-%m-%d")
        results.append({
            "uid": event["uid"],
            "summary": event["summary"] or "Outlook 会议室预定",
            "location": event["location"],
            "description": event["description"],
            "date": day,
            "start_time": start_time,
            "end_time": end_time,
            "duration_minutes": max(0, duration),
        })
    return results


def parse_ics(text: str) -> list[dict]:
    """解析 ICS 文本，返回日程列表（每周重复的会展开成多条）。"""
    events: list[dict] = []
    current: dict | None = None
    for line in unfold(text):
        upper = line.upper()
        if upper == "BEGIN:VEVENT":
            current = {"uid": "", "summary": "", "location": "", "description": "", "start": None, "end": None, "rrule": ""}
            continue
        if upper == "END:VEVENT":
            if current and current["start"]:
                events.extend(_expand(current))
            current = None
            continue
        if current is None or ":" not in line:
            continue
        name, _, value = line.partition(":")
        key = name.split(";")[0].strip().upper()
        if key == "UID":
            current["uid"] = value.strip()
        elif key == "SUMMARY":
            current["summary"] = _unescape(value)
        elif key == "LOCATION":
            current["location"] = _unescape(value)
        elif key == "DESCRIPTION":
            current["description"] = _unescape(value)
        elif key == "DTSTART":
            current["start"] = _parse_dt(value)
        elif key == "DTEND":
            current["end"] = _parse_dt(value)
        elif key == "RRULE":
            current["rrule"] = value.strip()
    return events
