"""Hash-chained chain of custody. Each case has its own chain starting from GENESIS_HASH."""

import hashlib
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.signing import canonical, server_sign, server_verify
from app.models import Case, CustodyEntry, fmt_ts, utcnow

GENESIS_HASH = "0" * 64


def compute_entry_hash(e: dict) -> str:
    """Must match packages/shared/src/crypto.ts::computeEntryHash."""
    fields = ("seq", "case_id", "evidence_id", "action", "actor_id", "ts", "details", "prev_hash")
    return hashlib.sha256(canonical({k: e[k] for k in fields})).hexdigest()


def entry_dict(e: CustodyEntry) -> dict:
    return {
        "seq": e.seq,
        "case_id": e.case_id,
        "evidence_id": e.evidence_id,
        "action": e.action,
        "actor_id": e.actor_id,
        "ts": e.ts,
        "details": e.details,
        "prev_hash": e.prev_hash,
        "entry_hash": e.entry_hash,
        "server_sig": e.server_sig,
    }


def append_entry(
    db: Session, case_id: str, action: str, actor_id: str, evidence_id: str | None = None, details: dict | None = None
) -> CustodyEntry:
    """Adds the next link. Caller commits. Locks the case row on Postgres so two appends can't take the same seq."""
    db.execute(select(Case.id).where(Case.id == case_id).with_for_update())
    last = db.execute(
        select(CustodyEntry.seq, CustodyEntry.entry_hash)
        .where(CustodyEntry.case_id == case_id)
        .order_by(CustodyEntry.seq.desc())
        .limit(1)
    ).first()
    data = {
        "seq": (last.seq + 1) if last else 1,
        "case_id": case_id,
        "evidence_id": evidence_id,
        "action": action,
        "actor_id": actor_id,
        "ts": fmt_ts(utcnow()),
        "details": details or {},
        "prev_hash": last.entry_hash if last else GENESIS_HASH,
    }
    data["entry_hash"] = compute_entry_hash(data)
    entry = CustodyEntry(**data, server_sig=server_sign(bytes.fromhex(data["entry_hash"])))
    db.add(entry)
    db.flush()
    return entry


@dataclass
class ChainResult:
    ok: bool
    length: int
    broken_at: int | None = None
    reason: str | None = None

    def as_dict(self) -> dict:
        return {"ok": self.ok, "length": self.length, "broken_at": self.broken_at, "reason": self.reason}


def verify_entries(entries: list[dict]) -> ChainResult:
    prev = GENESIS_HASH
    for i, e in enumerate(entries, start=1):
        if e["seq"] != i:
            return ChainResult(False, len(entries), i, f"expected entry #{i}, found #{e['seq']} (an entry is missing)")
        if e["prev_hash"] != prev:
            return ChainResult(False, len(entries), i, "link to the previous entry is broken")
        if compute_entry_hash(e) != e["entry_hash"]:
            return ChainResult(False, len(entries), i, "entry content was modified after it was written")
        if not server_verify(bytes.fromhex(e["entry_hash"]), e["server_sig"]):
            return ChainResult(False, len(entries), i, "server signature is invalid (entry was forged)")
        prev = e["entry_hash"]
    return ChainResult(True, len(entries))


def load_chain(db: Session, case_id: str) -> list[dict]:
    rows = db.scalars(select(CustodyEntry).where(CustodyEntry.case_id == case_id).order_by(CustodyEntry.seq)).all()
    return [entry_dict(r) for r in rows]


def chain_length(db: Session, case_id: str) -> int:
    return db.scalar(select(func.count()).select_from(CustodyEntry).where(CustodyEntry.case_id == case_id)) or 0
