import type { GameTheme, GameType, ThemeCorners, ThemeFont, ThemePattern, ThemeStyle } from "./types";
import { STYLES, STYLE_ORDER, getStyleSpec } from "./theme-styles";
import { AVATAR_COLORS } from "./avatar-colors";

/** All available fonts for the theme picker */
export const THEME_FONTS: { value: ThemeFont; label: string; category: "sans" | "serif" | "display" | "mono" | "handwritten" }[] = [
  { value: "Montserrat", label: "Montserrat", category: "sans" },
  { value: "DM Sans", label: "DM Sans", category: "sans" },
  { value: "Inter", label: "Inter", category: "sans" },
  { value: "Poppins", label: "Poppins", category: "sans" },
  { value: "Space Grotesk", label: "Space Grotesk", category: "sans" },
  { value: "Outfit", label: "Outfit", category: "sans" },
  { value: "Sora", label: "Sora", category: "sans" },
  { value: "Raleway", label: "Raleway", category: "sans" },
  { value: "Nunito", label: "Nunito", category: "sans" },
  { value: "Playfair Display", label: "Playfair Display", category: "serif" },
  { value: "Fraunces", label: "Fraunces", category: "serif" },
  { value: "Bebas Neue", label: "Bebas Neue", category: "display" },
  { value: "Oswald", label: "Oswald", category: "display" },
  { value: "Orbitron", label: "Orbitron", category: "display" },
  { value: "JetBrains Mono", label: "JetBrains Mono", category: "mono" },
  { value: "Kalam", label: "Kalam", category: "handwritten" },
  { value: "Patrick Hand", label: "Patrick Hand", category: "handwritten" },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

/** Compose a GameTheme from a style + mode + optional overrides. */
export function buildTheme(opts: {
  id?: string;
  name?: string;
  style?: ThemeStyle;
  mode: "light" | "dark";
  corners?: ThemeCorners;
  /** Override the default accent for this style/mode. */
  accent?: string;
  accentSecondary?: string;
  accentTertiary?: string;
  /** Override the default background. */
  bg?: string;
  headingFont?: ThemeFont;
  bodyFont?: ThemeFont;
  pattern?: ThemePattern | null;
  playerColors?: string[];
}): GameTheme {
  const style: ThemeStyle = opts.style ?? "flat";
  const spec = getStyleSpec(style);
  const colors = spec.modes[opts.mode] ?? spec.modes.light ?? spec.modes.dark!;

  const accent = opts.accent ?? colors.accent;
  const { r, g, b } = hexToRgb(accent);

  return {
    id: opts.id ?? `${style}-${opts.mode}-${opts.corners ?? "rounded"}`,
    name: opts.name ?? `${spec.name} (${opts.mode})`,
    style,
    mode: opts.mode,
    corners: opts.corners ?? "rounded",
    bg: opts.bg ?? colors.bg,
    surface: colors.surface,
    surfaceLight: colors.surfaceLight,
    accent,
    accentSecondary: opts.accentSecondary ?? colors.accentSecondary,
    accentTertiary: opts.accentTertiary ?? colors.accentTertiary,
    accentDim: `rgba(${r},${g},${b},0.14)`,
    textPrimary: colors.textPrimary,
    textMuted: colors.textMuted,
    textDim: colors.textDim,
    border: colors.border,
    danger: "#B91C1C",
    headingFont: opts.headingFont ?? spec.fonts.heading,
    bodyFont: opts.bodyFont ?? spec.fonts.body,
    bodyTextMode: colors.bodyTextMode,
    buttonTextMode: colors.buttonTextMode,
    pattern: opts.pattern ?? null,
    playerColors: opts.playerColors ?? Array.from(AVATAR_COLORS),
  };
}

/**
 * Auto-generate a preset for every (style × supported mode) combination.
 * Iterates the registry in `theme-styles.ts` so adding a style adds a preset.
 */
export const STYLE_PRESETS: GameTheme[] = STYLE_ORDER.flatMap((style) => {
  const spec = STYLES[style];
  const presets: GameTheme[] = [];
  const modes: Array<"light" | "dark"> = [];
  if (spec.modes.light) modes.push("light");
  if (spec.modes.dark) modes.push("dark");
  for (const mode of modes) {
    for (const corners of ["rounded", "square"] as const) {
      presets.push(buildTheme({ style, mode, corners }));
    }
  }
  return presets;
});

/** Backwards-compat alias — older code may still import THEME_PRESETS. */
export const THEME_PRESETS = STYLE_PRESETS;

/** Default theme per game type. Basic style, light mode, rounded corners. */
export const DEFAULT_THEME: Record<GameType, GameTheme> = {
  price_is_right: buildTheme({ style: "flat", mode: "light", corners: "rounded", id: "default-pir", name: "Default" }),
  trivia: buildTheme({ style: "flat", mode: "light", corners: "rounded", id: "default-trivia", name: "Default" }),
  stalk_market: buildTheme({ style: "flat", mode: "light", corners: "rounded", id: "default-sm", name: "Default" }),
};

export function getThemeById(id: string): GameTheme | undefined {
  return STYLE_PRESETS.find((t) => t.id === id);
}
