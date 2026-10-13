import { describe, expect, it } from "vitest";
import vectors from "./vectors.json" with { type: "json" };
import {
  canonical,
  computeEntryHash,
  generateKeypair,
  signManifest,
  verifyChain,
  verifyManifest,
  type CustodyEntry,
  type EvidenceManifest,
} from "../src/index.ts";

const manifest = vectors.manifest as EvidenceManifest;
const chain = vectors.chain as CustodyEntry[];

describe("manifest signatures", () => {
  it("canonical JSON ignores key order", () => {
    expect(canonical({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });

  it("matches the shared test vector", () => {
    expect(signManifest(manifest, vectors.secret_key_hex)).toBe(vectors.signature_hex);
    expect(verifyManifest(manifest, vectors.signature_hex, vectors.public_key_hex)).toBe(true);
  });

  it("rejects a manifest edited after signing", () => {
    const edited = { ...manifest, gps: { lat: 40, lon: 69.2401, accuracy: 4.5 } };
    expect(verifyManifest(edited, vectors.signature_hex, vectors.public_key_hex)).toBe(false);
  });

  it("rejects a signature from another device", () => {
    const other = generateKeypair();
    expect(verifyManifest(manifest, vectors.signature_hex, other.publicKeyHex)).toBe(false);
  });
});

describe("custody chain", () => {
  it("accepts the untouched chain", () => {
    expect(verifyChain(chain)).toEqual({ ok: true, length: 3 });
  });

  it("detects a modified entry", () => {
    const tampered = chain.map((e) => ({ ...e }));
    tampered[1].details = { ...tampered[1].details, size: 1 };
    expect(verifyChain(tampered)).toMatchObject({ ok: false, brokenAt: 2 });
  });

  it("detects a deleted entry", () => {
    expect(verifyChain([chain[0], chain[2]])).toMatchObject({ ok: false, brokenAt: 2 });
  });

  it("detects a rewritten entry whose hash was recomputed", () => {
    const tampered = chain.map((e) => ({ ...e }));
    tampered[0].details = { title: "Something else" };
    tampered[0].entry_hash = computeEntryHash(tampered[0]);
    expect(verifyChain(tampered)).toMatchObject({ ok: false, brokenAt: 2 });
  });
});
