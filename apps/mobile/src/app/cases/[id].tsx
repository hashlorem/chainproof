import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Image as RemoteImage } from "expo-image";
import { FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, authHeaders, getServerUrl, type Case, type Evidence } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { useQueue } from "@/lib/useQueue";
import { Button, Card, ErrorText, Pill, T, short } from "@/ui";

type Row = { kind: "server"; e: Evidence } | { kind: "pending"; uuid: string; uri: string; mime: string; capturedAt: string; error?: string };

export default function CaseScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const t = useTheme();
  const queue = useQueue();
  const [data, setData] = useState<(Case & { evidence: Evidence[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api.get<Case & { evidence: Evidence[] }>(`/cases/${id}`).then(setData, (e) => setError(String(e.message ?? e)));
    }, [id]),
  );

  const pending: Row[] = queue
    .filter((q) => q.manifest.case_id === id)
    .map((q) => ({ kind: "pending", uuid: q.manifest.evidence_uuid, uri: q.fileUri, mime: q.manifest.mime, capturedAt: q.manifest.captured_at, error: q.lastError }));
  const uploaded: Row[] = (data?.evidence ?? []).slice().reverse().map((e) => ({ kind: "server", e }));

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: data?.title ?? title ?? "Case" }} />
      <FlatList
        contentContainerStyle={{ padding: 16, gap: 10 }}
        data={[...pending, ...uploaded]}
        keyExtractor={(r) => (r.kind === "server" ? r.e.id : r.uuid)}
        ListHeaderComponent={error ? <ErrorText>{error}</ErrorText> : data?.description ? <T muted>{data.description}</T> : null}
        ListEmptyComponent={<T muted>No evidence yet. Tap Capture to take the first photo.</T>}
        renderItem={({ item }) =>
          item.kind === "pending" ? (
            <Card style={styles.row}>
              {item.mime.startsWith("image/") ? <RemoteImage source={{ uri: item.uri }} style={styles.thumb} contentFit="cover" /> : <MediaBadge mime={item.mime} />}
              <View style={{ flex: 1, gap: 4 }}>
                <T weight="600">Waiting to upload</T>
                <T size={13} muted>Captured {new Date(item.capturedAt).toLocaleString()}</T>
                <Pill tone="warn">Signed · queued</Pill>
                {item.error && <T size={12} style={{ color: t.bad }}>{item.error}</T>}
              </View>
            </Card>
          ) : (
            <Card style={styles.row}>
              {item.e.mime.startsWith("image/") ? (
                // expo-image sends the auth header reliably on Android; RN's <Image> dropped it.
                <RemoteImage source={{ uri: `${getServerUrl()}/evidence/${item.e.id}/thumbnail.jpg`, headers: authHeaders() }} style={styles.thumb} contentFit="cover" />
              ) : (
                <MediaBadge mime={item.e.mime} />
              )}
              <View style={{ flex: 1, gap: 4 }}>
                <T weight="600" numberOfLines={1}>{item.e.filename}</T>
                <T size={12} mono muted>{short(item.e.sha256, 8)}</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                  {item.e.provenance === "device_signed" ? <Pill tone="ok">Signed capture</Pill> : <Pill>Imported</Pill>}
                  {item.e.tsa_status === "stamped" && <Pill tone="info">Timestamped</Pill>}
                  {item.e.forensics_label && <Pill tone={VERDICT_TONE[item.e.forensics_label] ?? "neutral"}>{item.e.forensics_label}</Pill>}
                </View>
              </View>
            </Card>
          )
        }
      />
      <View style={[styles.footer, { borderColor: t.border, backgroundColor: t.surface }]}>
        <Button title="Capture evidence" onPress={() => router.push({ pathname: "/capture", params: { caseId: id } })} disabled={data?.status === "closed"} />
      </View>
    </SafeAreaView>
  );
}

const VERDICT_TONE: Record<string, "ok" | "warn" | "bad"> = {
  "Verified capture": "ok", "No signs of manipulation": "ok", Suspicious: "warn", "Likely manipulated": "bad", "AI-generated": "bad",
};

function MediaBadge({ mime }: { mime: string }) {
  const t = useTheme();
  return (
    <View style={[styles.thumb, { backgroundColor: t.surface2, alignItems: "center", justifyContent: "center" }]}>
      <T size={12} weight="600" muted>{mime.startsWith("video/") ? "▶ VIDEO" : mime.split("/")[1]?.toUpperCase()}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  thumb: { width: 72, height: 72, borderRadius: 10 },
  footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
