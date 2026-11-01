# ChainProof roadmap

The goal is a photo-investigation tool a DFIR examiner could rely on: every check validated with published error rates,
every examiner action in the append-only custody log, and every conclusion on a stated scale.

## Done

| Phase | Work | Where |
|---|---|---|
| 1 | Validation harness (NIST CFTT style): 1,155 labelled images from the VISION dataset, error rates with 95% intervals, held-out phones, regression gate in the tests | `server/app/validation`, `docs/validation/VALIDATION.md` |
| 1 | Copy-move detector v2: resized, rotated and overlapping clones; repeating patterns ignored; ELA demoted to a visual aid | `server/app/forensics/copymove.py`, `ela.py` |
| 1 | Examinations: notes, conclusions, technical review, examination PDF | `server/app/routers/examination.py`, `server/app/reports/examination.py` |
| 1 | Command-line examiner, CI | `server/scripts/examine.py`, `.github/workflows/ci.yml` |
| 2 | File history: camera / re-saved / Facebook / WhatsApp / Messenger from the file's structure | `server/app/forensics/structure.py` |
| 2 | Copies of evidence: perceptual-hash search with scene-geometry confirmation, difference map, `COMPARED` custody entries | `server/app/forensics/similarity.py`, `server/app/routers/forensics.py` |
| 2 | Comparisons with copies in the examination PDF | `server/app/reports/examination.py` |
| 2 | Threat model and standards mapping | `docs/security/chainproof-threat-model.md`, `docs/security/standards-mapping.md` |
| 2 | Custody log anchored to FreeTSA on every verify and export (TM-001); printed in both PDFs; `tamper_demo --resign` shows a re-signed rewrite being caught | `server/app/core/anchor.py` |
| 2 | Security fixes TM-003, TM-004, TM-005, TM-011: `demo.sh` refuses demo passwords; tunnel visitors told apart by `CF-Connecting-IP`, password reset lifts a lockout; public verify capped at 210 MB and 30 lookups/min; *AI-generated* only from a C2PA signer on the official trust list | `demo.sh`, `server/app/core/security.py`, `server/app/main.py`, `server/app/forensics/c2pa_check.py`, `verdict.py` |

## Phase 2: still to do

Each item ships only after the validation harness shows it helps: measure first, then decide whether it may affect the
verdict, be informational, or not ship at all. **Owner** works on branch `phase2`; items marked *now* come before the
presentation. AI detection moved to the friend (next section). Follow *Working in parallel* in `HANDOFF.md`.

| # | Item | Why | How to validate |
|---|---|---|---|
| 2 | **Validate the Messenger fingerprint** (friend can collect samples while building the AI set) | It rests on five photos from one sender's phone | Collect Messenger copies from several phones and app versions; add a `messenger` class to the test set; keep the label only if recognised ≥ 90% with ≤ 1% given wrongly |
| 3 | **Noise inconsistency map** (*now, if validation shows it helps*) | Spliced regions often carry different sensor noise; the difference map needs an original, this doesn't | Add as a check in `app/forensics`; run the harness; it may push the verdict only if it beats its false-alarm rate (as ELA failed to) |
| 4 | **JPEG ghosts** (Farid) | Shows regions that were compressed at a different quality before being pasted | Same as #3 |
| 5 | **Write C2PA Content Credentials** into signed captures (`c2pa-python` Builder) | Any C2PA verifier (Adobe's, the official tool) could then check our provenance, not only ChainProof | Round-trip test: our credential validates with `c2patool`; document that a self-signed certificate shows as "untrusted signer" |
| 6 | **Identical real objects** (found 31 Oct 2026) | Copy-move called the owner's untouched photo `16706978` *Likely manipulated*: two identical printed earring cards hang side by side (23 matches, scale 0.99). The VISION scenes rarely show duplicate products | Collect photos of shelves and stalls with repeated items; add them as a benign class; then decide whether near-identical objects need a higher match count or a "repeated object" wording |
| 7 | **Platform trust** | What a real lab would ask about | Hardware-backed device keys with Android key attestation (new APK); Postgres + MinIO/S3 object lock |

### Security fixes from the threat model (`docs/security/chainproof-threat-model.md`)

| Threat | Fix | Priority | Size |
|---|---|---|---|
| TM-003 (rest) | Force a password change on first login (needs a migration: say so first) | medium | small |
| TM-004 (rest) | Growing delays instead of a hard lockout | low | small |
| TM-011 (rest) | Add forged-AI-metadata and self-signed-credential cases to the validation set; re-download the C2PA trust list now and then | low | small |
| TM-001 (rest) | Keep the server's signing key away from the database when hosted (separate secret store or HSM) | medium | medium |
| TM-002 | Supervisor approval before a new device can sign; show enrolment date and approver in reports | high | medium |
| TM-006 | Run image analysis in a worker process with time and memory limits; lower Pillow's pixel limit; `pip-audit` in CI | medium | medium |
| TM-008 | Require the phone passcode when no biometrics are enrolled (new APK) | medium | small |
| TM-007 | Content-Security-Policy for the web app | low | small |

## Friend: AI detection that survives missing metadata and compression

**Goal:** flag AI-generated or AI-edited images even when the Content Credentials (C2PA) label and metadata are gone, for
example after Messenger or WhatsApp recompression. Branch `ai-detection`.

**Set expectations first.** This is an open research problem. On 2026-10-30 three 2025 open-source detectors were tried on
our demo photos: Community Forensics (CVPR 2025, MIT), B-Free (CVPR 2025, nonprofit licence) and Sentry (2023). All missed
a real ChatGPT edit; B-Free called two real photos AI; Community Forensics' own AI samples fell from about 0.99 to about
0.01 after quality-60 recompression. A measured "no detector is reliable after compression" is a valid, presentable result.

1. **Build the AI test set before choosing a model** (`server/app/validation/ai_set.py`):
   - AI images from current generators (ChatGPT/gpt-image, Gemini, Midjourney, Flux, Stable Diffusion 3.x), both fully
     generated and AI-edited real photos. Use only sources whose licence allows it, and record each source and licence in
     the manifest like `vision.py` does. Public sets to check: Synthbuster, the B-Free extended set (Flux, SD 3.5),
     Tiny-GenImage.
   - For each AI image, also store copies after Messenger-like (progressive, quality ≈ 60, metadata stripped),
     WhatsApp-like (1280 px, quality ≈ 80) and screenshot-like (PNG) processing.
   - Add an `ai` truth class to `validation/dataset.py`. The 525 benign VISION images (originals, WhatsApp, Facebook,
     re-saved, resized) are the "real" side; the false-alarm rate on them matters most.
2. **Measure candidates** on that set: detection on AI images (by generator and by processing) and false alarms on real
   photos. Re-use the loading tricks from the 2026-10-30 trial: load weights with `torch.load(weights_only=True)` and never
   run code shipped inside a model repository.
3. **Ship only what passes**, in `server/app/forensics/ai_detect.py`:
   - Report it as a finding with `check: "ai_model"` and its measured rates (`rates.py`), as a low or medium indicator.
     It must not produce an "AI-generated" verdict on its own; C2PA stays the strong signal.
   - Put PyTorch and the model in an optional dependency group (`uv sync --extra ai`) and download weights on first use
     with a SHA-256 check. Without them installed, the check reports "not available" and everything else works.
   - Add a small CI-safe test (mocked model) and extend the regression gate only with checks that run without the extra.
4. **Report** the results in `docs/validation/VALIDATION.md` (regenerated on `main` after merging), including when
   nothing passes.

## Rules that apply to all of it

- After any change in `server/app/forensics`, re-run `uv run python -m scripts.validate run` to check your work. On a branch,
  don't commit the regenerated report or `validated_rates.json`; after merging into `main`, re-run there and commit both.
- Tune thresholds on odd-numbered VISION phones only; even-numbered phones are the held-out check. Say so in the report when
  a threshold was set from all data.
- When a real case exposes a kind of edit the test set lacks, add it to `app/validation/generate.py` (that's how the
  overlapping "nearby clone" type came in).
