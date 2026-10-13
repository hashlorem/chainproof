"""RFC 3161 trusted timestamps: a third party (FreeTSA) signs "this hash existed at time T"."""

import base64
import logging

import rfc3161ng
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa
from pyasn1.codec.der import decoder, encoder
from pyasn1.type import univ
from rfc3161ng.api import get_hash_from_oid, get_hash_oid, id_attribute_messageDigest, load_certificate

from app.config import settings
from app.models import fmt_ts

log = logging.getLogger(__name__)


def request_timestamp(sha256_hex: str) -> tuple[str, str]:
    """Returns (token_b64, iso_time). Raises on network or TSA errors."""
    stamper = rfc3161ng.RemoteTimestamper(settings.tsa_url, hashname="sha256", include_tsa_certificate=True, timeout=10)
    token = stamper.timestamp(digest=bytes.fromhex(sha256_hex))
    return base64.b64encode(token).decode(), fmt_ts(rfc3161ng.get_timestamp(token, naive=False))


def check_timestamp(token_b64: str, sha256_hex: str) -> bool:
    """
    Checks the token is for this exact hash and carries a valid TSA signature (cert embedded in the token).
    rfc3161ng.check_timestamp only handles RSA keys, and FreeTSA signs with ECDSA, so the signature step is done here.
    """
    try:
        tst, rest = decoder.decode(base64.b64decode(token_b64), asn1Spec=rfc3161ng.TimeStampToken())
        if rest:
            return False
        imprint = tst.tst_info.message_imprint
        if imprint.hash_algorithm[0] != get_hash_oid("sha256") or bytes(imprint.hashed_message) != bytes.fromhex(sha256_hex):
            return False

        signed = tst.content
        signer = signed["signerInfos"][0]
        hash_name = get_hash_from_oid(signer["digestAlgorithm"]["algorithm"])
        hash_cls = getattr(hashes, hash_name.upper())
        content = bytes(decoder.decode(bytes(signed["contentInfo"]["content"]), asn1Spec=univ.OctetString())[0])

        attrs = signer["authenticatedAttributes"]
        if len(attrs):
            h = hashes.Hash(hash_cls())
            h.update(content)
            digest_attr = next(a for a in attrs if a[0] == id_attribute_messageDigest)
            if bytes(decoder.decode(bytes(digest_attr[1][0]), asn1Spec=univ.OctetString())[0]) != h.finalize():
                return False
            attr_set = univ.SetOf()
            for i, a in enumerate(attrs):
                attr_set.setComponentByPosition(i, a)
            signed_bytes = encoder.encode(attr_set)
        else:
            signed_bytes = content

        key = load_certificate(signed, b"").public_key()
        signature = bytes(signer["encryptedDigest"])
        if isinstance(key, rsa.RSAPublicKey):
            key.verify(signature, signed_bytes, padding.PKCS1v15(), hash_cls())
        elif isinstance(key, ec.EllipticCurvePublicKey):
            key.verify(signature, signed_bytes, ec.ECDSA(hash_cls()))
        else:
            return False
        return True
    except Exception as exc:  # malformed token, wrong hash or bad signature
        log.info("TSA token check failed: %s", exc)
        return False
