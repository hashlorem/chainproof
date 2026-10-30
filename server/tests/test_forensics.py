import io
from pathlib import Path

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


PHOTOS = Path(__file__).parent / "fixtures" / "vision"  # real phone photos, CC BY-SA 4.0 (see ATTRIBUTION.md)


@pytest.fixture(scope="module")
def photo() -> Image.Image:
    return Image.open(PHOTOS / "D10_I_nat_0090.jpg").convert("RGB")


def test_clean_image_has_no_clone(original):
    assert copymove.analyze(open_rgb(original))["regions"] == []


def test_clean_photo_has_no_clone(photo):
    assert copymove.analyze(open_rgb(jpeg(photo)))["regions"] == []


def test_cloned_area_is_found(photo):
    img = photo.copy()
    img.paste(img.crop((100, 450, 300, 650)), (650, 120))
    result = copymove.analyze(open_rgb(jpeg(img)))
    assert result["regions"], result["pairs"]
    boxes = [result["regions"][0]["copy_box"], result["regions"][0]["source_box"]]
    assert any(640 <= x0 and x1 <= 860 and 110 <= y0 and y1 <= 330 for x0, y0, x1, y1 in boxes)  # pasted at 650..850, 120..320
    assert result["overlay_png"]


def test_large_object_duplicated_next_to_itself_is_found(photo):
    # The bouquet case: a big region copied by less than its own size, so source and copy overlap.
    img = photo.copy()
    img.paste(img.crop((80, 380, 480, 700)), (230, 300))
    result = copymove.analyze(open_rgb(jpeg(img)))
    assert result["regions"] and result["findings"][0]["severity"] == "high", result["pairs"]


@pytest.mark.parametrize("scale,angle", [(0.6, 0), (1.4, 0), (1.0, 20), (0.8, -15)])
def test_resized_or_rotated_clone_is_found(photo, scale, angle):
    img = photo.copy()
    patch = img.crop((100, 450, 300, 650))
    patch = patch.resize((int(200 * scale), int(200 * scale)), Image.LANCZOS).rotate(angle, resample=Image.BICUBIC)
    img.paste(patch, (620, 100))
    result = copymove.analyze(open_rgb(jpeg(img)))
    assert result["regions"], result["pairs"]
    region = result["regions"][0]
    assert abs(region["scale"] - scale) < 0.1 or abs(1 / region["scale"] - scale) < 0.1, region
    assert abs(abs(region["angle"]) - abs(angle)) < 5, region


def test_periodic_pattern_is_not_a_clone():
    # Stair steps, windows, railings: the same shape repeats at a fixed spacing, so it also matches at twice it.
    img = scene(5)
    d = ImageDraw.Draw(img)
    for i in range(6):
        x = 40 + i * 95
        d.rectangle([x, 120, x + 60, 360], outline=(20, 20, 20), width=4)
        d.line([x, 240, x + 60, 240], fill=(20, 20, 20), width=3)
        d.ellipse([x + 22, 160, x + 38, 176], fill=(200, 30, 30))
    assert copymove.analyze(open_rgb(jpeg(img)))["regions"] == []


def test_repeated_text_is_not_a_clone():
    # Printed text repeats the same letters along one line. Those matches share a shift but cover no area.
    img = scene(4)
    ImageDraw.Draw(img).text((20, 300), "THE WAREHOUSE DOOR WAS FORCED AT NIGHT " * 2, fill=(10, 10, 10))
    assert copymove.analyze(open_rgb(jpeg(img)))["regions"] == []


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


def test_verdicts(original, photo):
    assert run_all(original, "image/jpeg", provenance_verified=True)["verdict"] == "verified_capture"
    img = photo.copy()
    img.paste(img.crop((100, 450, 300, 650)), (650, 120))
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
