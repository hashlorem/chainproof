"""Runs every check over a test set and writes a validation report anyone can reproduce."""

import json
import platform
import re
import subprocess
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps

from app.forensics.common import open_rgb
from app.forensics.verdict import run_all
from app.validation import generate, matching
from app.validation.dataset import NEGATIVE, POSITIVE, Item, load, manifest_digest
from app.validation.metrics import CHECKS, evaluate, evaluate_history, rate

RATES_FILE = Path(__file__).resolve().parent.parent / "forensics" / "validated_rates.json"
MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def _edited_area(path: Path, params: dict) -> np.ndarray | None:
    """The edited boxes as a mask in the same coordinates the checks use (rotated per EXIF, capped at 2048 px)."""
    boxes = [params[k] for k in ("source_box", "dest_box") if k in params]
    if not boxes:
        return None
    raw = Image.open(path)
    mask = Image.new("L", raw.size, 0)
    for b in boxes:
        ImageDraw.Draw(mask).rectangle(b, fill=255)
    if raw.getexif().get(0x0112, 1) != 1:
        mask.info["exif"] = raw.info["exif"]
        mask = ImageOps.exif_transpose(mask)
    return np.asarray(mask.resize(open_rgb(path.read_bytes()).size)) > 0


def _localized(report: dict, mask: np.ndarray | None) -> bool:
    """A clone hit counts only if a flagged box lies mostly inside the edited area."""
    if mask is None:
        return False
    for region in report["checks"]["copy_move"]["regions"]:
        for x0, y0, x1, y1 in (region["source_box"], region["copy_box"]):
            box = mask[max(y0, 0):y1 + 1, max(x0, 0):x1 + 1]
            if box.size and box.mean() >= 0.3:
                return True
    return False


def _analyse(job) -> dict:
    root, item = job
    path = Path(root) / item["file"]
    t = time.perf_counter()
    report = run_all(path.read_bytes(), MIME.get(path.suffix.lower(), "image/jpeg"))
    fired = {name: test(report) for name, test in CHECKS.items()}
    # Benign images have no edited area: any clone hit is a false alarm.
    fired["clone_localized"] = fired["clone"] if item["truth"] in NEGATIVE else _localized(report, _edited_area(path, item["params"]))
    device = re.search(r"\b(D\d\d)_", item["file"])
    return {
        "file": item["file"], "sha256": item["sha256"], "truth": item["truth"], "post": item["post"],
        "device": device.group(1) if device else None,
        "verdict": report["verdict"], "score": report["score"],
        "source": report["checks"]["structure"].get("source"), "exif_kept": bool(item["params"].get("exif_kept")),
        "findings": [f"{f['check']}: {f['title']}" for f in report["findings"]],
        "fired": fired,
        "seconds": round(time.perf_counter() - t, 2),
    }


def _environment(root: Path) -> dict:
    def git(*args):
        try:
            return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout.strip()
        except (OSError, subprocess.CalledProcessError):
            return "unknown"

    return {
        "run_at_utc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "git_commit": git("rev-parse", "HEAD"),
        "git_dirty": bool(git("status", "--porcelain", "--", "server/app")),
        "test_set_manifest_sha256": manifest_digest(root),
        "generator_version": generate.GENERATOR_VERSION,
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "packages": {p: version(p) for p in ("numpy", "opencv-python-headless", "pillow", "c2pa-python")},
    }


def run(root: Path, out: Path | None, workers: int = 8) -> dict:
    items: list[Item] = load(root)
    jobs = [(str(root), {"file": i.file, "sha256": i.sha256, "truth": i.truth, "post": i.post, "params": i.params}) for i in items]
    if workers <= 1:
        rows = list(map(_analyse, jobs))
    else:
        with ProcessPoolExecutor(workers) as pool:
            rows = list(pool.map(_analyse, jobs, chunksize=4))
    # Detector thresholds were tuned on odd-numbered VISION phones; even-numbered phones are the held-out check.
    holdout = [r for r in rows if r["device"] and int(r["device"][1:]) % 2 == 0]
    result = {"environment": _environment(root), "counts": _counts(items), "metrics": evaluate(rows), "history": evaluate_history(rows),
              "matching": matching.run(root, items, workers),
              "metrics_holdout": evaluate(holdout) if holdout else None, "items": rows}
    if out is not None:  # None: measure only (tests), don't publish
        out.mkdir(parents=True, exist_ok=True)
        (out / "results.json").write_text(json.dumps(result, indent=1))
        (out / "VALIDATION.md").write_text(markdown(result))
        RATES_FILE.write_text(json.dumps(rates_for_app(result), indent=1) + "\n")
    return result


def _counts(items: list[Item]) -> dict:
    counts: dict[str, int] = {}
    for i in items:
        counts[i.truth] = counts.get(i.truth, 0) + 1
    return counts


COPY_MOVE_KINDS = ("clone_same", "clone_nearby", "clone_scaled", "clone_rotated", "removal")


def rates_for_app(result: dict) -> dict:
    """The small summary the app shows next to each finding."""
    m = result["metrics"]
    env = result["environment"]
    checks = {name: {"label": v["label"], "false_alarm": v["false_alarm"], "detection": v["detection"],
                     "detection_by_type": v["detection_by_type"]} for name, v in m.items()}
    # The clone check is judged on what it is for (copied regions, not splices) and only when it points at the edit.
    loc = m["clone_localized"]["detection_by_type"]
    k, n = sum(loc[t]["k"] for t in COPY_MOVE_KINDS if t in loc), sum(loc[t]["n"] for t in COPY_MOVE_KINDS if t in loc)
    checks["clone"]["detection"] = rate(k, n)
    checks["clone"]["detection_note"] = "copied regions, flagged in the right place"
    return {"validated_at": env["run_at_utc"], "commit": env["git_commit"][:12], "test_set": env["test_set_manifest_sha256"][:16],
            "checks": checks, "history": result.get("history", {}),
            "matching": {k: result["matching"][k] for k in ("copies", "unrelated")} if result.get("matching") else None,
            "difference": {k: result["matching"][k] for k in ("false_change", "found")} if result.get("matching") else None}


def _pct(r: dict) -> str:
    if not r or r["n"] == 0:
        return "–"
    return f"{r['rate'] * 100:.1f}% ({r['k']}/{r['n']}; 95% CI {r['ci95'][0] * 100:.1f}–{r['ci95'][1] * 100:.1f}%)"


def markdown(result: dict) -> str:
    env, m, counts = result["environment"], result["metrics"], result["counts"]
    neg_n = sum(counts.get(t, 0) for t in NEGATIVE)
    pos_n = sum(counts.get(t, 0) for t in POSITIVE)
    lines = [
        "# ChainProof forensic checks: validation report",
        "",
        "Each check was run on a labelled test set of benign and manipulated images. **False alarm** is how often the "
        "check fires on a benign image; **detection** is how often it fires on a manipulated one. Every rate has its "
        "sample size and a 95% Wilson confidence interval. This follows the approach of NIST CFTT (tool testing against "
        "known samples) and ISO/IEC 27041 (assuring a method is fit for purpose).",
        "",
        f"- Run: {env['run_at_utc']} · commit `{env['git_commit'][:12]}`{' (uncommitted changes in server/app)' if env['git_dirty'] else ''}",
        f"- Test set: {neg_n} benign + {pos_n} manipulated images · manifest SHA-256 `{env['test_set_manifest_sha256']}`",
        f"- Environment: Python {env['python']} · {env['platform']} · "
        + ", ".join(f"{k} {v}" for k, v in env["packages"].items()),
        "",
        "## Summary",
        "",
        "| Check | False alarm (benign images) | Detection (manipulated images) |",
        "|---|---|---|",
    ]
    for v in m.values():
        lines.append(f"| {v['label']} | {_pct(v['false_alarm'])} | {_pct(v['detection'])} |")
    if result.get("metrics_holdout"):
        lines += ["", "### Held-out phones only", "",
                  "The copy-move thresholds were chosen using the odd-numbered VISION phones (D01, D03, …). These rows use only "
                  "the even-numbered phones, which played no part in choosing them, so they are the fairest estimate.", "",
                  "| Check | False alarm | Detection |", "|---|---|---|"]
        for v in result["metrics_holdout"].values():
            lines.append(f"| {v['label']} | {_pct(v['false_alarm'])} | {_pct(v['detection'])} |")

    lines += ["", "## False alarms by kind of benign image", "", "| Check | " + " | ".join(t for t in NEGATIVE if t in counts) + " |",
              "|---|" + "---|" * sum(t in counts for t in NEGATIVE)]
    for v in m.values():
        lines.append(f"| {v['label']} | " + " | ".join(_pct(v["false_alarm_by_type"].get(t)) for t in NEGATIVE if t in counts) + " |")

    lines += ["", "## Detection by kind of manipulation", "", "| Check | " + " | ".join(t for t in POSITIVE if t in counts) + " |",
              "|---|" + "---|" * sum(t in counts for t in POSITIVE)]
    for v in m.values():
        lines.append(f"| {v['label']} | " + " | ".join(_pct(v["detection_by_type"].get(t)) for t in POSITIVE if t in counts) + " |")

    if result.get("history"):
        lines += ["", "## File history check", "",
                  "What the file's structure says about where it has been (camera, Facebook, WhatsApp, re-saved). Each label is "
                  "judged on the images that truly are that kind (recognised) and on every other image (wrongly given). The rules "
                  "were written after looking at all VISION classes, so these rates are not from held-out data.", "",
                  "| Label | Recognised | Wrongly given to other images |", "|---|---|---|"]
        for v in result["history"].values():
            lines.append(f"| {v['label']} | {_pct(v['recognised'])} | {_pct(v['wrongly_given'])} |")
        lines += ["", "\"Looks like a Facebook Messenger copy\" rests on five photos from one sender and is not validated here."]

    if mt := result.get("matching"):
        lines += ["", "## Copies of evidence: matching and difference map", "",
                  f"Each derived image (WhatsApp, Facebook, re-saved, resized, edited) is matched against its own original, and every "
                  f"original against every other one. A match is a perceptual hash at most {mt['threshold']} of 64 bits apart (in any "
                  "rotation), or up to 24 bits apart when both photos also share one scene geometry (40+ matching points on one "
                  "homography). The difference map then lines each copy up with its original and outlines what changed.", "",
                  "| Measure | Result |", "|---|---|",
                  f"| Copies traced back to their original | {_pct(mt['copies'])} (hash alone: {_pct(mt['copies_hash_only'])}) |",
                  f"| Same, held-out phones only | {_pct(mt['copies_holdout'])} |",
                  f"| Unrelated photo pairs wrongly matched | {_pct(mt['unrelated'])}; closest unrelated pair {mt['closest_unrelated']} bits "
                  f"apart; {mt['borderline_checked']} look-alike pairs went through the geometry check |",
                  f"| Difference map reports changes on innocent copies | {_pct(mt['false_change'])} |",
                  f"| Difference map outlines the edited area | {_pct(mt['found'])} |", "",
                  "| Edit | Copy matched | Edit outlined |", "|---|---|---|"]
        for k, v in mt["found_by_type"].items():
            lines.append(f"| {k} | {_pct(mt['copies_by_type'].get(k))} | {_pct(v)} |")
        lines += ["", "The difference map needs the original. That is why it finds splices that copy-move detection cannot: "
                  "it compares against what the camera recorded instead of searching one image for internal copies."]

    posts = sorted({p for v in m.values() for p in v["detection_by_post"]})
    lines += ["", "## Detection by processing after the edit", "", "| Check | " + " | ".join(posts) + " |", "|---|" + "---|" * len(posts)]
    for v in m.values():
        lines.append(f"| {v['label']} | " + " | ".join(_pct(v["detection_by_post"].get(p)) for p in posts) + " |")

    lines += [
        "",
        "## Test set",
        "",
        "| Kind | Images | What it is |",
        "|---|---|---|",
        *[f"| {t} | {counts[t]} | {DESCRIBE[t]} |" for t in (*NEGATIVE, *POSITIVE) if t in counts],
        "",
        "Camera photos come from the VISION dataset (Shullani et al., *EURASIP Journal on Information Security*, 2017; "
        "CC BY-SA 4.0): natural scenes from 35 phones of 11 brands, with the same photos as shared through WhatsApp "
        "and Facebook. Manipulations are generated from those originals by `app/validation/generate.py` "
        f"(version {env['generator_version']}), seeded from each original's hash so the set can be rebuilt exactly.",
        "",
        "## Limitations",
        "",
        "- Manipulations are synthetic: irregular feathered regions on textured areas, like a lasso selection. A skilled "
        "forger (matching lighting, retouching edges, adding noise) will be harder to detect than these numbers suggest.",
        "- Benign images are phone photos of natural scenes. Other content (screenshots, scans, artwork, product shelves "
        "with identical items) can behave differently. Identical real objects are a known clone-detector false alarm.",
        "- The copy-move thresholds were tuned on the odd-numbered phones (see the held-out table), except the rule for "
        "overlapping source and copy (at least 60 matches), which was set from the largest overlapping false alarm on all "
        "benign images (24 matches) after a real overlapping forgery was missed. Its false-alarm rate is therefore not independent.",
        "- The matching thresholds (10 bits; 24 bits with 40 scene points) were chosen after looking at all phones, so the "
        "held-out matching row is not an independent check. The file history rules were also written after looking at all classes.",
        "- Copy-move detection is not designed to find splices (a region from a different photo); its splice row shows that.",
        "- \"Flagged in the edited area\" counts a hit only if a flagged box lies at least 30% inside the edited region. "
        "Plain \"detection\" also counts hits elsewhere in the photo, which are lucky rather than correct.",
        "- AI-generated images are not in this test set. The C2PA check only reads credentials that the generator embedded; "
        "it cannot detect AI images whose credentials were removed.",
        "- A rate measured on this set is evidence about these conditions, not a guarantee for a new image.",
        "",
        "## Reproduce",
        "",
        "```bash",
        "cd server",
        "uv run python -m scripts.validate fetch-vision --root validation_data",
        "uv run python -m scripts.validate generate --root validation_data",
        "uv run python -m scripts.validate run --root validation_data --out ../docs/validation",
        "```",
        "",
    ]
    return "\n".join(lines)


DESCRIBE = {
    "original": "Camera original, untouched",
    "whatsapp": "The same photo after sending through WhatsApp",
    "facebook": "The same photo after uploading to Facebook (low quality)",
    "recompressed": "Camera original re-saved as JPEG quality 85",
    "resized": "Camera original resized to 50% and re-saved",
    "clone_same": "A region copied elsewhere in the same photo at the same size",
    "clone_nearby": "A region duplicated right next to itself, overlapping the original (shifted 40–90% of its size)",
    "clone_scaled": "A region copied and resized (55–80% or 120–150%)",
    "clone_rotated": "A region copied and rotated 10–30°",
    "removal": "An object covered with a patch from right next to it (clone stamp)",
    "splice": "A region pasted in from a different photo taken by a different phone",
}
