import type { EvidenceManifest } from "@chainproof/shared";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { sealCapture } from "@/lib/capture";
import { Button, Card, ErrorText, T, short } from "@/ui";

type Phase = { kind: "ready" } | { kind: "sealing" } | { kind: "done"; manifest: EvidenceManifest } | { kind: "error"; message: string };

export default function Capture() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
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

  async function shoot() {
    if (!camera.current || phase.kind !== "ready") return;
    const capturedAt = new Date(); // shutter time, before GPS and signing
    setPhase({ kind: "sealing" });
    try {
      // exif: false + no extra processing: the bytes we hash are the bytes the server receives.
      const photo = await camera.current.takePictureAsync({ quality: 0.92, exif: false, shutterSound: true });
      const manifest = await sealCapture(caseId, photo.uri, capturedAt);
      setPhase({ kind: "done", manifest });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <View style={styles.black}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setCameraReady(true)} />
      <SafeAreaView style={styles.overlay}>
        <View style={styles.top}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <T style={{ color: "#fff" }} size={16}>Close</T>
          </Pressable>
        </View>

        {phase.kind === "sealing" && (
          <Card style={styles.panel}>
            <ActivityIndicator />
            <T weight="600">Sealing evidence…</T>
            <T size={13} muted>Hashing the photo, reading GPS and signing with this phone&apos;s key.</T>
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
              <Button title="Take another" variant="secondary" style={{ flex: 1 }} onPress={() => setPhase({ kind: "ready" })} />
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

        {phase.kind === "ready" && (
          <View style={styles.bottom}>
            <Pressable onPress={shoot} disabled={!cameraReady} style={({ pressed }) => [styles.shutter, { opacity: cameraReady ? (pressed ? 0.6 : 1) : 0.3 }]}>
              <View style={styles.shutterInner} />
            </Pressable>
            <T size={13} style={{ color: "#fff", opacity: 0.8 }}>Each photo is hashed and signed the moment it is taken.</T>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: "#000" },
  center: { justifyContent: "center", alignItems: "stretch" },
  overlay: { flex: 1, justifyContent: "space-between" },
  top: { padding: 16, flexDirection: "row" },
  bottom: { alignItems: "center", gap: 12, paddingBottom: 24 },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#fff" },
  panel: { margin: 16, gap: 6 },
});
