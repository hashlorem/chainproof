/**
 * This phone's signing identity. The Ed25519 private key is created here, kept in the
 * Keychain/Keystore (expo-secure-store) and never sent anywhere. The server only gets the public key.
 */
import { publicKeyFromSecret, signManifest, type EvidenceManifest } from "@chainproof/shared";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { api } from "./api";

const KEY = "chainproof.device";
type Stored = { secretKeyHex: string; publicKeyHex: string; deviceId: string; userId: string };

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const opts = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export async function getDevice(): Promise<Stored | null> {
  const raw = await SecureStore.getItemAsync(KEY, opts);
  return raw ? (JSON.parse(raw) as Stored) : null;
}

/** Makes a key and registers it, or reuses the one already enrolled for this user. */
export async function ensureEnrolled(userId: string): Promise<Stored> {
  const existing = await getDevice();
  if (existing && existing.userId === userId) return existing;

  const secretKeyHex = toHex(await Crypto.getRandomBytesAsync(32)); // secure RNG, never Math.random
  const publicKeyHex = publicKeyFromSecret(secretKeyHex);
  const name = [Device.manufacturer, Device.modelName].filter(Boolean).join(" ") || "Phone";
  const device = await api.post<{ id: string }>("/devices", { name, public_key_hex: publicKeyHex });
  const stored = { secretKeyHex, publicKeyHex, deviceId: device.id, userId };
  await SecureStore.setItemAsync(KEY, JSON.stringify(stored), opts);
  return stored;
}

export async function forgetDevice() {
  await SecureStore.deleteItemAsync(KEY, opts);
}

/** Ask for fingerprint/face (or passcode) before signing, so a borrowed unlocked phone can't sign evidence. */
export async function confirmPresence(reason: string): Promise<boolean> {
  if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) return true;
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: reason });
  return r.success;
}

export async function sign(manifest: EvidenceManifest): Promise<string> {
  const d = await getDevice();
  if (!d) throw new Error("This phone is not enrolled");
  return signManifest(manifest, d.secretKeyHex);
}

export async function sha256Bytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return toHex(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes)));
}
