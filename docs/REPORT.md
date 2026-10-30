# ChainProof Forensics Upgrade Report

Snapshot of 31 Oct 2026.
Full numbers are in
[`docs/validation/VALIDATION.md`](validation/VALIDATION.md).

ChainProof's photo checks are now tested on 1,155 labelled images, and the false-alarm rate on untouched photos fell from 22.7% to 0.8%. Every finding now says how often its check is wrong, and investigators can record notes, a conclusion and a peer review in the tamper-proof custody log. Phase 2 adds a file history and finds edited copies of stored evidence, outlining what changed.

## At a glance

The new version raises far fewer false alarms and catches resized or rotated copies it used to miss.

| Measure | Before | After |
| --- | --- | --- |
| Untouched photos called *Suspicious* or worse | 22.7% (119 of 525) | **0.8%** (4 of 525) |
| Untouched photos called *Likely manipulated* | 4.8% (25 of 525) | **0%** (0 of 525) |
| Clone detector false alarms on untouched photos | 18.9% | **0.8%** |
| Edited photos called *Likely manipulated* (same five edit types) | 48.4% | **61.5%** |
| Resized / rotated copies found in the right place | not measured | **84% / 92%** |
| Do we know how often each check is wrong? | No | Yes, shown next to every finding |
| Notes, conclusion and peer review | None | Yes, in the custody log |

"Untouched photos" are 525 real phone photos and their WhatsApp, Facebook, re-saved and resized copies. The "Before" figures come from the same test set run on the previous detector (commit 8f89df9). Held out from tuning, the new false-alarm rate is 0.4% (1 of 255).

## What changed

Five additions turn ChainProof from a demo into a tool with known reliability. All are on GitHub in commits 660a122 to 756c036.

| Change | What it does | Where |
| --- | --- | --- |
| Validation of every check | Runs each check on 1,155 labelled images and publishes how often it is wrong, with 95% confidence intervals | `server/app/validation`, report in `docs/validation/VALIDATION.md` |
| Clone detector v2 | Finds copies that were moved, resized, rotated or placed next to the original; ignores real repeating patterns (stairs, windows, shelves, fabric) | `server/app/forensics/copymove.py` |
| Error rates in the app | Every finding shows "How reliable", e.g. "Fires on 0.8% of benign photos; finds 81.7% of copied regions" | Web evidence page, *Check a photo*, examination PDF |
| Examinations | Notes, a conclusion on a fixed scale, a review by a different examiner, and a per-photo examination PDF, all in the tamper-proof custody log | Web evidence page, *Check a photo* → *Open an examination* |
| Command-line examiner | Examines a photo or a folder on a laptop without the server; never modifies the original | `server/scripts/examine.py` |

Also: error level analysis (ELA) is now a visual aid that no longer affects the verdict, and GitHub runs all tests on every push.

## How we tested the checks

We followed the idea behind NIST's Computer Forensics Tool Testing: run the tool on samples whose answer is known, and publish how often it is wrong.

1. **Real photos.** 105 natural-scene photos from 35 phones of 11 brands (the VISION research dataset, 3 per phone), plus the same photos after WhatsApp and Facebook. These are the untouched (benign) images.
2. **Innocent processing.** Each photo re-saved as JPEG quality 85, and resized to 50%. A check that fires on these is a false alarm.
3. **Edits.** From each photo we generated six forgeries: same-size clone, nearby clone (overlapping the original), resized clone (55–80% or 120–150%), rotated clone (10–30°), object removal (clone stamp) and a splice from another phone's photo. Each was saved at JPEG quality 95, 85 or 75, or recompressed like a messenger.
4. **Scoring.** A clone hit counts only if it points at the edited area. Every rate comes with its sample size and a 95% confidence interval.
5. **No cheating.** Thresholds were tuned on the odd-numbered phones only; the even-numbered phones are a held-out check.
6. **Reproducible.** Every image is listed with its SHA-256 hash, and generation is seeded, so anyone can rebuild the exact same 1,155 images and get the same numbers.

We also checked against our own demo photos, which caught a problem the synthetic set had missed (see What we found).

## Results by edit type

Copied regions are found 64–92% of the time; splices never (when the photo is examined on its own).

| Edit type (105 photos each) | Found in the edited area | 95% confidence interval |
| --- | --- | --- |
| Rotated clone (10–30°) | 92% (97/105) | 86–96% |
| Same-size clone | 91% (96/105) | 85–95% |
| Resized clone | 84% (88/105) | 76–90% |
| Nearby clone (overlaps original) | 77% (81/105) | 68–84% |
| Object removal (clone stamp) | 64% (67/105) | 54–72% |
| Splice from another photo | 0% (0/105) | 0–4% |

For comparison: untouched photos were wrongly flagged 0.8% of the time (4 of 525). Splices are outside what a copy-move detector can see, which is why they are listed as a limitation (and why Phase 2's comparison matters).

## Phase 2: where a photo has been, and copies of evidence

Phase 2 added two features. Comparing a copy against the stored original now catches 95% of splices, the edit that a photo examined on its own never reveals.

| Feature | What it does | Measured on the test set |
| --- | --- | --- |
| File history | Reads how the file is built to say where it has been: camera original, re-saved by other software (even with copied camera data), passed through Facebook, consistent with WhatsApp, Messenger | Camera originals 100% (105/105) and Facebook 100% (105/105) recognised; WhatsApp 99% (104/105); no re-saved file ever called a camera original (0 of 1,050) |
| Copies of evidence: search | Finds stored evidence a photo was copied from, even if resized, rotated, sent through a messenger or edited. Close matches by visual fingerprint; heavily edited copies confirmed by matching scene geometry | 99.9% of copies traced (1,049/1,050); unrelated photos wrongly matched 0 of 10,920 pairs |
| Copies of evidence: compare | Lines the copy up with the stored original and outlines what changed in red; logged in the custody log | No change reported on 420 innocent copies; edits outlined 83% of the time (522/630), splices 95% (100/105) |

**How to use it:** drop a photo into **Check a photo**. Matches appear under *Copies of your evidence*; click **Compare with this evidence** to see the changes. Every evidence page also has a **Compare a copy** box. Our own bouquet edit was found this way ("same scene, visibly changed, 430 matching points").

File history is information, not an accusation: passing through Messenger is not tampering, so it never changes the verdict. The WhatsApp label says "consistent with" because any program re-saving the same way looks identical, and the Messenger label rests on five photos from one sender. Photo search needs a login, so outsiders can't probe which photos are held as evidence.

## What we found

Testing showed the old checks were less reliable than they looked, and each finding led to a concrete fix.

| Finding | Evidence | What we did |
| --- | --- | --- |
| The old clone detector flagged real repeating patterns | 18.9% of untouched photos flagged: railings, bookshelves, stair steps, stacked windows, fabric | v2 ignores patterns that repeat at twice the distance, and weakly supported matches where source and copy overlap |
| Some old "detections" were in the wrong place | The old 60% detection rate counted hits anywhere in the photo | Hits now count only if they point at the edited area |
| The old detector counted every match twice | "20 matching points" really meant 10 | Each match counted once; thresholds re-tuned on data |
| Error level analysis (ELA) barely works | Caught 2.2% of edits, but fired on 6–11% of WhatsApp, Facebook and resized photos | ELA is now a visual aid that no longer affects the verdict |
| Our synthetic test set had a blind spot | Our real hand edit (a bouquet duplicated next to itself) was missed by v2 at first, because the copy overlaps the original | Added a "nearby clone" edit type; overlapping copies now count with at least 60 matches (the largest overlapping false alarm had 24; the bouquet has 861) |
| Open-source AI-image detectors are not reliable enough | Three 2025 research detectors all missed a real ChatGPT edit; one flagged two real photos as AI | Not used. AI images are flagged only through their signed Content Credentials (C2PA) |

The lesson for an examiner: validate before you trust a tool, and always test with real cases too.

## How to use it

Everything runs on one laptop. Setup is in the repo's `HANDOFF.md`; demo accounts use the password `chainproof123` (change it before any public demo).

**Investigate a photo in the web app** (http://localhost:3100):

1. Open **Check a photo** and drop the image in. You get a verdict, the findings, a clone overlay and an error-level heatmap. Each finding shows *How reliable*.
2. To keep a record, pick a case and click **Open an examination**. The photo is filed as evidence with its hash, and the analysis runs again.
3. On the evidence page, under **Examination**, add notes as you work: what you did and what you saw.
4. Click **Record conclusion**: state H1 (e.g. "the image was altered") and H2 ("it is an unaltered original"), pick how strongly the findings support H1 over H2, and write your reasoning and limitations.
5. A **different** examiner (e.g. the supervisor account) opens the same item and submits a **Technical review**: agree or disagree, with a comment.
6. Click **Examination report (PDF)**. The PDF is registered by its hash, so anyone can check it on the public `/verify` page.

Notes, conclusions and reviews go into the custody log, so they can't be edited or deleted. To change your mind, record a new conclusion; it needs a new review.

**Examine photos on a laptop without the server:**

```bash
cd server
uv run python -m scripts.examine file ~/Downloads/photo.jpg --out exam/ --examiner "Your Name"
uv run python -m scripts.examine batch ~/Downloads/photos --out exam/   # a folder, plus summary.csv
```

The photo is hashed, analysed only as a copy, and hashed again; if the hashes differ, the run stops. Output: `report.json`, the overlays and `examination.pdf`.

**Re-run the validation** after changing any check (about 1.3 GB download, around 10 minutes):

```bash
cd server
uv run python -m scripts.validate fetch-vision --root validation_data
uv run python -m scripts.validate generate --root validation_data
uv run python -m scripts.validate run --root validation_data --out ../docs/validation
```

## Limitations

The checks give indicators, not proof, and these gaps should be said out loud in the presentation:

- **Splices are not detected in a photo examined on its own (0%).** A region pasted in from a different photo leaves no copy inside the image, and ELA proved unreliable. With the original in evidence, Compare outlines 95% of them.
- **AI images are caught only through Content Credentials.** If the label is stripped (a screenshot, a messenger), ChainProof can't tell. No open-source AI detector passed testing.
- **The forgeries are synthetic.** A skilled forger who matches lighting and retouches edges will be harder to catch than these numbers suggest.
- **Identical real objects can look like clones**, e.g. a stand of identical earring cards. The finding says so, and an examiner must confirm it by eye.
- **Some thresholds are not independent.** The overlap rule, the matching thresholds and the file-history rules were set after looking at all the data, so those rates are optimistic.
- **Not a lab-accredited tool.** Real labs also need independent testing (e.g. ISO/IEC 17025). ChainProof is a validated prototype.

The strongest evidence is still a photo **captured and signed in the ChainProof app**: it shows *Verified capture* no matter what detectors say.

## Sources

- [ChainProof validation report](validation/VALIDATION.md) (full tables, confidence intervals, held-out results)
- [ChainProof repository](https://github.com/hashlorem/chainproof) (README sections *Examining a photo* and *How reliable are the checks?*)
- [VISION dataset](https://lesc.dinfo.unifi.it/VISION/), University of Florence, CC BY-SA 4.0 (Shullani et al., *EURASIP Journal on Information Security*, 2017)
- [NIST Computer Forensics Tool Testing Program (CFTT)](https://www.nist.gov/itl/ssd/software-quality-group/computer-forensics-tool-testing-program-cftt)
