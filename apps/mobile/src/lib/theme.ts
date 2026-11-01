import { Platform, useColorScheme, type TextStyle } from "react-native";

// "Examiner" look (docs/REDESIGN.md), the same tokens as the web app. Colour only for meaning:
// green = verified, amber = unverified or needs attention, red = a problem, blue = actions and selection.
const light = {
  bg: "#f5f5f7", surface: "#ffffff", surface2: "#ececf0", border: "rgba(0,0,0,0.08)", rule: "rgba(0,0,0,0.16)",
  ink: "#1d1d1f", muted: "#6e6e73", accent: "#0071e3", accentInk: "#ffffff",
  ok: "#248a3d", okBg: "#e9f5ec", bad: "#d70015", badBg: "#fdecee", warn: "#b25000", warnBg: "#fdf1e4", info: "#0066cc", infoBg: "#e8f1fb",
};
const dark: typeof light = {
  bg: "#1c1c1e", surface: "#252527", surface2: "#2c2c2e", border: "rgba(255,255,255,0.08)", rule: "rgba(255,255,255,0.16)",
  ink: "#f5f5f7", muted: "#a1a1a6", accent: "#0a84ff", accentInk: "#ffffff",
  ok: "#32d74b", okBg: "rgba(50,215,75,0.14)", bad: "#ff453a", badBg: "rgba(255,69,58,0.14)",
  warn: "#ff9f0a", warnBg: "rgba(255,159,10,0.14)", info: "#4da3ff", infoBg: "rgba(10,132,255,0.16)",
};

export type Theme = typeof light;
/** Phones follow the system setting (dark or light), as phone apps are expected to. */
export function useTheme(): Theme {
  return useColorScheme() === "light" ? light : dark;
}

// Loaded in app/_layout.tsx. iPhones use the system font (SF Pro), which apps may use but not bundle; Android gets
// Inter, the closest free match. Custom fonts on Android ignore fontWeight, so each weight is its own family.
export const FONT = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  mono: "IBMPlexMono_400Regular",
  monoMedium: "IBMPlexMono_500Medium",
  monoBold: "IBMPlexMono_600SemiBold",
};

type Weight = "400" | "500" | "600" | "700";
const FAMILY: Record<Weight, string> = { "400": FONT.regular, "500": FONT.medium, "600": FONT.semibold, "700": FONT.bold };

/** The text style for a weight: SF Pro with fontWeight on iOS, the matching Inter family on Android. */
export function sans(weight: Weight = "400"): TextStyle {
  return Platform.OS === "ios" ? { fontWeight: weight } : { fontFamily: FAMILY[weight] };
}
