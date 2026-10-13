from tests.test_forensics import jpeg, scene


def test_report_export_and_public_check(client, investigator, phone, case_id):
    phone.upload(case_id, jpeg(scene(7)))
    r = client.post(f"/cases/{case_id}/report", headers=investigator["headers"])
    assert r.status_code == 200
    assert r.content.startswith(b"%PDF")
    custody = client.get(f"/cases/{case_id}/custody", headers=investigator["headers"]).json()["entries"]
    assert custody[-1]["action"] == "EXPORTED"
    assert custody[-1]["details"]["report_sha256"] == r.headers["X-Content-SHA256"]

    check = client.post("/public/verify", files={"file": ("r.pdf", r.content)}).json()
    assert check["found"] and check["kind"] == "report"
    edited = r.content.replace(b"ChainProof", b"ChainPr00f", 1)
    assert client.post("/public/verify", files={"file": ("r.pdf", edited)}).json()["found"] is False
