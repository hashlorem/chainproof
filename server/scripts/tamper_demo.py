"""
For the presentation: act like an insider with direct database access and rewrite history.

    uv run python -m scripts.tamper_demo                 # edit entry #2 of the newest case
    uv run python -m scripts.tamper_demo --smart         # also recompute the entry's hash to hide the edit
    uv run python -m scripts.tamper_demo --case <id> --seq 3
    uv run python -m scripts.tamper_demo --resign        # the laptop's owner: also re-hash and re-sign every later entry

Then press "Verify" in the web app: the chain shows red at the edited entry. With --resign the chain itself checks out,
because the forger holds the server key; only the trusted-timestamp anchors (app/core/anchor.py) give it away, so press
Verify or export a report once before running it.
"""

import argparse
import json

from sqlalchemy import select, text

from app.core.chain import compute_entry_hash, entry_dict, load_chain
from app.core.signing import server_sign
from app.db import SessionLocal, custody_guards_disabled, engine
from app.models import Case, CustodyEntry


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", help="case id (default: newest case)")
    parser.add_argument("--seq", type=int, default=2)
    parser.add_argument("--smart", action="store_true", help="recompute entry_hash so the entry looks self-consistent")
    parser.add_argument("--resign", action="store_true", help="re-hash and re-sign every entry from --seq on, with the server key")
    args = parser.parse_args()

    with SessionLocal() as db:
        case = db.get(Case, args.case) if args.case else db.scalar(select(Case).order_by(Case.created_at.desc()))
        if case is None:
            raise SystemExit("No case found")
        entry = db.scalar(select(CustodyEntry).where(CustodyEntry.case_id == case.id, CustodyEntry.seq == args.seq))
        if entry is None:
            raise SystemExit(f"Case has no entry #{args.seq}")
        forged = entry_dict(entry)
        forged["details"] = forged["details"] | {"note": "evidence was never here"}
        new_hash = compute_entry_hash(forged) if args.smart else entry.entry_hash
        entries = load_chain(db, case.id) if args.resign else None
    if entries:
        return resign(case, args.seq, entries, forged["details"])

    print(f'Case "{case.title}" — rewriting entry #{args.seq} ({entry.action}) as a DB superuser...')
    with engine.begin() as conn, custody_guards_disabled(conn):
        conn.execute(
            text("UPDATE custody_entries SET details = :d, entry_hash = :h WHERE case_id = :c AND seq = :s"),
            {"d": json.dumps(forged["details"]), "h": new_hash, "c": case.id, "s": args.seq},
        )
    print("Done. The row is changed and the triggers are back on. Now run Verify in the app.")


def resign(case, seq: int, entries: list[dict], details: dict) -> None:
    print(f'Case "{case.title}" — rewriting entry #{seq} and re-signing the {len(entries) - seq + 1} entries from it on...')
    prev = None
    with engine.begin() as conn, custody_guards_disabled(conn):
        for e in entries:
            if e["seq"] < seq:
                prev = e["entry_hash"]
                continue
            e = e | {"prev_hash": prev or e["prev_hash"]} | ({"details": details} if e["seq"] == seq else {})
            e["entry_hash"] = compute_entry_hash(e)
            conn.execute(
                text("UPDATE custody_entries SET details = :d, prev_hash = :p, entry_hash = :h, server_sig = :s "
                     "WHERE case_id = :c AND seq = :q"),
                {"d": json.dumps(e["details"]), "p": e["prev_hash"], "h": e["entry_hash"],
                 "s": server_sign(bytes.fromhex(e["entry_hash"])), "c": case.id, "q": e["seq"]},
            )
            prev = e["entry_hash"]
    print("Done. Every hash and signature checks out again. Now run Verify: only the anchors can catch this.")


if __name__ == "__main__":
    main()
