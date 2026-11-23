"""员工登录二次验证（MFA）的待验证挑战。

口令校验通过后生成一次性挑战令牌，用户再用短信验证码完成登录。
系统以单进程形态部署，挑战保存在内存里即可，5 分钟过期。
"""

from __future__ import annotations

import secrets
import time

TTL_SECONDS = 300
MAX_ATTEMPTS = 5

_pending: dict[str, dict] = {}


def _prune() -> None:
    now = time.time()
    for key in [key for key, row in _pending.items() if row["expires_at"] < now]:
        _pending.pop(key, None)


def create_challenge(user_id: int, phone: str) -> str:
    _prune()
    token = secrets.token_urlsafe(24)
    _pending[token] = {"user_id": user_id, "phone": phone, "expires_at": time.time() + TTL_SECONDS, "attempts": 0}
    return token


def take_challenge(token: str) -> dict | None:
    """取出挑战并累加尝试次数，超过上限直接作废。"""
    _prune()
    row = _pending.get(token)
    if not row:
        return None
    row["attempts"] += 1
    if row["attempts"] > MAX_ATTEMPTS:
        _pending.pop(token, None)
        return None
    return row


def consume(token: str) -> None:
    _pending.pop(token, None)


def mask_phone(phone: str) -> str:
    phone = (phone or "").strip()
    if len(phone) < 7:
        return phone
    return f"{phone[:3]}****{phone[-4:]}"
