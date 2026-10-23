import { router } from "expo-router";
import { useEffect, useState } from "react";
import Constants from "expo-constants";
import { Alert, ScrollView } from "react-native";
import { getServerUrl } from "@/lib/api";
import { forgetDevice, getDevice } from "@/lib/device";
import { useSession } from "@/lib/session";
import { updateLabel } from "@/lib/updates";
import { Button, Card, Label, T } from "@/ui";

export default function Settings() {
  const { user, signOut } = useSession();
  const [device, setDevice] = useState<Awaited<ReturnType<typeof getDevice>>>(null);

  useEffect(() => {
    getDevice().then(setDevice);
  }, []);

  // Pairs of hex chars in groups, easy to compare by eye with the web Devices page.
  const fingerprint = device?.publicKeyHex.match(/.{1,4}/g)?.join(" ");

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card style={{ gap: 4 }}>
        <Label>Signed in as</Label>
        <T weight="600">{user?.name}</T>
        <T muted size={14}>{user?.email} · {user?.role}</T>
        <T muted size={13}>{getServerUrl()}</T>
      </Card>
      <Card style={{ gap: 6 }}>
        <Label>Device signing key · Ed25519 public key</Label>
        <T mono size={13}>{fingerprint ?? "not enrolled"}</T>
        <T size={13} muted>
          The private half is in this phone&apos;s secure storage and never leaves it. If the phone is lost, a supervisor revokes this key on the web Devices page.
        </T>
      </Card>
      <Card style={{ gap: 4 }}>
        <Label>App version</Label>
        <T size={14}>{Constants.expoConfig?.version} · {updateLabel()}</T>
      </Card>
      <Button title="Sign out" variant="secondary" onPress={async () => { await signOut(); router.replace("/login"); }} />
      <Button
        title="Remove key from this phone"
        variant="danger"
        onPress={() =>
          Alert.alert("Remove signing key?", "This phone will need to enroll a new key. Evidence already signed stays valid.", [
            { text: "Cancel", style: "cancel" },
            { text: "Remove", style: "destructive", onPress: async () => { await forgetDevice(); await signOut(); router.replace("/login"); } },
          ])
        }
      />
    </ScrollView>
  );
}
