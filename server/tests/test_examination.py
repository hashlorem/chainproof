import io

import pytest

from tests.test_forensics import jpeg, scene

CONCLUSION = {
    "h1": "The image was altered after capture",
    "h2": "The image is an unaltered camera original",
    "level": "strong",
    "rationale": "A cloned region of 2,046 matching points; the copy has no shadow of its own.",
    "limitations": "Recompression may hide smaller edits; identical real objects can look like clones.",
}


@pytest.fixture
def original() -> bytes:
    return jpeg(scene(11))


@pytest.fixture
def item(client, investigator, phone, case_id, original):
    ev = phone.upload(case_id, original).json()
    assert client.post(f"/evidence/{ev['id']}/analyze", headers=investigator["headers"]).status_code == 200
    return ev["id"]


def test_examination_workflow(client, investigator, supervisor, case_id, item):
    url = f"/evidence/{item}"
    r = client.post(f"{url}/notes", json={"text": "Received as a Messenger copy; working on the stored original."}, headers=investigator["headers"])
    assert r.status_code == 201 and r.json()["notes"][0]["text"].startswith("Received")

    assert client.post(f"{url}/review", json={"agrees": True, "comment": "Looks fine"}, headers=supervisor["headers"]).status_code == 409
    r = client.post(f"{url}/conclusion", json=CONCLUSION, headers=investigator["headers"])
    assert r.status_code == 201 and r.json()["conclusion"]["level"] == "strong support"

    # The person who concluded can't review their own conclusion.
    assert client.post(f"{url}/review", json={"agrees": True, "comment": "fine"}, headers=investigator["headers"]).status_code == 403
    r = client.post(f"{url}/review", json={"agrees": True, "comment": "Method and wording checked."}, headers=supervisor["headers"])
    assert r.status_code == 201 and r.json()["review"]["agrees"] is True

    # A new conclusion needs a new review.
    r = client.post(f"{url}/conclusion", json=CONCLUSION | {"level": "moderate"}, headers=investigator["headers"])
    assert r.json()["review"] is None

    pdf = client.post(f"{url}/examination-report", headers=supervisor["headers"])
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    check = client.post("/public/verify", files={"file": ("e.pdf", pdf.content)}).json()
    assert check["found"] is True

    entries = client.get(f"/cases/{case_id}/custody", headers=investigator["headers"]).json()["entries"]
    exam = [e["action"] for e in entries if e["evidence_id"] == item and e["action"] in ("NOTED", "CONCLUDED", "REVIEWED", "EXPORTED")]
    assert exam == ["NOTED", "CONCLUDED", "REVIEWED", "CONCLUDED", "EXPORTED"]
    assert client.post(f"/cases/{case_id}/verify", headers=investigator["headers"]).json()["ok"] is True


def test_conclusion_needs_reasoning_and_limits(client, investigator, item):
    bad = CONCLUSION | {"limitations": ""}
    assert client.post(f"/evidence/{item}/conclusion", json=bad, headers=investigator["headers"]).status_code == 422
    assert client.post(f"/evidence/{item}/conclusion", json=CONCLUSION | {"level": "proven"}, headers=investigator["headers"]).status_code == 422


def test_report_needs_analysis(client, investigator, phone, case_id, original):
    ev = phone.upload(case_id, original).json()
    assert client.post(f"/evidence/{ev['id']}/examination-report", headers=investigator["headers"]).status_code == 409


def test_comparisons_are_part_of_the_examination(client, investigator, phone, case_id):
    from PIL import Image

    from tests.test_forensics import PHOTOS
    original = PHOTOS.joinpath("D10_I_nat_0090.jpg").read_bytes()
    ev = phone.upload(case_id, original).json()
    assert client.post(f"/evidence/{ev['id']}/analyze", headers=investigator["headers"]).status_code == 200
    edited = Image.open(io.BytesIO(original)).convert("RGB")
    edited.paste(Image.open(PHOTOS / "D22_I_nat_0082.jpg").convert("RGB").crop((300, 300, 460, 460)), (600, 150))
    r = client.post(f"/evidence/{ev['id']}/compare", files={"file": ("tip.jpg", jpeg(edited, 85), "image/jpeg")}, headers=investigator["headers"])
    assert r.status_code == 200 and r.json()["regions"]

    state = client.get(f"/evidence/{ev['id']}/examination", headers=investigator["headers"]).json()
    c = state["comparisons"][0]
    assert c["filename"] == "tip.jpg" and c["regions"] > 0 and c["overlay"].startswith("compare-")
    pdf = client.post(f"/evidence/{ev['id']}/examination-report", headers=investigator["headers"])
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
