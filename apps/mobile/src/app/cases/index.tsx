import { Link, Stack, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { api, type Case } from "@/lib/api";
import { flushQueue } from "@/lib/queue";
import { useTheme } from "@/lib/theme";
import { useQueue } from "@/lib/useQueue";
import { Button, Card, ErrorText, Pill, T } from "@/ui";

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
              <Pressable hitSlop={10}><T size={15} style={{ color: t.accent }}>Device</T></Pressable>
            </Link>
          ),
        }}
      />
      <FlatList
        contentContainerStyle={{ padding: 16, gap: 12 }}
        data={cases?.filter((c) => c.status === "open") ?? []}
        keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            {queue.length > 0 && (
              <Pressable onPress={() => router.push("/queue")}>
                <Card style={{ backgroundColor: t.warnBg, borderColor: t.warn }}>
                  <T weight="600" style={{ color: t.warn }}>{queue.length} item{queue.length > 1 ? "s" : ""} waiting to upload</T>
                  <T size={13} muted>Already hashed and signed. Tap to see or retry.</T>
                </Card>
              </Pressable>
            )}
            <Button title="Check a photo for editing" variant="secondary" onPress={() => router.push("/check")} />
            {error && <ErrorText>{error}</ErrorText>}
            <T size={13} muted>Open cases. Tap a case to capture evidence for it.</T>
          </View>
        }
        ListEmptyComponent={cases ? <T muted>No open cases. Create one in the web app.</T> : null}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push({ pathname: "/cases/[id]", params: { id: item.id, title: item.title } })}>
            {({ pressed }) => (
              <Card style={{ opacity: pressed ? 0.7 : 1, gap: 4 }}>
                <View style={styles.row}>
                  <T size={17} weight="600" style={{ flex: 1 }}>{item.title}</T>
                  <Pill>{`${item.evidence_count ?? 0} items`}</Pill>
                </View>
                {!!item.description && <T muted size={14}>{item.description}</T>}
                <T mono size={12} muted>#{item.id.slice(0, 8).toUpperCase()}</T>
              </Card>
            )}
          </Pressable>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: 8 } });
