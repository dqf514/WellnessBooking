import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

DEFAULT_SEND_URL = "https://sms.shxinxinyun.com/api/send-sms-batch"
DEFAULT_BALANCE_URL = "https://sms.shxinxinyun.com/api/balance"
USER_AGENT = "application/x-www-form-urlencoded"


def _decode(raw: bytes, charset: str | None = None) -> str:
    for encoding in [charset, "utf-8", "gb18030", "gbk"]:
        if not encoding:
            continue
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _request(url: str, *, data: dict[str, str] | None = None, params: dict[str, str] | None = None) -> dict[str, Any]:
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    body = urllib.parse.urlencode(data or {}).encode("utf-8") if data is not None else None
    request = urllib.request.Request(url, data=body, method="POST" if data is not None else "GET", headers={"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            raw = _decode(response.read(), response.headers.get_content_charset())
    except urllib.error.HTTPError as exc:
        raw = _decode(exc.read(), exc.headers.get_content_charset())
        raise RuntimeError(f"短信网关 HTTP {exc.code}: {raw[:300]}") from exc
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        raise ValueError("短信接口返回非 JSON") from None


def send_sms_batch(*, sp_id: str, password_md5: str, mobiles: str, content: str, send_url: str | None = None) -> dict[str, Any]:
    content = (content or "").replace("小姐", "女士")
    return _request(send_url or DEFAULT_SEND_URL, data={"sp_id": sp_id, "mobiles": mobiles, "content": content, "password": password_md5})


def query_balance(*, sp_id: str, password_md5: str, balance_url: str | None = None) -> dict[str, Any]:
    return _request(balance_url or DEFAULT_BALANCE_URL, params={"sp_id": sp_id, "password": password_md5})
