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

/**
 * Turns a fresh camera file into signed evidence:
 * move it out of the temp cache → SHA-256 → GPS → manifest → biometric check → Ed25519 signature → upload queue.
 */
export async function sealCapture(caseId: string, tempUri: string, capturedAt: Date, mime = "image/jpeg") {
  const device = await getDevice();
  if (!device) throw new Error("This phone is not enrolled. Sign in again.");

  const evidenceUuid = Crypto.randomUUID();
  const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
  const dir = new Directory(Paths.document, "evidence");
  if (!dir.exists) dir.create();
  const file = new File(dir, `${evidenceUuid}.${ext}`);
  new File(tempUri).move(file);

  const bytes = await file.bytes();
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
  const stamp = capturedAt.toISOString().replace(/[-:]/g, "").slice(0, 15);
  await enqueue({ manifest, signature, fileUri: file.uri, filename: `IMG_${stamp}.${ext}`, attempts: 0 });
  flushQueue().catch(() => {});
  return manifest;
}
