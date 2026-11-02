"""
Copy-move (clone) detection. Finds keypoints that appear twice in the same image, then looks for a group of
matches that all follow one geometric transformation: a shift, optionally with resizing and rotation. A region
copied with a clone stamp, or pasted and then scaled or rotated, produces such a group.

Real scenes also repeat: railings, stair steps, stacked windows, bookshelves, woven fabric, rows of identical
products. Validation on camera photos (docs/validation) showed these cause most false alarms, so a group is
ignored when its source and copy overlap (unless the evidence is overwhelming), or when the same shift repeats at twice
the distance (a periodic pattern).
"""

import cv2
import numpy as np
from PIL import Image, ImageDraw

from app.forensics.common import finding, jpeg_b64

MIN_DISTANCE = 30   # px: ignore matches between neighbouring points
MIN_CLUSTER = 12    # matches that must follow one transformation. Chosen on half the validation phones (docs/validation)
MIN_SIDE = 0.03     # a copied area must span at least 3% of the image's short side in both directions. Points
                    # on one thin line (a row of printed letters) or a tiny spot are repeating texture, not an object.
STRONG = 20         # matches needed for "Cloned area detected"; fewer gives "Possible cloned area"
TOLERANCE = 6.0     # px: how far a match may land from where the transformation puts it
MAX_OVERLAP = 0.3   # source and copy boxes overlapping more than this (IoU) is usually repeating texture...
OVERLAP_MIN = 60    # ...unless this many matches agree. Overlapping false alarms in validation peaked at 24 matches;
                    # a large object moved by less than its own size (a real case) gave 861.
SCALE_RANGE = (0.4, 2.5)
MAX_HYPOTHESES = 600


def _keypoint_pairs(gray: np.ndarray) -> np.ndarray:
    """Returns N x 6 rows: ax, ay, bx, by, scale ratio, rotation (radians) for matches a -> b."""
    # Low contrast threshold: more keypoints in smooth areas, where clones are often hidden.
    sift = cv2.SIFT_create(nfeatures=8000, contrastThreshold=0.01)
    kps, desc = sift.detectAndCompute(gray, None)
    if desc is None or len(kps) < 10:
        return np.empty((0, 6))
    rows = []
    for m in cv2.BFMatcher(cv2.NORM_L2).knnMatch(desc, desc, k=3):
        # Drop each point's match with itself, then keep the best other match only if it is clearly
        # better than the runner-up (Lowe's ratio test).
        others = [x for x in m if x.trainIdx != x.queryIdx]
        if len(others) < 2 or others[0].distance > 0.6 * others[1].distance:
            continue
        ka, kb = kps[others[0].queryIdx], kps[others[0].trainIdx]
        if np.hypot(ka.pt[0] - kb.pt[0], ka.pt[1] - kb.pt[1]) < MIN_DISTANCE:
            continue
        rows.append((*ka.pt, *kb.pt, kb.size / ka.size, np.deg2rad(kb.angle - ka.angle)))
    rows = np.array(rows) if rows else np.empty((0, 6))
    if len(rows):
        # Each point matches its partner and the partner matches it back; keep one of each pair.
        swap = (rows[:, 0] > rows[:, 2]) | ((rows[:, 0] == rows[:, 2]) & (rows[:, 1] > rows[:, 3]))
        key = np.where(swap[:, None], rows[:, [2, 3, 0, 1]], rows[:, :4]).round()
        _, first = np.unique(key, axis=0, return_index=True)
        rows = rows[np.sort(first)]
    return rows


def _apply(m: np.ndarray, pts: np.ndarray) -> np.ndarray:
    return pts @ m[:, :2].T + m[:, 2]


def _similarity(s: float, theta: float, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    c, d = s * np.cos(theta), s * np.sin(theta)
    rot = np.array([[c, -d], [d, c]])
    return np.hstack([rot, (b - rot @ a)[:, None]])


def _box(pts: np.ndarray) -> list[int]:
    return [*map(int, pts.min(0)), *map(int, pts.max(0))]


def _iou(p: list[int], q: list[int]) -> float:
    ix = max(0, min(p[2], q[2]) - max(p[0], q[0]))
    iy = max(0, min(p[3], q[3]) - max(p[1], q[1]))
    inter = ix * iy
    union = (p[2] - p[0]) * (p[3] - p[1]) + (q[2] - q[0]) * (q[3] - q[1]) - inter
    return inter / union if union > 0 else 0.0


def _find_groups(rows: np.ndarray, min_side: float, rng: np.random.Generator) -> list[dict]:
    """Repeatedly finds the transformation most matches agree on, checks it, and removes those matches."""
    # Every match can be read both ways (a -> b or b -> a); a clone's matches agree only when read the same way.
    a = np.vstack([rows[:, 0:2], rows[:, 2:4]])
    b = np.vstack([rows[:, 2:4], rows[:, 0:2]])
    s = np.concatenate([rows[:, 4], 1 / rows[:, 4]])
    t = np.concatenate([rows[:, 5], -rows[:, 5]])
    pair = np.concatenate([np.arange(len(rows))] * 2)
    alive = np.ones(len(a), bool)
    shifts = rows[:, 2:4] - rows[:, 0:2]
    groups = []
    for _ in range(6):
        idx = np.flatnonzero(alive)
        if len(idx) < MIN_CLUSTER:
            break
        # Each match's own keypoint scale and orientation give a full transformation hypothesis (no random pairs needed).
        cand = idx if len(idx) <= MAX_HYPOTHESES else rng.choice(idx, MAX_HYPOTHESES, replace=False)
        best, best_in = None, None
        for i in cand:
            if not SCALE_RANGE[0] <= s[i] <= SCALE_RANGE[1]:
                continue
            m = _similarity(s[i], t[i], a[i], b[i])
            # Keypoint scale and angle are rough, so the error allowed grows with distance from the seed point.
            err = np.linalg.norm(_apply(m, a[idx]) - b[idx], axis=1)
            inl = idx[err < TOLERANCE + 0.08 * np.linalg.norm(a[idx] - a[i], axis=1)]
            if best_in is None or len(inl) > len(best_in):
                best, best_in = i, inl
        if best_in is None or len(best_in) < MIN_CLUSTER:
            break
        # Refine on all agreeing matches, then keep only those that fit the refined transformation tightly.
        m, _ = cv2.estimateAffinePartial2D(a[best_in], b[best_in], method=cv2.RANSAC, ransacReprojThreshold=TOLERANCE)
        if m is None:
            alive[np.isin(pair, pair[best_in])] = False
            continue
        inl = idx[np.linalg.norm(_apply(m, a[idx]) - b[idx], axis=1) < TOLERANCE]
        alive[np.isin(pair, pair[inl if len(inl) else best_in])] = False
        if len(inl) < MIN_CLUSTER:
            continue
        scale = float(np.hypot(m[0, 0], m[1, 0]))
        angle = float(np.degrees(np.arctan2(m[1, 0], m[0, 0])))
        src, dst = a[inl], b[inl]
        sbox, dbox = _box(src), _box(dst)
        w, h = src.max(0) - src.min(0)
        if min(w, h) < min_side or not SCALE_RANGE[0] <= scale <= SCALE_RANGE[1]:
            continue
        if _iou(sbox, dbox) > MAX_OVERLAP and len(inl) < OVERLAP_MIN:
            continue  # source and copy overlap with modest support: repeating texture
        if abs(scale - 1) < 0.05 and abs(angle) < 3:
            # Pure shift: a periodic pattern (stairs, windows, shelves) also matches at twice the distance.
            d = np.median(dst - src, axis=0)
            near = lambda v: np.linalg.norm(shifts - v, axis=1) < 2 * TOLERANCE  # noqa: E731
            if (near(2 * d) | near(-2 * d)).sum() >= 3:
                continue
        groups.append({"src": src, "dst": dst, "matches": len(inl), "scale": round(scale, 3), "angle": round(angle, 1)})
        if len(groups) == 3:
            break
    return groups


def analyze(img: Image.Image) -> dict:
    gray = cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2GRAY)
    rows = _keypoint_pairs(gray)
    empty = {"pairs": int(len(rows)), "regions": [], "overlay_jpg": None, "findings": []}
    if len(rows) < MIN_CLUSTER:
        return empty
    groups = _find_groups(rows, MIN_SIDE * min(img.size), np.random.default_rng(0))
    if not groups:
        return empty

    overlay = img.copy()
    draw = ImageDraw.Draw(overlay)
    regions = []
    for g in groups:
        for pts, color in ((g["src"], (255, 200, 0)), (g["dst"], (255, 40, 40))):
            x0, y0 = pts.min(axis=0) - 8
            x1, y1 = pts.max(axis=0) + 8
            draw.rectangle([x0, y0, x1, y1], outline=color, width=3)
        for p, q in list(zip(g["src"], g["dst"]))[:40]:
            draw.line([tuple(p), tuple(q)], fill=(0, 255, 120), width=1)
        regions.append({"matches": g["matches"], "source_box": _box(g["src"]), "copy_box": _box(g["dst"]),
                        "scale": g["scale"], "angle": g["angle"]})

    total = sum(r["matches"] for r in regions)
    moved = "; ".join(_describe(r) for r in regions if _describe(r))
    detail_tail = f" The copy was {moved}." if moved else ""
    # Many matches following one transformation almost never happens by chance, so a big group is a strong signal.
    # A small one can still be identical real objects (two copies of the same product), so it stays a "possible".
    if max(r["matches"] for r in regions) >= STRONG:
        found = finding("high", "Cloned area detected",
                        f"{total} matching points were copied to another place in the image (yellow = source, red = copy).{detail_tail}")
    else:
        found = finding("medium", "Possible cloned area",
                        f"{total} points repeat with the same transformation (yellow = source, red = copy). This can be a copied "
                        f"object, or two identical real objects.{detail_tail}")
    return {"pairs": int(len(rows)), "regions": regions, "overlay_jpg": jpeg_b64(overlay), "findings": [found]}


def _describe(r: dict) -> str:
    parts = []
    if abs(r["scale"] - 1) >= 0.05:
        parts.append(f"resized to {r['scale']:.0%}")
    if abs(r["angle"]) >= 3:
        parts.append(f"rotated {r['angle']:.0f}°")
    return " and ".join(parts)
