"""
Anchors a case's custody chain to a third-party clock (TM-001 in docs/security).

The server signs every entry, but whoever holds the laptop holds that key too, so they could rewrite an old entry,
recompute every hash after it and re-sign them all: the chain would still verify. An anchor closes that gap. On every
verify and report export, the hash of the newest entry is sent to the RFC 3161 timestamp authority (FreeTSA) and the
signed token is stored as an ANCHORED entry. A later rewrite then has to either

- keep the old anchors, whose hashes no longer match the rewritten entries, or
- get new tokens, which FreeTSA dates to the day of the rewrite, not the day the anchored entries claim.

Both show up below. Every PDF also prints its anchor, so a printed copy pins the log as it was.
"""

import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core import tsa
from app.core.chain import append_entry
from app.models import CustodyEntry
from app.core.timefmt import utc_text

log = logging.getLogger(__name__)

# An ANCHORED entry is written right after its token comes back, so the two clocks should agree. The slack covers a
# slow TSA and a laptop clock that is a little off.
CLOCK_SLACK = timedelta(minutes=10)


def anchor_head(db: Session, case_id: str, actor_id: str) -> dict | None:
    """
    Timestamps the newest entry's hash and appends an ANCHORED entry. Caller commits. Returns the anchor, or None
    when timestamping is off or the TSA can't be reached: the export or verify still goes ahead without one.
    """
    if not settings.tsa_enabled:
        return None
    head = db.scalar(select(CustodyEntry).where(CustodyEntry.case_id == case_id).order_by(CustodyEntry.seq.desc()).limit(1))
    if head is None:
        return None
    if head.action == "ANCHORED":  # nothing new since the last anchor
        return anchor_of(head.seq, head.details)
    try:
        token, tsa_time = tsa.request_timestamp(head.entry_hash)
    except Exception as exc:
        log.warning("Anchoring case %s failed: %s", case_id, exc)
        return None
    details = {"head_seq": head.seq, "head_hash": head.entry_hash, "tsa": settings.tsa_url, "tsa_time": tsa_time, "token_b64": token}
    entry = append_entry(db, case_id, "ANCHORED", "system", details=details)
    return anchor_of(entry.seq, details)


def anchor_of(seq: int, details: dict) -> dict:
    """What reports print: enough for anyone to look the hash up later. The token itself stays in the log."""
    return {"seq": seq, "head_seq": details["head_seq"], "head_hash": details["head_hash"], "tsa_time": details["tsa_time"]}


def _time(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def check_anchors(entries: list[dict]) -> dict:
    """
    Re-checks every anchor in a chain (as returned by load_chain). Needs no network: the tokens are stored.
    ok is None when the chain has never been anchored, so nothing can be said either way.
    """
    by_seq = {e["seq"]: e for e in entries}
    anchors = [e for e in entries if e["action"] == "ANCHORED"]
    problems = []
    for a in anchors:
        d, where = a["details"], f"anchor #{a['seq']}"
        anchored = by_seq.get(d.get("head_seq"))
        if anchored is None or anchored["entry_hash"] != d.get("head_hash"):
            problems.append(f"{where}: entry #{d.get('head_seq')} no longer has the hash that was timestamped (history was rewritten)")
            continue
        if not tsa.check_timestamp(d.get("token_b64", ""), d["head_hash"]):
            problems.append(f"{where}: the timestamp token does not verify for entry #{d['head_seq']}")
            continue
        stamped = _time(d["tsa_time"])
        if abs(stamped - _time(a["ts"])) > CLOCK_SLACK:
            problems.append(f"{where}: timestamped {d['tsa_time']} but recorded {a['ts']} (re-anchored after the fact)")
            continue
        later = [e for e in entries if e["seq"] > a["seq"]]
        if later and stamped > min(_time(e["ts"]) for e in later) + CLOCK_SLACK:
            problems.append(f"{where}: timestamped {d['tsa_time']}, after entries recorded later in the chain (re-anchored after the fact)")
    latest = anchor_of(anchors[-1]["seq"], anchors[-1]["details"]) if anchors else None
    return {"ok": (not problems) if anchors else None, "count": len(anchors), "latest": latest, "problems": problems}


def anchor_if_intact(db: Session, case_id: str, actor_id: str) -> dict | None:
    """Anchors only a chain that still checks out: an anchor after a break would bury the break, like any new entry."""
    from app.core.chain import load_chain, verify_entries

    entries = load_chain(db, case_id)
    if not verify_entries(entries).ok or check_anchors(entries)["ok"] is False:
        return None
    return anchor_head(db, case_id, actor_id)


def describe(anchors: dict) -> str:
    """One line for reports and the public page."""
    if anchors["ok"] is None:
        return "not anchored yet: no trusted timestamp covers this log"
    if not anchors["ok"]:
        return "; ".join(anchors["problems"])
    a = anchors["latest"]
    return (f"{anchors['count']} anchor(s) verify; entries up to #{a['head_seq']} were timestamped by FreeTSA at {utc_text(a['tsa_time'])} "
            f"(hash {a['head_hash']})")
