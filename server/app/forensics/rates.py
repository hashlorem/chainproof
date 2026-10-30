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


def describe_history(source: str | None) -> str | None:
    """'Right on 104/105 WhatsApp copies; given to 2.7% of other files (14/525)' or None if that label isn't validated."""
    h = ((load() or {}).get("history") or {}).get(source or "")
    if not h or not h["recognised"]["n"]:
        return None
    rec, wrong = h["recognised"], h["wrongly_given"]
    return (f"Right on {rec['rate']:.1%} of test files of this kind ({rec['k']}/{rec['n']}); "
            f"given wrongly to {wrong['rate']:.1%} of other files ({wrong['k']}/{wrong['n']})")


def annotate(report: dict) -> dict:
    """Adds 'validation' text to each finding and a summary block to the report. Leaves the report usable without rates."""
    rates = load()
    source = report.get("checks", {}).get("structure", {}).get("source")
    for f in report.get("findings", []):
        if f.get("check") == "structure":
            f["validation"] = describe_history(source)
            continue
        name = check_for(f)
        f["validation"] = describe(name) if name else None
    report["validation"] = (
        {"validated_at": rates["validated_at"], "commit": rates["commit"], "test_set": rates["test_set"],
         "checks": {k: describe(k) for k in rates["checks"]}}
        if rates else None
    )
    return report


def describe_matching() -> str | None:
    """'Traced 97.0% of test copies to their original (1019/1050); matched 0 of 10920 unrelated pairs'."""
    m = (load() or {}).get("matching")
    if not m:
        return None
    c, u = m["copies"], m["unrelated"]
    return (f"Traced {c['rate']:.1%} of test copies back to their original ({c['k']}/{c['n']}); "
            f"matched {u['k']} of {u['n']:,} unrelated photo pairs")


def describe_difference() -> str | None:
    """'No changes reported on 0.0% of innocent copies…; outlined 84.4% of edits (532/630)'."""
    m = (load() or {}).get("difference")
    if not m:
        return None
    f, d = m["false_change"], m["found"]
    return (f"Reported changes on {f['rate']:.1%} of innocent copies ({f['k']}/{f['n']}); "
            f"outlined {d['rate']:.1%} of test edits in the right place ({d['k']}/{d['n']})")
