import os
import tempfile
from pathlib import Path

# Must be set before the app is imported: settings are read once.
_tmp = Path(tempfile.mkdtemp(prefix="chainproof-test-"))
# Set CHAINPROOF_TEST_DATABASE_URL to run the suite against Postgres. The database is wiped first.
os.environ["CHAINPROOF_DATABASE_URL"] = os.environ.get("CHAINPROOF_TEST_DATABASE_URL", f"sqlite:///{_tmp / 'test.db'}")
os.environ["CHAINPROOF_STORAGE_DIR"] = str(_tmp / "storage")
os.environ["CHAINPROOF_TSA_ENABLED"] = "false"

import hashlib  # noqa: E402
import json  # noqa: E402
import uuid  # noqa: E402

import pytest  # noqa: E402
import rfc8785  # noqa: E402
from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402

PASSWORD = "correct-horse-battery"


@pytest.fixture(scope="session")
def client():
    from sqlalchemy import text

    from app.db import engine

    if engine.dialect.name == "postgresql":
        with engine.begin() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    with TestClient(app) as c:
        with SessionLocal() as db:
            for role in ("investigator", "supervisor", "auditor"):
                db.add(User(email=f"{role}@test.dev", name=role.title(), role=role, password_hash=hash_password(PASSWORD)))
            db.commit()
        yield c


def login(client, role: str) -> dict:
    r = client.post("/auth/login", json={"email": f"{role}@test.dev", "password": PASSWORD})
    assert r.status_code == 200, r.text
    body = r.json()
    return {"headers": {"Authorization": f"Bearer {body['token']}"}, "user": body["user"]}


class Phone:
    """Plays the mobile app: holds an enrolled key and signs captures."""

    def __init__(self, client, auth):
        self.client, self.auth = client, auth
        self.key = Ed25519PrivateKey.generate()
        pub = self.key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw).hex()
        r = client.post("/devices", json={"name": "Test phone", "public_key_hex": pub}, headers=auth["headers"])
        assert r.status_code == 201, r.text
        self.device_id = r.json()["id"]

    def manifest(self, case_id: str, data: bytes, **overrides) -> dict:
        m = {
            "evidence_uuid": str(uuid.uuid4()),
            "case_id": case_id,
            "sha256": hashlib.sha256(data).hexdigest(),
            "mime": "image/jpeg",
            "size": len(data),
            "captured_at": "2026-10-13T10:00:00.000Z",
            "gps": {"lat": 41.2995, "lon": 69.2401, "accuracy": 5.0},
            "device_id": self.device_id,
            "user_id": self.auth["user"]["id"],
            "app_version": "test",
        }
        return m | overrides

    def sign(self, manifest: dict) -> str:
        return self.key.sign(rfc8785.dumps(manifest)).hex()

    def upload(self, case_id: str, data: bytes, manifest: dict | None = None, signature: str | None = None):
        manifest = manifest or self.manifest(case_id, data)
        signature = signature or self.sign(manifest)
        return self.client.post(
            f"/cases/{case_id}/evidence",
            files={"file": ("photo.jpg", data, "image/jpeg")},
            data={"manifest": json.dumps(manifest), "signature": signature},
            headers=self.auth["headers"],
        )


@pytest.fixture
def investigator(client):
    return login(client, "investigator")


@pytest.fixture
def supervisor(client):
    return login(client, "supervisor")


@pytest.fixture
def phone(client, investigator):
    return Phone(client, investigator)


@pytest.fixture
def case_id(client, investigator):
    r = client.post("/cases", json={"title": f"Case {uuid.uuid4().hex[:6]}"}, headers=investigator["headers"])
    assert r.status_code == 201, r.text
    return r.json()["id"]
