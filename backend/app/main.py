import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database import Base, engine
from .routers import admin_core, admin_documents, admin_finance, admin_schedule, admin_settings, auth, maintenance, public
from .scheduler import start_scheduler
from .seed import run_seed


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    run_seed()
    stop_event = threading.Event()
    start_scheduler(stop_event)
    yield
    stop_event.set()


app = FastAPI(title="音昱 Wellness 预约管理 API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:38733", "http://localhost:38733", "http://127.0.0.1:38735", "http://localhost:38735"], allow_credentials=False, allow_methods=["*"], allow_headers=["*"])
for router in (auth.router, public.router, admin_core.router, admin_documents.router, admin_schedule.router, admin_finance.router, admin_settings.router, maintenance.router):
    app.include_router(router)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "wellness-booking"}


dist = Path(__file__).resolve().parent.parent.parent / "dist"
if dist.exists():
    app.mount("/", StaticFiles(directory=str(dist), html=True), name="frontend")
