"""Turns individual findings into one plain-language verdict. Indicators only: never proof."""

from app.forensics import c2pa_check, copymove, ela, exif, rates
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
    }
    findings = [f | {"check": name} for name, r in results.items() for f in r["findings"]]
    score = sum(WEIGHT[f["severity"]] for f in findings)

    if provenance_verified:
        findings.insert(0, finding("info", "Signed at capture", "This photo was taken in ChainProof and its hash still matches the device signature. Nothing was changed after capture.") | {"check": "provenance"})
        verdict = "verified_capture"
    elif results["c2pa"].get("ai_generated") or any(f["title"] == "AI generator named in metadata" for f in findings):
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


def split_images(report: dict) -> tuple[dict, dict[str, str]]:
    """Moves the base64 overlays out of the report so the stored JSON stays small."""
    images = {}
    for check, key, name in (("ela", "heatmap_png", "ela"), ("copy_move", "overlay_png", "copymove")):
        b64 = report["checks"][check].pop(key, None)
        if b64:
            images[name] = b64
        report["checks"][check][f"has_{name}_image"] = bool(b64)
    return report, images
