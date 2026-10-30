# ChainProof forensic checks: validation report

Each check was run on a labelled test set of benign and manipulated images. **False alarm** is how often the check fires on a benign image; **detection** is how often it fires on a manipulated one. Every rate has its sample size and a 95% Wilson confidence interval. This follows the approach of NIST CFTT (tool testing against known samples) and ISO/IEC 27041 (assuring a method is fit for purpose).

- Run: 2026-10-30T17:13:29Z · commit `cd8c0e18a34b`
- Test set: 525 benign + 630 manipulated images · manifest SHA-256 `5c167bb32423dd8237bed5d08c07b87cf649434daa7dfbd8eb529352f9abf5be`
- Environment: Python 3.12.13 · macOS-27.0.1-arm64-arm-64bit · numpy 2.5.4, opencv-python-headless 5.0.0.93, pillow 12.3.0, c2pa-python 0.38.0

## Summary

| Check | False alarm (benign images) | Detection (manipulated images) |
|---|---|---|
| Copy-move (clone) detection | 0.8% (4/525; 95% CI 0.3–1.9%) | 69.2% (436/630; 95% CI 65.5–72.7%) |
| Copy-move, flagged in the edited area | 0.8% (4/525; 95% CI 0.3–1.9%) | 68.1% (429/630; 95% CI 64.4–71.6%) |
| Error level analysis | 6.1% (32/525; 95% CI 4.3–8.5%) | 2.2% (14/630; 95% CI 1.3–3.7%) |
| Editing software named in metadata | 0.0% (0/525; 95% CI 0.0–0.7%) | 0.0% (0/630; 95% CI 0.0–0.6%) |
| Content Credentials say AI | 0.0% (0/525; 95% CI 0.0–0.7%) | 0.0% (0/630; 95% CI 0.0–0.6%) |
| Verdict: Suspicious or worse | 0.8% (4/525; 95% CI 0.3–1.9%) | 69.2% (436/630; 95% CI 65.5–72.7%) |
| Verdict: Likely manipulated / AI | 0.0% (0/525; 95% CI 0.0–0.7%) | 64.1% (404/630; 95% CI 60.3–67.8%) |

### Held-out phones only

The copy-move thresholds were chosen using the odd-numbered VISION phones (D01, D03, …). These rows use only the even-numbered phones, which played no part in choosing them, so they are the fairest estimate.

| Check | False alarm | Detection |
|---|---|---|
| Copy-move (clone) detection | 0.4% (1/255; 95% CI 0.1–2.2%) | 70.9% (217/306; 95% CI 65.6–75.7%) |
| Copy-move, flagged in the edited area | 0.4% (1/255; 95% CI 0.1–2.2%) | 70.6% (216/306; 95% CI 65.2–75.4%) |
| Error level analysis | 6.3% (16/255; 95% CI 3.9–10.0%) | 2.0% (6/306; 95% CI 0.9–4.2%) |
| Editing software named in metadata | 0.0% (0/255; 95% CI 0.0–1.5%) | 0.0% (0/306; 95% CI 0.0–1.2%) |
| Content Credentials say AI | 0.0% (0/255; 95% CI 0.0–1.5%) | 0.0% (0/306; 95% CI 0.0–1.2%) |
| Verdict: Suspicious or worse | 0.4% (1/255; 95% CI 0.1–2.2%) | 70.9% (217/306; 95% CI 65.6–75.7%) |
| Verdict: Likely manipulated / AI | 0.0% (0/255; 95% CI 0.0–1.5%) | 67.0% (205/306; 95% CI 61.5–72.0%) |

## False alarms by kind of benign image

| Check | original | whatsapp | facebook | recompressed | resized |
|---|---|---|---|---|---|
| Copy-move (clone) detection | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.9% (1/105; 95% CI 0.2–5.2%) | 0.9% (1/105; 95% CI 0.2–5.2%) | 0.9% (1/105; 95% CI 0.2–5.2%) | 0.9% (1/105; 95% CI 0.2–5.2%) |
| Copy-move, flagged in the edited area | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.9% (1/105; 95% CI 0.2–5.2%) | 0.9% (1/105; 95% CI 0.2–5.2%) | 0.9% (1/105; 95% CI 0.2–5.2%) | 0.9% (1/105; 95% CI 0.2–5.2%) |
| Error level analysis | 0.9% (1/105; 95% CI 0.2–5.2%) | 9.5% (10/105; 95% CI 5.3–16.7%) | 7.6% (8/105; 95% CI 3.9–14.3%) | 0.9% (1/105; 95% CI 0.2–5.2%) | 11.4% (12/105; 95% CI 6.7–18.9%) |
| Editing software named in metadata | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) |
| Content Credentials say AI | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) |
| Verdict: Suspicious or worse | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.9% (1/105; 95% CI 0.2–5.2%) | 0.9% (1/105; 95% CI 0.2–5.2%) | 0.9% (1/105; 95% CI 0.2–5.2%) | 0.9% (1/105; 95% CI 0.2–5.2%) |
| Verdict: Likely manipulated / AI | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) |

## Detection by kind of manipulation

| Check | clone_same | clone_nearby | clone_scaled | clone_rotated | removal | splice |
|---|---|---|---|---|---|---|
| Copy-move (clone) detection | 91.4% (96/105; 95% CI 84.5–95.4%) | 80.0% (84/105; 95% CI 71.4–86.5%) | 84.8% (89/105; 95% CI 76.7–90.4%) | 92.4% (97/105; 95% CI 85.7–96.1%) | 65.7% (69/105; 95% CI 56.2–74.1%) | 0.9% (1/105; 95% CI 0.2–5.2%) |
| Copy-move, flagged in the edited area | 91.4% (96/105; 95% CI 84.5–95.4%) | 77.1% (81/105; 95% CI 68.2–84.1%) | 83.8% (88/105; 95% CI 75.6–89.6%) | 92.4% (97/105; 95% CI 85.7–96.1%) | 63.8% (67/105; 95% CI 54.3–72.4%) | 0.0% (0/105; 95% CI 0.0–3.5%) |
| Error level analysis | 1.9% (2/105; 95% CI 0.5–6.7%) | 1.9% (2/105; 95% CI 0.5–6.7%) | 1.9% (2/105; 95% CI 0.5–6.7%) | 0.9% (1/105; 95% CI 0.2–5.2%) | 0.9% (1/105; 95% CI 0.2–5.2%) | 5.7% (6/105; 95% CI 2.6–11.9%) |
| Editing software named in metadata | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) |
| Content Credentials say AI | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) |
| Verdict: Suspicious or worse | 91.4% (96/105; 95% CI 84.5–95.4%) | 80.0% (84/105; 95% CI 71.4–86.5%) | 84.8% (89/105; 95% CI 76.7–90.4%) | 92.4% (97/105; 95% CI 85.7–96.1%) | 65.7% (69/105; 95% CI 56.2–74.1%) | 0.9% (1/105; 95% CI 0.2–5.2%) |
| Verdict: Likely manipulated / AI | 85.7% (90/105; 95% CI 77.8–91.1%) | 77.1% (81/105; 95% CI 68.2–84.1%) | 75.2% (79/105; 95% CI 66.2–82.5%) | 88.6% (93/105; 95% CI 81.1–93.3%) | 57.1% (60/105; 95% CI 47.6–66.2%) | 0.9% (1/105; 95% CI 0.2–5.2%) |

## File history check

What the file's structure says about where it has been (camera, Facebook, WhatsApp, re-saved). Each label is judged on the images that truly are that kind (recognised) and on every other image (wrongly given). The rules were written after looking at all VISION classes, so these rates are not from held-out data.

| Label | Recognised | Wrongly given to other images |
|---|---|---|
| Camera original | 100.0% (105/105; 95% CI 96.5–100.0%) | 0.0% (0/1050; 95% CI 0.0–0.4%) |
| Passed through Facebook | 100.0% (105/105; 95% CI 96.5–100.0%) | 0.0% (0/1050; 95% CI 0.0–0.4%) |
| Consistent with WhatsApp | 99.1% (104/105; 95% CI 94.8–99.8%) | 1.3% (14/1050; 95% CI 0.8–2.2%) |
| Re-saved, camera data copied | 100.0% (333/333; 95% CI 98.9–100.0%) | 0.0% (0/822; 95% CI 0.0–0.5%) |

"Looks like a Facebook Messenger copy" rests on five photos from one sender and is not validated here.

## Copies of evidence: matching and difference map

Each derived image (WhatsApp, Facebook, re-saved, resized, edited) is matched against its own original, and every original against every other one. A match is a perceptual hash at most 10 of 64 bits apart (in any rotation), or up to 24 bits apart when both photos also share one scene geometry (40+ matching points on one homography). The difference map then lines each copy up with its original and outlines what changed.

| Measure | Result |
|---|---|
| Copies traced back to their original | 99.9% (1049/1050; 95% CI 99.5–100.0%) (hash alone: 97.0% (1019/1050; 95% CI 95.8–97.9%)) |
| Same, held-out phones only | 100.0% (510/510; 95% CI 99.2–100.0%) |
| Unrelated photo pairs wrongly matched | 0.0% (0/10920; 95% CI 0.0–0.0%); closest unrelated pair 14 bits apart; 2141 look-alike pairs went through the geometry check |
| Difference map reports changes on innocent copies | 0.0% (0/420; 95% CI 0.0–0.9%) |
| Difference map outlines the edited area | 82.9% (522/630; 95% CI 79.7–85.6%) |

| Edit | Copy matched | Edit outlined |
|---|---|---|
| clone_same | 100.0% (105/105; 95% CI 96.5–100.0%) | 87.6% (92/105; 95% CI 80.0–92.6%) |
| clone_nearby | 100.0% (105/105; 95% CI 96.5–100.0%) | 63.8% (67/105; 95% CI 54.3–72.4%) |
| clone_scaled | 100.0% (105/105; 95% CI 96.5–100.0%) | 89.5% (94/105; 95% CI 82.2–94.0%) |
| clone_rotated | 100.0% (105/105; 95% CI 96.5–100.0%) | 86.7% (91/105; 95% CI 78.9–91.9%) |
| removal | 99.1% (104/105; 95% CI 94.8–99.8%) | 74.3% (78/105; 95% CI 65.2–81.7%) |
| splice | 100.0% (105/105; 95% CI 96.5–100.0%) | 95.2% (100/105; 95% CI 89.3–98.0%) |

The difference map needs the original. That is why it finds splices that copy-move detection cannot: it compares against what the camera recorded instead of searching one image for internal copies.

## Detection by processing after the edit

| Check | jpeg q75 | jpeg q85 | jpeg q95 | messenger-like |
|---|---|---|---|---|
| Copy-move (clone) detection | 70.8% (121/171; 95% CI 63.5–77.1%) | 69.0% (107/155; 95% CI 61.4–75.8%) | 70.4% (100/142; 95% CI 62.5–77.3%) | 66.7% (108/162; 95% CI 59.1–73.5%) |
| Copy-move, flagged in the edited area | 70.2% (120/171; 95% CI 62.9–76.5%) | 69.0% (107/155; 95% CI 61.4–75.8%) | 69.0% (98/142; 95% CI 61.0–76.0%) | 64.2% (104/162; 95% CI 56.6–71.2%) |
| Error level analysis | 1.8% (3/171; 95% CI 0.6–5.0%) | 3.2% (5/155; 95% CI 1.4–7.3%) | 0.7% (1/142; 95% CI 0.1–3.9%) | 3.1% (5/162; 95% CI 1.3–7.0%) |
| Editing software named in metadata | 0.0% (0/171; 95% CI 0.0–2.2%) | 0.0% (0/155; 95% CI 0.0–2.4%) | 0.0% (0/142; 95% CI 0.0–2.6%) | 0.0% (0/162; 95% CI 0.0–2.3%) |
| Content Credentials say AI | 0.0% (0/171; 95% CI 0.0–2.2%) | 0.0% (0/155; 95% CI 0.0–2.4%) | 0.0% (0/142; 95% CI 0.0–2.6%) | 0.0% (0/162; 95% CI 0.0–2.3%) |
| Verdict: Suspicious or worse | 70.8% (121/171; 95% CI 63.5–77.1%) | 69.0% (107/155; 95% CI 61.4–75.8%) | 70.4% (100/142; 95% CI 62.5–77.3%) | 66.7% (108/162; 95% CI 59.1–73.5%) |
| Verdict: Likely manipulated / AI | 64.9% (111/171; 95% CI 57.5–71.7%) | 67.1% (104/155; 95% CI 59.4–74.0%) | 64.1% (91/142; 95% CI 55.9–71.5%) | 60.5% (98/162; 95% CI 52.8–67.7%) |

## Test set

| Kind | Images | What it is |
|---|---|---|
| original | 105 | Camera original, untouched |
| whatsapp | 105 | The same photo after sending through WhatsApp |
| facebook | 105 | The same photo after uploading to Facebook (low quality) |
| recompressed | 105 | Camera original re-saved as JPEG quality 85 |
| resized | 105 | Camera original resized to 50% and re-saved |
| clone_same | 105 | A region copied elsewhere in the same photo at the same size |
| clone_nearby | 105 | A region duplicated right next to itself, overlapping the original (shifted 40–90% of its size) |
| clone_scaled | 105 | A region copied and resized (55–80% or 120–150%) |
| clone_rotated | 105 | A region copied and rotated 10–30° |
| removal | 105 | An object covered with a patch from right next to it (clone stamp) |
| splice | 105 | A region pasted in from a different photo taken by a different phone |

Camera photos come from the VISION dataset (Shullani et al., *EURASIP Journal on Information Security*, 2017; CC BY-SA 4.0): natural scenes from 35 phones of 11 brands, with the same photos as shared through WhatsApp and Facebook. Manipulations are generated from those originals by `app/validation/generate.py` (version 1), seeded from each original's hash so the set can be rebuilt exactly.

## Limitations

- Manipulations are synthetic: irregular feathered regions on textured areas, like a lasso selection. A skilled forger (matching lighting, retouching edges, adding noise) will be harder to detect than these numbers suggest.
- Benign images are phone photos of natural scenes. Other content (screenshots, scans, artwork, product shelves with identical items) can behave differently. Identical real objects are a known clone-detector false alarm.
- The copy-move thresholds were tuned on the odd-numbered phones (see the held-out table), except the rule for overlapping source and copy (at least 60 matches), which was set from the largest overlapping false alarm on all benign images (24 matches) after a real overlapping forgery was missed. Its false-alarm rate is therefore not independent.
- The matching thresholds (10 bits; 24 bits with 40 scene points) were chosen after looking at all phones, so the held-out matching row is not an independent check. The file history rules were also written after looking at all classes.
- Copy-move detection is not designed to find splices (a region from a different photo); its splice row shows that.
- "Flagged in the edited area" counts a hit only if a flagged box lies at least 30% inside the edited region. Plain "detection" also counts hits elsewhere in the photo, which are lucky rather than correct.
- AI-generated images are not in this test set. The C2PA check only reads credentials that the generator embedded; it cannot detect AI images whose credentials were removed.
- A rate measured on this set is evidence about these conditions, not a guarantee for a new image.

## Reproduce

```bash
cd server
uv run python -m scripts.validate fetch-vision --root validation_data
uv run python -m scripts.validate generate --root validation_data
uv run python -m scripts.validate run --root validation_data --out ../docs/validation
```
