from collections.abc import Iterator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


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
    from app import models  # noqa: F401  (registers tables)

    bind = bind or engine
    Base.metadata.create_all(bind)
    guards = _SQLITE_GUARDS if bind.dialect.name == "sqlite" else _POSTGRES_GUARDS
    with bind.begin() as conn:
        for stmt in guards:
            conn.execute(text(stmt))
