# ChainProof

Tamper-evident digital evidence for investigators: a **phone app** that signs every photo the moment it is taken, a **web app** that tracks every touch in a hash-chained chain of custody, and **photo forensics** that flags edited or AI-generated images.

> IT course project · cybersecurity · web + mobile

## What it proves

| Question | How ChainProof answers it |
|---|---|
| Was this file changed after capture? | SHA-256 hashed **on the phone** at the shutter press, re-hashed by the server on upload and on every verify |
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

Demo accounts: `investigator@`, `supervisor@` and `auditor@chainproof.dev`. The password is `chainproof123`.

### Postgres instead of SQLite

```bash
docker compose up -d db
export CHAINPROOF_DATABASE_URL=postgresql+psycopg://chainproof:chainproof@localhost:5432/chainproof
```

Other settings are listed in `server/app/config.py`. Each one can be set with a `CHAINPROOF_*` environment variable, for example `CHAINPROOF_TSA_ENABLED=false` to work offline.

## Tests

```bash
cd server && uv run pytest                # 26 tests: signatures, chain tampering, DB triggers, TSA, forensics, PDF
pnpm shared:test                          # 8 tests: same vectors from the TypeScript side
```

## Presentation demo (about 5 minutes)

1. **Capture.** On the phone, open a case and take 2–3 photos. Point out "Signed and queued" and the hash.
2. **Offline.** Turn on airplane mode and take a photo. It waits in the queue. Turn airplane mode off and it uploads, with the signature still valid.
3. **Web.** Open the case. Show the map, the custody timeline and the "Timestamped" badges. Click **Verify integrity**: all green, and checked a second time *in the browser*.
4. **Attack.** As the "insider with database access":
   ```bash
   cd server && uv run python -m scripts.tamper_demo --smart
   ```
   Click **Verify** again. The timeline turns red at the exact entry that was forged.
5. **Forensics.** Import an edited photo, for example one with a cloned area, then click **Run analysis**. It shows "Likely manipulated" with the clone highlighted.
6. **Report.** Click **Export PDF** and scan its QR code with a phone. The public page confirms the record. Edit one byte of the PDF and it is no longer recognised.

## Honest limitations

- A device signature proves **which enrolled device** signed the file, not that the scene is real. The device clock can be wrong, which is why the TSA timestamp at upload matters.
- Forensic checks give **indicators, not proof**.
- Signing keys are software keys in the Keychain/Keystore. Hardware-backed keys (Secure Enclave / StrongBox) need a development build and are future work.
- The TSA token is checked against the certificate inside it. Pinning FreeTSA's CA certificate would make this stricter.
- Files are stored on local disk (content-addressed, read-only). MinIO/S3 with object lock is the production path. `docker-compose.yml` already includes MinIO.
