import { ArchivoNarrow_700Bold } from "@expo-google-fonts/archivo-narrow";
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from "@expo-google-fonts/ibm-plex-mono";
import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { SessionProvider } from "@/lib/session";
import { FONT, useTheme } from "@/lib/theme";
import { H } from "@/ui";
import { useUpdatePrompt } from "@/lib/updates";

export default function RootLayout() {
  const scheme = useColorScheme();
  const t = useTheme();
  useUpdatePrompt();
  const [fontsLoaded, fontError] = useFonts({ ArchivoNarrow_700Bold, IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold });
  // A font that fails to load falls back to the system font rather than blocking the app.
  if (!fontsLoaded && !fontError) return null;
  return (
    <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
      <SessionProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: t.bg },
            headerStyle: { backgroundColor: t.bg },
            headerShadowVisible: false,
            headerTintColor: t.ink,
            headerTitle: ({ children }) => <H size={24}>{children}</H>,
            headerBackTitleStyle: { fontFamily: FONT.mono },
          }}
        >
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
