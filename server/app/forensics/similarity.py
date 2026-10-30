"""
"Is this a copy of our evidence?" Two tools:

- A perceptual hash (pHash): 64 bits that describe what a photo looks like, not its bytes. Re-saving, resizing or
  sending through a messenger barely changes it, so a circulating copy can be traced back to a stored original even
  though its SHA-256 differs. The match threshold is measured in docs/validation.
- A difference map: the questioned copy is lined up with the original and compared region by region, so an examiner
  can see exactly what someone changed.
"""

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError

from app.forensics.common import finding, open_rgb, png_b64

MATCH_DISTANCE = 10      # bits out of 64; chosen on the odd-numbered VISION phones (docs/validation)
# A heavily edited copy can drift further (a duplicated bouquet: 20 bits). Between MATCH_DISTANCE and VERIFY_DISTANCE a
# candidate is confirmed only if both photos share one scene geometry: at least SAME_SCENE matching points that fit one
# homography. Measured: real copies 81+ such points, look-alike unrelated photos 22 at most.
VERIFY_DISTANCE = 24
SAME_SCENE = 40
WORK_SIDE = 1024         # both images are compared at this size
CHANGE_LEVEL = 28        # per-pixel difference (0-255, after smoothing) that counts as changed
MIN_REGION = 0.0015      # changed regions smaller than this share of the image are compression noise


def phash(img: Image.Image) -> str:
    """64-bit DCT hash as 16 hex characters."""
    gray = np.asarray(img.convert("L").resize((32, 32), Image.LANCZOS), dtype=np.float32)
    low = cv2.dct(gray)[:8, :8]
    bits = (low > np.median(low.flatten()[1:])).flatten()
    return f"{int(''.join('1' if b else '0' for b in bits), 2):016x}"


def image_phash(data: bytes) -> str | None:
    """The stored hash for an evidence image, upright as displayed. None if the file can't be read as an image."""
    try:
        return phash(open_rgb(data))
    except (UnidentifiedImageError, OSError, ValueError):
        return None


def distance(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


ROTATIONS = (None, Image.Transpose.ROTATE_90, Image.Transpose.ROTATE_180, Image.Transpose.ROTATE_270)


def phashes(img: Image.Image) -> list[str]:
    """The hash of the image as it is and turned a quarter, half and three-quarters: copies that lost the camera's
    "rotate" flag (re-saves, screenshots) appear sideways."""
    small = img.convert("L").resize((64, 64), Image.LANCZOS)
    return [phash(small if t is None else small.transpose(t)) for t in ROTATIONS]


def closest(questioned: list[str], stored: str) -> int:
    return min(distance(h, stored) for h in questioned)


def upright(original: Image.Image, questioned: Image.Image) -> Image.Image:
    """Turns the questioned copy to the rotation whose hash is closest to the original's."""
    target = phash(original)
    best = min(range(4), key=lambda i: distance(phashes(questioned)[i], target))
    return questioned if best == 0 else questioned.transpose(ROTATIONS[best])


def same_scene(original: Image.Image, questioned: Image.Image) -> int:
    """Matching points between the two photos that fit one homography (after turning the copy upright)."""
    a, b = original.copy(), upright(original, questioned).copy()
    a.thumbnail((512, 512))
    b.thumbnail((512, 512))
    orb = cv2.ORB_create(1500)
    k1, d1 = orb.detectAndCompute(cv2.cvtColor(np.asarray(a.convert("RGB")), cv2.COLOR_RGB2GRAY), None)
    k2, d2 = orb.detectAndCompute(cv2.cvtColor(np.asarray(b.convert("RGB")), cv2.COLOR_RGB2GRAY), None)
    if d1 is None or d2 is None or len(k1) < 8 or len(k2) < 8:
        return 0
    matches = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(d1, d2)
    if len(matches) < 8:
        return 0
    src = np.float32([k1[m.queryIdx].pt for m in matches])
    dst = np.float32([k2[m.trainIdx].pt for m in matches])
    _, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
    return int(mask.sum()) if mask is not None else 0


def _fit(img: Image.Image, size: tuple[int, int]) -> np.ndarray:
    return np.asarray(img.convert("RGB").resize(size, Image.LANCZOS), dtype=np.float32)


def _align(original: Image.Image, questioned: Image.Image) -> tuple[np.ndarray, np.ndarray, str]:
    """Both images as float arrays at the same size. Same shape → resize; otherwise a feature-based homography."""
    scale = WORK_SIDE / max(original.size)
    size = (max(1, round(original.width * scale)), max(1, round(original.height * scale)))
    ref = _fit(original, size)
    if abs(original.width / original.height - questioned.width / questioned.height) < 0.02:
        return ref, _fit(questioned, size), "resized to match"
    q = np.asarray(questioned.convert("RGB"), dtype=np.uint8)
    orb = cv2.ORB_create(4000)
    k1, d1 = orb.detectAndCompute(cv2.cvtColor(ref.astype(np.uint8), cv2.COLOR_RGB2GRAY), None)
    k2, d2 = orb.detectAndCompute(cv2.cvtColor(q, cv2.COLOR_RGB2GRAY), None)
    if d1 is None or d2 is None:
        raise ValueError("not enough detail to line the images up")
    matches = sorted(cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(d2, d1), key=lambda m: m.distance)[:500]
    if len(matches) < 12:
        raise ValueError("the images could not be lined up")
    src = np.float32([k2[m.queryIdx].pt for m in matches])
    dst = np.float32([k1[m.trainIdx].pt for m in matches])
    h, _ = cv2.findHomography(src, dst, cv2.RANSAC, 4.0)
    if h is None:
        raise ValueError("the images could not be lined up")
    warped = cv2.warpPerspective(q, h, size).astype(np.float32)
    return ref, warped, "lined up by matching features (cropped, rotated or reframed copy)"


def compare(original: Image.Image, questioned: Image.Image) -> dict:
    ref, que, how = _align(original, upright(original, questioned))
    # Match overall brightness and colour first: a messenger's colour conversion is not an edit.
    for c in range(3):
        r, q = ref[..., c], que[..., c]
        que[..., c] = (q - q.mean()) / (q.std() + 1e-6) * r.std() + r.mean()
    blur = lambda a: cv2.GaussianBlur(a, (0, 0), 2.0)  # noqa: E731  smooths away compression noise
    diff = np.abs(blur(ref) - blur(que)).max(axis=2)
    mask = (diff > CHANGE_LEVEL).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    area = mask.shape[0] * mask.shape[1]
    regions = [[int(x), int(y), int(x + w), int(y + h)] for x, y, w, h, a in stats[1:] if a / area >= MIN_REGION]
    keep = np.zeros_like(mask)
    for i, (*_, a) in enumerate(stats[1:], start=1):
        if a / area >= MIN_REGION:
            keep[labels == i] = 1
    changed = float(keep.mean())

    overlay = que.clip(0, 255).astype(np.uint8).copy()
    tint = overlay.copy()
    tint[keep == 1] = (255, 40, 40)
    overlay = cv2.addWeighted(overlay, 0.55, tint, 0.45, 0)
    # Outline the changed shapes themselves; boxes around neighbouring regions overlap and clutter the picture.
    contours, _ = cv2.findContours(keep, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(overlay, contours, -1, (255, 40, 40), 2)

    if regions:
        found = finding("high", "Changed compared with the original",
                        f"{len(regions)} region{'s' if len(regions) != 1 else ''} ({changed:.1%} of the image) differ from the stored "
                        "original beyond what re-saving explains. They are outlined in red.")
    else:
        found = finding("info", "No changes found compared with the original",
                        "After lining the copy up with the stored original, no region differs beyond recompression and resizing.")
    return {"aligned": how, "changed_ratio": round(changed, 4), "regions": regions, "size": [ref.shape[1], ref.shape[0]],
            "overlay_png": png_b64(Image.fromarray(overlay)), "findings": [found]}
