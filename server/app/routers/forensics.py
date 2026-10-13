import base64
import hashlib

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from PIL import UnidentifiedImageError
from sqlalchemy.orm import Session

from app import storage
from app.core.chain import append_entry
from app.core.security import current_user, require_role
from app.core.signing import verify_manifest
from app.db import get_db
from app.forensics.verdict import run_all, split_images
from app.models import Device, Evidence, User
from app.routers.evidence import get_evidence

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
    for name, b64 in images.items():
        storage.save_derived(ev.id, f"{name}.png", base64.b64decode(b64))
    ev.forensics_json = report
    append_entry(db, ev.case_id, "ANALYZED", user.id, ev.id, {"verdict": report["verdict"], "score": report["score"]})
    db.commit()
    return report


@router.get("/evidence/{evidence_id}/forensics/{name}.png")
def forensic_image(evidence_id: str, name: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    """Derived overlays are copies made by the server, so viewing them is not logged as evidence access."""
    get_evidence(db, evidence_id)
    if name not in ("ela", "copymove"):
        raise HTTPException(404)
    data = storage.load_derived(evidence_id, f"{name}.png")
    if data is None:
        raise HTTPException(404, "Run the analysis first")
    return Response(data, media_type="image/png")


@router.post("/forensics/analyze")
async def analyze_any(file: UploadFile = File(...), _: User = Depends(current_user)):
    """'Check a photo': analyse any image without adding it to a case. Nothing is stored."""
    data = await file.read()
    if len(data) > MAX_ANALYZE:
        raise HTTPException(413, "Image too large")
    return _run(data, file.content_type or "image/jpeg")
