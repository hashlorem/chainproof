/**
 * Offline-first upload queue. The hash and signature are made at capture time, so evidence
 * taken with no signal is just as trustworthy when it uploads hours later.
 */
import type { EvidenceManifest } from "@chainproof/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { File } from "expo-file-system";
import { api, ApiError } from "./api";

const KEY = "chainproof.queue";

export type QueueItem = {
  manifest: EvidenceManifest;
  signature: string;
  fileUri: string;
  filename: string;
  attempts: number;
  lastError?: string;
};

type Listener = (items: QueueItem[]) => void;
const listeners = new Set<Listener>();

export async function readQueue(): Promise<QueueItem[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
}

async function writeQueue(items: QueueItem[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
  listeners.forEach((l) => l(items));
}

export function subscribe(l: Listener) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

export async function enqueue(item: QueueItem) {
  await writeQueue([...(await readQueue()), item]);
}

async function uploadOne(item: QueueItem) {
  const fd = new FormData();
  // React Native's FormData streams the file straight from disk.
  fd.append("file", { uri: item.fileUri, name: item.filename, type: item.manifest.mime } as unknown as Blob);
  fd.append("manifest", JSON.stringify(item.manifest));
  fd.append("signature", item.signature);
  await api.post(`/cases/${item.manifest.case_id}/evidence`, fd);
}

let flushing: Promise<number> | null = null;

/** Uploads everything it can. Returns how many items are still waiting. */
export function flushQueue(): Promise<number> {
  flushing ??= (async () => {
    try {
      for (const item of await readQueue()) {
        try {
          await uploadOne(item);
          await removeItem(item, true);
        } catch (e) {
          const err = e as ApiError;
          if (err.status === 409) {
            await removeItem(item, true); // already on the server
          } else {
            item.attempts += 1;
            item.lastError = err.message;
            await writeQueue((await readQueue()).map((q) => (q.manifest.evidence_uuid === item.manifest.evidence_uuid ? item : q)));
            if (err.status === 0) break; // offline: stop and try again later
          }
        }
      }
      return (await readQueue()).length;
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

export async function removeItem(item: QueueItem, deleteFile: boolean) {
  if (deleteFile) {
    try {
      new File(item.fileUri).delete();
    } catch {}
  }
  await writeQueue((await readQueue()).filter((q) => q.manifest.evidence_uuid !== item.manifest.evidence_uuid));
}
