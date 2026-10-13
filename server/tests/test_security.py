import pytest

from app.config import settings
from app.core.security import login_limiter
from tests.conftest import PASSWORD


@pytest.fixture(autouse=True)
def fresh_limiter():
    login_limiter.reset()
    yield
    login_limiter.reset()


def test_login_locks_after_repeated_failures(client):
    for _ in range(settings.login_max_failures):
        assert client.post("/auth/login", json={"email": "auditor@test.dev", "password": "wrong"}).status_code == 401
    r = client.post("/auth/login", json={"email": "auditor@test.dev", "password": PASSWORD})
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) > 0
    # Other accounts on the same IP are not locked out by one account's failures.
    assert client.post("/auth/login", json={"email": "supervisor@test.dev", "password": PASSWORD}).status_code == 200


def test_success_clears_failures(client):
    for _ in range(settings.login_max_failures - 1):
        client.post("/auth/login", json={"email": "auditor@test.dev", "password": "wrong"})
    assert client.post("/auth/login", json={"email": "auditor@test.dev", "password": PASSWORD}).status_code == 200
    assert client.post("/auth/login", json={"email": "auditor@test.dev", "password": "wrong"}).status_code == 401


def test_jwt_secret_is_generated_not_hardcoded():
    from app.core.security import jwt_secret

    assert settings.jwt_secret == ""
    assert len(jwt_secret()) >= 32
    assert (settings.storage_dir / "jwt_secret").read_text().strip() == jwt_secret()


def test_uploaded_html_is_never_served_as_a_page(client, investigator, case_id):
    html = b"<script>alert(document.domain)</script>"
    ev = client.post(
        f"/cases/{case_id}/evidence", files={"file": ('evil"\r\nX: 1.html', html, "text/html")}, headers=investigator["headers"]
    ).json()
    r = client.get(f"/evidence/{ev['id']}/file?purpose=view", headers=investigator["headers"])
    assert r.headers["content-type"] == "application/octet-stream"
    assert r.headers["content-disposition"].startswith("attachment;")
    assert "sandbox" in r.headers["content-security-policy"]
    assert r.headers["x-content-type-options"] == "nosniff"
    disposition = r.headers["content-disposition"]
    assert "\r" not in disposition and "\n" not in disposition
    ascii_part = disposition.split("filename=", 1)[1].split(";", 1)[0]
    assert ascii_part.count('"') == 2  # the quote inside the uploaded name was replaced, so it can't break out


def test_tsa_token_from_another_certificate_is_rejected(monkeypatch):
    from app.core import tsa
    from tests.test_tsa import HASH, TOKEN

    assert tsa.check_timestamp(TOKEN, HASH)
    monkeypatch.setattr(settings, "tsa_cert_sha256", "0" * 64)
    assert not tsa.check_timestamp(TOKEN, HASH)


def test_video_plays_inline_but_svg_does_not(client, investigator, phone, case_id):
    video = b"\x00\x00\x00\x18ftypmp42" + bytes(64)
    m = phone.manifest(case_id, video, mime="video/mp4")
    r = client.post(
        f"/cases/{case_id}/evidence",
        files={"file": ("VID_1.mp4", video, "video/mp4")},
        data={"manifest": __import__("json").dumps(m), "signature": phone.sign(m)},
        headers=investigator["headers"],
    )
    assert r.status_code == 201 and r.json()["provenance"] == "device_signed"
    r = client.get(f"/evidence/{m['evidence_uuid']}/file", headers=investigator["headers"])
    assert r.headers["content-type"] == "video/mp4" and r.headers["content-disposition"].startswith("inline;")

    svg = client.post(
        f"/cases/{case_id}/evidence", files={"file": ("x.svg", b"<svg onload='alert(1)'/>", "image/svg+xml")}, headers=investigator["headers"]
    ).json()
    r = client.get(f"/evidence/{svg['id']}/file", headers=investigator["headers"])
    assert r.headers["content-type"] == "application/octet-stream" and r.headers["content-disposition"].startswith("attachment;")
