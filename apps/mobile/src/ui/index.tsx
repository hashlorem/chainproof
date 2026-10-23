import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { FONT, useTheme, type Theme } from "@/lib/theme";

export function Button({ title, onPress, variant = "primary", busy, disabled, style }: {
  title: string; onPress: () => void; variant?: "primary" | "secondary" | "danger"; busy?: boolean; disabled?: boolean; style?: ViewStyle;
}) {
  const t = useTheme();
  const bg = variant === "primary" ? t.accent : t.surface;
  const fg = variant === "primary" ? t.accentInk : variant === "danger" ? t.bad : t.ink;
  const border = variant === "danger" ? t.bad : t.rule;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: pressed && variant !== "primary" ? t.surface2 : bg, borderColor: border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[s.card, { backgroundColor: t.surface, borderColor: t.rule }, style]}>{children}</View>;
}

type Tone = "ok" | "bad" | "warn" | "info" | "neutral";
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const t = useTheme();
  const [bg, fg] = toneColors(t, tone);
  const strong = tone === "bad";
  return (
    <Text style={[s.pill, { borderColor: tone === "neutral" ? t.rule : fg, color: tone === "neutral" ? t.ink : fg, backgroundColor: strong ? bg : "transparent", fontFamily: strong ? FONT.monoBold : FONT.mono }]}>
      {children}
    </Text>
  );
}

export function toneColors(t: Theme, tone: Tone): [string, string] {
  return {
    ok: [t.okBg, t.ok], bad: [t.badBg, t.bad], warn: [t.warnBg, t.warn], info: [t.infoBg, t.info], neutral: [t.surface2, t.muted],
  }[tone] as [string, string];
}

export function T({ children, muted, size = 14, weight, style, numberOfLines }: {
  children: ReactNode; muted?: boolean; size?: number; weight?: TextStyle["fontWeight"]; mono?: boolean; style?: TextStyle; numberOfLines?: number;
}) {
  const t = useTheme();
  // The whole app is set in IBM Plex Mono; `mono` is kept so older call sites still read clearly.
  const family = weight === "700" || weight === "600" || weight === "bold" ? FONT.monoBold : weight === "500" ? FONT.monoMedium : FONT.mono;
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: muted ? t.muted : t.ink, fontSize: size, fontFamily: family }, style]}>
      {children}
    </Text>
  );
}

// Condensed uppercase heading, like the printed headers on a custody form.
export function H({ children, size = 28, style, numberOfLines }: { children: ReactNode; size?: number; style?: TextStyle; numberOfLines?: number }) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: t.ink, fontFamily: FONT.display, fontSize: size, lineHeight: size * 1.02, textTransform: "uppercase" }, style]}>
      {children}
    </Text>
  );
}

// Small field label: "CASE NO.", "STATUS".
export function Label({ children, color, style }: { children: ReactNode; color?: string; style?: TextStyle }) {
  const t = useTheme();
  return <Text style={[s.label, { color: color ?? t.muted }, style]}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[s.error, { backgroundColor: t.badBg, color: t.bad, borderColor: t.bad }]}>{children}</Text>;
}

export const short = (h: string, n = 10) => (h.length > n * 2 ? `${h.slice(0, n)}…${h.slice(-6)}` : h);

const s = StyleSheet.create({
  button: { minHeight: 50, borderWidth: 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  buttonText: { fontSize: 13, fontFamily: FONT.monoBold, textTransform: "uppercase", letterSpacing: 1 },
  card: { borderWidth: 2, padding: 14 },
  pill: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, alignSelf: "flex-start", overflow: "hidden" },
  label: { fontSize: 10, fontFamily: FONT.mono, textTransform: "uppercase", letterSpacing: 1.2 },
  error: { padding: 10, borderWidth: 2, fontSize: 13, fontFamily: FONT.mono, overflow: "hidden" },
});
