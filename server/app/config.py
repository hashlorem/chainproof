from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

SERVER_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CHAINPROOF_", env_file=".env")

    # SQLite works with no setup. For Postgres (docker compose up db):
    # CHAINPROOF_DATABASE_URL=postgresql+psycopg://chainproof:chainproof@localhost:5432/chainproof
    database_url: str = f"sqlite:///{SERVER_DIR / 'storage' / 'chainproof.db'}"
    storage_dir: Path = SERVER_DIR / "storage"
    jwt_secret: str = "dev-only-change-me-in-production-0123456789"
    jwt_ttl_minutes: int = 12 * 60
    tsa_enabled: bool = True
    tsa_url: str = "https://freetsa.org/tsr"
    public_base_url: str = "http://localhost:3100"
    cors_origins: list[str] = ["http://localhost:3100"]


settings = Settings()
