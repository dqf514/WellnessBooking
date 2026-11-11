import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import Request
from starlette.types import Scope

from .api_key_service import record_api_key_usage
from .booking_service import reconcile_booking_inventory
from .config import UPLOAD_DIR
from .database import Base, SessionLocal, engine, ensure_booking_constraints, ensure_schema
from .routers import admin_api_keys, admin_core, admin_documents, admin_finance, admin_membership, admin_recycle, admin_schedule, admin_settings, auth, checkin, maintenance, public
from .scheduler import start_scheduler
from .seed import run_seed


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_schema()
    run_seed()
    with SessionLocal() as db:
        reconcile_booking_inventory(db)
    ensure_booking_constraints()
    stop_event = threading.Event()
    start_scheduler(stop_event)
    yield
    stop_event.set()


app = FastAPI(title="音昱 Wellness 预约管理 API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:38733", "http://localhost:38733", "http://127.0.0.1:38735", "http://localhost:38735"], allow_credentials=False, allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def api_key_usage_middleware(request: Request, call_next):
    if not request.headers.get("x-api-key", "").startswith("yyk_"):
        return await call_next(request)
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    finally:
        record_api_key_usage(request, status_code)


for router in (auth.router, public.router, checkin.router, admin_core.router, admin_documents.router, admin_membership.router, admin_schedule.router, admin_finance.router, admin_settings.router, admin_api_keys.router, admin_recycle.router, maintenance.router):
    app.include_router(router)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "wellness-booking"}


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope: Scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            normalized_path = path.replace("\\", "/").lstrip("/")
            is_api = normalized_path == "api" or normalized_path.startswith("api/")
            if exc.status_code != 404 or scope["method"] not in ("GET", "HEAD") or is_api or Path(normalized_path).suffix:
                raise
            return await super().get_response("index.html", scope)


app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
dist = Path(__file__).resolve().parent.parent.parent / "dist"
if dist.exists():
    app.mount("/", SPAStaticFiles(directory=str(dist), html=True), name="frontend")
