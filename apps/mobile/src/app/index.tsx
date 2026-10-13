import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "@/lib/session";

export default function Index() {
  const { user, ready } = useSession();
  if (!ready) return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator /></View>;
  return <Redirect href={user ? "/cases" : "/login"} />;
}
