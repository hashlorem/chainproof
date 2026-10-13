from app.models import Case, Device, Evidence, User


def user_out(u: User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "role": u.role}


def device_out(d: Device) -> dict:
    return {
        "id": d.id,
        "user_id": d.user_id,
        "name": d.name,
        "public_key_hex": d.public_key_hex,
        "revoked": d.revoked,
        "enrolled_at": d.enrolled_at,
        "revoked_at": d.revoked_at,
    }


def case_out(c: Case, evidence_count: int | None = None) -> dict:
    out = {
        "id": c.id,
        "title": c.title,
        "description": c.description,
        "status": c.status,
        "created_by": c.created_by,
        "created_at": c.created_at,
        "custodian_id": c.custodian_id,
    }
    if evidence_count is not None:
        out["evidence_count"] = evidence_count
    return out


def evidence_out(e: Evidence) -> dict:
    return {
        "id": e.id,
        "case_id": e.case_id,
        "uploaded_by": e.uploaded_by,
        "device_id": e.device_id,
        "filename": e.filename,
        "mime": e.mime,
        "size": e.size,
        "sha256": e.sha256,
        "manifest": e.manifest_json,
        "signature": e.signature,
        "provenance": e.provenance,
        "received_at": e.received_at,
        "tsa_status": e.tsa_status,
        "tsa_time": e.tsa_time,
        "forensics_label": (e.forensics_json or {}).get("label"),
        "forensics_verdict": (e.forensics_json or {}).get("verdict"),
    }
