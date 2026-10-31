"""C2PA Content Credentials: a signed edit history that cameras, Adobe tools and many AI generators embed."""

import io
from functools import cache
from pathlib import Path

import c2pa

from app.forensics.common import finding

AI_SOURCE_TYPES = ("trainedAlgorithmicMedia", "compositeWithTrainedAlgorithmicMedia", "algorithmicMedia")
# The official C2PA trust list (CC BY 4.0), downloaded 31 Oct 2026 from
# https://raw.githubusercontent.com/c2pa-org/conformance-public/main/trust-list/C2PA-TRUST-LIST.pem
# (SHA-256 b3949271a07b007e92ef1d18050b55388f5e0d2686a16fd864176c48421af8ae). Re-download it now and then: new
# signers are added. Anyone can sign a manifest with a self-made certificate; only listed signers come out "Trusted".
TRUST_LIST = Path(__file__).with_name("c2pa_trust_list.pem")


@cache
def _settings() -> c2pa.Settings:
    return c2pa.Settings.from_dict({"verify": {"verify_trust": True}, "trust": {"trust_anchors": TRUST_LIST.read_text()}})


def analyze(data: bytes, mime: str) -> dict:
    try:
        reader = c2pa.Reader.try_create(mime, stream=io.BytesIO(data), context=c2pa.Context(_settings()))
    except c2pa.C2paError as exc:
        return {"present": False, "findings": [], "error": str(exc)[:200]}
    if reader is None:
        return {"present": False, "findings": []}

    with reader:
        manifest = reader.get_active_manifest() or {}
        state = reader.get_validation_state()
    actions = [
        a
        for assertion in manifest.get("assertions", [])
        if assertion.get("label", "").startswith("c2pa.actions")
        for a in assertion.get("data", {}).get("actions", [])
    ]
    source_types = {str(a.get("digitalSourceType", "")).rsplit("/", 1)[-1] for a in actions}
    generator = manifest.get("claim_generator") or ", ".join(
        g.get("name", "") for g in manifest.get("claim_generator_info", []) if isinstance(g, dict)
    )
    issuer = (manifest.get("signature_info") or {}).get("issuer")
    ai = bool(source_types & set(AI_SOURCE_TYPES))
    # "Valid" only means the signature matches the file; "Trusted" also means the signer is on the C2PA trust list.
    trusted = (state or "").lower() == "trusted"
    signer = f"signed by {issuer or 'unknown issuer'}" + ("" if trusted else ", not on the C2PA trust list")

    findings = []
    if ai and trusted:
        findings.append(finding("high", "Content Credentials say AI-generated", f"Made with {generator or 'an AI tool'}, {signer}."))
    elif ai:
        findings.append(finding("medium", "Content Credentials claim AI, signer not trusted",
                                f"Claims {generator or 'an AI tool'}, {signer}. Anyone can sign such a claim with a self-made certificate."))
    else:
        findings.append(finding("info", "Content Credentials found", f"Created or edited with {generator or 'unknown tool'}, {signer}."))
    if state and state.lower() not in ("valid", "trusted"):
        findings.append(finding("medium", "Content Credentials do not validate", f"Validation state: {state}. The image may have been changed after signing."))
    return {
        "present": True,
        "validation_state": state,
        "generator": generator,
        "issuer": issuer,
        "actions": [a.get("action") for a in actions],
        "ai_generated": ai,
        "trusted": trusted,
        "findings": findings,
    }
