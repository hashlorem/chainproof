from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

SERVER_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CHAINPROOF_", env_file=".env")

    # SQLite works with no setup. For Postgres (docker compose up db):
    # CHAINPROOF_DATABASE_URL=postgresql+psycopg://chainproof:chainproof@localhost:5432/chainproof
    database_url: str = f"sqlite:///{SERVER_DIR / 'storage' / 'chainproof.db'}"
    storage_dir: Path = SERVER_DIR / "storage"
    # Leave empty to auto-generate one and keep it in storage_dir (see core/security.py).
    jwt_secret: str = ""
    jwt_ttl_minutes: int = 12 * 60
    tsa_enabled: bool = True
    tsa_url: str = "https://freetsa.org/tsr"
    # SHA-256 of FreeTSA's signing certificate (https://freetsa.org/files/tsa.crt, valid until 2040).
    # Tokens signed by any other certificate are rejected. Set to "" to accept any embedded cert.
    tsa_cert_sha256: str = "32e841a95cc1164101ffde41298ef2fc75c1c4372ef095e88a6bbd47dfb191fc"
    login_max_failures: int = 5
    login_lockout_minutes: int = 15
    public_base_url: str = "http://localhost:3100"
    cors_origins: list[str] = ["http://localhost:3100"]


settings = Settings()
