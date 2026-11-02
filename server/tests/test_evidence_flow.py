import hashlib

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.db import custody_guards_disabled, engine

JPEG = b"\xff\xd8\xff\xe0fake-jpeg-bytes" + bytes(range(256))


def actions(client, auth, case_id):
    r = client.get(f"/cases/{case_id}/custody", headers=auth["headers"])
    return [e["action"] for e in r.json()["entries"]]


def test_signed_capture_round_trip(client, investigator, phone, case_id):
    r = phone.upload(case_id, JPEG)
    assert r.status_code == 201, r.text
    ev = r.json()
    assert ev["provenance"] == "device_signed"
    assert ev["sha256"] == hashlib.sha256(JPEG).hexdigest()
    assert actions(client, investigator, case_id) == ["CASE_OPENED", "CAPTURED", "UPLOADED"]

    report = client.post(f"/cases/{case_id}/verify", headers=investigator["headers"]).json()
    assert report["ok"] and report["chain"]["ok"]
    assert report["evidence"][0]["checks"]["device_signature"]["ok"] is True

    r = client.get(f"/evidence/{ev['id']}/file?purpose=download", headers=investigator["headers"])
    assert r.content == JPEG
    assert actions(client, investigator, case_id)[-2:] == ["VERIFIED", "DOWNLOADED"]


def test_file_changed_after_capture_is_rejected(phone, case_id):
    m = phone.manifest(case_id, JPEG)
    r = phone.upload(case_id, JPEG + b"edited", manifest=m)
    assert r.status_code == 422
    assert "hash does not match" in r.json()["detail"]


def test_manifest_edited_after_signing_is_rejected(phone, case_id):
    m = phone.manifest(case_id, JPEG)
    sig = phone.sign(m)
    m["gps"] = {"lat": 1.0, "lon": 1.0, "accuracy": 5.0}
    assert phone.upload(case_id, JPEG, manifest=m, signature=sig).status_code == 422


def test_revoked_device_cannot_upload(client, investigator, phone, case_id):
    client.post(f"/devices/{phone.device_id}/revoke", headers=investigator["headers"])
    assert phone.upload(case_id, JPEG).status_code == 403


def test_cannot_sign_as_another_user(client, supervisor, phone, case_id):
    m = phone.manifest(case_id, JPEG, user_id=supervisor["user"]["id"])
    assert phone.upload(case_id, JPEG, manifest=m).status_code == 403


def test_auditor_cannot_upload(client, case_id):
    from tests.conftest import login

    auditor = login(client, "auditor")
    r = client.post(f"/cases/{case_id}/evidence", files={"file": ("a.txt", b"x")}, headers=auditor["headers"])
    assert r.status_code == 403


def test_imported_upload(client, investigator, case_id):
    r = client.post(
        f"/cases/{case_id}/evidence", files={"file": ("log.txt", b"server log", "text/plain")}, headers=investigator["headers"]
    )
    assert r.status_code == 201
    assert r.json()["provenance"] == "imported"
    report = client.post(f"/cases/{case_id}/verify", headers=investigator["headers"]).json()
    assert report["ok"]


def test_database_refuses_to_rewrite_custody(phone, case_id):
    phone.upload(case_id, JPEG)
    with engine.begin() as conn, pytest.raises(DBAPIError, match="append-only"):
        conn.execute(text("UPDATE custody_entries SET action = 'VIEWED' WHERE case_id = :c"), {"c": case_id})
    with engine.begin() as conn, pytest.raises(DBAPIError, match="append-only"):
        conn.execute(text("DELETE FROM custody_entries WHERE case_id = :c"), {"c": case_id})
    with engine.begin() as conn, pytest.raises(DBAPIError, match="immutable"):
        conn.execute(text("UPDATE evidence SET sha256 = 'x' WHERE case_id = :c"), {"c": case_id})


def _as_attacker_with_db_access(sql: str, **params):
    """Simulates someone who bypasses the API and drops the triggers (like scripts/tamper_demo.py)."""
    with engine.begin() as conn, custody_guards_disabled(conn):
        conn.execute(text(sql), params)


def test_tampered_entry_is_detected(client, investigator, phone, case_id):
    phone.upload(case_id, JPEG)
    _as_attacker_with_db_access(
        "UPDATE custody_entries SET details = :d WHERE case_id = :c AND seq = 2", d='{"note": "rewritten"}', c=case_id
    )
    report = client.post(f"/cases/{case_id}/verify", headers=investigator["headers"]).json()
    assert not report["ok"]
    assert report["chain"]["broken_at"] == 2
    assert "modified" in report["chain"]["reason"]
    assert actions(client, investigator, case_id)[-1] != "VERIFIED"  # nothing appended after a break


def test_deleted_entry_is_detected(client, investigator, phone, case_id):
    phone.upload(case_id, JPEG)
    _as_attacker_with_db_access("DELETE FROM custody_entries WHERE case_id = :c AND seq = 2", c=case_id)
    report = client.post(f"/cases/{case_id}/verify", headers=investigator["headers"]).json()
    assert report["chain"]["broken_at"] == 2


def test_swapped_file_is_detected(client, investigator, phone, case_id):
    from app import storage

    ev = phone.upload(case_id, JPEG).json()
    path = storage._path(ev["sha256"])
    path.chmod(0o644)
    path.write_bytes(b"swapped")
    report = client.post(f"/cases/{case_id}/verify", headers=investigator["headers"]).json()
    assert not report["ok"]
    assert report["evidence"][0]["checks"]["file_hash"]["ok"] is False
    path.write_bytes(JPEG)  # other tests share this content-addressed file


def test_public_verify(client, phone, case_id):
    data = JPEG + b"public"
    phone.upload(case_id, data)
    r = client.post("/public/verify", files={"file": ("x.jpg", data)}).json()
    assert r["found"] and r["matches"][0]["intact"]
    assert "title" not in r["matches"][0]
    assert client.post("/public/verify", files={"file": ("x.jpg", b"never uploaded")}).json()["found"] is False


def test_custody_transfer(client, investigator, supervisor, case_id):
    r = client.post(
        f"/cases/{case_id}/transfer",
        json={"to_user_id": supervisor["user"]["id"], "reason": "Sent to lab"},
        headers=investigator["headers"],
    )
    assert r.status_code == 200
    assert r.json()["custodian_id"] == supervisor["user"]["id"]
    assert actions(client, investigator, case_id)[-1] == "TRANSFERRED"


def test_close_and_reopen(client, investigator, supervisor, phone, case_id):
    phone.upload(case_id, JPEG + b"close")
    r = client.post(f"/cases/{case_id}/close", json={"reason": "Investigation complete"}, headers=investigator["headers"])
    assert r.status_code == 200 and r.json()["status"] == "closed"
    assert actions(client, investigator, case_id)[-1] == "CASE_CLOSED"

    assert phone.upload(case_id, JPEG + b"late").status_code == 409
    r = client.post(f"/cases/{case_id}/transfer", json={"to_user_id": supervisor["user"]["id"], "reason": "x"}, headers=investigator["headers"])
    assert r.status_code == 409
    assert client.post(f"/cases/{case_id}/verify", headers=investigator["headers"]).json()["ok"]

    assert client.post(f"/cases/{case_id}/reopen", json={"reason": "New lead"}, headers=investigator["headers"]).status_code == 403
    r = client.post(f"/cases/{case_id}/reopen", json={"reason": "New lead"}, headers=supervisor["headers"])
    assert r.status_code == 200 and r.json()["status"] == "open"
    assert actions(client, investigator, case_id)[-1] == "CASE_REOPENED"


def test_only_supervisors_create_users(client, investigator, supervisor):
    body = {"email": "new.person@test.dev", "name": "New Person", "password": "longenough1", "role": "investigator"}
    assert client.post("/auth/users", json=body, headers=investigator["headers"]).status_code == 403
    assert client.post("/auth/users", json=body, headers=supervisor["headers"]).status_code == 201
    assert client.post("/auth/users", json=body, headers=supervisor["headers"]).status_code == 409
    assert client.post("/auth/login", json={"email": "New.Person@test.dev", "password": "longenough1"}).status_code == 200


def test_integrity_check_of_one_item_adds_no_custody_entry(client, investigator, phone, case_id):
    ev = phone.upload(case_id, b"\xff\xd8 a capture").json()["id"]
    before = len(client.get(f"/cases/{case_id}/custody", headers=investigator["headers"]).json()["entries"])
    r = client.get(f"/evidence/{ev}/integrity", headers=investigator["headers"]).json()
    assert r["ok"] and r["checks"]["file_hash"]["ok"] and r["checked_at"].endswith("Z")
    assert len(client.get(f"/cases/{case_id}/custody", headers=investigator["headers"]).json()["entries"]) == before
