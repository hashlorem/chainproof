// Writes test/vectors.json: fixed inputs + outputs that server/tests also check, so TS and Python stay in agreement.
import { writeFileSync } from "node:fs";
import { computeEntryHash, publicKeyFromSecret, signManifest } from "../src/crypto.ts";
import { GENESIS_HASH, type CustodyEntry, type EvidenceManifest } from "../src/types.ts";

const secretKeyHex = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const manifest: EvidenceManifest = {
  evidence_uuid: "5b0c6a8e-2f43-4c1a-9d0e-7f1c2b3a4d5e",
  case_id: "c0ffee00-0000-4000-8000-000000000001",
  sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  mime: "image/jpeg",
  size: 2048576,
  captured_at: "2026-10-13T14:03:22.512Z",
  gps: { lat: 41.2995, lon: 69.2401, accuracy: 4.5 },
  device_id: "d0000000-0000-4000-8000-000000000007",
  user_id: "u0000000-0000-4000-8000-000000000003",
  app_version: "0.1.0",
};

const chain: CustodyEntry[] = [];
let prev = GENESIS_HASH;
const raw = [
  { action: "CASE_OPENED", evidence_id: null, details: { title: "Warehouse break-in" } },
  { action: "UPLOADED", evidence_id: manifest.evidence_uuid, details: { sha256: manifest.sha256, size: 2048576 } },
  { action: "VIEWED", evidence_id: manifest.evidence_uuid, details: {} },
] as const;
raw.forEach((r, i) => {
  const base = {
    seq: i + 1,
    case_id: manifest.case_id,
    evidence_id: r.evidence_id,
    action: r.action,
    actor_id: manifest.user_id,
    ts: `2026-10-13T14:0${4 + i}:00.000000Z`,
    details: r.details as Record<string, unknown>,
    prev_hash: prev,
  };
  const entry_hash = computeEntryHash(base);
  chain.push({ ...base, entry_hash });
  prev = entry_hash;
});

const vectors = {
  secret_key_hex: secretKeyHex,
  public_key_hex: publicKeyFromSecret(secretKeyHex),
  manifest,
  signature_hex: signManifest(manifest, secretKeyHex),
  chain,
};
writeFileSync(new URL("../test/vectors.json", import.meta.url), JSON.stringify(vectors, null, 2) + "\n");
console.log("wrote test/vectors.json");
