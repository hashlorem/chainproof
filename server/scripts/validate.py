"""
Tool validation (NIST CFTT style): build a labelled test set, run every check on it, publish the error rates.

    uv run python -m scripts.validate fetch-vision --root validation_data     # ~400 MB of real phone photos
    uv run python -m scripts.validate generate --root validation_data         # forgeries + benign re-saves
    uv run python -m scripts.validate run --root validation_data --out ../docs/validation
"""

import argparse
from pathlib import Path

from app.validation import generate, run, vision
from app.validation.dataset import load


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch-vision", help="download camera originals and their WhatsApp/Facebook versions")
    f.add_argument("--per-device", type=int, default=3)
    g = sub.add_parser("generate", help="make manipulated and benign re-saved images from the camera originals")
    g.add_argument("--kinds", default="clone_same,clone_nearby,clone_scaled,clone_rotated,removal,splice,doodle,recompressed,resized")
    r = sub.add_parser("run", help="run every check on the test set and write the validation report")
    r.add_argument("--out", type=Path, default=Path("../docs/validation"))
    for s in (f, g, r):
        s.add_argument("--root", type=Path, default=Path("validation_data"))
        s.add_argument("--workers", type=int, default=8)
    a = p.parse_args()

    if a.cmd == "fetch-vision":
        items = vision.fetch(a.root, a.per_device, a.workers)
        print(f"{len(items)} images in {a.root}")
    elif a.cmd == "generate":
        items = load(a.root)
        kinds = tuple(a.kinds.split(","))
        if present := sorted({i.truth for i in items if i.file.startswith("generated/")} & set(kinds)):
            raise SystemExit(f"{a.root} already has generated {', '.join(present)}. Pass only new kinds with --kinds.")
        made = generate.generate(a.root, [i for i in items if i.truth == "original"], kinds, a.workers)
        print(f"{len(made)} generated images in {a.root}/generated")
    else:
        result = run.run(a.root, a.out, a.workers)
        for v in result["metrics"].values():
            fa, d = v["false_alarm"], v["detection"]
            print(f"{v['label']:42s} false alarm {fa['rate']:.1%} (n={fa['n']})  detection {d['rate']:.1%} (n={d['n']})")
        print(f"Report: {a.out / 'VALIDATION.md'}")


if __name__ == "__main__":
    main()
