"""
Copy-move (clone) detection. Finds keypoints that appear twice in the same image.
A cloned area produces many matching pairs that all share the same shift (dx, dy).
"""

from collections import Counter

import cv2
import numpy as np
from PIL import Image, ImageDraw

from app.forensics.common import finding, png_b64

MIN_DISTANCE = 30  # px: ignore matches between neighbouring points
MIN_CLUSTER = 8    # pairs sharing one shift needed to call it a clone. Lower finds more clones, but repeating
                   # patterns in real photos (bricks, tiles, windows) can then cause false alarms.
SHIFT_BIN = 6      # px tolerance when grouping shifts


def analyze(img: Image.Image) -> dict:
    gray = cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2GRAY)
    # Low contrast threshold: more keypoints in smooth areas, where clones are often hidden.
    sift = cv2.SIFT_create(nfeatures=8000, contrastThreshold=0.01)
    kps, desc = sift.detectAndCompute(gray, None)
    empty = {"pairs": 0, "regions": [], "overlay_png": None, "findings": []}
    if desc is None or len(kps) < 10:
        return empty

    matches = cv2.BFMatcher(cv2.NORM_L2).knnMatch(desc, desc, k=3)
    pairs = []
    for m in matches:
        # Drop each point's match with itself, then keep the best other match only if it is clearly
        # better than the runner-up (Lowe's ratio test).
        others = [x for x in m if x.trainIdx != x.queryIdx]
        if len(others) < 2 or others[0].distance > 0.6 * others[1].distance:
            continue
        a, b = np.array(kps[others[0].queryIdx].pt), np.array(kps[others[0].trainIdx].pt)
        if np.linalg.norm(a - b) < MIN_DISTANCE:
            continue
        if (a[0], a[1]) > (b[0], b[1]):  # same direction for a->b and b->a, so they share one shift
            a, b = b, a
        pairs.append((a, b))

    bins = [tuple(np.round((b - a) / SHIFT_BIN).astype(int)) for a, b in pairs]
    counts = Counter(bins)

    def near(s1, s2) -> bool:
        # A shift that lands right on a bin edge can round either way, so neighbouring bins count together.
        return abs(s1[0] - s2[0]) <= 1 and abs(s1[1] - s2[1]) <= 1

    clusters, used = [], set()
    for center, _ in counts.most_common():
        if center in used:
            continue
        members = {s for s in counts if near(s, center) and s not in used}
        n = sum(counts[s] for s in members)
        if n >= MIN_CLUSTER:
            clusters.append((members, n))
            used |= members
        if len(clusters) == 3:
            break
    if not clusters:
        return empty | {"pairs": len(pairs)}

    overlay = img.copy()
    draw = ImageDraw.Draw(overlay)
    regions = []
    for members, n in clusters:
        sel = [(a, b) for (a, b), s in zip(pairs, bins) if s in members]
        src, dst = np.array([a for a, _ in sel]), np.array([b for _, b in sel])
        for pts, color in ((src, (255, 200, 0)), (dst, (255, 40, 40))):
            x0, y0 = pts.min(axis=0) - 8
            x1, y1 = pts.max(axis=0) + 8
            draw.rectangle([x0, y0, x1, y1], outline=color, width=3)
        for a, b in sel[:40]:
            draw.line([tuple(a), tuple(b)], fill=(0, 255, 120), width=1)
        regions.append({"matches": n, "source_box": [*map(int, src.min(0)), *map(int, src.max(0))],
                        "copy_box": [*map(int, dst.min(0)), *map(int, dst.max(0))]})

    total = sum(r["matches"] for r in regions)
    return {
        "pairs": len(pairs),
        "regions": regions,
        "overlay_png": png_b64(overlay),
        # Many points sharing one exact shift almost never happens by chance, so this is a strong signal.
        "findings": [finding("high", "Cloned area detected",
                             f"{total} matching points were copied to another place in the image (yellow = source, red = copy).")],
    }
