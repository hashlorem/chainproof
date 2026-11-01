import { Link, Stack, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { api, type Case } from "@/lib/api";
import { flushQueue } from "@/lib/queue";
import { useTheme } from "@/lib/theme";
import { useQueue } from "@/lib/useQueue";
import { Button, Card, ErrorText, H, Label, T } from "@/ui";

export default function Cases() {
  const t = useTheme();
  const queue = useQueue();
  const [cases, setCases] = useState<Case[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setCases(await api.get<Case[]>("/cases"));
      setError(null);
      flushQueue().catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useFocusEffect(useCallback(() => void load(), [load]));

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/settings" asChild>
              <Pressable hitSlop={10}><T size={15} style={{ color: t.accent }}>This device</T></Pressable>
            </Link>
          ),
        }}
      />
      <FlatList
        contentContainerStyle={{ paddingBottom: 24 }}
        data={cases?.filter((c) => c.status === "open") ?? []}
        keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListHeaderComponent={
          <View style={{ gap: 12, padding: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.rule }}>
            <Label>Open cases · tap one to capture evidence</Label>
            {queue.length > 0 && (
              <Pressable onPress={() => router.push("/queue")}>
                <Card style={{ backgroundColor: t.warnBg }}>
                  <T weight="600" style={{ color: t.warn }}>{queue.length} item{queue.length > 1 ? "s" : ""} waiting to upload</T>
                  <T size={13} muted>Already hashed and signed. Tap to see or retry.</T>
                </Card>
              </Pressable>
            )}
            <Button title="Check a photo for editing" variant="secondary" onPress={() => router.push("/check")} />
            {error && <ErrorText>{error}</ErrorText>}
          </View>
        }
        ListEmptyComponent={cases ? <T muted style={{ padding: 16 }}>No open cases. Create one in the web app.</T> : null}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push({ pathname: "/cases/[id]", params: { id: item.id, title: item.title } })}>
            {({ pressed }) => (
              <View style={[styles.row, { borderColor: t.border, backgroundColor: pressed ? t.surface2 : undefined }]}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Label>Case {item.id.slice(0, 8).toUpperCase()}</Label>
                  <H size={24}>{item.title}</H>
                  {!!item.description && <T muted size={12} numberOfLines={2}>{item.description}</T>}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <T size={22} weight="600">{item.evidence_count ?? 0}</T>
                  <Label>Items</Label>
                </View>
              </View>
            )}
          </Pressable>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1 } });
