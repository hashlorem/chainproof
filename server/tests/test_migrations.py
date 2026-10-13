from alembic import command
from alembic.config import Config

from app.config import SERVER_DIR
from app.db import engine


def test_models_match_migrations(client):
    """Fails if someone changed app/models.py without adding a migration (alembic revision --autogenerate)."""
    cfg = Config(str(SERVER_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(SERVER_DIR / "migrations"))
    with engine.connect() as conn:
        cfg.attributes["connection"] = conn
        command.check(cfg)
