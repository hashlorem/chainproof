"""C2PA Content Credentials: a signed edit history that cameras, Adobe tools and many AI generators embed."""

import io

import c2pa

from app.forensics.common import finding

AI_SOURCE_TYPES = ("trainedAlgorithmicMedia", "compositeWithTrainedAlgorithmicMedia", "algorithmicMedia")


def analyze(data: bytes, mime: str) -> dict:
    try:
        reader = c2pa.Reader.try_create(mime, stream=io.BytesIO(data))
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

    findings = []
    if ai:
        findings.append(finding("high", "Content Credentials say AI-generated", f"Made with {generator or 'an AI tool'}, signed by {issuer or 'unknown issuer'}."))
    else:
        findings.append(finding("info", "Content Credentials found", f"Created or edited with {generator or 'unknown tool'}, signed by {issuer or 'unknown issuer'}."))
    if state and state.lower() not in ("valid", "trusted"):
        findings.append(finding("medium", "Content Credentials do not validate", f"Validation state: {state}. The image may have been changed after signing."))
    return {
        "present": True,
        "validation_state": state,
        "generator": generator,
        "issuer": issuer,
        "actions": [a.get("action") for a in actions],
        "ai_generated": ai,
        "findings": findings,
    }
