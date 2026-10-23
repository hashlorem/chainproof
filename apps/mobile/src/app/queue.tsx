import { Image as RemoteImage } from "expo-image";
import { useState } from "react";
import { Alert, FlatList, StyleSheet, View } from "react-native";
import { flushQueue, removeItem } from "@/lib/queue";
import { useTheme } from "@/lib/theme";
import { useQueue } from "@/lib/useQueue";
import { Button, Card, T, short } from "@/ui";

export default function Queue() {
  const t = useTheme();
  const items = useQueue();
  const [busy, setBusy] = useState(false);

  return (
    <FlatList
      contentContainerStyle={{ padding: 16, gap: 10 }}
      data={items}
      keyExtractor={(i) => i.manifest.evidence_uuid}
      ListHeaderComponent={
        <View style={{ gap: 10 }}>
          <T muted size={14}>
            These were hashed and signed when you took them. Uploading later doesn&apos;t weaken them: the server checks the original signature.
          </T>
          {items.length > 0 && <Button title="Upload now" busy={busy} onPress={async () => { setBusy(true); await flushQueue().catch(() => {}); setBusy(false); }} />}
        </View>
      }
      ListEmptyComponent={<T muted>Everything is uploaded.</T>}
      renderItem={({ item }) => (
        <Card style={styles.row}>
          {item.manifest.mime.startsWith("image/") ? (
            <RemoteImage source={{ uri: item.fileUri }} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={[styles.thumb, { backgroundColor: t.surface2, alignItems: "center", justifyContent: "center" }]}>
              <T size={11} weight="600" muted>▶ VIDEO</T>
            </View>
          )}
          <View style={{ flex: 1, gap: 3 }}>
            <T weight="600">{new Date(item.manifest.captured_at).toLocaleString()}</T>
            <T mono size={12} muted>{short(item.manifest.sha256, 8)}</T>
            <T size={12} muted>{item.attempts} attempt{item.attempts === 1 ? "" : "s"}</T>
            {item.lastError && <T size={12} style={{ color: t.bad }}>{item.lastError}</T>}
          </View>
          <Button
            title="Discard"
            variant="secondary"
            onPress={() =>
              Alert.alert("Discard this evidence?", "The photo will be deleted from this phone and never uploaded.", [
                { text: "Keep", style: "cancel" },
                { text: "Discard", style: "destructive", onPress: () => removeItem(item, true) },
              ])
            }
          />
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: { width: 60, height: 60, borderWidth: 1 },
});
