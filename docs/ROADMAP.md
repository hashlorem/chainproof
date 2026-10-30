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

## Phase 2: still to do (owner, after the presentation)

Each item ships only after the validation harness shows it helps: measure first, then decide whether it may affect the
verdict, be informational, or not ship at all.

| # | Item | Why | How to validate |
|---|---|---|---|
| 1 | **Comparisons in the examination PDF** | Today a comparison is only a custody entry; the report should show the difference map and its numbers | Unit test: a compared item's PDF contains the comparison section |
| 2 | **Validate the Messenger fingerprint** | It rests on five photos from one sender's phone | Collect Messenger copies from several phones and app versions; add a `messenger` class to the test set; keep the label only if recognised ≥ 90% with ≤ 1% given wrongly |
| 3 | **Noise inconsistency map** | Spliced regions often carry different sensor noise; the difference map needs an original, this doesn't | Add as a check in `app/forensics`; run the harness; it may push the verdict only if it beats its false-alarm rate (as ELA failed to) |
| 4 | **JPEG ghosts** (Farid) | Shows regions that were compressed at a different quality before being pasted | Same as #3 |
| 5 | **Write C2PA Content Credentials** into signed captures (`c2pa-python` Builder) | Any C2PA verifier (Adobe's, the official tool) could then check our provenance, not only ChainProof | Round-trip test: our credential validates with `c2patool`; document that a self-signed certificate shows as "untrusted signer" |
| 6 | **AI-image detector** | Only if one passes on current generators | Three 2025 detectors (Community Forensics, B-Free, Sentry) failed on 2026-10-30. Add an `ai` class to the test set first; never let it drive the verdict alone |
| 7 | **Platform trust** | What a real lab would ask about | Hardware-backed device keys with Android key attestation (new APK); Postgres + MinIO/S3 object lock; a written threat model (`security-threat-model` skill); a standards mapping (ISO/IEC 27037/27041/27042 → feature) |

## Rules that apply to all of it

- After any change in `server/app/forensics`, re-run `uv run python -m scripts.validate run` and commit the report together
  with `server/app/forensics/validated_rates.json`.
- Tune thresholds on odd-numbered VISION phones only; even-numbered phones are the held-out check. Say so in the report when
  a threshold was set from all data.
- When a real case exposes a kind of edit the test set lacks, add it to `app/validation/generate.py` (that's how the
  overlapping "nearby clone" type came in).
