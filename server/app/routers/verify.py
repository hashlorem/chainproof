import hashlib

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import storage
from app.core import tsa
from app.core.chain import append_entry, load_chain, verify_entries
from app.config import settings
from app.core.security import client_ip, current_user, public_limiter
from app.core.signing import server_public_key_hex, verify_manifest
from app.db import get_db
from app.models import Case, Device, Evidence, Report, User
from app.routers.cases import get_case

router = APIRouter(tags=["verify"])


def public_rate_limit(request: Request) -> None:
    """Public lookups need no account, so cap them per visitor (TM-005)."""
    if wait := public_limiter.hit(client_ip(request), settings.public_verify_per_minute):
        raise HTTPException(429, "Too many checks. Try again in a minute.", headers={"Retry-After": str(wait)})


def check_evidence(db: Session, ev: Evidence) -> dict:
    """Re-checks one item from scratch: stored bytes, device signature, trusted timestamp."""
    checks: dict[str, dict] = {}

    if storage.exists(ev.storage_key):
        actual = hashlib.sha256(storage.load(ev.storage_key)).hexdigest()
        checks["file_hash"] = {"ok": actual == ev.sha256, "detail": "stored file matches its recorded hash" if actual == ev.sha256 else f"stored file hash is {actual}"}
    else:
        checks["file_hash"] = {"ok": False, "detail": "stored file is missing"}

    if ev.provenance == "device_signed":
        device = db.get(Device, ev.device_id)
        sig_ok = device is not None and verify_manifest(ev.manifest_json, ev.signature or "", device.public_key_hex)
        hash_ok = ev.manifest_json.get("sha256") == ev.sha256
        detail = "signed at capture by an enrolled device" if sig_ok and hash_ok else "manifest or signature does not verify"
        if sig_ok and device.revoked:
            detail += f" (device revoked later, at {device.revoked_at})"
        checks["device_signature"] = {"ok": sig_ok and hash_ok, "detail": detail}
    else:
        checks["device_signature"] = {"ok": None, "detail": "imported file: no capture signature"}

    if ev.tsa_status == "stamped":
        ok = tsa.check_timestamp(ev.tsa_token_b64, ev.sha256)
        checks["trusted_timestamp"] = {"ok": ok, "detail": f"existed by {ev.tsa_time} (RFC 3161)" if ok else "timestamp token does not verify"}
    else:
        checks["trusted_timestamp"] = {"ok": None, "detail": f"timestamp {ev.tsa_status}"}

    ok = all(c["ok"] is not False for c in checks.values())
    return {"evidence_id": ev.id, "filename": ev.filename, "sha256": ev.sha256, "ok": ok, "checks": checks}


def verify_case(db: Session, case_id: str) -> dict:
    chain = verify_entries(load_chain(db, case_id))
    evidence = db.scalars(select(Evidence).where(Evidence.case_id == case_id).order_by(Evidence.received_at)).all()
    items = [check_evidence(db, ev) for ev in evidence]
    return {"ok": chain.ok and all(i["ok"] for i in items), "chain": chain.as_dict(), "evidence": items}


@router.post("/cases/{case_id}/verify")
def verify(case_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_case(db, case_id)
    report = verify_case(db, case_id)
    # Only append to a healthy chain: adding links after a break would bury the evidence of tampering.
    if report["chain"]["ok"]:
        failed = [i["evidence_id"] for i in report["evidence"] if not i["ok"]]
        append_entry(db, case_id, "VERIFIED", user.id, details={"ok": report["ok"], "failed_evidence": failed})
        db.commit()
    return report


@router.get("/public/server-key")
def public_server_key():
    return {"algorithm": "Ed25519", "public_key_hex": server_public_key_hex()}


def public_lookup(db: Session, sha: str) -> dict:
    matches = db.scalars(select(Evidence).where(Evidence.sha256 == sha)).all()
    report = db.scalar(select(Report).where(Report.sha256 == sha))
    if report:
        return {"sha256": sha, "found": True, "kind": "report", "report": {
            "case_reference": report.case_id[:8].upper(), "generated_at": report.created_at}}
    if not matches:
        return {"sha256": sha, "found": False}
    results = []
    for ev in matches:
        case = db.get(Case, ev.case_id)
        check = check_evidence(db, ev)
        chain = verify_entries(load_chain(db, ev.case_id))
        results.append({
            "evidence_id": ev.id,
            "case_reference": case.id[:8].upper(),  # not the title: the public page should not leak case details
            "received_at": ev.received_at,
            "captured_at": ev.manifest_json.get("captured_at"),
            "provenance": ev.provenance,
            "tsa_time": ev.tsa_time,
            "intact": check["ok"] and chain.ok,
            "checks": check["checks"] | {"chain_of_custody": {"ok": chain.ok, "detail": "intact" if chain.ok else chain.reason}},
        })
    return {"sha256": sha, "found": True, "kind": "evidence", "matches": results}


@router.get("/public/verify/{sha256}", dependencies=[Depends(public_rate_limit)])
def public_verify_hash(sha256: str, db: Session = Depends(get_db)):
    sha = sha256.lower()
    if len(sha) != 64 or any(c not in "0123456789abcdef" for c in sha):
        raise HTTPException(422, "Not a SHA-256 hash")
    return public_lookup(db, sha)


@router.post("/public/verify", dependencies=[Depends(public_rate_limit)])
async def public_verify_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Anyone holding a copy of the file can check it against the record. The file is hashed in chunks, never stored.
    The body size is capped before this runs (main.CapUploads); the web page hashes in the browser and uses the GET.
    """
    h = hashlib.sha256()
    while chunk := await file.read(1 << 20):
        h.update(chunk)
    return public_lookup(db, h.hexdigest())
