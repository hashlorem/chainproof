import io

from PIL import Image

from app.forensics import similarity as sim
from app.forensics.common import open_rgb
from tests.test_forensics import PHOTOS, jpeg


def photo(name="D10_I_nat_0090.jpg") -> Image.Image:
    return Image.open(PHOTOS / name).convert("RGB")


def test_recompressed_resized_and_rotated_copies_match():
    original = photo()
    h = sim.phash(original)
    small = original.resize((640, 480), Image.LANCZOS)
    for copy in (open_rgb(jpeg(original, 60)), open_rgb(jpeg(small, 75)), small.transpose(Image.Transpose.ROTATE_90)):
        assert sim.closest(sim.phashes(copy), h) <= sim.MATCH_DISTANCE


def test_different_photos_do_not_match():
    names = sorted(p.name for p in PHOTOS.glob("*.jpg"))
    hashes = [sim.phash(photo(n)) for n in names]
    for i, a in enumerate(names):
        for j, b in enumerate(names):
            if i != j:
                assert sim.closest(sim.phashes(photo(a)), hashes[j]) > sim.MATCH_DISTANCE, (a, b)


def test_difference_map_quiet_on_innocent_copy():
    original = photo()
    copy = open_rgb(jpeg(original.resize((800, 600), Image.LANCZOS), 70))
    assert sim.compare(original, copy)["regions"] == []


def test_difference_map_outlines_a_splice():
    original, donor = photo(), photo("D22_I_nat_0082.jpg")
    edited = original.copy()
    edited.paste(donor.crop((300, 300, 460, 460)), (600, 150))  # 160 px from another phone's photo
    result = sim.compare(original, open_rgb(jpeg(edited, 85)))
    assert result["findings"][0]["severity"] == "high"
    x0, y0, x1, y1 = result["regions"][0]
    assert x0 < 760 and x1 > 600 and y0 < 310 and y1 > 150  # overlaps the pasted area (work size = 1024 px, same as the photo)


def test_match_and_compare_endpoints(client, investigator, phone, case_id):
    original = PHOTOS.joinpath("D10_I_nat_0090.jpg").read_bytes()
    ev = phone.upload(case_id, original).json()
    copy = jpeg(Image.open(io.BytesIO(original)).convert("RGB").resize((700, 525)), 60)
    r = client.post("/forensics/match", files={"file": ("copy.jpg", copy, "image/jpeg")}, headers=investigator["headers"])
    assert r.status_code == 200, r.text
    hit = next(m for m in r.json()["matches"] if m["evidence_id"] == ev["id"])
    assert hit["identical"] is False and hit["distance"] <= sim.MATCH_DISTANCE

    r = client.post(f"/evidence/{ev['id']}/compare", files={"file": ("copy.jpg", copy, "image/jpeg")}, headers=investigator["headers"])
    assert r.status_code == 200 and r.json()["regions"] == [] and r.json()["overlay_png"]
    entries = client.get(f"/cases/{case_id}/custody", headers=investigator["headers"]).json()["entries"]
    assert entries[-1]["action"] == "COMPARED" and entries[-1]["details"]["distance"] == r.json()["distance"]


def test_compared_copy_is_kept_as_an_exhibit(client, investigator, phone, case_id):
    """Without the questioned file nobody could repeat the comparison, so it is kept, re-hashed and its download logged."""
    import hashlib

    from app import storage

    original = PHOTOS.joinpath("D10_I_nat_0090.jpg").read_bytes()
    ev = phone.upload(case_id, original).json()["id"]
    copy = jpeg(Image.open(io.BytesIO(original)).convert("RGB").resize((640, 480)), 70)
    sha = hashlib.sha256(copy).hexdigest()
    client.post(f"/evidence/{ev}/compare", files={"file": ("copy.jpg", copy, "image/jpeg")}, headers=investigator["headers"])
    assert client.get(f"/evidence/{ev}/examination", headers=investigator["headers"]).json()["comparisons"][-1]["kept"]

    r = client.get(f"/evidence/{ev}/compared/{sha}", headers=investigator["headers"])
    assert r.status_code == 200 and r.content == copy and r.headers["x-content-sha256"] == sha
    last = client.get(f"/cases/{case_id}/custody", headers=investigator["headers"]).json()["entries"][-1]
    assert last["action"] == "DOWNLOADED" and last["details"] == {"compared_copy": sha}

    check = client.post(f"/cases/{case_id}/verify", headers=investigator["headers"]).json()
    assert next(i for i in check["evidence"] if i["evidence_id"] == ev)["checks"]["kept_copies"]["ok"] is True
    path = storage._path(sha)  # someone with access to the server swaps the kept file
    path.chmod(0o644)
    path.write_bytes(copy + b"x")
    assert client.get(f"/evidence/{ev}/compared/{sha}", headers=investigator["headers"]).status_code == 409
    check = client.post(f"/cases/{case_id}/verify", headers=investigator["headers"]).json()
    assert check["ok"] is False
    assert next(i for i in check["evidence"] if i["evidence_id"] == ev)["checks"]["kept_copies"]["ok"] is False
    assert client.get(f"/evidence/{ev}/compared/{'0' * 64}", headers=investigator["headers"]).status_code == 404


def test_same_scene_confirms_a_heavily_edited_copy_but_not_another_photo():
    original = photo()
    edited = original.copy()
    edited.paste(original.crop((0, 0, 512, 384)).resize((400, 300)), (520, 380))  # a large chunk duplicated, like the bouquet
    assert sim.same_scene(original, open_rgb(jpeg(edited, 80))) >= sim.SAME_SCENE
    for other in ("D04_I_nat_0114.jpg", "D22_I_nat_0082.jpg", "D34_I_nat_0103.jpg"):
        assert sim.same_scene(original, photo(other)) < sim.SAME_SCENE, other
