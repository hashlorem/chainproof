import copy
import hashlib
import io
import json
import logging
import uuid
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Response, UploadFile
from PIL import Image, ImageOps
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app import storage
from app.config import settings
from app.core import tsa
from app.core.chain import append_entry
from app.core.security import current_user, require_role
from app.core.signing import verify_manifest
from app.forensics import alternatives
from app.forensics.similarity import image_phash
from app.db import SessionLocal, get_db
from app.models import Device, Evidence, User
from app.routers.cases import get_case
from app.schemas import ManifestIn
from app.serializers import evidence_out

router = APIRouter(tags=["evidence"])
log = logging.getLogger(__name__)

MAX_UPLOAD = 200 * 1024 * 1024


def stamp_evidence(evidence_id: str) -> None:
    """Runs after the upload response, so a slow TSA never blocks the phone."""
    with SessionLocal() as db:
        ev = db.get(Evidence, evidence_id)
        if ev is None or ev.tsa_status == "stamped":
            return
        try:
            ev.tsa_token_b64, ev.tsa_time = tsa.request_timestamp(ev.sha256)
            ev.tsa_status = "stamped"
            append_entry(db, ev.case_id, "TIMESTAMPED", "system", ev.id, {"tsa": settings.tsa_url, "tsa_time": ev.tsa_time})
        except Exception as exc:
            log.warning("Timestamping %s failed: %s", evidence_id, exc)
            ev.tsa_status = "failed"
        db.commit()


@router.post("/cases/{case_id}/evidence", status_code=201)
async def upload_evidence(
    case_id: str,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    manifest: str | None = Form(None),
    signature: str | None = Form(None),
    user: User = Depends(require_role("investigator", "supervisor")),
    db: Session = Depends(get_db),
):
    """
    Two kinds of upload:
    - Device-signed (phone): manifest + signature made at capture time. Every field is checked against the file and the device key.
    - Imported (web): no manifest. The server records the hash on arrival, so provenance before upload is unknown.
    """
    case = get_case(db, case_id)
    if case.status != "open":
        raise HTTPException(409, "Case is closed")
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "File too large")
    sha = hashlib.sha256(data).hexdigest()
    mime = file.content_type or "application/octet-stream"

    device: Device | None = None
    if manifest is not None:
        try:
            m = ManifestIn.model_validate_json(manifest)
        except ValidationError as exc:
            raise HTTPException(422, f"Invalid manifest: {exc.errors()[0]['msg']}")
        manifest_dict = json.loads(manifest)  # verify the exact signed values, not a re-serialized model
        if m.sha256 != sha:
            raise HTTPException(422, "File hash does not match the signed manifest (file changed after capture)")
        if m.size != len(data):
            raise HTTPException(422, "File size does not match the signed manifest")
        if m.case_id != case_id:
            raise HTTPException(422, "Manifest is for a different case")
        if m.user_id != user.id:
            raise HTTPException(403, "Manifest was signed for a different user")
        device = db.get(Device, m.device_id)
        if device is None or device.user_id != user.id:
            raise HTTPException(403, "Unknown device")
        if device.revoked:
            raise HTTPException(403, "This device has been revoked")
        if not signature or not verify_manifest(manifest_dict, signature, device.public_key_hex):
            raise HTTPException(422, "Device signature is invalid")
        evidence_id, provenance = m.evidence_uuid.lower(), "device_signed"
    else:
        evidence_id, provenance = str(uuid.uuid4()), "imported"
        manifest_dict = {"sha256": sha, "mime": mime, "size": len(data), "source": "web import"}
        signature = None

    if db.get(Evidence, evidence_id):
        raise HTTPException(409, "This evidence was already uploaded")

    ev = Evidence(
        id=evidence_id,
        case_id=case_id,
        uploaded_by=user.id,
        device_id=device.id if device else None,
        filename=(file.filename or "evidence")[:255],
        mime=mime,
        size=len(data),
        sha256=sha,
        storage_key=storage.save(sha, data),
        manifest_json=manifest_dict,
        signature=signature,
        provenance=provenance,
        tsa_status="pending" if settings.tsa_enabled else "disabled",
        phash=image_phash(data) if mime.startswith("image/") else None,
    )
    db.add(ev)
    db.flush()
    if device:
        append_entry(
            db, case_id, "CAPTURED", user.id, ev.id,
            {"device_id": device.id, "captured_at": manifest_dict["captured_at"], "gps": manifest_dict["gps"]},
        )
    append_entry(db, case_id, "UPLOADED", user.id, ev.id, {"sha256": sha, "size": len(data), "provenance": provenance})
    db.commit()
    if settings.tsa_enabled:
        background.add_task(stamp_evidence, ev.id)
    return evidence_out(ev)


def get_evidence(db: Session, evidence_id: str) -> Evidence:
    ev = db.get(Evidence, evidence_id)
    if ev is None:
        raise HTTPException(404, "Evidence not found")
    return ev


@router.get("/evidence/{evidence_id}")
def evidence_detail(evidence_id: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    ev = get_evidence(db, evidence_id)
    out = evidence_out(ev)
    if ev.device_id:
        device = db.get(Device, ev.device_id)
        out["device"] = {"id": device.id, "name": device.name, "revoked": device.revoked}
    # Reports stored before "what else explains it" existed get it on the way out; the stored record is untouched.
    out["forensics"] = alternatives.annotate(copy.deepcopy(ev.forensics_json)) if ev.forensics_json else None
    return out


@router.get("/evidence/{evidence_id}/file")
def evidence_file(
    evidence_id: str, purpose: str = "view", user: User = Depends(current_user), db: Session = Depends(get_db)
):
    """Every access to the original file is written to the chain of custody."""
    ev = get_evidence(db, evidence_id)
    action = "DOWNLOADED" if purpose == "download" else "VIEWED"
    append_entry(db, ev.case_id, action, user.id, ev.id)
    db.commit()
    # Uploaded files are untrusted: only media and PDFs may display inline (never HTML or SVG, which can run
    # script), and the sandbox CSP blocks script even if someone opens the file directly.
    inline_ok = ev.mime.startswith(("image/", "video/", "audio/")) and ev.mime != "image/svg+xml" or ev.mime == "application/pdf"
    disposition = "inline" if action == "VIEWED" and inline_ok else "attachment"
    return Response(
        storage.load(ev.storage_key),
        media_type=ev.mime if inline_ok else "application/octet-stream",
        headers={
            "Content-Disposition": f"{disposition}; filename=\"{safe_filename(ev.filename)}\"; filename*=UTF-8''{quote(ev.filename)}",
            "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
            "X-Content-SHA256": ev.sha256,
        },
    )


def safe_filename(name: str) -> str:
    """ASCII fallback for Content-Disposition: no quotes, slashes or control characters."""
    cleaned = "".join(c if c.isascii() and c.isprintable() and c not in '"\\/;' else "_" for c in name)
    return cleaned.strip(" .") or "evidence"


@router.get("/evidence/{evidence_id}/thumbnail.jpg")
def evidence_thumbnail(evidence_id: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    """A small derived copy for lists. It is not the evidence itself, so viewing it is not logged."""
    ev = get_evidence(db, evidence_id)
    if not ev.mime.startswith("image/"):
        raise HTTPException(404, "No thumbnail for this file type")
    thumb = storage.load_derived(ev.id, "thumb.jpg")
    if thumb is None:
        try:
            img = ImageOps.exif_transpose(Image.open(io.BytesIO(storage.load(ev.storage_key)))).convert("RGB")
        except OSError:
            raise HTTPException(404, "Could not read image")
        img.thumbnail((480, 480))
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=80)
        thumb = buf.getvalue()
        storage.save_derived(ev.id, "thumb.jpg", thumb)
    return Response(thumb, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"})


@router.post("/evidence/{evidence_id}/timestamp")
def retry_timestamp(evidence_id: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    ev = get_evidence(db, evidence_id)
    if not settings.tsa_enabled:
        raise HTTPException(409, "Timestamping is disabled on this server")
    stamp_evidence(ev.id)
    db.refresh(ev)
    return evidence_out(ev)
