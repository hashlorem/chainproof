import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { Image as RemoteImage } from "expo-image";
import { FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, authHeaders, getServerUrl, type Case, type Evidence } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { useQueue } from "@/lib/useQueue";
import { Button, ErrorText, H, Label, Pill, T, short } from "@/ui";

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
  // Oldest first, like the numbered items on a custody form; queued captures come last.
  const uploaded: Row[] = (data?.evidence ?? []).map((e) => ({ kind: "server", e }));
  const rows = [...uploaded, ...pending];
  const signed = data?.evidence.filter((e) => e.provenance === "device_signed").length ?? 0;
  const closed = data?.status === "closed";

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: `Case ${id.slice(0, 8).toUpperCase()}` }} />
      <FlatList
        data={rows}
        keyExtractor={(r) => (r.kind === "server" ? r.e.id : r.uuid)}
        ListHeaderComponent={
          <View style={[styles.head, { borderColor: t.rule }]}>
            <View style={{ padding: 20, gap: 8 }}>
              <Label>Chain of custody record · {closed ? "Closed" : "Open"}</Label>
              <H size={34}>{data?.title ?? title ?? "Case"}</H>
              {!!data?.description && <T muted size={12}>{data.description}</T>}
              {error && <ErrorText>{error}</ErrorText>}
            </View>
            <View style={[styles.stats, { borderColor: t.rule }]}>
              <Stat label="Items" value={uploaded.length + pending.length} />
              <Stat label="Signed" value={signed} divider />
              <Stat label="Queue" value={pending.length} divider />
            </View>
          </View>
        }
        ListEmptyComponent={<T muted style={{ padding: 20 }}>No evidence yet. Tap Capture to take the first photo.</T>}
        renderItem={({ item, index }) => {
          const n = String(index + 1).padStart(2, "0");
          if (item.kind === "pending") {
            return (
              <ItemRow n={n} thumb={item.mime.startsWith("image/") ? <RemoteImage source={{ uri: item.uri }} style={styles.thumbImg} contentFit="cover" /> : <MediaBadge mime={item.mime} />}>
                <T weight="600" numberOfLines={1}>Waiting to upload</T>
                <T size={11} muted>Signed · queued · {new Date(item.capturedAt).toLocaleTimeString()}</T>
                {item.error && <T size={11} style={{ color: t.bad }}>{item.error}</T>}
              </ItemRow>
            );
          }
          const e = item.e;
          const tone = e.forensics_label ? VERDICT_TONE[e.forensics_label] : undefined;
          const flagged = tone === "bad";
          return (
            <ItemRow
              n={n}
              flagged={flagged}
              thumb={
                e.mime.startsWith("image/") ? (
                  // expo-image sends the auth header reliably on Android; RN's <Image> dropped it.
                  <RemoteImage source={{ uri: `${getServerUrl()}/evidence/${e.id}/thumbnail.jpg`, headers: authHeaders() }} style={styles.thumbImg} contentFit="cover" />
                ) : (
                  <MediaBadge mime={e.mime} />
                )
              }
              status={flagged ? <Pill tone="bad">Edited?</Pill> : <Pill>{e.provenance === "device_signed" ? "Signed" : "Imported"}</Pill>}
            >
              <T weight="600" numberOfLines={1}>{e.filename}</T>
              <T size={11} muted numberOfLines={1}>
                {[e.provenance === "device_signed" ? "Signed" : "Imported", e.tsa_status === "stamped" && "TSA", e.forensics_label].filter(Boolean).join(" · ")}
              </T>
              <T size={11} muted>{short(e.sha256, 6)}</T>
            </ItemRow>
          );
        }}
      />
      <View style={[styles.footer, { borderColor: t.rule, backgroundColor: t.bg }]}>
        <Button
          title={closed ? "Case closed" : `Capture item ${String(rows.length + 1).padStart(2, "0")}`}
          onPress={() => router.push({ pathname: "/capture", params: { caseId: id } })}
          disabled={closed}
          style={{ minHeight: 56 }}
        />
      </View>
    </SafeAreaView>
  );
}

function Stat({ label, value, divider }: { label: string; value: number; divider?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 20, borderLeftWidth: divider ? 1 : 0, borderColor: t.rule }}>
      <Label>{label}</Label>
      <T size={18} weight="600">{value}</T>
    </View>
  );
}

function ItemRow({ n, thumb, status, flagged, children }: { n: string; thumb: ReactNode; status?: ReactNode; flagged?: boolean; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.row, { borderColor: t.border, backgroundColor: flagged ? t.badBg : undefined }]}>
      <T size={15} weight="600" style={{ width: 24 }}>{n}</T>
      <View style={[styles.thumb, { borderColor: t.rule, backgroundColor: t.surface2 }]}>{thumb}</View>
      <View style={{ flex: 1, gap: 2 }}>{children}</View>
      {status}
    </View>
  );
}

const VERDICT_TONE: Record<string, "ok" | "warn" | "bad"> = {
  "Verified capture": "ok", "No signs of manipulation": "ok", Suspicious: "warn", "Likely manipulated": "bad", "AI-generated": "bad",
};

function MediaBadge({ mime }: { mime: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Label>{mime.startsWith("video/") ? "Video" : mime.split("/")[1] ?? "File"}</Label>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { borderBottomWidth: StyleSheet.hairlineWidth },
  stats: { flexDirection: "row", borderTopWidth: 1 },
  row: { flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  thumb: { width: 56, height: 56, borderRadius: 8, overflow: "hidden" },
  thumbImg: { width: "100%", height: "100%" },
  footer: { padding: 16, paddingBottom: 20, borderTopWidth: StyleSheet.hairlineWidth },
});
