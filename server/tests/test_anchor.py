"""
Anchoring the custody log to a trusted timestamp (TM-001). FreeTSA is replaced by a stand-in here so the tests run
offline; test_tsa.py checks a real FreeTSA token.
"""

import pytest

from app.config import settings
from app.core import tsa
from app.core.anchor import check_anchors
from app.core.chain import compute_entry_hash, load_chain, verify_entries
from app.core.signing import server_sign
from app.db import SessionLocal
from app.models import fmt_ts, utcnow
from tests.test_forensics import jpeg, scene


@pytest.fixture
def fake_tsa(monkeypatch):
    """A stand-in TSA: tokens are bound to their hash, and the clock can be moved to play a rewrite done later."""
    clock = {"now": None}
    monkeypatch.setattr(settings, "tsa_enabled", True)
    monkeypatch.setattr(tsa, "request_timestamp", lambda h: (f"token:{h}", clock["now"] or fmt_ts(utcnow())))
    monkeypatch.setattr(tsa, "check_timestamp", lambda token, h: token == f"token:{h}")
    return clock


def chain(case_id):
    with SessionLocal() as db:
        return load_chain(db, case_id)


def test_verify_anchors_the_log(client, investigator, phone, case_id, fake_tsa):
    phone.upload(case_id, jpeg(scene()))
    r = client.post(f"/cases/{case_id}/verify", headers=investigator["headers"]).json()
    entries = chain(case_id)
    anchor = entries[-1]
    assert anchor["action"] == "ANCHORED" and entries[-2]["action"] == "VERIFIED"
    assert anchor["details"]["head_seq"] == entries[-2]["seq"]
    assert anchor["details"]["head_hash"] == entries[-2]["entry_hash"]
    assert r["anchors"]["ok"] is True and r["anchors"]["latest"]["head_seq"] == entries[-2]["seq"]


def test_report_prints_the_anchor_that_covers_it(client, investigator, phone, case_id, fake_tsa):
    phone.upload(case_id, jpeg(scene()))
    assert client.post(f"/cases/{case_id}/report", headers=investigator["headers"]).status_code == 200
    actions = [e["action"] for e in chain(case_id)]
    assert actions[-2:] == ["ANCHORED", "EXPORTED"]


def test_no_tsa_still_works(client, investigator, phone, case_id, monkeypatch):
    monkeypatch.setattr(settings, "tsa_enabled", True)
    monkeypatch.setattr(tsa, "request_timestamp", lambda h: (_ for _ in ()).throw(OSError("FreeTSA unreachable")))
    phone.upload(case_id, jpeg(scene()))
    r = client.post(f"/cases/{case_id}/verify", headers=investigator["headers"]).json()
    assert r["ok"] and r["anchors"]["ok"] is None
    assert "ANCHORED" not in [e["action"] for e in chain(case_id)]


def resign_from(entries, seq, change):
    """What the laptop's owner can do: edit an old entry, then recompute and re-sign everything after it."""
    out, prev = [], None
    for e in entries:
        e = dict(e)
        if e["seq"] == seq:
            change(e)
        if prev is not None:
            e["prev_hash"] = prev
        if e["seq"] >= seq:
            e["entry_hash"] = compute_entry_hash(e)
            e["server_sig"] = server_sign(bytes.fromhex(e["entry_hash"]))
        prev = e["entry_hash"]
        out.append(e)
    return out


def test_rewrite_with_the_server_key_is_caught_by_the_anchor(client, investigator, phone, case_id, fake_tsa):
    phone.upload(case_id, jpeg(scene()))
    client.post(f"/cases/{case_id}/verify", headers=investigator["headers"])
    forged = resign_from(chain(case_id), 2, lambda e: e.update(details=e["details"] | {"sha256": "0" * 64}))
    assert verify_entries(forged).ok  # the hash chain and signatures alone can't see it
    result = check_anchors(forged)
    assert result["ok"] is False and "rewritten" in result["problems"][0]


def test_re_anchoring_a_rewrite_shows_the_later_date(client, investigator, phone, case_id, fake_tsa):
    phone.upload(case_id, jpeg(scene()))
    client.post(f"/cases/{case_id}/verify", headers=investigator["headers"])
    entries = chain(case_id)
    a = entries[-1]["seq"]

    def rewrite(e):
        e["details"] = e["details"] | {"sha256": "0" * 64}

    forged = resign_from(entries, 2, rewrite)
    # The forger gets a fresh, genuine token for the new hash, but the TSA dates it to the day of the rewrite.
    head = forged[a - 2]
    forged[a - 1] = dict(forged[a - 1], details=forged[a - 1]["details"] | {
        "head_hash": head["entry_hash"], "token_b64": f"token:{head['entry_hash']}", "tsa_time": "2027-03-01T09:00:00.000000Z"})
    forged = resign_from(forged, a, lambda e: None)
    assert verify_entries(forged).ok
    result = check_anchors(forged)
    assert result["ok"] is False and "after the fact" in result["problems"][0]


def test_broken_chain_is_not_anchored(client, investigator, phone, case_id, fake_tsa):
    from sqlalchemy import text

    from app.db import custody_guards_disabled, engine

    phone.upload(case_id, jpeg(scene()))
    with engine.begin() as conn, custody_guards_disabled(conn):
        conn.execute(text("UPDATE custody_entries SET details = '{\"x\": 1}' WHERE case_id = :c AND seq = 1"), {"c": case_id})
    r = client.post(f"/cases/{case_id}/verify", headers=investigator["headers"]).json()
    assert not r["chain"]["ok"]
    assert "ANCHORED" not in [e["action"] for e in chain(case_id)]
