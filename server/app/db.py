from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import SERVER_DIR, settings


class Base(DeclarativeBase):
    pass


def make_engine(url: str):
    is_sqlite = url.startswith("sqlite")
    engine = create_engine(url, connect_args={"check_same_thread": False} if is_sqlite else {})
    if is_sqlite:
        @event.listens_for(engine, "connect")
        def _pragmas(conn, _):
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute("PRAGMA journal_mode=WAL")
    return engine


engine = make_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    with SessionLocal() as db:
        yield db


# The database itself refuses to rewrite history, even if the API has a bug.
# Only someone with direct superuser access could drop these, and the hash chain would still expose the edit.
_SQLITE_GUARDS = [
    """CREATE TRIGGER IF NOT EXISTS custody_no_update BEFORE UPDATE ON custody_entries
       BEGIN SELECT RAISE(ABORT, 'custody log is append-only'); END""",
    """CREATE TRIGGER IF NOT EXISTS custody_no_delete BEFORE DELETE ON custody_entries
       BEGIN SELECT RAISE(ABORT, 'custody log is append-only'); END""",
    """CREATE TRIGGER IF NOT EXISTS evidence_frozen BEFORE UPDATE OF sha256, size, manifest_json, signature, storage_key, device_id ON evidence
       BEGIN SELECT RAISE(ABORT, 'evidence record is immutable'); END""",
    """CREATE TRIGGER IF NOT EXISTS evidence_no_delete BEFORE DELETE ON evidence
       BEGIN SELECT RAISE(ABORT, 'evidence cannot be deleted'); END""",
]

_POSTGRES_GUARDS = [
    """CREATE OR REPLACE FUNCTION chainproof_append_only() RETURNS trigger AS $$
       BEGIN RAISE EXCEPTION 'custody log is append-only'; END; $$ LANGUAGE plpgsql""",
    """CREATE OR REPLACE FUNCTION chainproof_evidence_frozen() RETURNS trigger AS $$
       BEGIN
         IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'evidence cannot be deleted'; END IF;
         IF (NEW.sha256, NEW.size, NEW.manifest_json, NEW.signature, NEW.storage_key, NEW.device_id)
            IS DISTINCT FROM (OLD.sha256, OLD.size, OLD.manifest_json, OLD.signature, OLD.storage_key, OLD.device_id)
         THEN RAISE EXCEPTION 'evidence record is immutable'; END IF;
         RETURN NEW;
       END; $$ LANGUAGE plpgsql""",
    "DROP TRIGGER IF EXISTS custody_append_only ON custody_entries",
    """CREATE TRIGGER custody_append_only BEFORE UPDATE OR DELETE ON custody_entries
       FOR EACH ROW EXECUTE FUNCTION chainproof_append_only()""",
    "DROP TRIGGER IF EXISTS evidence_frozen ON evidence",
    """CREATE TRIGGER evidence_frozen BEFORE UPDATE OR DELETE ON evidence
       FOR EACH ROW EXECUTE FUNCTION chainproof_evidence_frozen()""",
]


def init_db(bind=None) -> None:
    """Brings the database up to the latest migration (server/migrations). Runs on every API start."""
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect

    bind = bind or engine
    cfg = Config(str(SERVER_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(SERVER_DIR / "migrations"))
    with bind.begin() as conn:
        cfg.attributes["connection"] = conn
        tables = set(inspect(conn).get_table_names())
        if "custody_entries" in tables and "alembic_version" not in tables:
            # Made before migrations existed (by create_all): it already matches the first migration.
            command.stamp(cfg, "0001")
        command.upgrade(cfg, "head")


@contextmanager
def custody_guards_disabled(conn):
    """
    Turns off the append-only triggers on custody_entries for the length of the block, then restores them.
    Only for tamper demos and tests: it plays an insider with direct database access.
    """
    if conn.dialect.name == "sqlite":
        conn.execute(text("DROP TRIGGER custody_no_update"))
        conn.execute(text("DROP TRIGGER custody_no_delete"))
        try:
            yield
        finally:
            for stmt in _SQLITE_GUARDS:
                conn.execute(text(stmt))
    else:
        conn.execute(text("ALTER TABLE custody_entries DISABLE TRIGGER custody_append_only"))
        try:
            yield
        finally:
            conn.execute(text("ALTER TABLE custody_entries ENABLE TRIGGER custody_append_only"))
