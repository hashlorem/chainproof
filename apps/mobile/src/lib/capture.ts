import type { EvidenceManifest } from "@chainproof/shared";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import * as Location from "expo-location";
import { confirmPresence, getDevice, sha256Bytes, sign } from "./device";
import { enqueue, flushQueue } from "./queue";

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

async function currentGps(): Promise<EvidenceManifest["gps"]> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return null;
  const fix =
    (await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), 8000)) ??
    (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }));
  if (!fix) return null;
  return {
    lat: Number(fix.coords.latitude.toFixed(7)),
    lon: Number(fix.coords.longitude.toFixed(7)),
    accuracy: fix.coords.accuracy == null ? null : Math.round(fix.coords.accuracy * 10) / 10,
  };
}

const MIME_BY_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", mp4: "video/mp4", mov: "video/quicktime" };

export function mimeFromUri(uri: string, fallback: string): string {
  const ext = uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? fallback;
}

/**
 * Turns a fresh camera file into signed evidence:
 * move it out of the temp cache → SHA-256 → GPS → manifest → biometric check → Ed25519 signature → upload queue.
 */
export async function sealCapture(caseId: string, tempUri: string, capturedAt: Date, mime = "image/jpeg") {
  const device = await getDevice();
  if (!device) throw new Error("This phone is not enrolled. Sign in again.");

  const evidenceUuid = Crypto.randomUUID();
  const ext = Object.entries(MIME_BY_EXT).find(([, m]) => m === mime)?.[0] ?? "bin";
  const dir = new Directory(Paths.document, "evidence");
  if (!dir.exists) dir.create();
  // Read the camera's temp file once, write those exact bytes to app storage, then hash the same bytes.
  const temp = new File(tempUri);
  const bytes = await temp.bytes();
  // Expo's fetch uploads a file under its name on disk, so give it the readable name here.
  const stamp = capturedAt.toISOString().replace(/[-:]/g, "").slice(0, 15);
  const prefix = mime.startsWith("video/") ? "VID" : "IMG";
  const file = new File(dir, `${prefix}_${stamp}_${evidenceUuid.slice(0, 8)}.${ext}`);
  file.create();
  file.write(bytes);
  try {
    temp.delete();
  } catch {}

  const manifest: EvidenceManifest = {
    evidence_uuid: evidenceUuid,
    case_id: caseId,
    sha256: await sha256Bytes(bytes),
    mime,
    size: bytes.length,
    captured_at: capturedAt.toISOString(),
    gps: await currentGps(),
    device_id: device.deviceId,
    user_id: device.userId,
    app_version: Constants.expoConfig?.version ?? "dev",
  };

  if (!(await confirmPresence("Sign this evidence"))) {
    file.delete();
    throw new Error("Not signed: identity check was cancelled");
  }
  const signature = await sign(manifest);
  await enqueue({ manifest, signature, fileUri: file.uri, filename: file.name, attempts: 0 });
  flushQueue().catch(() => {});
  return manifest;
}
