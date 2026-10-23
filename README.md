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
| Was the photo edited? | Metadata analysis, Error Level Analysis, copy-move (clone) detection, C2PA Content Credentials |

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
- **Passwords:** the app is public while the tunnel is open. Change the demo passwords first: click your name to change yours, and supervisors use **Users → Reset password** for the others. The script warns you if any account still uses `chainproof123`.
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
cd server && uv run pytest                # 36 tests: signatures, chain tampering, DB triggers, TSA, forensics, PDF, security, migrations
pnpm shared:test                          # 8 tests: same vectors from the TypeScript side

# Same server suite against Postgres (the database is wiped first, so use a throwaway one):
CHAINPROOF_TEST_DATABASE_URL=postgresql+psycopg://user@localhost:5432/chainproof_test uv run pytest
```

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
3. **Web.** Open the case. Show the map, the custody timeline and the "Timestamped" badges. Click **Verify integrity**: all green, and checked a second time *in the browser*.
4. **Attack.** As the "insider with database access":
   ```bash
   cd server && uv run python -m scripts.tamper_demo --smart
   ```
   Click **Verify** again. The timeline turns red at the exact entry that was forged.
5. **Forensics.** Import an edited photo, for example one with a cloned area, then click **Run analysis**. It shows "Likely manipulated" with the clone highlighted.
6. **Report.** Click **Export PDF** and scan its QR code with a phone. The public page confirms the record. Edit one byte of the PDF and it is no longer recognised.

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
