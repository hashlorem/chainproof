import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getServerUrl } from "@/lib/api";
import { useSession } from "@/lib/session";
import { sans, useTheme } from "@/lib/theme";
import { Button, ErrorText, H, Label, T } from "@/ui";

export default function Login() {
  const t = useTheme();
  const { signIn } = useSession();
  // On a real phone "localhost" is the phone itself: use your computer's LAN address, e.g. http://192.168.1.20:8000.
  // demo.sh passes its tunnel address in EXPO_PUBLIC_API_URL so nobody has to type it.
  const [server, setServer] = useState(process.env.EXPO_PUBLIC_API_URL ?? getServerUrl() ?? "http://192.168.1.20:8000");
  const [email, setEmail] = useState("investigator@chainproof.dev");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const input = [styles.input, sans("400"), { backgroundColor: t.surface2, borderColor: t.border, color: t.ink }];

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(server.trim(), email, password);
      router.replace("/cases");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 6 }}>
            <H size={44}>ChainProof</H>
            <T muted>Capture evidence that can prove where, when and by which device it was taken, and that nobody changed it since.</T>
          </View>
          <View style={{ gap: 10 }}>
            <Label>Server</Label>
            <TextInput style={input} value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
            <Label>Email</Label>
            <TextInput style={input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <Label>Password</Label>
            <TextInput style={input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={submit} />
            {error && <ErrorText>{error}</ErrorText>}
            <Button title="Sign in" onPress={submit} busy={busy} disabled={!password} style={{ marginTop: 6 }} />
            <T size={12} muted>
              First sign-in creates this phone&apos;s signing key. It stays in the phone&apos;s secure storage and is never uploaded.
            </T>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 28 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
});
