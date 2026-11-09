from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

from .config import DATABASE_URL


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
        }
        for table, columns_to_add in additions.items():
            existing = {column["name"] for column in inspect(connection).get_columns(table)}
            for name, definition in columns_to_add.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {definition}"))


def ensure_booking_constraints():
    if not DATABASE_URL.startswith("sqlite"):
        return
    with engine.begin() as connection:
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_bookings_active_member_session ON bookings(session_id, member_id) WHERE status IN ('booked', 'checked_in', 'completed', 'no_show')"))
