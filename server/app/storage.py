"""Content-addressed file store: a file's key is its SHA-256, so it can't be silently swapped."""

from pathlib import Path

from app.config import settings


def _path(key: str) -> Path:
    return settings.storage_dir / "objects" / key[:2] / key


def save(sha256_hex: str, data: bytes) -> str:
    path = _path(sha256_hex)
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_bytes(data)
        tmp.replace(path)
        path.chmod(0o444)
    return sha256_hex


def load(key: str) -> bytes:
    return _path(key).read_bytes()


def exists(key: str) -> bool:
    return _path(key).exists()


def _derived_path(evidence_id: str, name: str) -> Path:
    return settings.storage_dir / "derived" / evidence_id / name


def save_derived(evidence_id: str, name: str, data: bytes) -> None:
    """Derived files (thumbnails, forensic overlays) live apart from originals and may be regenerated."""
    path = _derived_path(evidence_id, name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def load_derived(evidence_id: str, name: str) -> bytes | None:
    path = _derived_path(evidence_id, name)
    return path.read_bytes() if path.exists() else None
