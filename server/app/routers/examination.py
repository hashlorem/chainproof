"""
Examinations: an examiner's notes, conclusion and a second examiner's technical review of one evidence item.
Nothing here has its own table. Every note, conclusion and review is a custody entry, so it is append-only,
hash-chained and signed like everything else, and the current state is read back from the chain.
"""

import hashlib
import platform
import subprocess
from functools import cache
from importlib.metadata import version
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import storage
from app.core.chain import append_entry
from app.core.security import current_user, require_role
from app.db import get_db
from app.forensics import rates
from app.models import Case, CustodyEntry, Evidence, Report, User, fmt_ts, utcnow
from app.reports.examination import build_examination
from app.routers.evidence import get_evidence

router = APIRouter(tags=["examination"])

# Verbal scale for evaluative conclusions (see the ENFSI guideline). Always support for H1 *against* H2.
LEVELS = {
    "none": "no support either way",
    "limited": "limited support",
    "moderate": "moderate support",
    "strong": "strong support",
    "very_strong": "very strong support",
}


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class ConclusionIn(BaseModel):
    question: str = Field(default="Is this image an unaltered record of what the camera captured?", max_length=500)
    h1: str = Field(min_length=3, max_length=500)
    h2: str = Field(min_length=3, max_length=500)
    level: Literal["none", "limited", "moderate", "strong", "very_strong"]
    rationale: str = Field(min_length=10, max_length=4000)
    limitations: str = Field(min_length=10, max_length=4000)


class ReviewIn(BaseModel):
    agrees: bool
    comment: str = Field(min_length=3, max_length=4000)


def _writable(db: Session, ev: Evidence) -> None:
    if db.get(Case, ev.case_id).status != "open":
        raise HTTPException(409, "Case is closed. Reopen it first")


def _entries(db: Session, ev: Evidence) -> list[CustodyEntry]:
    return list(db.scalars(select(CustodyEntry).where(
        CustodyEntry.case_id == ev.case_id, CustodyEntry.evidence_id == ev.id,
        CustodyEntry.action.in_(("NOTED", "CONCLUDED", "REVIEWED", "COMPARED"))).order_by(CustodyEntry.seq)))


def examination_state(db: Session, ev: Evidence) -> dict:
    """Notes, comparisons, the latest conclusion, and the review of that conclusion (an older conclusion's review doesn't count)."""
    names = {u.id: u.name for u in db.scalars(select(User))}
    notes, comparisons, conclusion, review = [], [], None, None
    for e in _entries(db, ev):
        by = names.get(e.actor_id, e.actor_id)
        if e.action == "NOTED":
            notes.append({"seq": e.seq, "ts": e.ts, "by": by, "text": e.details["text"]})
        elif e.action == "CONCLUDED":
            conclusion = {"seq": e.seq, "ts": e.ts, "by": by, "by_id": e.actor_id, **e.details,
                          "level": LEVELS[e.details["level"]], "level_key": e.details["level"]}
            review = None
        elif e.action == "COMPARED":
            d = e.details
            comparisons.append({"seq": e.seq, "ts": e.ts, "by": by, "filename": d.get("questioned_filename") or "unnamed copy",
                                "sha256": d["questioned_sha256"], "distance": d["distance"], "changed_ratio": d["changed_ratio"],
                                "regions": d["regions"], "aligned": d.get("aligned"), "overlay": d.get("overlay")})
        elif e.action == "REVIEWED" and conclusion and e.details.get("conclusion_seq") == conclusion["seq"]:
            review = {"seq": e.seq, "ts": e.ts, "by": by, "agrees": e.details["agrees"], "comment": e.details["comment"]}
    return {"question": (conclusion or {}).get("question"), "notes": notes, "comparisons": comparisons, "conclusion": conclusion,
            "review": review, "levels": LEVELS}


@router.get("/evidence/{evidence_id}/examination")
def get_examination(evidence_id: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    return examination_state(db, get_evidence(db, evidence_id))


@router.post("/evidence/{evidence_id}/notes", status_code=201)
def add_note(evidence_id: str, body: NoteIn, user: User = Depends(require_role("investigator", "supervisor")),
             db: Session = Depends(get_db)):
    ev = get_evidence(db, evidence_id)
    _writable(db, ev)
    append_entry(db, ev.case_id, "NOTED", user.id, ev.id, {"text": body.text})
    db.commit()
    return examination_state(db, ev)


@router.post("/evidence/{evidence_id}/conclusion", status_code=201)
def conclude(evidence_id: str, body: ConclusionIn, user: User = Depends(require_role("investigator", "supervisor")),
             db: Session = Depends(get_db)):
    ev = get_evidence(db, evidence_id)
    _writable(db, ev)
    append_entry(db, ev.case_id, "CONCLUDED", user.id, ev.id, body.model_dump())
    db.commit()
    return examination_state(db, ev)


@router.post("/evidence/{evidence_id}/review", status_code=201)
def review(evidence_id: str, body: ReviewIn, user: User = Depends(require_role("investigator", "supervisor")),
           db: Session = Depends(get_db)):
    ev = get_evidence(db, evidence_id)
    _writable(db, ev)
    conclusion = examination_state(db, ev)["conclusion"]
    if conclusion is None:
        raise HTTPException(409, "There is no conclusion to review yet")
    if conclusion["by_id"] == user.id:
        raise HTTPException(403, "A technical review must be done by a different examiner")
    append_entry(db, ev.case_id, "REVIEWED", user.id, ev.id,
                 {"conclusion_seq": conclusion["seq"], "agrees": body.agrees, "comment": body.comment})
    db.commit()
    return examination_state(db, ev)


@cache
def _tool_versions() -> tuple[str, str]:
    try:
        commit = subprocess.run(["git", "rev-parse", "--short=12", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        commit = "unknown"
    libs = f"Python {platform.python_version()}, " + ", ".join(
        f"{p} {version(p)}" for p in ("numpy", "opencv-python-headless", "pillow", "c2pa-python"))
    return commit, libs


@router.post("/evidence/{evidence_id}/examination-report")
def examination_report(evidence_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ev = get_evidence(db, evidence_id)
    if not ev.forensics_json:
        raise HTTPException(409, "Run the forensic analysis first")
    state = examination_state(db, ev)
    commit, libs = _tool_versions()
    now = fmt_ts(utcnow())
    subject = {
        "filename": ev.filename, "sha256": ev.sha256, "size": ev.size, "mime": ev.mime,
        "source": f"Case {ev.case_id[:8].upper()}, evidence item received {ev.received_at}",
        "provenance": ("Signed by an enrolled device at capture; signature and hash verified on upload."
                       if ev.provenance == "device_signed" else "Imported file: no capture signature, origin unproven."),
        "acquired_at": ev.received_at + (f" · trusted timestamp {ev.tsa_time}" if ev.tsa_time else ""),
        # The stored original is content-addressed; re-hash it now to show the copy examined is the evidence.
        "sha256_after": hashlib.sha256(storage.load(ev.storage_key)).hexdigest(),
    }
    images = {"original": storage.load(ev.storage_key), "ela": storage.load_derived(ev.id, "ela.png"),
              "copymove": storage.load_derived(ev.id, "copymove.png")}
    for c in state["comparisons"]:
        c["overlay_png"] = storage.load_derived(ev.id, c["overlay"]) if c.get("overlay") else None
    report = rates.annotate(dict(ev.forensics_json))
    pdf = build_examination(subject, report, images,
                            {"tool": "ChainProof", "commit": commit, "versions": libs, "examined_at": now, "examiner": user.name},
                            state)
    sha = hashlib.sha256(pdf).hexdigest()
    db.add(Report(case_id=ev.case_id, sha256=sha, created_by=user.id))
    append_entry(db, ev.case_id, "EXPORTED", user.id, ev.id, {"report_sha256": sha, "kind": "examination"})
    db.commit()
    return Response(pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="examination-{ev.id[:8]}.pdf"', "X-Content-SHA256": sha})
