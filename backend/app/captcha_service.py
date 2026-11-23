"""员工登录图片验证码：服务端生成、一次一用，挡住脚本批量试密码。

中等难度：字符带旋转与随机间距，叠加干扰线与噪点，人眼可辨、脚本难读。
"""

from __future__ import annotations

import base64
import io
import random
import time
import uuid

from PIL import Image, ImageDraw, ImageFont

from .security import hash_otp

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 去掉 0/O/1/I 等易混字符
CODE_LENGTH = 4
TTL_SECONDS = 300
MAX_ATTEMPTS = 5
WIDTH, HEIGHT = 160, 46
MAX_CHALLENGES = 500

_challenges: dict[str, dict] = {}


def _code_hash(code: str) -> str:
    return hash_otp(f"captcha:{code}")


def _prune() -> None:
    now = time.time()
    for key in [key for key, row in _challenges.items() if row["expires_at"] < now]:
        _challenges.pop(key, None)
    while len(_challenges) > MAX_CHALLENGES:
        _challenges.pop(next(iter(_challenges)), None)


def _render(code: str) -> bytes:
    image = Image.new("RGB", (WIDTH, HEIGHT), (243, 245, 248))
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=32)
    for _ in range(240):
        draw.point((random.randint(0, WIDTH - 1), random.randint(0, HEIGHT - 1)), fill=(random.randint(196, 232), random.randint(198, 234), random.randint(202, 238)))
    for _ in range(3):
        points = [(random.randint(0, WIDTH), random.randint(0, HEIGHT)) for _ in range(random.randint(3, 6))]
        draw.line(points, fill=(random.randint(120, 200), random.randint(120, 200), random.randint(120, 200)), width=random.randint(1, 2))
    step = WIDTH // (CODE_LENGTH + 1)
    for index, char in enumerate(code):
        glyph = Image.new("RGBA", (38, 48), (0, 0, 0, 0))
        ImageDraw.Draw(glyph).text((4, 3), char, font=font, fill=(random.randint(20, 95), random.randint(20, 95), random.randint(60, 150), 255))
        glyph = glyph.rotate(random.uniform(-28, 28), resample=Image.BICUBIC, expand=True)
        image.paste(glyph, (step * index + random.randint(-4, 6), random.randint(-5, 2)), glyph)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def new_captcha() -> dict:
    """生成一张验证码，返回 captcha_id 与 base64 图片。"""
    _prune()
    code = "".join(random.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
    captcha_id = uuid.uuid4().hex
    _challenges[captcha_id] = {"hash": _code_hash(code), "expires_at": time.time() + TTL_SECONDS, "attempts": 0}
    encoded = base64.b64encode(_render(code)).decode("ascii")
    return {"captcha_id": captcha_id, "image": f"data:image/png;base64,{encoded}", "expires_in": TTL_SECONDS}


def verify_captcha(captcha_id: str, answer: str) -> bool:
    """校验验证码；通过后立即作废，失败最多重试 5 次。"""
    _prune()
    row = _challenges.get(captcha_id)
    if not row:
        return False
    if row["attempts"] >= MAX_ATTEMPTS:
        _challenges.pop(captcha_id, None)
        return False
    row["attempts"] += 1
    if row["hash"] != _code_hash(answer.strip().upper()):
        return False
    _challenges.pop(captcha_id, None)
    return True
