import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { SessionProvider } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function RootLayout() {
  const scheme = useColorScheme();
  const t = useTheme();
  return (
    <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
      <SessionProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ contentStyle: { backgroundColor: t.bg }, headerTintColor: t.accent, headerTitleStyle: { color: t.ink } }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="cases/index" options={{ title: "Cases" }} />
          <Stack.Screen name="cases/[id]" options={{ title: "Case" }} />
          <Stack.Screen name="capture" options={{ headerShown: false, presentation: "fullScreenModal", animation: "fade" }} />
          <Stack.Screen name="queue" options={{ title: "Upload queue" }} />
          <Stack.Screen name="check" options={{ title: "Check a photo" }} />
          <Stack.Screen name="settings" options={{ title: "This device" }} />
        </Stack>
      </SessionProvider>
    </ThemeProvider>
  );
}
