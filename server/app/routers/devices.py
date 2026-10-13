from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import current_user, require_role
from app.db import get_db
from app.models import Device, User, fmt_ts, utcnow
from app.schemas import DeviceIn
from app.serializers import device_out

router = APIRouter(prefix="/devices", tags=["devices"])


@router.post("", status_code=201)
def enroll(body: DeviceIn, user: User = Depends(require_role("investigator", "supervisor")), db: Session = Depends(get_db)):
    if db.scalar(select(Device).where(Device.public_key_hex == body.public_key_hex)):
        raise HTTPException(409, "This key is already enrolled")
    device = Device(user_id=user.id, name=body.name, public_key_hex=body.public_key_hex)
    db.add(device)
    db.commit()
    return device_out(device)


@router.get("")
def list_devices(user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Device).order_by(Device.enrolled_at.desc())
    if user.role == "investigator":
        q = q.where(Device.user_id == user.id)
    return [device_out(d) | {"user_name": d.user.name} for d in db.scalars(q)]


@router.post("/{device_id}/revoke")
def revoke(device_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    device = db.get(Device, device_id)
    if device is None:
        raise HTTPException(404, "Device not found")
    if user.role != "supervisor" and device.user_id != user.id:
        raise HTTPException(403, "Only the owner or a supervisor can revoke a device")
    if not device.revoked:
        device.revoked = True
        device.revoked_at = fmt_ts(utcnow())
        db.commit()
    return device_out(device)
