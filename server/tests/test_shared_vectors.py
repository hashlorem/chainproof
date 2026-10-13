"""The phone signs in TypeScript and the server verifies in Python: both must agree byte for byte."""

import json
from pathlib import Path

from app.core.chain import compute_entry_hash
from app.core.signing import verify_manifest

VECTORS = json.loads((Path(__file__).parents[2] / "packages/shared/test/vectors.json").read_text())


def test_typescript_signature_verifies_in_python():
    assert verify_manifest(VECTORS["manifest"], VECTORS["signature_hex"], VECTORS["public_key_hex"])


def test_edited_manifest_fails():
    edited = VECTORS["manifest"] | {"captured_at": "2026-10-14T00:00:00.000Z"}
    assert not verify_manifest(edited, VECTORS["signature_hex"], VECTORS["public_key_hex"])


def test_entry_hashes_match_typescript():
    for entry in VECTORS["chain"]:
        assert compute_entry_hash(entry) == entry["entry_hash"]
