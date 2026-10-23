import * as Updates from "expo-updates";
import { useEffect, useRef } from "react";
import { Alert, AppState } from "react-native";

// Over-the-air updates (EAS Update). `eas update` publishes new JS; installed apps see a popup
// and restart into it. Changes to native code need a new APK instead: the runtime version
// (app.json "version") stops an update from reaching an app it would break.
// Does nothing in Expo Go and dev mode, where the updates API is unavailable.
export function useUpdatePrompt() {
  const asking = useRef(false);
  const dismissed = useRef<string | null>(null);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    async function check() {
      if (asking.current) return;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;
        const id = result.manifest?.id ?? "unknown";
        if (id === dismissed.current) return;
        asking.current = true;
        Alert.alert("Update available", "A new version of ChainProof is ready. Restarting takes a few seconds.", [
          { text: "Later", style: "cancel", onPress: () => { dismissed.current = id; asking.current = false; } },
          { text: "Update now", onPress: () => void install() },
        ]);
      } catch (e) {
        console.info("[updates] check failed", e);
      }
    }

    async function install() {
      try {
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } catch (e) {
        asking.current = false;
        Alert.alert("Update failed", e instanceof Error ? e.message : String(e));
      }
    }

    check();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => sub.remove();
  }, []);
}

// Shown on the settings screen so you can tell which update a phone is running.
export function updateLabel() {
  if (__DEV__ || !Updates.isEnabled) return "development";
  if (Updates.isEmbeddedLaunch) return "built-in version";
  const when = Updates.createdAt ? Updates.createdAt.toLocaleString() : "";
  return `update ${Updates.updateId?.slice(0, 8)} ${when}`.trim();
}
