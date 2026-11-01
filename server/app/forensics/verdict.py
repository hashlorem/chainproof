"""Turns individual findings into one plain-language verdict. Indicators only: never proof."""

from app.forensics import c2pa_check, copymove, ela, exif, rates, structure
from app.forensics.common import finding, open_rgb

WEIGHT = {"info": 0, "low": 1, "medium": 2, "high": 3}
LABELS = {
    "verified_capture": "Verified capture",
    "ai_generated": "AI-generated",
    "likely_manipulated": "Likely manipulated",
    "suspicious": "Suspicious",
    "no_signs": "No signs of manipulation",
}


def run_all(data: bytes, mime: str, provenance_verified: bool = False) -> dict:
    """Runs every check. Each result keeps its own findings; images come back as base64 PNG."""
    img = open_rgb(data)
    results = {
        "metadata": exif.analyze(data),
        "ela": ela.analyze(img),
        "copy_move": copymove.analyze(img),
        "c2pa": c2pa_check.analyze(data, mime),
        "structure": structure.analyze(data),
    }
    findings = [f | {"check": name} for name, r in results.items() for f in r["findings"]]
    score = sum(WEIGHT[f["severity"]] for f in findings)

    if provenance_verified:
        findings.insert(0, finding("info", "Signed at capture", "This photo was taken in ChainProof and its hash still matches the device signature. Nothing was changed after capture.") | {"check": "provenance"})
        verdict = "verified_capture"
    # Only signed credentials from a listed signer: metadata text and self-signed claims are easy to forge (TM-011).
    elif results["c2pa"].get("ai_generated") and results["c2pa"].get("trusted"):
        verdict = "ai_generated"
    elif score >= 4 or any(f["severity"] == "high" for f in findings):
        verdict = "likely_manipulated"
    elif score >= 2:
        verdict = "suspicious"
    else:
        verdict = "no_signs"

    return rates.annotate({
        "verdict": verdict,
        "label": LABELS[verdict],
        "score": score,
        "findings": sorted(findings, key=lambda f: -WEIGHT[f["severity"]]),
        "checks": results,
        "disclaimer": "Automated forensic checks give indicators, not proof. A clean result does not guarantee an image is authentic.",
    })


# Where each analysis picture is stored next to the evidence. Analyses from before 1 Nov 2026 kept the clone overlay
# as copymove.png, so readers fall back to that name when a report has no "{name}_file".
IMAGE_FILES = {"ela": "ela.png", "copymove": "copymove.jpg"}
LEGACY_FILES = {"ela": "ela.png", "copymove": "copymove.png"}


def split_images(report: dict) -> tuple[dict, dict[str, str]]:
    """Moves the base64 pictures out of the report so the stored JSON stays small. Returns {file name: base64}."""
    images = {}
    for check, key, name in (("ela", "heatmap_png", "ela"), ("copy_move", "overlay_jpg", "copymove")):
        b64 = report["checks"][check].pop(key, None)
        if b64:
            images[IMAGE_FILES[name]] = b64
            report["checks"][check][f"{name}_file"] = IMAGE_FILES[name]
        report["checks"][check][f"has_{name}_image"] = bool(b64)
    return report, images


def image_file(report: dict, check: str, name: str) -> str | None:
    """The stored picture this report refers to, or None if this analysis made none (an older file may still exist)."""
    c = report["checks"][check]
    return c.get(f"{name}_file", LEGACY_FILES[name]) if c.get(f"has_{name}_image") else None
