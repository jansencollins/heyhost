import type { GameTheme, GameType, ThemeFont } from "./types";

/** All available fonts for the theme picker */
export const THEME_FONTS: { value: ThemeFont; label: string; category: "sans" | "serif" | "display" }[] = [
  { value: "Montserrat", label: "Montserrat", category: "sans" },
  { value: "DM Sans", label: "DM Sans", category: "sans" },
  { value: "Inter", label: "Inter", category: "sans" },
  { value: "Poppins", label: "Poppins", category: "sans" },
  { value: "Space Grotesk", label: "Space Grotesk", category: "sans" },
  { value: "Outfit", label: "Outfit", category: "sans" },
  { value: "Sora", label: "Sora", category: "sans" },
  { value: "Raleway", label: "Raleway", category: "sans" },
  { value: "Nunito", label: "Nunito", category: "sans" },
  { value: "Bebas Neue", label: "Bebas Neue", category: "display" },
  { value: "Oswald", label: "Oswald", category: "display" },
  { value: "Playfair Display", label: "Playfair Display", category: "serif" },
];

/**
 * Parse a hex color to RGB components.
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

/**
 * Lighten or darken a hex color by a factor (-1 to 1).
 * Positive = lighter, negative = darker.
 */
function adjustColor(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex);
  const adjust = (c: number) => Math.min(255, Math.max(0, Math.round(c + (factor > 0 ? (255 - c) : c) * factor)));
  return `#${[adjust(r), adjust(g), adjust(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Build a complete GameTheme from just bg, accent, fonts, and text modes.
 * Derives all the intermediate colors automatically.
 */
export function buildTheme(opts: {
  id: string;
  name: string;
  bg: string;
  accent: string;
  headingFont: ThemeFont;
  bodyFont: ThemeFont;
  bodyTextMode: "light" | "dark";
  buttonTextMode: "light" | "dark";
}): GameTheme {
  const { r, g, b } = hexToRgb(opts.accent);
  const isLightBody = opts.bodyTextMode === "light";

  return {
    id: opts.id,
    name: opts.name,
    bg: opts.bg,
    surface: adjustColor(opts.bg, 0.08),
    surfaceLight: adjustColor(opts.bg, 0.15),
    accent: opts.accent,
    accentDim: `rgba(${r},${g},${b},0.12)`,
    textPrimary: isLightBody ? "#FFFFFF" : "#1A1A1A",
    textMuted: isLightBody ? adjustColor(opts.bg, 0.55) : adjustColor(opts.bg, -0.4),
    textDim: isLightBody ? adjustColor(opts.bg, 0.35) : adjustColor(opts.bg, -0.25),
    border: `rgba(${r},${g},${b},0.10)`,
    danger: "#EF4444",
    headingFont: opts.headingFont,
    bodyFont: opts.bodyFont,
    bodyTextMode: opts.bodyTextMode,
    buttonTextMode: opts.buttonTextMode,
  };
}

/**
 * Light theme presets — matched to the dashboard palette.
 * Cream paper bg + ink text, with one accent color per preset.
 * Bright accents (sunflower, lime) get dark button text for contrast;
 * the rest use white button text.
 */
export const THEME_PRESETS: GameTheme[] = [
  {
    id: "cream-coral",
    name: "Cream Coral",
    bg: "#F4EDE0",
    surface: "#FBF6EC",
    surfaceLight: "#FFFDF6",
    accent: "#FF5B3B",
    accentDim: "rgba(255,91,59,0.14)",
    textPrimary: "#1A1412",
    textMuted: "#6B625A",
    textDim: "#9C9388",
    border: "rgba(255,91,59,0.22)",
    danger: "#B91C1C",
    headingFont: "Montserrat",
    bodyFont: "DM Sans",
    bodyTextMode: "dark",
    buttonTextMode: "light",
  },
  {
    id: "cream-lime",
    name: "Cream Lime",
    bg: "#F4EDE0",
    surface: "#FBF6EC",
    surfaceLight: "#FFFDF6",
    accent: "#A3E635",
    accentDim: "rgba(163,230,53,0.20)",
    textPrimary: "#1A1412",
    textMuted: "#6B625A",
    textDim: "#9C9388",
    border: "rgba(163,230,53,0.30)",
    danger: "#B91C1C",
    headingFont: "Montserrat",
    bodyFont: "DM Sans",
    bodyTextMode: "dark",
    buttonTextMode: "dark",
  },
  {
    id: "cream-violet",
    name: "Cream Violet",
    bg: "#F4EDE0",
    surface: "#FBF6EC",
    surfaceLight: "#FFFDF6",
    accent: "#6C4BF5",
    accentDim: "rgba(108,75,245,0.14)",
    textPrimary: "#1A1412",
    textMuted: "#6B625A",
    textDim: "#9C9388",
    border: "rgba(108,75,245,0.22)",
    danger: "#B91C1C",
    headingFont: "Montserrat",
    bodyFont: "DM Sans",
    bodyTextMode: "dark",
    buttonTextMode: "light",
  },
  {
    id: "cream-teal",
    name: "Cream Teal",
    bg: "#F4EDE0",
    surface: "#FBF6EC",
    surfaceLight: "#FFFDF6",
    accent: "#14B8A6",
    accentDim: "rgba(20,184,166,0.16)",
    textPrimary: "#1A1412",
    textMuted: "#6B625A",
    textDim: "#9C9388",
    border: "rgba(20,184,166,0.25)",
    danger: "#B91C1C",
    headingFont: "Montserrat",
    bodyFont: "DM Sans",
    bodyTextMode: "dark",
    buttonTextMode: "light",
  },
  {
    id: "cream-magenta",
    name: "Cream Magenta",
    bg: "#F4EDE0",
    surface: "#FBF6EC",
    surfaceLight: "#FFFDF6",
    accent: "#EC4899",
    accentDim: "rgba(236,72,153,0.14)",
    textPrimary: "#1A1412",
    textMuted: "#6B625A",
    textDim: "#9C9388",
    border: "rgba(236,72,153,0.22)",
    danger: "#B91C1C",
    headingFont: "Montserrat",
    bodyFont: "DM Sans",
    bodyTextMode: "dark",
    buttonTextMode: "light",
  },
  {
    id: "cream-sunflower",
    name: "Cream Sunflower",
    bg: "#F4EDE0",
    surface: "#FBF6EC",
    surfaceLight: "#FFFDF6",
    accent: "#F5C518",
    accentDim: "rgba(245,197,24,0.20)",
    textPrimary: "#1A1412",
    textMuted: "#6B625A",
    textDim: "#9C9388",
    border: "rgba(245,197,24,0.30)",
    danger: "#B91C1C",
    headingFont: "Montserrat",
    bodyFont: "DM Sans",
    bodyTextMode: "dark",
    buttonTextMode: "dark",
  },
  // Two darker neutral variants for hosts who want a moodier surface
  {
    id: "dune-coral",
    name: "Dune Coral",
    bg: "#ECE3D0",
    surface: "#F4EDE0",
    surfaceLight: "#FBF6EC",
    accent: "#FF5B3B",
    accentDim: "rgba(255,91,59,0.16)",
    textPrimary: "#1A1412",
    textMuted: "#6B625A",
    textDim: "#9C9388",
    border: "rgba(255,91,59,0.25)",
    danger: "#B91C1C",
    headingFont: "Montserrat",
    bodyFont: "DM Sans",
    bodyTextMode: "dark",
    buttonTextMode: "light",
  },
  {
    id: "dune-violet",
    name: "Dune Violet",
    bg: "#ECE3D0",
    surface: "#F4EDE0",
    surfaceLight: "#FBF6EC",
    accent: "#6C4BF5",
    accentDim: "rgba(108,75,245,0.16)",
    textPrimary: "#1A1412",
    textMuted: "#6B625A",
    textDim: "#9C9388",
    border: "rgba(108,75,245,0.25)",
    danger: "#B91C1C",
    headingFont: "Montserrat",
    bodyFont: "DM Sans",
    bodyTextMode: "dark",
    buttonTextMode: "light",
  },
];

/** Default theme per game type */
export const DEFAULT_THEME: Record<GameType, GameTheme> = {
  price_is_right: THEME_PRESETS[1], // Cream Lime — matches the TCHM brand color
  trivia: THEME_PRESETS[2], // Cream Violet — matches the trivia brand color
};

export function getThemeById(id: string): GameTheme | undefined {
  return THEME_PRESETS.find((t) => t.id === id);
}
