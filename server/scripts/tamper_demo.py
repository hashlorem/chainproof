"""
For the presentation: act like an insider with direct database access and rewrite history.

    uv run python -m scripts.tamper_demo                 # edit entry #2 of the newest case
    uv run python -m scripts.tamper_demo --smart         # also recompute the entry's hash to hide the edit
    uv run python -m scripts.tamper_demo --case <id> --seq 3

Then press "Verify" in the web app: the chain shows red at the edited entry.
"""

import argparse
import json

from sqlalchemy import select, text

from app.core.chain import compute_entry_hash, entry_dict
from app.db import _SQLITE_GUARDS, SessionLocal, engine
from app.models import Case, CustodyEntry


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", help="case id (default: newest case)")
    parser.add_argument("--seq", type=int, default=2)
    parser.add_argument("--smart", action="store_true", help="recompute entry_hash so the entry looks self-consistent")
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

    print(f'Case "{case.title}" — rewriting entry #{args.seq} ({entry.action}) as a DB superuser...')
    is_sqlite = engine.dialect.name == "sqlite"
    with engine.begin() as conn:
        if is_sqlite:
            conn.execute(text("DROP TRIGGER custody_no_update"))
        else:
            conn.execute(text("ALTER TABLE custody_entries DISABLE TRIGGER custody_append_only"))
        conn.execute(
            text("UPDATE custody_entries SET details = :d, entry_hash = :h WHERE case_id = :c AND seq = :s"),
            {"d": json.dumps(forged["details"]), "h": new_hash, "c": case.id, "s": args.seq},
        )
        if is_sqlite:
            for stmt in _SQLITE_GUARDS:
                conn.execute(text(stmt))
        else:
            conn.execute(text("ALTER TABLE custody_entries ENABLE TRIGGER custody_append_only"))
    print("Done. The row is changed and the triggers are back on. Now run Verify in the app.")


if __name__ == "__main__":
    main()
