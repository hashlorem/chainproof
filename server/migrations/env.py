"""Alembic environment. The database URL comes from app settings (CHAINPROOF_DATABASE_URL), not alembic.ini."""

from alembic import context

from app import models  # noqa: F401  (registers tables on Base.metadata)
from app.config import settings
from app.db import Base, make_engine

target_metadata = Base.metadata


def run(connection) -> None:
    # Batch mode lets SQLite handle ALTER TABLE changes by rebuilding the table.
    context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    context.configure(url=settings.database_url, target_metadata=target_metadata, literal_binds=True, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()
elif (conn := context.config.attributes.get("connection")) is not None:
    run(conn)  # called from app.db.init_db with the app's own engine
else:
    with make_engine(settings.database_url).connect() as conn:
        run(conn)
