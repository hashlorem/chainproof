import { useColorScheme } from "react-native";

// "Evidence form" look, same tokens as the web app: ruled paper, black rules, one signal red for problems.
const light = {
  bg: "#f7f7f5", surface: "#ffffff", surface2: "#efefea", border: "#d4d4ce", rule: "#111111", ink: "#111111", muted: "#55554f",
  accent: "#111111", accentInk: "#f7f7f5", ok: "#17663a", okBg: "#eef4ef", bad: "#c8281e", badBg: "#fbedeb",
  warn: "#9a5300", warnBg: "#fbf1e3", info: "#1f4fd1", infoBg: "#edf1fb",
};
const dark: typeof light = {
  bg: "#121211", surface: "#1a1a18", surface2: "#242421", border: "#3a3a36", rule: "#edede8", ink: "#edede8", muted: "#a3a39b",
  accent: "#edede8", accentInk: "#121211", ok: "#6fcf97", okBg: "#13241a", bad: "#ff7062", badBg: "#2e1513",
  warn: "#f0b04a", warnBg: "#2b2111", info: "#8fb0ff", infoBg: "#151e33",
};

export type Theme = typeof light;
export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

// Loaded in app/_layout.tsx. Custom fonts on Android ignore fontWeight, so each weight is its own family.
export const FONT = {
  display: "ArchivoNarrow_700Bold",
  mono: "IBMPlexMono_400Regular",
  monoMedium: "IBMPlexMono_500Medium",
  monoBold: "IBMPlexMono_600SemiBold",
};
