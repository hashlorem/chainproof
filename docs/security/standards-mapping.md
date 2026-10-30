# ChainProof against digital-forensics standards

How ChainProof's features line up with the standards a forensic lab works to, and where the gaps are. This is a
self-assessment for the course, not a certification: a real lab would also need independent testing and accreditation
(for example ISO/IEC 17025). Version: 31 Oct 2026.

## At a glance

| Standard | What it asks for | Covered by ChainProof | Main gap |
|---|---|---|---|
| ISO/IEC 27037 | Identify, collect, acquire and preserve digital evidence so it stays unchanged and accounted for | Hash and sign at capture, trusted timestamp, immutable storage, append-only custody log | The custody log's head is not externally anchored (threat TM-001) |
| ISO/IEC 27041 | Show that each method is suitable and works (validation) | Validation harness with measured error rates, held-out phones, regression gate in CI | Synthetic forgeries; no independent test lab |
| ISO/IEC 27042 | Analyse and interpret evidence competently, reproducibly, with stated confidence | Examinations: notes, conclusions on a fixed scale, peer review; tool versions in every report; command-line re-run | No record of examiner competence or training |
| ISO/IEC 27043 | A defined investigation process from incident to closure | Cases with custodian, transfer, closing and reopening; roles | No formal readiness or incident-response stage |
| NIST SP 800-86 | Collection → examination → analysis → reporting | Capture app → automated checks → examinations → case and examination PDFs | — |
| NIST CFTT | Test forensic tools against known samples and publish results | `docs/validation/VALIDATION.md`, reproducible from a hashed manifest | Not tested by NIST or a third party |
| ACPO principles (UK) | Don't change data; competent access; audit trail; responsibility | See the ACPO table below | Principle 2 (competence) is not recorded |
| SWGDE image authentication | Provenance → file structure → global → local → comparison → conclusion | One check per stage; the examination PDF follows this order | No noise or JPEG-ghost analysis yet (roadmap) |
| ENFSI evaluative reporting | Conclusions as support for one proposition over another, on a stated scale | Conclusion form: H1 vs H2, five-level scale, reasoning, limitations | — |

## ISO/IEC 27037: identification, collection, acquisition, preservation

| Requirement | ChainProof | Where |
|---|---|---|
| Record what was collected, by whom, when and where | Signed manifest with hash, time, GPS, device and user | `apps/mobile/src/lib/device.ts`, `packages/shared/src/crypto.ts` |
| Verify integrity with a hash at collection and later | SHA-256 on the phone at the shutter press, re-hashed on upload and on every verify | `server/app/routers/evidence.py`, `server/app/routers/verify.py` |
| Preserve the original unchanged | Content-addressed storage; database triggers forbid changing or deleting evidence records | `server/app/storage.py`, `server/app/db.py` |
| Independent proof of time | RFC 3161 token from FreeTSA per upload, with a pinned certificate | `server/app/core/tsa.py` |
| Document every handling step (chain of custody) | Hash-chained, server-signed custody log of every view, download, analysis, comparison, note, transfer and export | `server/app/core/chain.py` |
| Work on copies | Analysis and comparison read the stored original and write derived files only; the CLI copies, then re-hashes the original | `server/app/forensics`, `server/scripts/examine.py` |

## ISO/IEC 27041 and NIST CFTT: is the method fit for purpose?

| Requirement | ChainProof | Where |
|---|---|---|
| Test against samples with known answers | 1,155 labelled images: real phone photos, WhatsApp/Facebook copies, re-saves, six kinds of forgery | `server/app/validation` |
| Know the error rates | False-alarm and detection rates with 95% confidence intervals, per edit type and processing | `docs/validation/VALIDATION.md` |
| Avoid tuning on the test data | Thresholds tuned on odd-numbered phones; even-numbered phones held out; exceptions stated | same |
| Repeatable | Hash-listed test set, seeded generation, environment and commit recorded in every run | `server/app/validation/run.py` |
| Catch regressions | Small validation run in the test suite, on every push | `server/tests/test_validation_smoke.py`, `.github/workflows/ci.yml` |
| Tell the user | Each finding shows "How reliable" in the app and the PDF | `server/app/forensics/rates.py` |

## ISO/IEC 27042: analysis and interpretation

| Requirement | ChainProof | Where |
|---|---|---|
| Separate observation from interpretation | Automated findings are labelled indicators; the examiner's conclusion is a separate, signed custody entry | `server/app/routers/examination.py` |
| State conclusions with their strength | H1 vs H2 on a five-level scale, with required reasoning and limitations; "proves" is never offered | `apps/web/src/components/ExaminationPanel.tsx` |
| Peer review | A different examiner must review; a new conclusion needs a new review | `server/app/routers/examination.py` (`review`) |
| Reproducibility | Tool commit and library versions in every examination report; the CLI reproduces an analysis offline | `server/app/reports/examination.py`, `server/scripts/examine.py` |
| Report limitations | Every report lists the method's limitations and validation reference | `server/app/reports/examination.py` |

## ACPO principles

| Principle | ChainProof |
|---|---|
| 1. No action should change data that may be relied on in court | Originals are never modified; analysis works on copies; the CLI re-hashes the input and stops if it changed |
| 2. Whoever accesses original data must be competent and able to explain it | Roles limit who can act; **competence is not recorded** (gap) |
| 3. An audit trail of all processes, repeatable by a third party | Hash-chained custody log; validation and analyses can be re-run from recorded versions |
| 4. The person in charge is responsible for following the law and these principles | Each case has a named custodian; custody transfers are logged with reasons |

## SWGDE image authentication workflow

| Stage | ChainProof check | Measured |
|---|---|---|
| Provenance and acquisition | Signed capture; trusted timestamp | Signature and hash checks are exact |
| File structure | File history (camera, re-saved, Facebook, WhatsApp, Messenger), metadata, C2PA | Camera originals 100% recognised; no re-saved file called an original |
| Global analysis | ELA heatmap (visual aid only) | Caught 2% of edits, so it no longer affects the verdict |
| Local analysis | Copy-move v2 (resized, rotated, overlapping clones) | 0.8% false alarms; 82% of copied regions found in the right place |
| Comparison with a known original | Copies of evidence: search + difference map | 99.9% of copies traced; 95% of splices outlined; no false changes on 420 innocent copies |
| AI-generated content | C2PA Content Credentials | Works only when the label survives; learned detectors under evaluation (roadmap) |
| Conclusion and review | Examinations | — |

## Admissibility (Daubert factors, US)

| Factor | ChainProof's answer |
|---|---|
| Can the method be and has it been tested? | Yes: the validation harness, reproducible by anyone |
| Known error rate? | Published per check, with confidence intervals |
| Peer review and publication? | The underlying techniques are published (SIFT copy-move, perceptual hashing, RFC 3161, C2PA); ChainProof's own implementation is not peer-reviewed |
| Standards controlling its operation? | This mapping; fixed thresholds recorded in code and in the validation report |
| General acceptance? | Hashing, trusted timestamps and chain of custody are standard practice; image-forensic indicators are accepted as indicators, not proof |

## Gaps to close, in priority order

1. Timestamp the custody log's head externally (TM-001, ISO/IEC 27037 preservation).
2. Require approval for device enrolment (TM-002).
3. Record examiner competence (training, sign-off) for ACPO principle 2 and ISO/IEC 27042.
4. Independent testing of the validation results by someone outside the team.
