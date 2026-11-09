import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
BACKUP_DIR = BASE_DIR / "backups"
UPLOAD_DIR = BASE_DIR / "uploads"
for directory in (DATA_DIR, BACKUP_DIR, UPLOAD_DIR):
    directory.mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{(DATA_DIR / 'wellness.db').as_posix()}")
JWT_SECRET = os.environ.get("JWT_SECRET", "wellness-local-secret-change-before-production")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))
SEED_DEMO_DATA = os.environ.get("SEED_DEMO_DATA", "true").lower() in {"1", "true", "yes"}
SMS_DEV_MODE = os.environ.get("SMS_DEV_MODE", "true").lower() in {"1", "true", "yes"}
SMS_DEV_CODE = os.environ.get("SMS_DEV_CODE", "246810")
