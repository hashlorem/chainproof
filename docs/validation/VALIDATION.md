# ChainProof forensic checks: validation report

Each check was run on a labelled test set of benign and manipulated images. **False alarm** is how often the check fires on a benign image; **detection** is how often it fires on a manipulated one. Every rate has its sample size and a 95% Wilson confidence interval. This follows the approach of NIST CFTT (tool testing against known samples) and ISO/IEC 27041 (assuring a method is fit for purpose).

- Run: 2026-11-02T07:07:13Z · commit `aa6d3818e16a`
- Test set: 525 benign + 735 manipulated images · manifest SHA-256 `6e3527f7693bf12e796c3b0f545884d4a223cbcf4eb836103b14fe50ec70d458`
- Environment: Python 3.12.13 · macOS-27.0.1-arm64-arm-64bit · numpy 2.5.4, opencv-python-headless 5.0.0.93, pillow 12.3.0, c2pa-python 0.38.0

## Summary

| Check | False alarm (benign images) | Detection (manipulated images) |
|---|---|---|
| Copy-move (clone) detection | 0.8% (4/525; 95% CI 0.3–1.9%) | 59.5% (437/735; 95% CI 55.9–62.9%) |
| Copy-move, flagged in the edited area | 0.8% (4/525; 95% CI 0.3–1.9%) | 58.4% (429/735; 95% CI 54.8–61.9%) |
| Error level analysis | 6.1% (32/525; 95% CI 4.3–8.5%) | 5.3% (39/735; 95% CI 3.9–7.2%) |
| Editing software named in metadata | 0.0% (0/525; 95% CI 0.0–0.7%) | 0.0% (0/735; 95% CI 0.0–0.5%) |
| Content Credentials say AI | 0.0% (0/525; 95% CI 0.0–0.7%) | 0.0% (0/735; 95% CI 0.0–0.5%) |
| Verdict: Suspicious or worse | 0.8% (4/525; 95% CI 0.3–1.9%) | 59.5% (437/735; 95% CI 55.9–62.9%) |
| Verdict: Likely manipulated / AI | 0.0% (0/525; 95% CI 0.0–0.7%) | 55.0% (404/735; 95% CI 51.3–58.5%) |

### Held-out phones only

The copy-move thresholds were chosen using the odd-numbered VISION phones (D01, D03, …). These rows use only the even-numbered phones, which played no part in choosing them, so they are the fairest estimate.

| Check | False alarm | Detection |
|---|---|---|
| Copy-move (clone) detection | 0.4% (1/255; 95% CI 0.1–2.2%) | 61.1% (218/357; 95% CI 55.9–66.0%) |
| Copy-move, flagged in the edited area | 0.4% (1/255; 95% CI 0.1–2.2%) | 60.5% (216/357; 95% CI 55.4–65.4%) |
| Error level analysis | 6.3% (16/255; 95% CI 3.9–10.0%) | 4.8% (17/357; 95% CI 3.0–7.5%) |
| Editing software named in metadata | 0.0% (0/255; 95% CI 0.0–1.5%) | 0.0% (0/357; 95% CI 0.0–1.1%) |
| Content Credentials say AI | 0.0% (0/255; 95% CI 0.0–1.5%) | 0.0% (0/357; 95% CI 0.0–1.1%) |
| Verdict: Suspicious or worse | 0.4% (1/255; 95% CI 0.1–2.2%) | 61.1% (218/357; 95% CI 55.9–66.0%) |
| Verdict: Likely manipulated / AI | 0.0% (0/255; 95% CI 0.0–1.5%) | 57.4% (205/357; 95% CI 52.2–62.5%) |

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

| Check | clone_same | clone_nearby | clone_scaled | clone_rotated | removal | splice | doodle |
|---|---|---|---|---|---|---|---|
| Copy-move (clone) detection | 91.4% (96/105; 95% CI 84.5–95.4%) | 80.0% (84/105; 95% CI 71.4–86.5%) | 84.8% (89/105; 95% CI 76.7–90.4%) | 92.4% (97/105; 95% CI 85.7–96.1%) | 65.7% (69/105; 95% CI 56.2–74.1%) | 0.9% (1/105; 95% CI 0.2–5.2%) | 0.9% (1/105; 95% CI 0.2–5.2%) |
| Copy-move, flagged in the edited area | 91.4% (96/105; 95% CI 84.5–95.4%) | 77.1% (81/105; 95% CI 68.2–84.1%) | 83.8% (88/105; 95% CI 75.6–89.6%) | 92.4% (97/105; 95% CI 85.7–96.1%) | 63.8% (67/105; 95% CI 54.3–72.4%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) |
| Error level analysis | 1.9% (2/105; 95% CI 0.5–6.7%) | 1.9% (2/105; 95% CI 0.5–6.7%) | 1.9% (2/105; 95% CI 0.5–6.7%) | 0.9% (1/105; 95% CI 0.2–5.2%) | 0.9% (1/105; 95% CI 0.2–5.2%) | 5.7% (6/105; 95% CI 2.6–11.9%) | 23.8% (25/105; 95% CI 16.7–32.8%) |
| Editing software named in metadata | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) |
| Content Credentials say AI | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) | 0.0% (0/105; 95% CI 0.0–3.5%) |
| Verdict: Suspicious or worse | 91.4% (96/105; 95% CI 84.5–95.4%) | 80.0% (84/105; 95% CI 71.4–86.5%) | 84.8% (89/105; 95% CI 76.7–90.4%) | 92.4% (97/105; 95% CI 85.7–96.1%) | 65.7% (69/105; 95% CI 56.2–74.1%) | 0.9% (1/105; 95% CI 0.2–5.2%) | 0.9% (1/105; 95% CI 0.2–5.2%) |
| Verdict: Likely manipulated / AI | 85.7% (90/105; 95% CI 77.8–91.1%) | 77.1% (81/105; 95% CI 68.2–84.1%) | 75.2% (79/105; 95% CI 66.2–82.5%) | 88.6% (93/105; 95% CI 81.1–93.3%) | 57.1% (60/105; 95% CI 47.6–66.2%) | 0.9% (1/105; 95% CI 0.2–5.2%) | 0.0% (0/105; 95% CI 0.0–3.5%) |

## File history check

What the file's structure says about where it has been (camera, Facebook, WhatsApp, re-saved). Each label is judged on the images that truly are that kind (recognised) and on every other image (wrongly given). The rules were written after looking at all VISION classes, so these rates are not from held-out data.

| Label | Recognised | Wrongly given to other images |
|---|---|---|
| Camera original | 100.0% (105/105; 95% CI 96.5–100.0%) | 0.0% (0/1155; 95% CI 0.0–0.3%) |
| Passed through Facebook | 100.0% (105/105; 95% CI 96.5–100.0%) | 0.0% (0/1155; 95% CI 0.0–0.3%) |
| Consistent with WhatsApp | 99.1% (104/105; 95% CI 94.8–99.8%) | 1.3% (15/1155; 95% CI 0.8–2.1%) |
| Re-saved, camera data copied | 100.0% (375/375; 95% CI 99.0–100.0%) | 0.0% (0/885; 95% CI 0.0–0.4%) |

"Looks like a Facebook Messenger copy" rests on five photos from one sender and is not validated here.

## Copies of evidence: matching and difference map

Each derived image (WhatsApp, Facebook, re-saved, resized, edited) is matched against its own original, and every original against every other one. A match is a perceptual hash at most 10 of 64 bits apart (in any rotation), or up to 24 bits apart when both photos also share one scene geometry (40+ matching points on one homography). The difference map then lines each copy up with its original and outlines what changed.

| Measure | Result |
|---|---|
| Copies traced back to their original | 99.9% (1154/1155; 95% CI 99.5–100.0%) (hash alone: 97.1% (1122/1155; 95% CI 96.0–98.0%)) |
| Same, held-out phones only | 100.0% (561/561; 95% CI 99.3–100.0%) |
| Unrelated photo pairs wrongly matched | 0.0% (0/10920; 95% CI 0.0–0.0%); closest unrelated pair 14 bits apart; 2141 look-alike pairs went through the geometry check |
| Difference map reports changes on innocent copies | 0.0% (0/420; 95% CI 0.0–0.9%) |
| Difference map outlines the edited area | 92.8% (682/735; 95% CI 90.7–94.5%) |

| Edit | Copy matched | Edit outlined |
|---|---|---|
| clone_same | 100.0% (105/105; 95% CI 96.5–100.0%) | 92.4% (97/105; 95% CI 85.7–96.1%) |
| clone_nearby | 100.0% (105/105; 95% CI 96.5–100.0%) | 83.8% (88/105; 95% CI 75.6–89.6%) |
| clone_scaled | 100.0% (105/105; 95% CI 96.5–100.0%) | 94.3% (99/105; 95% CI 88.1–97.4%) |
| clone_rotated | 100.0% (105/105; 95% CI 96.5–100.0%) | 94.3% (99/105; 95% CI 88.1–97.4%) |
| removal | 99.1% (104/105; 95% CI 94.8–99.8%) | 85.7% (90/105; 95% CI 77.8–91.1%) |
| splice | 100.0% (105/105; 95% CI 96.5–100.0%) | 100.0% (105/105; 95% CI 96.5–100.0%) |
| doodle | 100.0% (105/105; 95% CI 96.5–100.0%) | 99.1% (104/105; 95% CI 94.8–99.8%) |

The difference map needs the original. That is why it finds splices that copy-move detection cannot: it compares against what the camera recorded instead of searching one image for internal copies.

## Detection by processing after the edit

| Check | jpeg q75 | jpeg q85 | jpeg q95 | messenger-like |
|---|---|---|---|---|
| Copy-move (clone) detection | 61.7% (121/196; 95% CI 54.8–68.2%) | 57.8% (108/187; 95% CI 50.6–64.6%) | 59.5% (100/168; 95% CI 52.0–66.6%) | 58.7% (108/184; 95% CI 51.5–65.6%) |
| Copy-move, flagged in the edited area | 61.2% (120/196; 95% CI 54.2–67.8%) | 57.2% (107/187; 95% CI 50.0–64.1%) | 58.3% (98/168; 95% CI 50.8–65.5%) | 56.5% (104/184; 95% CI 49.3–63.5%) |
| Error level analysis | 4.6% (9/196; 95% CI 2.4–8.5%) | 4.8% (9/187; 95% CI 2.5–8.9%) | 5.9% (10/168; 95% CI 3.3–10.6%) | 6.0% (11/184; 95% CI 3.4–10.4%) |
| Editing software named in metadata | 0.0% (0/196; 95% CI 0.0–1.9%) | 0.0% (0/187; 95% CI 0.0–2.0%) | 0.0% (0/168; 95% CI 0.0–2.2%) | 0.0% (0/184; 95% CI 0.0–2.1%) |
| Content Credentials say AI | 0.0% (0/196; 95% CI 0.0–1.9%) | 0.0% (0/187; 95% CI 0.0–2.0%) | 0.0% (0/168; 95% CI 0.0–2.2%) | 0.0% (0/184; 95% CI 0.0–2.1%) |
| Verdict: Suspicious or worse | 61.7% (121/196; 95% CI 54.8–68.2%) | 57.8% (108/187; 95% CI 50.6–64.6%) | 59.5% (100/168; 95% CI 52.0–66.6%) | 58.7% (108/184; 95% CI 51.5–65.6%) |
| Verdict: Likely manipulated / AI | 56.6% (111/196; 95% CI 49.6–63.4%) | 55.6% (104/187; 95% CI 48.4–62.5%) | 54.2% (91/168; 95% CI 46.6–61.5%) | 53.3% (98/184; 95% CI 46.1–60.3%) |

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
| doodle | 105 | Pen strokes or a scribble drawn over the photo (thin, solid colour, nothing copied) |

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
