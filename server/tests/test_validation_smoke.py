"""
Regression gate for the validation harness: a small, fast version of docs/validation run on six real photos.
It fails if a change to the checks makes them miss clones they used to find, or start firing on untouched photos.
The full measurement is `uv run python -m scripts.validate run` (see docs/validation/VALIDATION.md).
"""

from pathlib import Path

import pytest

from app.validation import generate, run
from app.validation.dataset import Item, append, sha256_file

PHOTOS = Path(__file__).parent / "fixtures" / "vision"
KINDS = ("clone_same", "clone_nearby", "clone_scaled", "clone_rotated", "removal", "splice", "recompressed", "resized")


@pytest.fixture(scope="module")
def result(tmp_path_factory):
    root = tmp_path_factory.mktemp("testset")
    originals = []
    for p in sorted(PHOTOS.glob("*.jpg")):
        (root / "orig").mkdir(exist_ok=True)
        (root / "orig" / p.name).write_bytes(p.read_bytes())
        originals.append(Item(file=f"orig/{p.name}", sha256=sha256_file(p), truth="original", source=p.name, licence="CC BY-SA 4.0"))
    append(root, originals)
    generate.generate(root, originals, KINDS, workers=1)
    return run.run(root, None, workers=1)


def test_test_set_is_complete(result):
    assert result["counts"] == {"original": 6, **{k: 6 for k in KINDS}}


def test_overlapping_clones_are_measured(result):
    assert result["metrics"]["clone"]["detection_by_type"]["clone_nearby"]["n"] == 6


def test_clone_detector_stays_quiet_on_benign_photos(result):
    fa = result["metrics"]["clone"]["false_alarm"]
    assert fa["k"] <= 1, fa  # 18 benign images: at most one false alarm


def test_clone_detector_still_finds_clones(result):
    # Floors equal what v2 measured on these 1024 px photos (fewer keypoints than full-size photos, so lower
    # than the full validation). Any drop below them is a regression.
    by_type = result["metrics"]["clone"]["detection_by_type"]
    assert by_type["clone_same"]["k"] >= 4, by_type
    assert by_type["clone_scaled"]["k"] + by_type["clone_rotated"]["k"] >= 8, by_type


def test_strong_verdicts_are_rare_on_benign_photos(result):
    assert result["metrics"]["verdict_strong"]["false_alarm"]["k"] == 0, result["metrics"]["verdict_strong"]


def test_copies_are_traced_and_unrelated_photos_are_not(result):
    m = result["matching"]
    assert m["unrelated"]["k"] == 0, m["unrelated"]
    assert m["copies"]["k"] >= 44, m["copies"]  # measured 46 of 48 on these photos


def test_difference_map_is_quiet_on_innocent_copies_and_finds_edits(result):
    m = result["matching"]
    assert m["false_change"]["k"] == 0, m["false_change_by_type"]
    assert m["found"]["k"] >= 25, m["found_by_type"]  # measured 27 of 36
