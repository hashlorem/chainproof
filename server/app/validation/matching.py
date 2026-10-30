"""
Validation of "is this a copy of our evidence?": every derived image is matched against its own original (should
match), originals are matched against each other (should not), and the difference map is checked for false changes
on innocent copies and for finding the edited area on manipulated ones.
"""

import itertools
import re
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps

from app.forensics import similarity as sim
from app.forensics.common import open_rgb
from app.validation.dataset import NEGATIVE, POSITIVE, Item
from app.validation.metrics import rate


def original_of(item: Item | dict) -> str | None:
    source = item.source if isinstance(item, Item) else item["source"]
    if m := re.match(r"generated v\d+ from (\S+)", source):
        return m.group(1)
    if m := re.match(r"VISION (D\d\d) (natWA|natFBL)_(\d{4})", source):
        return f"vision/nat/{m.group(1)}_I_nat_{m.group(3)}.jpg"
    return None


def _edited_area(original: Path, params: dict, size: tuple[int, int]) -> np.ndarray:
    """Edited boxes in the coordinates of the difference map (the original, upright, at the compare size)."""
    raw = Image.open(original)
    mask = Image.new("L", raw.size, 0)
    for key in ("source_box", "dest_box"):
        if key in params:
            ImageDraw.Draw(mask).rectangle(params[key], fill=255)
    if raw.getexif().get(0x0112, 1) != 1:
        mask.info["exif"] = raw.info["exif"]
        mask = ImageOps.exif_transpose(mask)
    return np.asarray(mask.resize(size)) > 0


def _pair(job) -> dict:
    root, item = job
    original_path = Path(root) / original_of(item)
    original, copy = open_rgb(original_path.read_bytes()), open_rgb((Path(root) / item["file"]).read_bytes())
    result = sim.compare(original, copy)
    found = False
    if "dest_box" in item["params"]:
        mask = _edited_area(original_path, item["params"], tuple(result["size"]))
        found = any(mask[y0:y1 + 1, x0:x1 + 1].mean() >= 0.3 for x0, y0, x1, y1 in result["regions"])
    device = re.search(r"\b(D\d\d)_", item["file"])
    d = sim.closest(sim.phashes(copy), sim.phash(original))
    traced = d <= sim.MATCH_DISTANCE or (d <= sim.VERIFY_DISTANCE and sim.same_scene(original, copy) >= sim.SAME_SCENE)
    return {"file": item["file"], "truth": item["truth"], "device": device.group(1) if device else None,
            "distance": d, "traced": traced, "changed": bool(result["regions"]), "found": found}


def _hashes(path: str) -> list[str]:
    return sim.phashes(open_rgb(Path(path).read_bytes()))


def _same_scene(pair: tuple[str, str]) -> bool:
    a, b = (open_rgb(Path(p).read_bytes()) for p in pair)
    return sim.same_scene(a, b) >= sim.SAME_SCENE


def run(root: Path, items: list[Item], workers: int = 8) -> dict:
    derived = [{"file": i.file, "truth": i.truth, "params": i.params, "source": i.source} for i in items if original_of(i)]
    originals = [str(root / i.file) for i in items if i.truth == "original"]
    jobs = [(str(root), d) for d in derived]
    if workers <= 1:
        rows, hashes = list(map(_pair, jobs)), list(map(_hashes, originals))
    else:
        with ProcessPoolExecutor(workers) as pool:
            rows = list(pool.map(_pair, jobs, chunksize=4))
            hashes = list(pool.map(_hashes, originals))
    # Unrelated photos: each original, in any rotation, against every other original as stored. A pair counts as a
    # false match if it is within MATCH_DISTANCE, or within VERIFY_DISTANCE and passes the scene-geometry check.
    pairs = list(itertools.permutations(range(len(hashes)), 2))
    distances = [sim.closest(hashes[j], hashes[i][0]) for i, j in pairs]
    borderline = [(originals[i], originals[j]) for (i, j), d in zip(pairs, distances) if sim.MATCH_DISTANCE < d <= sim.VERIFY_DISTANCE]
    if workers <= 1:
        confirmed = sum(map(_same_scene, borderline))
    else:
        with ProcessPoolExecutor(workers) as pool:
            confirmed = sum(pool.map(_same_scene, borderline, chunksize=8))
    return evaluate(rows, distances, confirmed, len(borderline))


def evaluate(rows: list[dict], unrelated: list[int], borderline_confirmed: int = 0, borderline: int = 0) -> dict:
    t = sim.MATCH_DISTANCE
    holdout = [r for r in rows if r["device"] and int(r["device"][1:]) % 2 == 0]
    benign = [r for r in rows if r["truth"] in NEGATIVE]
    edits = [r for r in rows if r["truth"] in POSITIVE]
    return {
        "threshold": t,
        "copies": rate(sum(r["traced"] for r in rows), len(rows)),
        "copies_hash_only": rate(sum(r["distance"] <= t for r in rows), len(rows)),
        "copies_holdout": rate(sum(r["traced"] for r in holdout), len(holdout)),
        "copies_by_type": {k: rate(sum(r["traced"] for r in v), len(v))
                           for k in (*NEGATIVE, *POSITIVE) if (v := [r for r in rows if r["truth"] == k])},
        "unrelated": rate(sum(d <= t for d in unrelated) + borderline_confirmed, len(unrelated)),
        "borderline_checked": borderline,
        "closest_unrelated": min(unrelated) if unrelated else None,
        "false_change": rate(sum(r["changed"] for r in benign), len(benign)),
        "false_change_by_type": {k: rate(sum(r["changed"] for r in v), len(v))
                                 for k in NEGATIVE if (v := [r for r in benign if r["truth"] == k])},
        "found": rate(sum(r["found"] for r in edits), len(edits)),
        "found_by_type": {k: rate(sum(r["found"] for r in v), len(v)) for k in POSITIVE if (v := [r for r in edits if r["truth"] == k])},
    }
