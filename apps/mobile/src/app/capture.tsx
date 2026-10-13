import type { EvidenceManifest } from "@chainproof/shared";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { mimeFromUri, sealCapture } from "@/lib/capture";
import { Button, Card, ErrorText, T, short } from "@/ui";

type Mode = "picture" | "video";
type Phase =
  | { kind: "ready" }
  | { kind: "recording"; startedAt: Date }
  | { kind: "sealing" }
  | { kind: "done"; manifest: EvidenceManifest }
  | { kind: "error"; message: string };

const MAX_VIDEO_SECONDS = 120;
const MAX_VIDEO_BYTES = 90 * 1024 * 1024; // Cloudflare's free tunnel rejects requests over 100 MB

export default function Capture() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [mic, requestMic] = useMicrophonePermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [mode, setMode] = useState<Mode>("picture");
  const [phase, setPhase] = useState<Phase>({ kind: "ready" });

  if (!permission) return <View style={styles.black} />;
  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.black, styles.center, { padding: 24, gap: 16 }]}>
        <T style={{ color: "#fff", textAlign: "center" }}>ChainProof needs the camera to capture evidence.</T>
        <Button title="Allow camera" onPress={requestPermission} />
        <Button title="Cancel" variant="secondary" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  async function seal(uri: string, capturedAt: Date, fallbackMime: string) {
    setPhase({ kind: "sealing" });
    try {
      const manifest = await sealCapture(caseId, uri, capturedAt, mimeFromUri(uri, fallbackMime));
      setPhase({ kind: "done", manifest });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function shoot() {
    if (!camera.current || phase.kind !== "ready") return;
    const capturedAt = new Date(); // shutter time, before GPS and signing
    try {
      // exif: false + no extra processing: the bytes we hash are the bytes the server receives.
      const photo = await camera.current.takePictureAsync({ quality: 0.92, exif: false, shutterSound: true });
      await seal(photo.uri, capturedAt, "image/jpeg");
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function toggleRecording() {
    if (!camera.current) return;
    if (phase.kind === "recording") {
      camera.current.stopRecording(); // recordAsync below resolves with the file
      return;
    }
    if (phase.kind !== "ready") return;
    const startedAt = new Date();
    setPhase({ kind: "recording", startedAt });
    try {
      const video = await camera.current.recordAsync({ maxDuration: MAX_VIDEO_SECONDS, maxFileSize: MAX_VIDEO_BYTES });
      if (!video) throw new Error("Recording failed");
      await seal(video.uri, startedAt, "video/mp4");
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function switchMode(next: Mode) {
    if (phase.kind !== "ready" || next === mode) return;
    if (next === "video" && !mic?.granted) await requestMic(); // denied → video records without sound
    setCameraReady(false);
    setMode(next);
  }

  const recording = phase.kind === "recording";

  return (
    <View style={styles.black}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode={mode}
        mute={mode === "video" && !mic?.granted}
        onCameraReady={() => setCameraReady(true)}
      />
      <SafeAreaView style={styles.overlay}>
        <View style={styles.top}>
          {!recording && (
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <T style={{ color: "#fff" }} size={16}>Close</T>
            </Pressable>
          )}
          {recording && <RecordingTimer startedAt={phase.startedAt} />}
        </View>

        {phase.kind === "sealing" && (
          <Card style={styles.panel}>
            <ActivityIndicator />
            <T weight="600">Sealing evidence…</T>
            <T size={13} muted>Hashing the file, reading GPS and signing with this phone&apos;s key.</T>
          </Card>
        )}
        {phase.kind === "done" && (
          <Card style={styles.panel}>
            <T weight="700" size={17}>Signed and queued ✓</T>
            <T size={13} muted>SHA-256</T>
            <T mono size={12}>{short(phase.manifest.sha256, 16)}</T>
            <T size={13} muted>
              {phase.manifest.gps ? `GPS ${phase.manifest.gps.lat.toFixed(5)}, ${phase.manifest.gps.lon.toFixed(5)} (±${phase.manifest.gps.accuracy ?? "?"} m)` : "No GPS fix"}
            </T>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              <Button title="Capture another" variant="secondary" style={{ flex: 1 }} onPress={() => setPhase({ kind: "ready" })} />
              <Button title="Done" style={{ flex: 1 }} onPress={() => router.back()} />
            </View>
          </Card>
        )}
        {phase.kind === "error" && (
          <Card style={styles.panel}>
            <ErrorText>{phase.message}</ErrorText>
            <Button title="Try again" onPress={() => setPhase({ kind: "ready" })} />
          </Card>
        )}

        {(phase.kind === "ready" || recording) && (
          <View style={styles.bottom}>
            {!recording && (
              <View style={styles.modes}>
                {(["picture", "video"] as const).map((m) => (
                  <Pressable key={m} onPress={() => switchMode(m)} hitSlop={8}>
                    <T weight={mode === m ? "700" : "400"} style={{ color: mode === m ? "#facc15" : "#fff" }}>
                      {m === "picture" ? "PHOTO" : "VIDEO"}
                    </T>
                  </Pressable>
                ))}
              </View>
            )}
            <Pressable
              onPress={mode === "picture" ? shoot : toggleRecording}
              disabled={!cameraReady}
              style={({ pressed }) => [styles.shutter, { opacity: cameraReady ? (pressed ? 0.6 : 1) : 0.3 }]}
            >
              <View style={mode === "picture" ? styles.shutterInner : recording ? styles.stopInner : styles.recordInner} />
            </Pressable>
            <T size={13} style={{ color: "#fff", opacity: 0.8 }}>
              {recording
                ? `Tap to stop. Max ${MAX_VIDEO_SECONDS / 60} min.`
                : mode === "video" && !mic?.granted
                  ? "Microphone not allowed: video will have no sound."
                  : "Each capture is hashed and signed the moment it ends."}
            </T>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

function RecordingTimer({ startedAt }: { startedAt: Date }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.floor((now - startedAt.getTime()) / 1000));
  return (
    <View style={styles.rec}>
      <View style={styles.recDot} />
      <T style={{ color: "#fff" }} weight="600">{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: "#000" },
  center: { justifyContent: "center", alignItems: "stretch" },
  overlay: { flex: 1, justifyContent: "space-between" },
  top: { padding: 16, flexDirection: "row" },
  bottom: { alignItems: "center", gap: 12, paddingBottom: 24 },
  modes: { flexDirection: "row", gap: 28 },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#fff" },
  recordInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#ef4444" },
  stopInner: { width: 30, height: 30, borderRadius: 6, backgroundColor: "#ef4444" },
  rec: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#ef4444" },
  panel: { margin: 16, gap: 6 },
});
