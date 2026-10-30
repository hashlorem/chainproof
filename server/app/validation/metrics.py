"""Error rates with honest uncertainty: every rate comes with its sample size and a 95% Wilson interval."""

import math
from collections import defaultdict

from app.validation.dataset import NEGATIVE, POSITIVE

# What counts as "this check fired" for each check, given one analysis report.
CHECKS = {
    "clone": lambda r: bool(r["checks"]["copy_move"]["regions"]),
    "ela": lambda r: bool(r["checks"]["ela"]["findings"]),  # informational since validation v2, still measured
    "metadata_editor": lambda r: any(f["title"] == "Edited with image software" for f in r["checks"]["metadata"]["findings"]),
    "c2pa_ai": lambda r: bool(r["checks"]["c2pa"].get("ai_generated")),
    "verdict_any": lambda r: r["verdict"] in ("suspicious", "likely_manipulated", "ai_generated"),
    "verdict_strong": lambda r: r["verdict"] in ("likely_manipulated", "ai_generated"),
}
LABELS = {
    "clone": "Copy-move (clone) detection",
    "clone_localized": "Copy-move, flagged in the edited area",
    "ela": "Error level analysis",
    "metadata_editor": "Editing software named in metadata",
    "c2pa_ai": "Content Credentials say AI",
    "verdict_any": "Verdict: Suspicious or worse",
    "verdict_strong": "Verdict: Likely manipulated / AI",
}


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def rate(k: int, n: int) -> dict:
    lo, hi = wilson(k, n)
    return {"k": k, "n": n, "rate": round(k / n, 4) if n else None, "ci95": [round(lo, 4), round(hi, 4)]}


def evaluate(rows: list[dict]) -> dict:
    """rows: {"truth", "post", "fired": {check: bool}}. Returns per-check FPR on benign images and TPR per edit type."""
    out = {}
    for check in LABELS:
        by_truth: dict[str, list[bool]] = defaultdict(list)
        by_post: dict[str, list[bool]] = defaultdict(list)
        for row in rows:
            by_truth[row["truth"]].append(row["fired"][check])
            if row["truth"] in POSITIVE:
                by_post[row["post"]].append(row["fired"][check])
        neg = [f for t in NEGATIVE for f in by_truth.get(t, [])]
        pos = [f for t in POSITIVE for f in by_truth.get(t, [])]
        out[check] = {
            "label": LABELS[check],
            "false_alarm": rate(sum(neg), len(neg)),
            "false_alarm_by_type": {t: rate(sum(v), len(v)) for t in NEGATIVE if (v := by_truth.get(t))},
            "detection": rate(sum(pos), len(pos)),
            "detection_by_type": {t: rate(sum(v), len(v)) for t in POSITIVE if (v := by_truth.get(t))},
            "detection_by_post": {p: rate(sum(v), len(v)) for p, v in sorted(by_post.items())},
        }
    return out
