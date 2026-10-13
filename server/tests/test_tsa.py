"""Uses a real FreeTSA token saved in tests/fixtures, so this runs offline."""

import base64
from pathlib import Path

from app.core.tsa import check_timestamp

TOKEN, HASH = (Path(__file__).parent / "fixtures/freetsa_token.txt").read_text().split()


def test_real_token_verifies():
    assert check_timestamp(TOKEN, HASH)


def test_token_is_bound_to_its_hash():
    assert not check_timestamp(TOKEN, "0" * 64)


def test_corrupted_token_fails():
    raw = bytearray(base64.b64decode(TOKEN))
    raw[-10] ^= 1
    assert not check_timestamp(base64.b64encode(raw).decode(), HASH)
