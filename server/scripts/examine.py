"""
Examine images on your own machine, without the server or a case.

    uv run python -m scripts.examine file photo.jpg --out exam/ [--examiner "Name"] [--source "Sent by …"]
    uv run python -m scripts.examine batch folder/ --out exam/

The input is hashed first, analysed only as a copy in a temporary folder, and hashed again at the end. If the
two hashes differ the run fails. Output per image: report.json, ela.png, copymove.png, examination.pdf.
"""

import argparse
import base64
import csv
import hashlib
import json
import mimetypes
import shutil
import subprocess
import sys
import tempfile
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path

from app.forensics.verdict import run_all, split_images
from app.reports.examination import build_examination

IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _method(examiner: str | None) -> dict:
    try:
        commit = subprocess.run(["git", "rev-parse", "--short=12", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        commit = "unknown"
    return {
        "tool": "ChainProof image examination (scripts/examine.py)",
        "commit": commit,
        "versions": f"Python {sys.version.split()[0]}, " + ", ".join(
            f"{p} {version(p)}" for p in ("numpy", "opencv-python-headless", "pillow", "c2pa-python")),
        "examined_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "examiner": examiner,
    }


def examine(path: Path, out: Path, examiner: str | None = None, source: str | None = None) -> dict:
    path = path.resolve()
    before = _sha256(path)
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp) / path.name
        shutil.copy2(path, work)
        if _sha256(work) != before:
            raise SystemExit(f"Working copy of {path} does not match the original. Stopping.")
        report, images = split_images(run_all(work.read_bytes(), mime))
        original_bytes = work.read_bytes()
    after = _sha256(path)
    if after != before:
        raise SystemExit(f"{path} changed during the examination ({before} → {after}). Results are not reliable.")

    out.mkdir(parents=True, exist_ok=True)
    pngs = {name: base64.b64decode(b64) for name, b64 in images.items()}
    for name, data in pngs.items():
        (out / f"{name}.png").write_bytes(data)
    subject = {"filename": path.name, "sha256": before, "sha256_after": after, "size": path.stat().st_size, "mime": mime,
               "source": source or f"Local file {path}", "acquired_at": datetime.fromtimestamp(path.stat().st_mtime, UTC).strftime(
                   "%Y-%m-%dT%H:%M:%SZ") + " (file modified time)"}
    method = _method(examiner)
    record = {"subject": subject, "method": method, "report": report}
    (out / "report.json").write_text(json.dumps(record, indent=1))
    pdf = build_examination(subject, report, {"original": original_bytes, **pngs}, method)
    (out / "examination.pdf").write_bytes(pdf)
    record["pdf_sha256"] = hashlib.sha256(pdf).hexdigest()
    return record


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("file", help="examine one image")
    f.add_argument("path", type=Path)
    b = sub.add_parser("batch", help="examine every image in a folder (not recursive)")
    b.add_argument("path", type=Path)
    for s in (f, b):
        s.add_argument("--out", type=Path, required=True)
        s.add_argument("--examiner")
        s.add_argument("--source", help="where the file came from, for the report")
    a = p.parse_args()

    if a.cmd == "file":
        r = examine(a.path, a.out, a.examiner, a.source)
        print(f"{r['subject']['filename']}: {r['report']['label']} (score {r['report']['score']})")
        for finding in r["report"]["findings"]:
            print(f"  [{finding['severity']}] {finding['title']}" + (f"  — {finding['validation']}" if finding.get("validation") else ""))
        print(f"SHA-256 {r['subject']['sha256']} (unchanged)\nReport: {a.out / 'examination.pdf'}")
        return

    files = sorted(x for x in a.path.iterdir() if x.suffix.lower() in IMAGE_TYPES)
    a.out.mkdir(parents=True, exist_ok=True)
    with open(a.out / "summary.csv", "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["file", "sha256", "verdict", "score", "findings"])
        for x in files:
            r = examine(x, a.out / x.stem, a.examiner, a.source)
            w.writerow([x.name, r["subject"]["sha256"], r["report"]["label"], r["report"]["score"],
                        "; ".join(f["title"] for f in r["report"]["findings"])])
            print(f"{x.name}: {r['report']['label']}")
    print(f"Summary: {a.out / 'summary.csv'}")


if __name__ == "__main__":
    main()
