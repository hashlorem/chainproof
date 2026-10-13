import canonicalize from "canonicalize";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { GENESIS_HASH, type CustodyEntry, type EvidenceManifest } from "./types.ts";

export function canonical(value: unknown): string {
  const out = canonicalize(value);
  if (out === undefined) throw new Error("value cannot be canonicalized");
  return out;
}

export function sha256Hex(data: Uint8Array | string): string {
  return bytesToHex(sha256(typeof data === "string" ? utf8ToBytes(data) : data));
}

export function generateKeypair(): { secretKeyHex: string; publicKeyHex: string } {
  const sk = ed25519.utils.randomSecretKey();
  return { secretKeyHex: bytesToHex(sk), publicKeyHex: bytesToHex(ed25519.getPublicKey(sk)) };
}

export function publicKeyFromSecret(secretKeyHex: string): string {
  return bytesToHex(ed25519.getPublicKey(hexToBytes(secretKeyHex)));
}

export function signManifest(manifest: EvidenceManifest, secretKeyHex: string): string {
  const msg = utf8ToBytes(canonical(manifest));
  return bytesToHex(ed25519.sign(msg, hexToBytes(secretKeyHex)));
}

export function verifyManifest(manifest: EvidenceManifest, signatureHex: string, publicKeyHex: string): boolean {
  try {
    const msg = utf8ToBytes(canonical(manifest));
    return ed25519.verify(hexToBytes(signatureHex), msg, hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}

/** The server signs every entry_hash, so a forged entry can't be slipped in even with a recomputed hash. */
export function verifyEntrySignature(entryHashHex: string, signatureHex: string, serverPublicKeyHex: string): boolean {
  try {
    return ed25519.verify(hexToBytes(signatureHex), hexToBytes(entryHashHex), hexToBytes(serverPublicKeyHex));
  } catch {
    return false;
  }
}

/** Must match server/app/core/chain.py::compute_entry_hash. */
export function computeEntryHash(entry: Omit<CustodyEntry, "entry_hash">): string {
  const { seq, case_id, evidence_id, action, actor_id, ts, details, prev_hash } = entry;
  return sha256Hex(canonical({ seq, case_id, evidence_id, action, actor_id, ts, details, prev_hash }));
}

export type ChainCheck = { ok: true; length: number } | { ok: false; brokenAt: number; reason: string };

/** Re-checks a whole chain in the browser or on the phone, without trusting the server's own verdict. */
export function verifyChain(entries: CustodyEntry[], serverPublicKeyHex?: string): ChainCheck {
  let prev = GENESIS_HASH;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.seq !== i + 1) return { ok: false, brokenAt: i + 1, reason: `expected seq ${i + 1}, found ${e.seq}` };
    if (e.prev_hash !== prev) return { ok: false, brokenAt: e.seq, reason: "prev_hash does not match previous entry" };
    if (computeEntryHash(e) !== e.entry_hash) return { ok: false, brokenAt: e.seq, reason: "entry content was modified" };
    if (serverPublicKeyHex && !verifyEntrySignature(e.entry_hash, e.server_sig ?? "", serverPublicKeyHex))
      return { ok: false, brokenAt: e.seq, reason: "server signature is invalid (entry was forged)" };
    prev = e.entry_hash;
  }
  return { ok: true, length: entries.length };
}
