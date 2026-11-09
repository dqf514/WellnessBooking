import logging
import threading
from datetime import datetime

from .database import SessionLocal
from .models import BackupPlanSettings
from .sms_service import send_due_reminders

logger = logging.getLogger(__name__)


def start_scheduler(stop_event: threading.Event) -> threading.Thread:
    def loop():
        while not stop_event.is_set():
            db = SessionLocal()
            try:
                plan = db.get(BackupPlanSettings, 1)
                if plan and plan.enabled:
                    now = datetime.now()
                    if now.strftime("%H:%M") == plan.daily_time_hm and plan.last_run_date != now.date().isoformat():
                        from .routers.maintenance import cleanup_backups, create_backup
                        path = create_backup()
                        plan.last_run_date = now.date().isoformat()
                        db.commit()
                        cleanup_backups(plan.keep_last)
                        logger.info("自动备份完成：%s", path.name)
                send_due_reminders(db)
            except Exception as exc:
                db.rollback()
                logger.warning("后台计划任务异常：%s", exc)
            finally:
                db.close()
            stop_event.wait(20)

    thread = threading.Thread(target=loop, name="wellness-scheduler", daemon=True)
    thread.start()
    return thread
