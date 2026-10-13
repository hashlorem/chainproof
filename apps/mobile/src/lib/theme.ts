import { useColorScheme } from "react-native";

const light = {
  bg: "#f6f7f9", surface: "#ffffff", surface2: "#f0f2f5", border: "#e2e5ea", ink: "#111827", muted: "#5b6472",
  accent: "#0f766e", accentInk: "#ffffff", ok: "#15803d", okBg: "#e8f5ec", bad: "#b91c1c", badBg: "#fdecec",
  warn: "#b45309", warnBg: "#fdf3e2", info: "#1d4ed8", infoBg: "#eaf1fb",
};
const dark: typeof light = {
  bg: "#0c0f14", surface: "#131820", surface2: "#1a212b", border: "#262e3a", ink: "#e7eaf0", muted: "#94a0b2",
  accent: "#2dd4bf", accentInk: "#062a26", ok: "#4ade80", okBg: "#0f2a1a", bad: "#f87171", badBg: "#2d1414",
  warn: "#fbbf24", warnBg: "#2b2210", info: "#93b4fd", infoBg: "#13213a",
};

export type Theme = typeof light;
export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
