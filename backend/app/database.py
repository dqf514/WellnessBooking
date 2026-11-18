import logging

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

from .config import DATABASE_URL

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


connect_args = {"check_same_thread": False, "timeout": 30}
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args=connect_args,
        poolclass=StaticPool if ":memory:" in DATABASE_URL else None,
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, _):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()
else:
    engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_schema():
    with engine.begin() as connection:
        additions = {
            "app_settings": {"logo_url": "VARCHAR(600) DEFAULT ''", "favicon_url": "VARCHAR(600) DEFAULT ''"},
            "class_sessions": {"reserved_count": "INTEGER DEFAULT 0"},
            "member_cards": {"version": "INTEGER DEFAULT 0"},
            "rooms": {"floor": "VARCHAR(30) DEFAULT '1F'", "sort_order": "INTEGER DEFAULT 0"},
            "bookings": {"experience_voucher_id": "INTEGER REFERENCES experience_vouchers(id)"},
            "member_documents": {"category": "VARCHAR(24) DEFAULT 'contract'"},
            "transactions": {
                "cancelled_at": "DATETIME",
                "cancelled_by": "VARCHAR(80) DEFAULT ''",
                "booking_id": "INTEGER REFERENCES bookings(id)",
                "cash_basis": "BOOLEAN DEFAULT 1",
                "revenue_mode": "VARCHAR(24) DEFAULT 'legacy'",
                "revenue_start_on": "VARCHAR(10) DEFAULT ''",
                "revenue_days": "INTEGER DEFAULT 0",
                "revenue_sequence": "INTEGER DEFAULT 0",
                "created_by": "VARCHAR(80) DEFAULT ''",
            },
        }
        soft_delete_tables = {"users", "members", "teachers", "rooms", "courses", "class_sessions", "card_products", "member_cards", "bookings", "member_card_shares", "experience_vouchers", "member_reminders", "room_reservations", "member_records", "member_documents", "transactions", "api_keys"}
        for table in soft_delete_tables:
            additions.setdefault(table, {}).update({
                "deleted_at": "DATETIME",
                "deleted_by": "VARCHAR(80) DEFAULT ''",
                "deleted_state_json": "TEXT DEFAULT '{}'",
            })
        for table, columns_to_add in additions.items():
            existing = {column["name"] for column in inspect(connection).get_columns(table)}
            for name, definition in columns_to_add.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {definition}"))


def ensure_constraints():
    if not DATABASE_URL.startswith("sqlite"):
        return
    with engine.begin() as connection:
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_bookings_active_member_session ON bookings(session_id, member_id) WHERE status IN ('booked', 'checked_in', 'completed', 'no_show')"))
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_transactions_booking_revenue_sequence ON transactions(booking_id, revenue_sequence, kind) WHERE booking_id IS NOT NULL AND kind IN ('consumption', 'consumption_reversal')"))
        # 教练与员工账号的关联必须唯一；历史数据可能存在重复，先清理再建索引，
        # 并且建索引失败不能阻断服务启动。
        linked = connection.execute(text("SELECT id, user_id FROM teachers WHERE user_id IS NOT NULL AND deleted_at IS NULL ORDER BY id")).fetchall()
        kept: set[int] = set()
        for teacher_id, user_id in linked:
            if user_id in kept:
                connection.execute(text("UPDATE teachers SET user_id = NULL WHERE id = :id"), {"id": teacher_id})
            else:
                kept.add(user_id)
        try:
            connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_teachers_user_id ON teachers(user_id) WHERE user_id IS NOT NULL AND deleted_at IS NULL"))
        except Exception:  # noqa: BLE001 - 索引失败不应让整个服务无法启动
            logger.warning("教练账号唯一索引创建失败，请检查 teachers.user_id 是否存在重复数据")
