# ChainProof forensic checks: validation report

Each check was run on a labelled test set of benign and manipulated images. **False alarm** is how often the check fires on a benign image; **detection** is how often it fires on a manipulated one. Every rate has its sample size and a 95% Wilson confidence interval. This follows the approach of NIST CFTT (tool testing against known samples) and ISO/IEC 27041 (assuring a method is fit for purpose).

- Run: 2026-10-30T12:05:28Z · commit `8f89df9476a0`
- Test set: 525 benign + 525 manipulated images · manifest SHA-256 `e157801b3b07909f89103de533bb8b8b1d9eb77ecc78cc343d7ed1050467d2d9`
- Environment: Python 3.12.13 · macOS-27.0.1-arm64-arm-64bit · numpy 2.5.4, opencv-python-headless 5.0.0.93, pillow 12.3.0, c2pa-python 0.38.0

## Summary

| Check | False alarm (benign images) | Detection (manipulated images) |
|---|---|---|
| Copy-move (clone) detection | 18.9% (99/525; 95% CI 15.7–22.4%) | 60.0% (315/525; 95% CI 55.8–64.1%) |
| Error level analysis | 6.1% (32/525; 95% CI 4.3–8.5%) | 2.3% (12/525; 95% CI 1.3–4.0%) |
| Editing software named in metadata | 0.0% (0/525; 95% CI 0.0–0.7%) | 0.0% (0/525; 95% CI 0.0–0.7%) |
| Content Credentials say AI | 0.0% (0/525; 95% CI 0.0–0.7%) | 0.0% (0/525; 95% CI 0.0–0.7%) |
| Verdict: Suspicious or worse | 22.7% (119/525; 95% CI 19.3–26.4%) | 61.0% (320/525; 95% CI 56.7–65.0%) |
| Verdict: Likely manipulated / AI | 4.8% (25/525; 95% CI 3.2–6.9%) | 48.4% (254/525; 95% CI 44.1–52.6%) |

## False alarms by kind of benign image

| Check | original | whatsapp | facebook | recompressed | resized |
|---|---|---|---|---|---|
| Copy-move (clone) detection | 19.1% (20/105; 95% CI 12.7–27.6%) | 17.1% (18/105; 95% CI 11.1–25.5%) | 16.2% (17/105; 95% CI 10.4–24.4%) | 18.1% (19/105; 95% CI 11.9–26.5%) | 23.8% (25/105; 95% CI 16.7–32.8%) |
| Error level analysis | 0.9% (1/105; 95% CI 0.2–5.2%) | 9.5% (10/105; 95% CI 5.3–16.7%) | 7.6% (8/105; 95% CI 3.9–14.3%) | 0.9% (1/105; 95% CI 0.2–5.2%) | 11.4% (12/105; 95% CI 6.7–18.9%) |
| Editing software named in metadata | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) |
| Content Credentials say AI | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) |
| Verdict: Suspicious or worse | 19.1% (20/105; 95% CI 12.7–27.6%) | 23.8% (25/105; 95% CI 16.7–32.8%) | 21.9% (23/105; 95% CI 15.1–30.7%) | 19.1% (20/105; 95% CI 12.7–27.6%) | 29.5% (31/105; 95% CI 21.6–38.9%) |
| Verdict: Likely manipulated / AI | 5.7% (6/105; 95% CI 2.6–11.9%) | 3.8% (4/105; 95% CI 1.5–9.4%) | 3.8% (4/105; 95% CI 1.5–9.4%) | 5.7% (6/105; 95% CI 2.6–11.9%) | 4.8% (5/105; 95% CI 2.1–10.7%) |

## Detection by kind of manipulation

| Check | clone_same | clone_scaled | clone_rotated | removal | splice |
|---|---|---|---|---|---|
| Copy-move (clone) detection | 96.2% (101/105; 95% CI 90.6–98.5%) | 54.3% (57/105; 95% CI 44.8–63.5%) | 47.6% (50/105; 95% CI 38.3–57.1%) | 82.9% (87/105; 95% CI 74.5–88.9%) | 19.1% (20/105; 95% CI 12.7–27.6%) |
| Error level analysis | 1.9% (2/105; 95% CI 0.5–6.7%) | 1.9% (2/105; 95% CI 0.5–6.7%) | 0.9% (1/105; 95% CI 0.2–5.2%) | 0.9% (1/105; 95% CI 0.2–5.2%) | 5.7% (6/105; 95% CI 2.6–11.9%) |
| Editing software named in metadata | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) |
| Content Credentials say AI | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) |
| Verdict: Suspicious or worse | 96.2% (101/105; 95% CI 90.6–98.5%) | 54.3% (57/105; 95% CI 44.8–63.5%) | 47.6% (50/105; 95% CI 38.3–57.1%) | 82.9% (87/105; 95% CI 74.5–88.9%) | 23.8% (25/105; 95% CI 16.7–32.8%) |
| Verdict: Likely manipulated / AI | 93.3% (98/105; 95% CI 86.9–96.7%) | 40.0% (42/105; 95% CI 31.1–49.6%) | 34.3% (36/105; 95% CI 25.9–43.8%) | 67.6% (71/105; 95% CI 58.2–75.8%) | 6.7% (7/105; 95% CI 3.3–13.1%) |

## Detection by processing after the edit

| Check | jpeg q75 | jpeg q85 | jpeg q95 | messenger-like |
|---|---|---|---|---|
| Copy-move (clone) detection | 57.3% (82/143; 95% CI 49.1–65.1%) | 56.9% (74/130; 95% CI 48.3–65.1%) | 66.1% (80/121; 95% CI 57.3–73.9%) | 60.3% (79/131; 95% CI 51.7–68.3%) |
| Error level analysis | 2.1% (3/143; 95% CI 0.7–6.0%) | 2.3% (3/130; 95% CI 0.8–6.6%) | 0.8% (1/121; 95% CI 0.1–4.5%) | 3.8% (5/131; 95% CI 1.6–8.6%) |
| Editing software named in metadata | 0.0% (0/143; 95% CI 0.0–2.6%) | 0.0% (0/130; 95% CI 0.0–2.9%) | 0.0% (0/121; 95% CI 0.0–3.1%) | 0.0% (0/131; 95% CI 0.0–2.9%) |
| Content Credentials say AI | 0.0% (0/143; 95% CI 0.0–2.6%) | 0.0% (0/130; 95% CI 0.0–2.9%) | 0.0% (0/121; 95% CI 0.0–3.1%) | 0.0% (0/131; 95% CI 0.0–2.9%) |
| Verdict: Suspicious or worse | 58.0% (83/143; 95% CI 49.9–65.8%) | 58.5% (76/130; 95% CI 49.9–66.6%) | 66.1% (80/121; 95% CI 57.3–73.9%) | 61.8% (81/131; 95% CI 53.3–69.7%) |
| Verdict: Likely manipulated / AI | 48.9% (70/143; 95% CI 40.9–57.1%) | 47.7% (62/130; 95% CI 39.3–56.2%) | 49.6% (60/121; 95% CI 40.8–58.4%) | 47.3% (62/131; 95% CI 39.0–55.8%) |

## Test set

| Kind | Images | What it is |
|---|---|---|
| original | 105 | Camera original, untouched |
| whatsapp | 105 | The same photo after sending through WhatsApp |
| facebook | 105 | The same photo after uploading to Facebook (low quality) |
| recompressed | 105 | Camera original re-saved as JPEG quality 85 |
| resized | 105 | Camera original resized to 50% and re-saved |
| clone_same | 105 | A region copied elsewhere in the same photo at the same size |
| clone_scaled | 105 | A region copied and resized (55–80% or 120–150%) |
| clone_rotated | 105 | A region copied and rotated 10–30° |
| removal | 105 | An object covered with a patch from right next to it (clone stamp) |
| splice | 105 | A region pasted in from a different photo taken by a different phone |

Camera photos come from the VISION dataset (Shullani et al., *EURASIP Journal on Information Security*, 2017; CC BY-SA 4.0): natural scenes from 35 phones of 11 brands, with the same photos as shared through WhatsApp and Facebook. Manipulations are generated from those originals by `app/validation/generate.py` (version 1), seeded from each original's hash so the set can be rebuilt exactly.

## Limitations

- Manipulations are synthetic: irregular feathered regions on textured areas, like a lasso selection. A skilled forger (matching lighting, retouching edges, adding noise) will be harder to detect than these numbers suggest.
- Benign images are phone photos of natural scenes. Other content (screenshots, scans, artwork, product shelves with identical items) can behave differently. Identical real objects are a known clone-detector false alarm.
- AI-generated images are not in this test set. The C2PA check only reads credentials that the generator embedded; it cannot detect AI images whose credentials were removed.
- A rate measured on this set is evidence about these conditions, not a guarantee for a new image.

## Reproduce

```bash
cd server
uv run python -m scripts.validate fetch-vision --root validation_data
uv run python -m scripts.validate generate --root validation_data
uv run python -m scripts.validate run --root validation_data --out ../docs/validation
```
