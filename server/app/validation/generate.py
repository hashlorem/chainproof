"""
Makes labelled test images from camera originals: five kinds of forgery a person would make in an editor, and two
kinds of innocent processing. Everything is seeded from the original's hash, so the same originals always give the
same test set.

Forged regions are irregular, feathered blobs placed on textured areas, like a lasso selection in an editor.
These are synthetic forgeries: they show how the checks behave, but a skilled human forger can do better.
"""

import hashlib
import io
import random
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from app.validation.dataset import Item, append, sha256_file

GENERATOR_VERSION = "1"
POSTS = ("jpeg q95", "jpeg q85", "jpeg q75", "messenger-like")


def _rng(*parts: str) -> random.Random:
    return random.Random(hashlib.sha256("|".join(parts).encode()).hexdigest())


def _texture(gray: np.ndarray, box) -> float:
    x0, y0, x1, y1 = box
    patch = gray[y0:y1, x0:x1]
    return float(np.abs(np.diff(patch, axis=0)).mean() + np.abs(np.diff(patch, axis=1)).mean())


def _boxes(rng, size, r, n=40):
    w, h = size
    for _ in range(n):
        x, y = rng.randint(0, w - r - 1), rng.randint(0, h - r - 1)
        yield (x, y, x + r, y + r)


def _textured_box(rng, img: Image.Image, r: int):
    """The most textured of 40 random boxes: forgers copy objects, not blank sky."""
    small = img.convert("L")
    gray = np.asarray(small, dtype=np.float32)
    return max(_boxes(rng, img.size, r), key=lambda b: _texture(gray, b))


def _far_box(rng, size, r, avoid, min_dist):
    ax, ay = (avoid[0] + avoid[2]) / 2, (avoid[1] + avoid[3]) / 2
    for b in _boxes(rng, size, r, 200):
        if ((b[0] + r / 2 - ax) ** 2 + (b[1] + r / 2 - ay) ** 2) ** 0.5 >= min_dist:
            return b
    raise ValueError("image too small for this edit")


def _blob(rng, r: int) -> Image.Image:
    """Irregular lasso-like mask with soft edges."""
    mask = Image.new("L", (r, r), 0)
    cx = cy = r / 2
    pts = []
    for i in range(14):
        a = 2 * np.pi * i / 14
        rad = r / 2 * rng.uniform(0.62, 0.95)
        pts.append((cx + rad * np.cos(a), cy + rad * np.sin(a)))
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(max(1, r // 120)))


def _paste(img, patch, mask, dst_center):
    x = int(dst_center[0] - patch.width / 2)
    y = int(dst_center[1] - patch.height / 2)
    img.paste(patch, (x, y), mask)
    return [x, y, x + patch.width, y + patch.height]


def forge(kind: str, img: Image.Image, rng: random.Random, donor: Image.Image | None = None) -> tuple[Image.Image, dict]:
    img = img.copy()
    short = min(img.size)
    r = int(short * rng.uniform(0.10, 0.22))
    if kind == "removal":
        # Clone stamp: cover a textured "object" with a same-size patch taken from right next to it.
        target = _textured_box(rng, img, r)
        dx, dy = rng.choice([(1.3, 0), (-1.3, 0), (0, 1.3), (0, -1.3)])
        sx, sy = int(target[0] + dx * r), int(target[1] + dy * r)
        sx, sy = min(max(sx, 0), img.width - r), min(max(sy, 0), img.height - r)
        src = (sx, sy, sx + r, sy + r)
        dst = _paste(img, img.crop(src), _blob(rng, r), ((target[0] + target[2]) / 2, (target[1] + target[3]) / 2))
        return img, {"source_box": list(src), "dest_box": dst}
    if kind == "splice":
        donor_box = _textured_box(rng, donor, int(min(donor.size) * r / short))
        patch = donor.crop(donor_box).convert("RGB").resize((r, r), Image.LANCZOS)
        dst = _far_box(rng, img.size, r, (0, 0, 0, 0), 0)
        placed = _paste(img, patch, _blob(rng, r), ((dst[0] + dst[2]) / 2, (dst[1] + dst[3]) / 2))
        return img, {"dest_box": placed}

    src = _textured_box(rng, img, r)
    patch, mask = img.crop(src), _blob(rng, r)
    params: dict = {"source_box": list(src)}
    if kind == "clone_scaled":
        s = rng.choice([rng.uniform(0.55, 0.8), rng.uniform(1.2, 1.5)])
        n = int(r * s)
        patch, mask = patch.resize((n, n), Image.LANCZOS), mask.resize((n, n), Image.LANCZOS)
        params["scale"] = round(s, 3)
    elif kind == "clone_rotated":
        a = rng.uniform(10, 30) * rng.choice([-1, 1])
        patch = patch.rotate(a, resample=Image.BICUBIC, expand=True)
        mask = mask.rotate(a, resample=Image.BICUBIC, expand=True)
        params["angle"] = round(a, 2)
    if kind == "clone_nearby":
        # Duplicate an object right next to itself: the copy overlaps the original (like moving a bouquet slightly).
        a = rng.uniform(0, 2 * np.pi)
        d = r * rng.uniform(0.4, 0.9)
        cx = min(max((src[0] + src[2]) / 2 + d * np.cos(a), r / 2), img.width - r / 2)
        cy = min(max((src[1] + src[3]) / 2 + d * np.sin(a), r / 2), img.height - r / 2)
        params["dest_box"] = _paste(img, patch, mask, (cx, cy))
        return img, params
    dst = _far_box(rng, img.size, max(patch.size), src, 1.6 * r)
    params["dest_box"] = _paste(img, patch, mask, ((dst[0] + dst[2]) / 2, (dst[1] + dst[3]) / 2))
    return img, params


def save(img: Image.Image, post: str, exif: bytes | None, rng: random.Random) -> tuple[bytes, dict]:
    """The step after editing. Careful forgers keep the camera EXIF; messengers strip it and recompress hard."""
    buf = io.BytesIO()
    if post == "messenger-like":
        img.convert("RGB").save(buf, "JPEG", quality=60, progressive=True, optimize=True)
        return buf.getvalue(), {"exif_kept": False}
    keep = bool(exif) and rng.random() < 0.5
    kw = {"exif": exif} if keep else {}
    img.convert("RGB").save(buf, "JPEG", quality=int(post.split("q")[1]), **kw)
    return buf.getvalue(), {"exif_kept": keep}


def _make(job) -> list[dict]:
    root, orig, donor_file, kinds = job
    root = Path(root)
    img = Image.open(root / orig["file"])
    exif = img.info.get("exif")
    img.load()
    donor = Image.open(root / donor_file).convert("RGB") if donor_file else None
    stem = Path(orig["file"]).stem
    out = []
    for kind in kinds:
        rng = _rng(GENERATOR_VERSION, orig["sha256"], kind)
        if kind == "recompressed":
            data, extra = save(img, "jpeg q85", exif, rng)
            params, post = extra, "jpeg q85"
        elif kind == "resized":
            small = img.resize((img.width // 2, img.height // 2), Image.LANCZOS)
            data, extra = save(small, "jpeg q90", exif, rng)
            params, post = extra | {"scale": 0.5}, "resize 50% + jpeg q90"
        else:
            edited, params = forge(kind, img.convert("RGB"), rng, donor)
            post = rng.choice(POSTS)
            data, extra = save(edited, post, exif, rng)
            params |= extra
        rel = Path("generated") / kind / f"{stem}_{kind}.jpg"
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_bytes(data)
        out.append(dict(file=str(rel), sha256=sha256_file(root / rel), truth=kind, post=post, params=params,
                        source=f"generated v{GENERATOR_VERSION} from {orig['file']}" + (f" + {donor_file}" if kind == "splice" else ""),
                        licence=orig["licence"]))
    return out


def generate(root: Path, originals: list[Item], kinds: tuple[str, ...], workers: int = 8) -> list[Item]:
    """Each original gets one image per kind. Splices take a region from the next original in the list."""
    jobs = []
    for i, o in enumerate(originals):
        donor = originals[(i + 1) % len(originals)].file if "splice" in kinds else None
        jobs.append((str(root), {"file": o.file, "sha256": o.sha256, "licence": o.licence}, donor, kinds))
    if workers <= 1:
        batches = list(map(_make, jobs))
    else:
        with ProcessPoolExecutor(workers) as pool:
            batches = list(pool.map(_make, jobs))
    items = [Item(**d) for batch in batches for d in batch]
    append(root, items)
    return items
