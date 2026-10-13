"""
Error Level Analysis. Re-save the image as JPEG and look at how much each area changes.
Areas pasted in from another image, or edited after the last save, often compress differently and light up.
"""

import io

import numpy as np
from PIL import Image

from app.forensics.common import finding, png_b64

QUALITY = 90
BLOCK = 16


def analyze(img: Image.Image) -> dict:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=QUALITY)
    resaved = np.asarray(Image.open(buf), dtype=np.int16)
    diff = np.abs(np.asarray(img, dtype=np.int16) - resaved).max(axis=2).astype(np.float32)

    # Average error per 16x16 block, then look for blocks far above the image's own normal level.
    h, w = (diff.shape[0] // BLOCK) * BLOCK, (diff.shape[1] // BLOCK) * BLOCK
    blocks = diff[:h, :w].reshape(h // BLOCK, BLOCK, w // BLOCK, BLOCK).mean(axis=(1, 3))
    # Most blocks of a re-saved JPEG barely change, so the median alone is too low a bar.
    # A block counts as an outlier only if it also beats 2.5x the 90th percentile.
    median = float(np.median(blocks))
    mad = float(np.median(np.abs(blocks - median)))
    threshold = max(median + 6 * mad, 2.5 * float(np.percentile(blocks, 90)), 3.0)
    outliers = blocks > threshold
    outlier_ratio = float(outliers.mean())

    scale = 255.0 / max(float(np.percentile(diff, 99.5)), 1.0)
    heat = np.clip(diff * scale, 0, 255).astype(np.uint8)
    heatmap = Image.fromarray(np.stack([heat, (heat * 0.6).astype(np.uint8), 255 - heat], axis=2))

    findings = []
    if 0.002 < outlier_ratio < 0.25:
        sev = "medium" if outlier_ratio > 0.01 else "low"
        findings.append(finding(sev, "Uneven compression", f"{outlier_ratio:.1%} of the image compresses very differently from the rest. Look at the bright areas in the heatmap."))
    return {
        "mean_error": round(float(diff.mean()), 3),
        "outlier_ratio": round(outlier_ratio, 4),
        "heatmap_png": png_b64(heatmap),
        "findings": findings,
    }
