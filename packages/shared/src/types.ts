/** Signed on the phone at capture time. Field order does not matter: it is canonicalized (RFC 8785) before signing. */
export interface EvidenceManifest {
  evidence_uuid: string;
  case_id: string;
  sha256: string;
  mime: string;
  size: number;
  captured_at: string; // ISO 8601, device clock
  gps: { lat: number; lon: number; accuracy: number | null } | null;
  device_id: string;
  user_id: string;
  app_version: string;
}

export const CUSTODY_ACTIONS = [
  "CASE_OPENED",
  "CASE_CLOSED",
  "CASE_REOPENED",
  "CAPTURED",
  "UPLOADED",
  "VIEWED",
  "DOWNLOADED",
  "ANALYZED",
  "TRANSFERRED",
  "EXPORTED",
  "VERIFIED",
  "TIMESTAMPED",
  "NOTED",
  "CONCLUDED",
  "REVIEWED",
] as const;
export type CustodyAction = (typeof CUSTODY_ACTIONS)[number];

/** One link in a case's chain of custody, exactly as the API returns it. */
export interface CustodyEntry {
  seq: number;
  case_id: string;
  evidence_id: string | null;
  action: CustodyAction;
  actor_id: string;
  ts: string;
  details: Record<string, unknown>;
  prev_hash: string;
  entry_hash: string;
  /** Server's Ed25519 signature over entry_hash (hex). */
  server_sig?: string;
}

export const GENESIS_HASH = "0".repeat(64);
