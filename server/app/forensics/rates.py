"""Measured error rates (from app/validation) attached to findings, so every indicator says how often its check is wrong."""

import json
from functools import cache
from pathlib import Path

RATES_FILE = Path(__file__).resolve().parent / "validated_rates.json"


@cache
def load() -> dict | None:
    try:
        return json.loads(RATES_FILE.read_text())
    except (OSError, ValueError):
        return None


def check_for(finding: dict) -> str | None:
    """Which validated check a finding comes from, if that check has been validated."""
    check, title = finding.get("check"), finding.get("title", "")
    if check == "copy_move":
        return "clone"
    if check == "ela":
        return "ela"
    if check == "metadata" and title == "Edited with image software":
        return "metadata_editor"
    if check == "c2pa" and "AI" in title:
        return "c2pa_ai"
    return None


def describe(name: str) -> str | None:
    """'Fires on 1.8% of benign photos (8/420); finds 61.0% of edits (320/525)' or None if not validated."""
    rates = load()
    r = (rates or {}).get("checks", {}).get(name)
    if not r or not r["false_alarm"]["n"]:
        return None
    fa, det = r["false_alarm"], r["detection"]
    text = f"Fires on {fa['rate']:.1%} of benign photos ({fa['k']}/{fa['n']})"
    if det["n"]:
        text += f"; finds {det['rate']:.1%} of {r.get('detection_note') or 'test edits'} ({det['k']}/{det['n']})"
    return text


def annotate(report: dict) -> dict:
    """Adds 'validation' text to each finding and a summary block to the report. Leaves the report usable without rates."""
    rates = load()
    for f in report.get("findings", []):
        name = check_for(f)
        f["validation"] = describe(name) if name else None
    report["validation"] = (
        {"validated_at": rates["validated_at"], "commit": rates["commit"], "test_set": rates["test_set"],
         "checks": {k: describe(k) for k in rates["checks"]}}
        if rates else None
    )
    return report
