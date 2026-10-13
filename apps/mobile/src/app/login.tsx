import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getServerUrl } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { Button, ErrorText, T } from "@/ui";

export default function Login() {
  const t = useTheme();
  const { signIn } = useSession();
  // On a real phone "localhost" is the phone itself: use your computer's LAN address, e.g. http://192.168.1.20:8000
  const [server, setServer] = useState(getServerUrl() ?? "http://192.168.1.20:8000");
  const [email, setEmail] = useState("investigator@chainproof.dev");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const input = [styles.input, { backgroundColor: t.surface, borderColor: t.border, color: t.ink }];

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
            <T size={30} weight="700">ChainProof</T>
            <T muted>Capture evidence that can prove where, when and by which device it was taken, and that nobody changed it since.</T>
          </View>
          <View style={{ gap: 10 }}>
            <T size={13} muted>Server</T>
            <TextInput style={input} value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
            <T size={13} muted>Email</T>
            <TextInput style={input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <T size={13} muted>Password</T>
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
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
});
