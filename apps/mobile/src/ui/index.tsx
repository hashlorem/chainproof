import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { FONT, sans, useTheme, type Theme } from "@/lib/theme";

// "Examiner" look: grouped panes instead of bordered boxes, rounded corners, colour only for meaning.

export function Button({ title, onPress, variant = "primary", busy, disabled, style }: {
  title: string; onPress: () => void; variant?: "primary" | "secondary" | "danger"; busy?: boolean; disabled?: boolean; style?: ViewStyle;
}) {
  const t = useTheme();
  const bg = variant === "primary" ? t.accent : variant === "danger" ? t.badBg : t.surface2;
  const fg = variant === "primary" ? t.accentInk : variant === "danger" ? t.bad : t.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      style={({ pressed }) => [s.button, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }, style]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonText, sans("600"), { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

/** A pane: a slightly lighter surface with rounded corners. No outline: the shade separates it. */
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[s.card, { backgroundColor: t.surface }, style]}>{children}</View>;
}

type Tone = "ok" | "bad" | "warn" | "info" | "neutral";
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const t = useTheme();
  const [bg, fg] = toneColors(t, tone);
  return <Text style={[s.pill, sans("600"), { color: fg, backgroundColor: bg }]}>{children}</Text>;
}

export function toneColors(t: Theme, tone: Tone): [string, string] {
  return {
    ok: [t.okBg, t.ok], bad: [t.badBg, t.bad], warn: [t.warnBg, t.warn], info: [t.infoBg, t.info], neutral: [t.surface2, t.muted],
  }[tone] as [string, string];
}

/** Body text in the system font (SF Pro on iPhone, Inter on Android). `mono` is for hashes and IDs. */
export function T({ children, muted, size = 15, weight, mono, style, numberOfLines }: {
  children: ReactNode; muted?: boolean; size?: number; weight?: TextStyle["fontWeight"]; mono?: boolean; style?: TextStyle; numberOfLines?: number;
}) {
  const t = useTheme();
  const w = weight === "700" || weight === "bold" ? "700" : weight === "600" ? "600" : weight === "500" ? "500" : "400";
  const font = mono ? { fontFamily: w === "400" ? FONT.mono : FONT.monoBold } : sans(w);
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: muted ? t.muted : t.ink, fontSize: mono ? size - 1 : size, lineHeight: size * 1.35 }, font, style]}>
      {children}
    </Text>
  );
}

/** Headings: the system font, semibold, slightly tight. No uppercase. */
export function H({ children, size = 26, style, numberOfLines }: { children: ReactNode; size?: number; style?: TextStyle; numberOfLines?: number }) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: t.ink, fontSize: size, lineHeight: size * 1.2, letterSpacing: -0.3 }, sans("700"), style]}>
      {children}
    </Text>
  );
}

/** Small section label: "AUTOMATED VERDICT", "FILE". */
export function Label({ children, color, style }: { children: ReactNode; color?: string; style?: TextStyle }) {
  const t = useTheme();
  return <Text style={[s.label, sans("600"), { color: color ?? t.muted }, style]}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[s.error, sans("500"), { backgroundColor: t.badBg, color: t.bad }]}>{children}</Text>;
}

export const short = (h: string, n = 10) => (h.length > n * 2 ? `${h.slice(0, n)}…${h.slice(-6)}` : h);

const s = StyleSheet.create({
  button: { minHeight: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  buttonText: { fontSize: 16 },
  card: { borderRadius: 12, padding: 14 },
  pill: { fontSize: 12, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, alignSelf: "flex-start", overflow: "hidden" },
  label: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  error: { padding: 12, borderRadius: 10, fontSize: 14, overflow: "hidden" },
});
