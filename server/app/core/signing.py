"""Ed25519 signatures. Device signatures must verify exactly like packages/shared/src/crypto.ts."""

from functools import lru_cache

import rfc8785
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from app.config import settings


def canonical(value) -> bytes:
    return rfc8785.dumps(value)


def verify_manifest(manifest: dict, signature_hex: str, public_key_hex: str) -> bool:
    try:
        key = Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_key_hex))
        key.verify(bytes.fromhex(signature_hex), canonical(manifest))
        return True
    except (InvalidSignature, ValueError):
        return False


@lru_cache
def server_key() -> Ed25519PrivateKey:
    """The server's own key. It signs every custody entry so a database edit can't forge a valid entry."""
    path = settings.storage_dir / "server_ed25519.pem"
    if path.exists():
        return serialization.load_pem_private_key(path.read_bytes(), password=None)
    path.parent.mkdir(parents=True, exist_ok=True)
    key = Ed25519PrivateKey.generate()
    path.write_bytes(
        key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    )
    path.chmod(0o600)
    return key


def server_public_key_hex() -> str:
    return server_key().public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw).hex()


def server_sign(message: bytes) -> str:
    return server_key().sign(message).hex()


def server_verify(message: bytes, signature_hex: str) -> bool:
    try:
        server_key().public_key().verify(bytes.fromhex(signature_hex), message)
        return True
    except (InvalidSignature, ValueError):
        return False
