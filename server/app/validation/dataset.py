"""A test set is a folder plus manifest.jsonl: one line per image with its ground truth and where it came from."""

import hashlib
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

# Benign: what happens to real photos every day. A check that fires on these is a false alarm.
NEGATIVE = ("original", "whatsapp", "facebook", "recompressed", "resized")
# Manipulated: what a forger does. A check that misses these is a miss.
POSITIVE = ("clone_same", "clone_nearby", "clone_scaled", "clone_rotated", "removal", "splice", "doodle")


@dataclass
class Item:
    file: str              # path relative to the test-set folder
    sha256: str
    truth: str             # one of NEGATIVE or POSITIVE
    source: str            # e.g. "VISION D04 nat_0012" or "generated from <file>"
    licence: str
    post: str = ""         # post-processing after the edit, e.g. "jpeg q75", "messenger-like"
    params: dict = field(default_factory=dict)  # edit parameters: boxes, scale, angle

    @property
    def positive(self) -> bool:
        return self.truth in POSITIVE


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load(root: Path, verify: bool = True) -> list[Item]:
    items = [Item(**json.loads(line)) for line in (root / "manifest.jsonl").read_text().splitlines() if line.strip()]
    if verify:
        bad = [i.file for i in items if sha256_file(root / i.file) != i.sha256]
        if bad:
            raise ValueError(f"{len(bad)} test files changed since the manifest was written, e.g. {bad[:3]}")
    return items


def append(root: Path, items: list[Item]) -> None:
    with open(root / "manifest.jsonl", "a") as f:
        for item in items:
            f.write(json.dumps(asdict(item), sort_keys=True) + "\n")


def manifest_digest(root: Path) -> str:
    """One hash for the whole test set, recorded in every validation report."""
    return sha256_file(root / "manifest.jsonl")
