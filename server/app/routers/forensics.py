import base64
import hashlib

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import storage
from app.core.chain import append_entry
from app.core.security import current_user, require_role
from app.core.signing import verify_manifest
from app.db import get_db
from app.forensics import alternatives, rates
from app.forensics.common import open_rgb
from app.forensics.similarity import MATCH_DISTANCE, SAME_SCENE, VERIFY_DISTANCE, closest, compare, image_phash, phash, phashes, same_scene
from app.forensics.verdict import run_all, split_images
from app.models import Case, CustodyEntry, Device, Evidence, User
from app.routers.evidence import get_evidence, safe_filename

router = APIRouter(tags=["forensics"])
MAX_ANALYZE = 40 * 1024 * 1024


def _run(data: bytes, mime: str, provenance_verified: bool = False) -> dict:
    if not mime.startswith("image/"):
        raise HTTPException(415, "Forensic analysis works on images only")
    try:
        return run_all(data, mime, provenance_verified)
    except (UnidentifiedImageError, OSError):
        raise HTTPException(415, "Could not read this image")


def _provenance_verified(db: Session, ev: Evidence, data: bytes) -> bool:
    if ev.provenance != "device_signed":
        return False
    device = db.get(Device, ev.device_id)
    return (
        device is not None
        and hashlib.sha256(data).hexdigest() == ev.sha256 == ev.manifest_json.get("sha256")
        and verify_manifest(ev.manifest_json, ev.signature or "", device.public_key_hex)
    )


@router.post("/evidence/{evidence_id}/analyze")
def analyze_evidence(
    evidence_id: str, user: User = Depends(require_role("investigator", "supervisor")), db: Session = Depends(get_db)
):
    ev = get_evidence(db, evidence_id)
    data = storage.load(ev.storage_key)
    report, images = split_images(_run(data, ev.mime, _provenance_verified(db, ev, data)))
    for filename, b64 in images.items():
        storage.save_derived(ev.id, filename, base64.b64decode(b64))
    ev.forensics_json = report
    append_entry(db, ev.case_id, "ANALYZED", user.id, ev.id, {"verdict": report["verdict"], "score": report["score"]})
    db.commit()
    return report


FORENSIC_IMAGES = {"ela.png": "image/png", "copymove.jpg": "image/jpeg", "copymove.png": "image/png"}


@router.get("/evidence/{evidence_id}/forensics/{filename}")
def forensic_image(evidence_id: str, filename: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    """Derived overlays are copies made by the server, so viewing them is not logged as evidence access."""
    get_evidence(db, evidence_id)
    if filename not in FORENSIC_IMAGES:
        raise HTTPException(404)
    data = storage.load_derived(evidence_id, filename)
    if data is None:
        raise HTTPException(404, "Run the analysis first")
    return Response(data, media_type=FORENSIC_IMAGES[filename])


@router.post("/forensics/analyze")
async def analyze_any(file: UploadFile = File(...), _: User = Depends(current_user)):
    """'Check a photo': analyse any image without adding it to a case. Nothing is stored."""
    data = await file.read()
    if len(data) > MAX_ANALYZE:
        raise HTTPException(413, "Image too large")
    return _run(data, file.content_type or "image/jpeg")


def _backfill_phash(db: Session) -> None:
    """Evidence uploaded before perceptual hashes existed gets one the first time anyone searches."""
    for ev in db.scalars(select(Evidence).where(Evidence.phash.is_(None), Evidence.mime.like("image/%"))):
        ev.phash = image_phash(storage.load(ev.storage_key)) or ""
    db.commit()


def _questioned(data: bytes) -> Image.Image:
    try:
        return open_rgb(data)
    except (UnidentifiedImageError, OSError):
        raise HTTPException(415, "Could not read this image")


@router.post("/forensics/match")
async def match_evidence(file: UploadFile = File(...), _: User = Depends(current_user), db: Session = Depends(get_db)):
    """
    Is this photo a copy of something we hold as evidence? Compares its perceptual hash with every evidence image.
    Investigators only: a public version would let anyone probe whether a given photo is held as evidence.
    """
    data = await file.read()
    if len(data) > MAX_ANALYZE:
        raise HTTPException(413, "Image too large")
    questioned = _questioned(data)
    hashes = phashes(questioned)
    _backfill_phash(db)
    sha = hashlib.sha256(data).hexdigest()
    cases = {c.id: c.title for c in db.scalars(select(Case))}
    found = []
    for ev in db.scalars(select(Evidence).where(Evidence.phash.is_not(None), Evidence.phash != "")):
        d = closest(hashes, ev.phash)
        kind, points = None, None
        if d <= MATCH_DISTANCE:
            kind = "match"
        elif d <= VERIFY_DISTANCE:
            # Borderline: confirm with scene geometry against the original before calling it a copy.
            points = same_scene(open_rgb(storage.load(ev.storage_key)), questioned)
            kind = "edited_copy" if points >= SAME_SCENE else None
        if kind:
            found.append({"evidence_id": ev.id, "case_id": ev.case_id, "case_title": cases.get(ev.case_id), "filename": ev.filename,
                          "received_at": ev.received_at, "distance": d, "kind": kind, "scene_points": points,
                          "identical": ev.sha256 == sha})
    found.sort(key=lambda m: (not m["identical"], m["distance"]))
    return {"sha256": sha, "matches": found, "threshold": MATCH_DISTANCE, "validation": rates.describe_matching()}


@router.post("/evidence/{evidence_id}/compare")
async def compare_with_evidence(evidence_id: str, file: UploadFile = File(...), user: User = Depends(current_user),
                                db: Session = Depends(get_db)):
    """Lines a questioned copy up with this evidence item's original and maps what changed. Logged as COMPARED."""
    ev = get_evidence(db, evidence_id)
    if not ev.mime.startswith("image/"):
        raise HTTPException(415, "Only images can be compared")
    data = await file.read()
    if len(data) > MAX_ANALYZE:
        raise HTTPException(413, "Image too large")
    questioned = _questioned(data)
    original = open_rgb(storage.load(ev.storage_key))
    try:
        result = compare(original, questioned)
    except ValueError as e:
        raise HTTPException(422, f"Could not compare: {e}")
    sha = hashlib.sha256(data).hexdigest()
    alternatives.annotate(result)
    result |= {"questioned_sha256": sha, "distance": closest(phashes(questioned), phash(original)),
               "validation": rates.describe_difference()}
    # Keep the difference map with the evidence (like the ELA heatmap) so the examination report can show it, and
    # keep the questioned copy itself: it is now an exhibit, and without it nobody could repeat the comparison.
    # The copy goes in the same content-addressed, read-only store as the originals, under its own hash.
    overlay = f"compare-{sha[:16]}.png"
    storage.save_derived(ev.id, overlay, base64.b64decode(result["overlay_png"]))
    storage.save(sha, data)
    append_entry(db, ev.case_id, "COMPARED", user.id, ev.id, {
        "questioned_sha256": sha, "questioned_filename": (file.filename or "")[:200], "distance": result["distance"],
        "changed_ratio": result["changed_ratio"], "regions": len(result["regions"]), "aligned": result["aligned"],
        "overlay": overlay, "kept": True})
    db.commit()
    return result


@router.get("/evidence/{evidence_id}/compared/{sha256}")
def compared_copy(evidence_id: str, sha256: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """A questioned copy kept from a comparison. Downloading it is logged like the original, and it is re-hashed first."""
    ev = get_evidence(db, evidence_id)
    entry = next((e for e in db.scalars(select(CustodyEntry).where(CustodyEntry.evidence_id == ev.id, CustodyEntry.action == "COMPARED"))
                  if e.details.get("questioned_sha256") == sha256 and e.details.get("kept")), None)
    data = storage.load(sha256) if entry and storage.exists(sha256) else None
    if data is None:
        raise HTTPException(404, "No kept copy with that hash (comparisons before 1 Nov 2026 kept only the hash)")
    if hashlib.sha256(data).hexdigest() != sha256:
        raise HTTPException(409, "The kept copy no longer matches the hash recorded when it was compared")
    append_entry(db, ev.case_id, "DOWNLOADED", user.id, ev.id, {"compared_copy": sha256})
    db.commit()
    name = entry.details.get("questioned_filename") or f"copy-{sha256[:12]}"
    return Response(data, media_type="application/octet-stream", headers={
        "Content-Disposition": f'attachment; filename="{safe_filename(name)}"', "X-Content-SHA256": sha256})
