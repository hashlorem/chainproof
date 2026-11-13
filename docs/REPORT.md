# ChainProof Forensics Upgrade Report

Snapshot of 1 Nov 2026. Full numbers are in
[`docs/validation/VALIDATION.md`](validation/VALIDATION.md).

ChainProof keeps photo and video evidence tamper-evident from the moment it is taken to the printed report, and checks photos for editing with a measured error rate on every finding. Untouched photos are wrongly flagged 0.8% of the time, and comparing a copy with the stored original outlines 93% of edits. This report covers what ChainProof does, how to use it, how we tested it and what it can't do.

## What ChainProof is

ChainProof has three parts: a **phone app** that signs every photo or video at the shutter press, a **server** that keeps a tamper-evident record of everyone who touched each file, and a **web app** where investigators examine the evidence and export reports. It was built as an IT course project in cybersecurity, aimed at the way a digital forensics examiner works.

```
Phone app ──signed upload──▶ Server ◀──examine──▶ Web app (staff)
                               ▲  ▲
                      RFC 3161 │  └──hash lookup── Public verify
                               ▼
                            FreeTSA
```

The phone is the only place a capture is signed. Everything after that, from an upload to a PDF export, becomes a new entry in the server's chain, and FreeTSA's timestamps make a rewritten chain detectable even by someone holding the server's key.

| Question an examiner gets asked | How ChainProof answers it |
| --- | --- |
| Was this photo changed after it was taken? | The phone computes its SHA-256 hash at capture; the server re-hashes it on upload and on every check |
| Which phone took it, when and where? | A manifest (hash, GPS, time, device, user) signed with an Ed25519 key that never leaves the phone |
| Could the time be faked? | An independent RFC 3161 timestamp from FreeTSA on every upload |
| Who handled it since? | A custody log where each entry contains the hash of the one before it. The database refuses edits and deletes, and FreeTSA timestamps the log on every check |
| Was the photo edited? | Clone detection (including resized and rotated copies), metadata, Content Credentials (C2PA), and a comparison against the stored original |
| Where has this file been? | File history read from the file's structure: camera original, re-saved, Facebook, consistent with WhatsApp |
| How far can I trust each check? | Every finding shows its measured error rate and what else could explain it |
| Is this printed report genuine? | Every PDF is registered by its hash, and anyone can check it on the public Verify page by QR code |

The strongest evidence is a photo signed in the ChainProof app at capture. Detection after the fact is the fallback for files that arrive from somewhere else.

## New since 31 October

Compare now catches pen marks drawn on a photo (104 of 105), and the web and phone apps share a new, calmer look built for examiners. Both are on the `redesign-2` branch and are not yet merged into `main`.

| Change | Before | After |
| --- | --- | --- |
| Drawn marks (pen strokes, scribbles) outlined by Compare | 49% (51 of 105) | **99%** (104 of 105) |
| Innocent copies wrongly reported as changed | 0 of 420 | **0 of 420** |
| All edits outlined by Compare (seven edit types) | 83% of six types | **93%** (682 of 735) |
| Compare views | Difference map only | Difference, side by side, and swipe |
| PDF reports | Grid tables, raw ISO timestamps | Clean rules, "1 Nov 2026, 07:51:05 UTC" |

- **Drawn marks.** We added a "doodle" edit type to the test set after a real hand edit of our bouquet photo showed a gap. Thin strokes now get their own pass in the difference map. A photo examined on its own still shows no sign of a drawn mark (0 of 105), so Compare needs the original.
- **Redesign ("Examiner").** Dark by default, panes instead of boxes, and colour only where it means something: green for verified, amber for unverified (an imported file), red for a problem, grey for nothing found. Before this, "No signs of manipulation" showed in green, which reads as "verified" and overstates what the checks can say.
- **Custody log as a chain.** The case page draws the log as a spine: solid where FreeTSA has timestamped the entries, dashed after that, with a seal on each anchor.

These figures come from a validation run on the branch on 1 November 2026. The official report in `docs/validation/VALIDATION.md` is regenerated after the merge. Adding the 105 doodles lowers the overall "Suspicious or worse" detection rate from 69% to 60%, because those edits are only visible to Compare.

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

Phase 2 added two features. Comparing a copy against the stored original now catches every splice in the test set (105 of 105), the edit that a photo examined on its own never reveals.

| Feature | What it does | Measured on the test set |
| --- | --- | --- |
| File history | Reads how the file is built to say where it has been: camera original, re-saved by other software (even with copied camera data), passed through Facebook, consistent with WhatsApp, Messenger | Camera originals 100% (105/105) and Facebook 100% (105/105) recognised; WhatsApp 99% (104/105); no re-saved file ever called a camera original (0 of 1,050) |
| Copies of evidence: search | Finds stored evidence a photo was copied from, even if resized, rotated, sent through a messenger or edited. Close matches by visual fingerprint; heavily edited copies confirmed by matching scene geometry | 99.9% of copies traced (1,049/1,050); unrelated photos wrongly matched 0 of 10,920 pairs |
| Copies of evidence: compare | Lines the copy up with the stored original and outlines what changed in red; logged in the custody log | No change reported on 420 innocent copies; edits outlined 93% of the time (682/735), splices 100% (105/105), drawn marks 99% (104/105) |

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

Everything runs on one laptop; setup is in the repo's `README.md`. Demo accounts (`investigator@`, `supervisor@` and `auditor@chainproof.dev`) use the password `chainproof123`. Change it before any public demo: `./demo.sh` refuses to start until you do.

**1. Capture on the phone** (Expo Go, or the installable Android app):

1. Sign in and set **Server** to the laptop's address, for example `http://192.168.1.20:8000` on the same Wi-Fi, or the https address `./demo.sh` prints.
2. Tap an open case, then **Capture**. Each photo or video is hashed and signed the moment it ends and shows **Signed at capture**.
3. With no connection, captures wait under **Waiting to upload** and go up on their own when the phone is back online, signature intact. **Upload now** retries straight away.
4. **Check a photo for editing** runs the photo checks on a picture from the gallery without recording anything.
5. **This device** shows the phone's Ed25519 public key and the app version.

**2. Examine in the web app** (http://localhost:3100):

1. **Cases → New case**, then open it. The case page shows the facts, the integrity panel, the evidence list, a map of GPS points and the custody chain.
2. **Import a file** for evidence that did not come from the app. It is tagged *Imported* in amber: we know when it arrived, not where it came from.
3. Open an item. The viewer switches between **Preview**, **Original** (opening it is logged), **Clone map** and **ELA**. **Run analysis** gives the verdict and each finding with *How reliable* and *What else explains it*.
4. Under **Compare a copy with this original**, drop a copy that is circulating. Switch between **Difference**, **Side by side** and **Swipe**. The copy is kept as an exhibit under its own SHA-256, and **Download the copy** is logged.
5. Under **Examination**: **Add note** as you work, then **Record conclusion** (H1 and H2, how strongly the findings support H1 over H2, reasoning, limitations). A different examiner submits the **Technical review**. Then download the **Examination report (PDF)**.
6. Back on the case: **Verify integrity** re-checks every hash and signature on the server and again in the browser, then has FreeTSA timestamp the log. **Export PDF** gives the case report. **Transfer custody** and **Close case** are logged too.

**Check a photo** in the side bar is a quick check that is not recorded. It also searches all evidence for copies of the photo; **Compare with this evidence** opens the comparison, and **Open an examination** files the photo into a case.

**3. Check a report anywhere:** **Public verify** opens in a new tab and needs no login. Drop an evidence file or a PDF report, or scan the QR code on the PDF. It matches exact SHA-256 hashes only, so a PDF changed by one byte is not recognised.

Notes, conclusions, reviews, comparisons, views and exports all go into the custody log, so none of them can be edited or deleted. To change your mind, record a new conclusion; it needs a new review.

4. **Examine photos on a laptop without the server:**

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

- **Splices are not detected in a photo examined on its own (0%).** A region pasted in from a different photo leaves no copy inside the image, and ELA proved unreliable. With the original in evidence, Compare outlines all 105 in the test set.
- **Drawn marks need the original too.** A pen stroke drawn on a photo leaves no trace the standalone checks can see (0 of 105). Compare outlines 104 of 105, and 50 of 51 on the phones held out from tuning.
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
