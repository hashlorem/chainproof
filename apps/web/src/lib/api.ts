import type { CustodyEntry, EvidenceManifest } from "@chainproof/shared";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "chainproof.token";

export type Role = "investigator" | "supervisor" | "auditor";
export interface User { id: string; email: string; name: string; role: Role }
export interface Case {
  id: string; title: string; description: string; status: string;
  created_by: string; created_at: string; custodian_id: string; evidence_count?: number;
}
export interface Evidence {
  id: string; case_id: string; uploaded_by: string; device_id: string | null; filename: string; mime: string;
  size: number; sha256: string; manifest: Partial<EvidenceManifest> & Record<string, unknown>; signature: string | null;
  provenance: "device_signed" | "imported"; received_at: string; tsa_status: string; tsa_time: string | null;
  forensics_label: string | null; forensics_verdict: ForensicReport["verdict"] | null; device?: { id: string; name: string; revoked: boolean }; forensics?: ForensicReport | null;
}
export interface Device {
  id: string; user_id: string; user_name?: string; name: string; public_key_hex: string;
  revoked: boolean; enrolled_at: string; revoked_at: string | null;
}
export interface Check { ok: boolean | null; detail: string }
export interface EvidenceCheck { evidence_id: string; filename: string; sha256: string; ok: boolean; checks: Record<string, Check> }
export interface Verification {
  ok: boolean;
  chain: { ok: boolean; length: number; broken_at: number | null; reason: string | null };
  evidence: EvidenceCheck[];
}
export interface Finding { severity: "info" | "low" | "medium" | "high"; title: string; detail: string; check: string }
export interface ForensicReport {
  verdict: "verified_capture" | "ai_generated" | "likely_manipulated" | "suspicious" | "no_signs";
  label: string; score: number; findings: Finding[]; disclaimer: string;
  checks: {
    metadata: { format: string; width: number; height: number; tags: Record<string, string>; gps: { lat: number; lon: number } | null };
    ela: { mean_error: number; outlier_ratio: number; heatmap_png?: string; has_ela_image?: boolean };
    copy_move: { pairs: number; regions: unknown[]; overlay_png?: string | null; has_copymove_image?: boolean };
    c2pa: { present: boolean; generator?: string; issuer?: string; validation_state?: string; ai_generated?: boolean };
  };
}
export type CustodyResponse = { server_public_key_hex: string; entries: CustodyEntry[] };

export const tokenStore = {
  get: () => (typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const token = tokenStore.get();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401 && token) {
    tokenStore.clear();
    // Outside React, so no router here. A full reload to /login also clears any stale page state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (typeof window !== "undefined" && !location.pathname.startsWith("/login")) location.href = "/login";
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {}
    throw new ApiError(res.status, msg);
  }
  return res;
}

export const api = {
  get: async <T,>(path: string) => (await request(path)).json() as Promise<T>,
  post: async <T,>(path: string, body?: unknown) =>
    (await request(path, { method: "POST", body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body) })).json() as Promise<T>,
  blob: async (path: string, init?: RequestInit) => {
    const res = await request(path, init);
    return { blob: await res.blob(), sha256: res.headers.get("X-Content-SHA256") };
  },
};

/** Hash a file in the browser (Web Crypto), so the public verify page never uploads the file itself. */
export async function sha256File(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export function formatTs(ts: string | null | undefined) {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? ts : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}
