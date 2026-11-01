# ChainProof

Tamper-evident digital evidence for investigators: a **phone app** that signs every photo the moment it is taken, a **web app** that tracks every touch in a hash-chained chain of custody, and **photo forensics** that flags edited or AI-generated images.

> IT course project · cybersecurity · web + mobile

## What it proves

| Question | How ChainProof answers it |
|---|---|
| Was this photo or video changed after capture? | SHA-256 hashed **on the phone** at the shutter press, re-hashed by the server on upload and on every verify |
| Which device took it, when and where? | Signed manifest (hash, GPS, time, device, user) using an **Ed25519 key that never leaves the phone** |
| Could the time be faked? | Independent **RFC 3161 trusted timestamp** from FreeTSA on every upload |
| Who touched it since? | **Hash-chained custody log**: each entry hashes the previous one and is signed by the server. The database refuses UPDATE/DELETE |
| Is this printed report genuine? | Every PDF is registered by hash. Anyone can check it on the public `/verify` page |
| Was the photo edited? | Copy-move (clone) detection that also finds resized and rotated copies, metadata analysis, C2PA Content Credentials, and an error-level heatmap as a visual aid |
| Where has this photo been? | **File history** from the file's structure: camera original, re-saved by software (even when camera data was copied across), Facebook, consistent with WhatsApp, Messenger |
| Is this a copy of our evidence, and what changed? | **Visual fingerprints** find re-saved, resized, rotated or edited copies of stored evidence; a **difference map** outlines exactly what changed, including splices |
| How far can I trust each check? | Every check has a **measured error rate** from a labelled test set of real phone photos (`docs/validation`), shown next to each finding |
| Who concluded what, and was it checked? | **Examinations**: notes, a conclusion on a stated scale, and a second examiner's review, all written into the custody chain, plus a per-item examination report |

## Layout

```
apps/web/          Next.js 16 — investigators' dashboard + public verify page   (port 3100)
apps/mobile/       Expo SDK 57 — capture, sign, offline upload queue, "check a photo"
packages/shared/   TypeScript: manifest types, RFC 8785 canonical JSON, Ed25519 sign/verify, chain verification
server/            FastAPI — API, custody chain, TSA, forensics, PDF reports        (port 8000)
```

The phone signs in TypeScript and the server verifies in Python. `packages/shared/test/vectors.json` is checked by **both** test suites so the two can never drift apart.

## Run it

Needs Node 22+, pnpm, and [uv](https://docs.astral.sh/uv/) (Python 3.12 is installed automatically).

```bash
pnpm install

# 1. API (SQLite + local files by default, no Docker needed)
cd server
uv run python -m scripts.seed                       # demo users, password: chainproof123
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000

# 2. Web (new terminal)
pnpm web                                            # http://localhost:3100

# 3. Optional: fill a demo case without a phone
cd server && uv run python -m scripts.demo_data

# 4. Phone (new terminal)
pnpm mobile                                         # scan the QR code with Expo Go
```

On the phone's login screen, set **Server** to your computer's LAN address, for example `http://192.168.1.20:8000`, not `localhost`. The phone and the computer must be on the same Wi-Fi.

**Android emulator instead of a phone:**
1. Start the emulator with a virtual camera, so it doesn't use your webcam:
   `emulator -avd <name> -camera-back virtualscene`
2. Run `pnpm mobile` and press `a`.
3. Use `http://10.0.2.2:8000` as the server. That's how the emulator reaches your computer.

Photos from the emulator's camera often come out black. That's an emulator limitation; real phones are fine.

Demo accounts: `investigator@`, `supervisor@` and `auditor@chainproof.dev`. The password is `chainproof123`.

### Presentation mode: public https addresses

```bash
./demo.sh
```

This runs the API and web app on this laptop and opens two free Cloudflare tunnels, so a real phone works on any network and the QR codes in PDFs open for anyone. It prints the web address, the API address and the command for the phone app. Press Ctrl+C to stop everything.

- **Install first:** `brew install cloudflared`. No account is needed.
- **Addresses change:** you get new ones every run.
- **Passwords:** the app is public while the tunnel is open. Change the demo passwords first: click your name to change yours, and supervisors use **Users → Reset password** for the others. The script refuses to start while any account still uses `chainproof123`.
- **Video size:** Cloudflare's free tunnel rejects uploads over 100 MB, so phone videos stop at 90 MB.

### Installable Android app and updates

Expo Go is for development. To put ChainProof on someone else's Android phone, build an APK with EAS. It needs a free Expo account; the project is `@hashlorem/chainproof`.

```bash
cd apps/mobile
pnpm dlx eas-cli@latest login                                        # once
pnpm dlx eas-cli@latest build --platform android --profile preview  # or from the repo root: pnpm mobile:build
```

Open the install link on the Android phone, download the APK and allow "install unknown apps" when asked. The phone needs an `https://` server address, such as the API address from `./demo.sh`. Release builds refuse plain `http://`.

**Sending a change to installed phones:**

```bash
cd apps/mobile
pnpm dlx eas-cli@latest update --channel preview --environment preview --message "what changed"
# or from the repo root: pnpm mobile:update "what changed"
```

The next time the app opens or comes back to the screen, it shows **Update available**. **Update now** restarts it on the new code. **Settings → App version** shows which update a phone is running.

Updates only carry JavaScript: screens, logic and text. A new native library, a permission change or an Expo SDK upgrade needs a new APK. When that happens, raise `version` in `app.json` (and `android.versionCode`) and run the build again. The runtime version follows `version`, so old APKs never receive an update they can't run.

### Postgres instead of SQLite

```bash
docker compose up -d db
export CHAINPROOF_DATABASE_URL=postgresql+psycopg://chainproof:chainproof@localhost:5432/chainproof
```

Other settings are listed in `server/app/config.py`. Each one can be set with a `CHAINPROOF_*` environment variable, for example `CHAINPROOF_TSA_ENABLED=false` to work offline.

## Tests

```bash
cd server && uv run pytest                # 88 tests: signatures, chain tampering, DB triggers, TSA, forensics, PDF, security, migrations,
                                          #   examinations, and a validation regression gate on six real photos
pnpm shared:test                          # 8 tests: same vectors from the TypeScript side

# Same server suite against Postgres (the database is wiped first, so use a throwaway one):
CHAINPROOF_TEST_DATABASE_URL=postgresql+psycopg://user@localhost:5432/chainproof_test uv run pytest
```

GitHub Actions runs the server tests and the shared, web and mobile checks on every push (`.github/workflows/ci.yml`).

## Examining a photo

On a case's evidence page, below **Photo forensics**, the **Examination** panel records the work the way a forensic
lab would:

1. **Notes**: what you did and observed, as you go.
2. **Conclusion**: two competing explanations (H1 and H2), how strongly the findings support one over the other
   (*no support / limited / moderate / strong / very strong*), your reasoning and your limitations. Never "proves".
3. **Technical review**: a *different* examiner agrees or disagrees. A new conclusion needs a new review.
4. **Examination report (PDF)**: provenance and hashes, file structure, heatmap and clone overlay, findings with their
   measured error rates, notes, conclusion, review, method and tool versions. It is registered by hash, so `/verify`
   recognises it.

All of these are custody entries, so they can't be edited or deleted. **Check a photo** can file any photo into a case
with **Open an examination**.

### Copies of evidence

**Check a photo** also searches every evidence image for copies: a WhatsApp or Facebook version, a screenshot, a
resized, rotated or edited copy. Each hit is either a *visual match* (perceptual hash within 10 of 64 bits) or *same
scene, visibly changed* (up to 24 bits, confirmed by 40+ matching points on one scene geometry). **Compare** lines the
copy up with the stored original and outlines what changed. Each evidence page has the same **Compare a copy** panel.
Comparisons are logged in custody as `COMPARED`. The search needs a login: a public version would let anyone probe whether
a photo is held as evidence.

### On your own machine (no server)

```bash
cd server
uv run python -m scripts.examine file ~/Downloads/photo.jpg --out exam/ --examiner "Your Name" --source "Sent by …"
uv run python -m scripts.examine batch ~/Downloads/case-photos --out exam/      # one folder per photo + summary.csv
```

The photo is hashed first, analysed only as a copy, and hashed again at the end. If the hashes differ, the run stops.
Each photo gets `report.json`, the overlays and `examination.pdf`.

## How reliable are the checks? (validation)

Forensic tools are only trustworthy if you know how often they're wrong. `server/app/validation` tests every check on a
labelled set of benign and manipulated images, in the spirit of NIST's Computer Forensics Tool Testing (CFTT):

- **Benign:** 105 real photos from 35 phones (the VISION dataset, CC BY-SA 4.0), the same photos after WhatsApp and
  Facebook, re-saved, and resized.
- **Manipulated:** generated from those photos: same-size, nearby, resized and rotated clones, object removal, and
  splices from another phone's photo, then re-saved at different qualities or recompressed like a messenger.

Latest results (1,155 images; full detail and 95% confidence intervals in the report):

| | Result |
|---|---|
| Untouched photos (incl. WhatsApp, Facebook, re-saved, resized) called *Likely manipulated* | **0 of 525** |
| Untouched photos called *Suspicious* or worse | **0.8%** (4 of 525); 0.4% on phones held out from tuning |
| Copied regions found **in the right place**: same size / nearby / resized / rotated / object removal | 91% / 77% / 84% / 92% / 64% |
| Splices from a different photo, photo examined alone | **not detected** (0%): copy-move can't see them, and ELA proved unreliable |
| Copies traced back to their stored original | **99.9%** (1,049 of 1,050); unrelated photos wrongly matched: **0 of 10,920** pairs |
| Difference map against the original: changes reported on innocent copies / edits outlined | **0 of 420** / **83%** (splices **95%**) |
| File history: camera originals / Facebook / WhatsApp recognised | 100% / 100% / 99%; no re-saved file ever called a camera original (0 of 1,050) |
| AI-generated images | only via Content Credentials from a signer on the official C2PA trust list (ChatGPT's are); a self-signed claim or an AI name in the metadata is only a warning; no learned detector passed testing |

The full report, with 95% confidence intervals, results by edit type and by recompression, a held-out check and the
limitations, is in [`docs/validation/VALIDATION.md`](docs/validation/VALIDATION.md). To reproduce it (about 1.3 GB of
test images, around 10 minutes on 8 cores):

```bash
cd server
uv run python -m scripts.validate fetch-vision --root validation_data
uv run python -m scripts.validate generate --root validation_data
uv run python -m scripts.validate run --root validation_data --out ../docs/validation
```

**Rule:** after changing anything in `server/app/forensics`, re-run the validation and commit the new report together with
`server/app/forensics/validated_rates.json`.

## Changing the database

The API applies migrations from `server/migrations` every time it starts. After you edit `server/app/models.py`:

```bash
cd server
uv run alembic revision --autogenerate -m "describe the change"   # review the generated file
uv run pytest tests/test_migrations.py                              # fails if models and migrations disagree
```

## Presentation demo (about 5 minutes)

1. **Capture.** On the phone, open a case and take 2–3 photos and a short video. Point out "Signed and queued" and the hash.
2. **Offline.** Turn on airplane mode and take a photo. It waits in the queue. Turn airplane mode off and it uploads, with the signature still valid.
3. **Web.** Open the case. Show the map, the custody timeline and the "Timestamped" badges. Click **Verify integrity**: all green, and checked a second time *in the browser*. Verify also sends the newest entry's hash to FreeTSA ("Log anchored").
4. **Attack.** As the "insider with database access":
   ```bash
   cd server && uv run python -m scripts.tamper_demo --smart
   ```
   Click **Verify** again. The timeline turns red at the exact entry that was forged.
   Then play the laptop's owner, who also has the server's signing key:
   ```bash
   uv run python -m scripts.tamper_demo --resign
   ```
   Every hash is recomputed and re-signed, so the chain itself checks out again. Click **Verify**: it still fails, because
   the FreeTSA timestamp from step 3 no longer matches, and a new one would carry today's date.
5. **Forensics.** Import an edited photo, for example one with a cloned area, then click **Run analysis**. It shows "Likely manipulated" with the clone highlighted, and how often that check is wrong.
   Add a note, record a conclusion as the investigator, review it as the supervisor, and export the examination report.
6. **Copies.** In **Check a photo**, drop the edited copy of a photo whose original is in a case. ChainProof finds the
   original ("same scene, visibly changed") and **Compare** outlines exactly what was changed.
7. **Report.** Click **Export PDF** and scan its QR code with a phone. The public page confirms the record. Edit one byte of the PDF and it is no longer recognised.

## Security notes

- **Logins:** 5 failed attempts lock an account for 15 minutes. An IP gets 20 attempts, because a class can share one IP.
- **JWT secret:** if `CHAINPROOF_JWT_SECRET` isn't set, a random secret is generated once and kept next to the server's signing key. Nothing secret is hardcoded.
- **Timestamps:** tokens must be signed by FreeTSA's pinned certificate (`tsa_cert_sha256` in `config.py`).
- **Uploaded files:** they're untrusted. Only images and PDFs display inline. Everything else downloads, under a sandbox CSP.

## Honest limitations

- A device signature proves **which enrolled device** signed the file, not that the scene is real. The device clock can be wrong, which is why the TSA timestamp at upload matters.
- Forensic checks give **indicators, not proof**.
- Audio-only recordings aren't supported yet. Video records sound when the microphone is allowed.
- Signing keys are software keys in the Keychain/Keystore. Hardware-backed keys (Secure Enclave / StrongBox) need a development build and are future work.
- The login limiter lives in memory, so it resets on restart and covers one API process.
- Files are stored on local disk (content-addressed, read-only). MinIO/S3 with object lock is the production path. `docker-compose.yml` already includes MinIO.
