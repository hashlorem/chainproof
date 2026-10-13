from pydantic import BaseModel, EmailStr, Field

from app.models import ROLES


class LoginIn(BaseModel):
    email: str
    password: str


class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8)
    role: str = Field(pattern="^(" + "|".join(ROLES) + ")$")


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class PasswordResetIn(BaseModel):
    new_password: str = Field(min_length=8)


class DeviceIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    public_key_hex: str = Field(pattern="^[0-9a-f]{64}$")


class CaseIn(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = ""


class TransferIn(BaseModel):
    to_user_id: str
    reason: str = Field(min_length=1, max_length=500)


class ReasonIn(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class GpsIn(BaseModel):
    lat: float
    lon: float
    accuracy: float | None


class ManifestIn(BaseModel):
    """Mirror of EvidenceManifest in packages/shared/src/types.ts."""

    evidence_uuid: str = Field(pattern="^[0-9a-fA-F-]{36}$")
    case_id: str
    sha256: str = Field(pattern="^[0-9a-f]{64}$")
    mime: str
    size: int = Field(ge=0)
    captured_at: str
    gps: GpsIn | None
    device_id: str
    user_id: str
    app_version: str
