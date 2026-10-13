import type { ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { useTheme, type Theme } from "@/lib/theme";

export function Button({ title, onPress, variant = "primary", busy, disabled, style }: {
  title: string; onPress: () => void; variant?: "primary" | "secondary" | "danger"; busy?: boolean; disabled?: boolean; style?: ViewStyle;
}) {
  const t = useTheme();
  const bg = variant === "primary" ? t.accent : variant === "danger" ? t.bad : t.surface;
  const fg = variant === "primary" ? t.accentInk : variant === "danger" ? "#fff" : t.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: bg, borderColor: variant === "secondary" ? t.border : bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border }, style]}>{children}</View>;
}

type Tone = "ok" | "bad" | "warn" | "info" | "neutral";
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const t = useTheme();
  const [bg, fg] = toneColors(t, tone);
  return <Text style={[s.pill, { backgroundColor: bg, color: fg }]}>{children}</Text>;
}

export function toneColors(t: Theme, tone: Tone): [string, string] {
  return {
    ok: [t.okBg, t.ok], bad: [t.badBg, t.bad], warn: [t.warnBg, t.warn], info: [t.infoBg, t.info], neutral: [t.surface2, t.muted],
  }[tone] as [string, string];
}

export function T({ children, muted, size = 15, weight, mono, style, numberOfLines }: {
  children: ReactNode; muted?: boolean; size?: number; weight?: TextStyle["fontWeight"]; mono?: boolean; style?: TextStyle; numberOfLines?: number;
}) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: muted ? t.muted : t.ink, fontSize: size, fontWeight: weight, fontFamily: mono ? MONO : undefined }, style]}>
      {children}
    </Text>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[s.error, { backgroundColor: t.badBg, color: t.bad }]}>{children}</Text>;
}

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

export const short = (h: string, n = 10) => (h.length > n * 2 ? `${h.slice(0, n)}…${h.slice(-6)}` : h);

const s = StyleSheet.create({
  button: { minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  buttonText: { fontSize: 16, fontWeight: "600" },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  pill: { fontSize: 12, fontWeight: "600", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: "hidden", alignSelf: "flex-start" },
  error: { padding: 10, borderRadius: 10, fontSize: 14, overflow: "hidden" },
});
