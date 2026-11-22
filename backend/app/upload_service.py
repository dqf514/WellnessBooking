"""图片上传统一处理：校验格式与体积、落盘到 uploads 目录、清理旧文件。"""
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from .config import UPLOAD_DIR

MAX_IMAGE_BYTES = 6 * 1024 * 1024


def save_image(file: UploadFile, folder: str, prefix: str, max_bytes: int = MAX_IMAGE_BYTES) -> str:
    """保存图片并返回可访问的相对地址；仅接受 PNG / JPG / WebP。"""
    raw = file.file.read(max_bytes + 1)
    if len(raw) > max_bytes:
        raise HTTPException(400, f"图片不能超过 {max_bytes // 1024 // 1024}MB")
    extension = Path(file.filename or "").suffix.lower()
    valid = (extension == ".png" and raw.startswith(b"\x89PNG\r\n\x1a\n")) or (extension in {".jpg", ".jpeg"} and raw.startswith(b"\xff\xd8")) or (extension == ".webp" and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP")
    if not valid:
        raise HTTPException(400, "仅支持 PNG、JPG 或 WebP 图片")
    directory = UPLOAD_DIR / folder
    directory.mkdir(parents=True, exist_ok=True)
    stored_name = f"{prefix}-{uuid.uuid4().hex}{extension}"
    (directory / stored_name).write_bytes(raw)
    return f"/uploads/{folder}/{stored_name}"


def image_size(file: UploadFile) -> int:
    """取上传文件的字节数；上传流可能已被读完，这里按文件长度计算。"""
    try:
        file.file.seek(0, 2)
        size = file.file.tell()
        file.file.seek(0)
        return size
    except OSError:  # noqa: BLE001 - 取不到长度时按 0 处理
        return 0


def remove_upload(url: str, folder: str) -> None:
    """删除上传目录里的旧文件；只允许删除指定目录下的文件。"""
    if not url or not url.startswith(f"/uploads/{folder}/"):
        return
    name = Path(url.split("/")[-1]).name
    if not name:
        return
    target = UPLOAD_DIR / folder / name
    try:
        if target.is_file():
            target.unlink()
    except OSError:  # noqa: BLE001 - 清理旧图失败不应影响主流程
        pass


def upload_path(url: str, folder: str):
    """把 /uploads/xxx/yyy 形式的地址转成本地文件路径；不合法时返回 None。"""
    if not url or not url.startswith(f"/uploads/{folder}/"):
        return None
    name = Path(url.split("/")[-1]).name
    if not name:
        return None
    target = UPLOAD_DIR / folder / name
    return target if target.is_file() else None
