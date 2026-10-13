import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const SERVER_KEY = "chainproof.server";
const TOKEN_KEY = "chainproof.token";

export type User = { id: string; email: string; name: string; role: "investigator" | "supervisor" | "auditor" };
export type Case = { id: string; title: string; description: string; status: string; evidence_count?: number; created_at: string };
export type Evidence = {
  id: string; filename: string; mime: string; size: number; sha256: string; provenance: "device_signed" | "imported";
  received_at: string; tsa_status: string; tsa_time: string | null; forensics_label: string | null;
  manifest: { captured_at?: string; gps?: { lat: number; lon: number; accuracy: number | null } | null };
};
export type Finding = { severity: "info" | "low" | "medium" | "high"; title: string; detail: string };
export type ForensicReport = {
  verdict: string; label: string; findings: Finding[]; disclaimer: string;
  checks: { ela: { heatmap_png?: string }; copy_move: { overlay_png?: string | null } };
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let serverUrl: string | null = null;
let token: string | null = null;

export async function loadSession() {
  serverUrl = await AsyncStorage.getItem(SERVER_KEY);
  token = await SecureStore.getItemAsync(TOKEN_KEY);
  return { serverUrl, hasToken: !!token };
}

export function getServerUrl() {
  return serverUrl;
}

/** For <Image source={{ uri, headers }}>, which can't use fetch(). */
export function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function setServerUrl(url: string) {
  serverUrl = url.replace(/\/+$/, "");
  await AsyncStorage.setItem(SERVER_KEY, serverUrl);
}

export async function setToken(t: string | null) {
  token = t;
  if (t) await SecureStore.setItemAsync(TOKEN_KEY, t, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!serverUrl) throw new ApiError(0, "No server set");
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(`${serverUrl}${path}`, { ...init, headers });
  } catch (e) {
    console.info(`[chainproof] ${init.method ?? "GET"} ${path} failed:`, e);
    throw new ApiError(0, `Can't reach ${serverUrl} (${e instanceof Error ? e.message : String(e)})`);
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body) }),
};
