import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Image, ScrollView, View } from "react-native";
import { api, type ForensicReport } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { Button, Card, ErrorText, H, Pill, T, toneColors } from "@/ui";

// Green only for a verified capture: "no signs" is not proof of authenticity, so it stays neutral.
const VERDICT_TONE: Record<string, "ok" | "warn" | "bad" | "neutral"> = {
  verified_capture: "ok", no_signs: "neutral", suspicious: "warn", likely_manipulated: "bad", ai_generated: "bad",
};
const SEVERITY_TONE = { info: "info", low: "neutral", medium: "warn", high: "bad" } as const;

export default function Check() {
  const t = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  const [report, setReport] = useState<ForensicReport | null>(null);
  const [view, setView] = useState<"photo" | "ela" | "clones">("photo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    // Pass the original file through: editing or re-encoding it here would destroy the evidence we want to check.
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 });
    if (res.canceled) return;
    const asset = res.assets[0];
    setUri(asset.uri);
    setReport(null);
    setError(null);
    setView("photo");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", new File(asset.uri) as unknown as Blob, asset.fileName ?? "photo.jpg");
      setReport(await api.post<ForensicReport>("/forensics/analyze", fd));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const tone = report ? VERDICT_TONE[report.verdict] ?? "warn" : "ok";
  const [bg, fg] = toneColors(t, tone);
  const shown =
    view === "ela" && report?.checks.ela.heatmap_png ? `data:image/png;base64,${report.checks.ela.heatmap_png}`
    : view === "clones" && report?.checks.copy_move.overlay_jpg ? `data:image/jpeg;base64,${report.checks.copy_move.overlay_jpg}`
    : view === "clones" && report?.checks.copy_move.overlay_png ? `data:image/png;base64,${report.checks.copy_move.overlay_png}`
    : uri;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <T muted size={14}>Pick any image, for example a tip from the public or a screenshot, and look for signs of editing. Nothing is saved.</T>
      <Button title={uri ? "Check another photo" : "Choose a photo"} onPress={pick} busy={busy} />
      {error && <ErrorText>{error}</ErrorText>}
      {shown && <Image source={{ uri: shown }} style={{ width: "100%", aspectRatio: 4 / 3 }} resizeMode="contain" />}
      {report && (
        <>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Button title="Photo" variant={view === "photo" ? "primary" : "secondary"} style={{ flex: 1, minHeight: 38 }} onPress={() => setView("photo")} />
            <Button title="ELA" variant={view === "ela" ? "primary" : "secondary"} style={{ flex: 1, minHeight: 38 }} onPress={() => setView("ela")} disabled={!report.checks.ela.heatmap_png} />
            <Button title="Clones" variant={view === "clones" ? "primary" : "secondary"} style={{ flex: 1, minHeight: 38 }} onPress={() => setView("clones")} disabled={!(report.checks.copy_move.overlay_jpg ?? report.checks.copy_move.overlay_png)} />
          </View>
          <Card style={{ backgroundColor: tone === "neutral" ? t.surface : bg, gap: 4 }}>
            <H size={24} style={{ color: tone === "neutral" ? t.ink : fg }}>{report.label}</H>
            <T size={13} muted>{report.disclaimer}</T>
          </Card>
          {report.findings.map((f, i) => (
            <Card key={i} style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Pill tone={SEVERITY_TONE[f.severity]}>{f.severity.toUpperCase()}</Pill>
                <T weight="600" style={{ flex: 1 }}>{f.title}</T>
              </View>
              <T size={14} muted>{f.detail}</T>
              {f.validation !== undefined && <T size={13}><T size={13} muted>How reliable: </T>{f.validation ?? "not validated yet"}</T>}
              {f.alternative && <T size={13}><T size={13} muted>What else explains it: </T>{f.alternative}</T>}
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}
