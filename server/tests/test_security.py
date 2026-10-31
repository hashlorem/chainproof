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


def test_change_and_reset_password(client, supervisor):
    body = {"email": "pw.user@test.dev", "name": "Pw User", "password": "first-password", "role": "auditor"}
    uid = client.post("/auth/users", json=body, headers=supervisor["headers"]).json()["id"]
    tok = client.post("/auth/login", json={"email": body["email"], "password": "first-password"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}

    assert client.post("/auth/password", json={"current_password": "wrong", "new_password": "second-password"}, headers=h).status_code == 400
    assert client.post("/auth/password", json={"current_password": "first-password", "new_password": "second-password"}, headers=h).status_code == 200
    assert client.post("/auth/login", json={"email": body["email"], "password": "second-password"}).status_code == 200

    # Only supervisors reset other people's passwords.
    assert client.post(f"/auth/users/{uid}/password", json={"new_password": "third-password"}, headers=h).status_code == 403
    assert client.post(f"/auth/users/{uid}/password", json={"new_password": "third-password"}, headers=supervisor["headers"]).status_code == 200
    assert client.post("/auth/login", json={"email": body["email"], "password": "third-password"}).status_code == 200


def test_tunnel_visitors_are_told_apart_by_cloudflare_header(client, monkeypatch):
    """Behind the demo tunnel every request comes from 127.0.0.1; one attacker must not lock out the room (TM-004)."""
    monkeypatch.setattr(settings, "trust_cf_connecting_ip", True)
    attacker = {"CF-Connecting-IP": "203.0.113.9"}
    for i in range(settings.login_max_failures * 4):
        client.post("/auth/login", json={"email": f"nobody{i}@test.dev", "password": "wrong"}, headers=attacker)
    assert client.post("/auth/login", json={"email": "auditor@test.dev", "password": PASSWORD}, headers=attacker).status_code == 429
    visitor = {"CF-Connecting-IP": "198.51.100.4"}
    assert client.post("/auth/login", json={"email": "auditor@test.dev", "password": PASSWORD}, headers=visitor).status_code == 200


def test_cloudflare_header_is_ignored_unless_enabled(client):
    """Without the tunnel anyone could send the header, so by default it must not dodge the per-address limit."""
    for i in range(settings.login_max_failures * 4):
        client.post("/auth/login", json={"email": f"nobody{i}@test.dev", "password": "wrong"}, headers={"CF-Connecting-IP": f"203.0.113.{i}"})
    assert client.post("/auth/login", json={"email": "auditor@test.dev", "password": PASSWORD}).status_code == 429


def test_password_reset_lifts_lockout(client, supervisor):
    for _ in range(settings.login_max_failures):
        client.post("/auth/login", json={"email": "auditor@test.dev", "password": "wrong"})
    assert client.post("/auth/login", json={"email": "auditor@test.dev", "password": PASSWORD}).status_code == 429
    auditor = next(u for u in client.get("/auth/users", headers=supervisor["headers"]).json() if u["email"] == "auditor@test.dev")
    r = client.post(f"/auth/users/{auditor['id']}/password", json={"new_password": PASSWORD}, headers=supervisor["headers"])
    assert r.status_code == 200, r.text
    assert client.post("/auth/login", json={"email": "auditor@test.dev", "password": PASSWORD}).status_code == 200


def test_public_verify_upload_is_capped(client, monkeypatch):
    monkeypatch.setattr(settings, "public_verify_max_mb", 1)
    assert client.post("/public/verify", files={"file": ("x.jpg", b"small")}).status_code == 200
    r = client.post("/public/verify", files={"file": ("x.jpg", b"0" * (1024 * 1024 + 1))})
    assert r.status_code == 413
    assert "1 MB" in r.json()["detail"]


def test_public_verify_upload_cap_counts_bytes_without_content_length(client, monkeypatch):
    monkeypatch.setattr(settings, "public_verify_max_mb", 1)
    body = b"--b\r\nContent-Disposition: form-data; name=\"file\"; filename=\"x\"\r\n\r\n" + b"0" * (2 * 1024 * 1024) + b"\r\n--b--\r\n"
    r = client.post("/public/verify", content=(body[i:i + 65536] for i in range(0, len(body), 65536)),
                    headers={"Content-Type": "multipart/form-data; boundary=b"})
    assert r.status_code == 413


def test_public_lookups_are_rate_limited(client, monkeypatch):
    from app.core.security import public_limiter

    public_limiter.reset()
    monkeypatch.setattr(settings, "public_verify_per_minute", 3)
    for _ in range(3):
        assert client.get(f"/public/verify/{'0' * 64}").status_code == 200
    r = client.get(f"/public/verify/{'0' * 64}")
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) > 0
    public_limiter.reset()
