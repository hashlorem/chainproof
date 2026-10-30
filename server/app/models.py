import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, BigInteger, Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


def fmt_ts(dt: datetime) -> str:
    """The one timestamp format that gets hashed. Keep in sync with clients."""
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


# JSONB on Postgres so the immutability trigger can compare values.
JsonType = JSON().with_variant(JSONB(), "postgresql")

ROLES = ("investigator", "supervisor", "auditor")


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20))
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[str] = mapped_column(String(32), default=lambda: fmt_ts(utcnow()))


class Device(Base):
    __tablename__ = "devices"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(255))
    public_key_hex: Mapped[str] = mapped_column(String(64), unique=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    enrolled_at: Mapped[str] = mapped_column(String(32), default=lambda: fmt_ts(utcnow()))
    revoked_at: Mapped[str | None] = mapped_column(String(32), nullable=True)

    user: Mapped[User] = relationship()


class Case(Base):
    __tablename__ = "cases"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="open")
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[str] = mapped_column(String(32), default=lambda: fmt_ts(utcnow()))
    custodian_id: Mapped[str] = mapped_column(ForeignKey("users.id"))


class Evidence(Base):
    __tablename__ = "evidence"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # = manifest.evidence_uuid, chosen on the phone
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), index=True)
    uploaded_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    device_id: Mapped[str | None] = mapped_column(ForeignKey("devices.id"), nullable=True)
    filename: Mapped[str] = mapped_column(String(255))
    mime: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    storage_key: Mapped[str] = mapped_column(String(255))
    manifest_json: Mapped[dict] = mapped_column(JsonType)
    signature: Mapped[str | None] = mapped_column(String(128), nullable=True)
    provenance: Mapped[str] = mapped_column(String(20))  # "device_signed" | "imported"
    received_at: Mapped[str] = mapped_column(String(32), default=lambda: fmt_ts(utcnow()))
    # Filled in after upload, so these stay mutable:
    tsa_token_b64: Mapped[str | None] = mapped_column(Text, nullable=True)
    tsa_time: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tsa_status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | stamped | failed | disabled
    forensics_json: Mapped[dict | None] = mapped_column(JsonType, nullable=True)
    # Perceptual hash of images (app/forensics/similarity.py): finds copies of this evidence that were re-saved or edited.
    phash: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)


class CustodyEntry(Base):
    __tablename__ = "custody_entries"
    __table_args__ = (UniqueConstraint("case_id", "seq"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    evidence_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    action: Mapped[str] = mapped_column(String(20))
    actor_id: Mapped[str] = mapped_column(String(36))
    ts: Mapped[str] = mapped_column(String(32))
    details: Mapped[dict] = mapped_column(JsonType)
    prev_hash: Mapped[str] = mapped_column(String(64))
    entry_hash: Mapped[str] = mapped_column(String(64))
    server_sig: Mapped[str] = mapped_column(String(128))


class Report(Base):
    """Every exported PDF is hashed and recorded, so a printed or emailed copy can be checked later."""

    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), index=True)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[str] = mapped_column(String(32), default=lambda: fmt_ts(utcnow()))
