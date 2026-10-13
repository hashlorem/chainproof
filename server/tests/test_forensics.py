import io

import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFilter

from app.forensics import copymove, ela, exif
from app.forensics.common import open_rgb
from app.forensics.verdict import run_all


def scene(seed=1, size=(640, 480)) -> Image.Image:
    """A photo-like test image: gradients, random shapes, blur and sensor noise."""
    rng = np.random.default_rng(seed)
    w, h = size
    x, y = np.meshgrid(np.linspace(0, 1, w), np.linspace(0, 1, h))
    base = np.stack([x * 180 + 40, y * 160 + 50, (1 - x) * 120 + 60], axis=2)
    img = Image.fromarray(base.astype(np.uint8))
    d = ImageDraw.Draw(img)
    for _ in range(120):
        x0, y0 = rng.integers(0, w), rng.integers(0, h)
        r = rng.integers(4, 40)
        d.ellipse([x0, y0, x0 + r, y0 + r * rng.uniform(0.5, 1.5)], fill=tuple(int(v) for v in rng.integers(0, 255, 3)))
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    noisy = np.asarray(img, dtype=np.int16) + rng.normal(0, 6, (h, w, 3))
    return Image.fromarray(np.clip(noisy, 0, 255).astype(np.uint8))


def jpeg(img: Image.Image, q=92, **kw) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=q, **kw)
    return buf.getvalue()


def png(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


@pytest.fixture(scope="module")
def original() -> bytes:
    return jpeg(scene())


def test_clean_image_has_no_clone(original):
    assert copymove.analyze(open_rgb(original))["regions"] == []


def test_cloned_area_is_found(original):
    img = open_rgb(original)
    img.paste(img.crop((60, 60, 200, 200)), (380, 250))
    result = copymove.analyze(open_rgb(jpeg(img)))
    assert result["regions"], result["pairs"]
    x0, y0, x1, y1 = result["regions"][0]["copy_box"]
    assert 370 <= x0 and x1 <= 530 and 240 <= y0 and y1 <= 400  # inside the pasted area (380..520, 250..390)
    assert result["overlay_png"]


def test_ela_flags_a_spliced_patch():
    # Background has been through JPEG at q=90 twice, so re-saving barely changes it.
    base = Image.open(io.BytesIO(jpeg(Image.open(io.BytesIO(jpeg(scene(2), 90))), 90))).convert("RGB")
    clean = ela.analyze(base)
    base.paste(scene(3).crop((0, 0, 120, 120)), (300, 200))  # fresh, never-compressed pixels
    spliced = ela.analyze(open_rgb(png(base)))
    assert spliced["outlier_ratio"] > clean["outlier_ratio"]
    assert spliced["findings"], spliced["outlier_ratio"]


def test_editing_software_in_exif():
    ex = Image.Exif()
    ex[0x0131] = "Adobe Photoshop 26.1"  # Software
    ex[0x010F] = "Canon"  # Make
    report = exif.analyze(jpeg(scene(), exif=ex.tobytes()))
    assert report["tags"]["Software"] == "Adobe Photoshop 26.1"
    assert any(f["title"] == "Edited with image software" for f in report["findings"])


def test_verdicts(original):
    assert run_all(original, "image/jpeg", provenance_verified=True)["verdict"] == "verified_capture"
    img = open_rgb(original)
    img.paste(img.crop((60, 60, 200, 200)), (380, 250))
    assert run_all(jpeg(img), "image/jpeg")["verdict"] == "likely_manipulated"


def test_analyze_endpoints(client, investigator, phone, case_id, original):
    ev = phone.upload(case_id, original).json()
    r = client.post(f"/evidence/{ev['id']}/analyze", headers=investigator["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["verdict"] == "verified_capture"
    assert client.get(f"/evidence/{ev['id']}/forensics/ela.png", headers=investigator["headers"]).status_code == 200
    custody = client.get(f"/cases/{case_id}/custody", headers=investigator["headers"]).json()["entries"]
    assert custody[-1]["action"] == "ANALYZED"

    r = client.post("/forensics/analyze", files={"file": ("x.jpg", original, "image/jpeg")}, headers=investigator["headers"])
    assert r.status_code == 200 and r.json()["checks"]["ela"]["heatmap_png"]
    r = client.post("/forensics/analyze", files={"file": ("x.txt", b"hi", "text/plain")}, headers=investigator["headers"])
    assert r.status_code == 415
