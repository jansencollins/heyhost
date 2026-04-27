import type { GameTheme, GameType, ThemeFont, ThemePattern } from "./types";

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
  pattern?: ThemePattern | null;
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
    pattern: opts.pattern ?? null,
  };
}

/**
 * Generic solid-color theme presets — a versatile set of bg/accent pairings
 * that work across game types. Mix of clean light surfaces, mid-tones, and
 * moodier dark backgrounds. All built via buildTheme() so the derived
 * surface/border/text tokens stay consistent.
 */
export const THEME_PRESETS: GameTheme[] = [
  // Light backgrounds
  buildTheme({
    id: "snow-indigo",
    name: "Snow Indigo",
    bg: "#FAFAFA",
    accent: "#4F46E5",
    headingFont: "Inter",
    bodyFont: "Inter",
    bodyTextMode: "dark",
    buttonTextMode: "light",
  }),
  buildTheme({
    id: "linen-coral",
    name: "Linen Coral",
    bg: "#F5EFE6",
    accent: "#F97350",
    headingFont: "Montserrat",
    bodyFont: "DM Sans",
    bodyTextMode: "dark",
    buttonTextMode: "light",
  }),
  buildTheme({
    id: "mint-forest",
    name: "Mint Forest",
    bg: "#E8F5EE",
    accent: "#15803D",
    headingFont: "Sora",
    bodyFont: "DM Sans",
    bodyTextMode: "dark",
    buttonTextMode: "light",
  }),
  buildTheme({
    id: "sky-plum",
    name: "Sky Plum",
    bg: "#EEF4FB",
    accent: "#7E22CE",
    headingFont: "Outfit",
    bodyFont: "Inter",
    bodyTextMode: "dark",
    buttonTextMode: "light",
  }),
  buildTheme({
    id: "rose-crimson",
    name: "Rose Crimson",
    bg: "#FBEEF0",
    accent: "#DC2626",
    headingFont: "Playfair Display",
    bodyFont: "DM Sans",
    bodyTextMode: "dark",
    buttonTextMode: "light",
  }),
  buildTheme({
    id: "butter-amber",
    name: "Butter Amber",
    bg: "#FBF4D8",
    accent: "#B45309",
    headingFont: "Raleway",
    bodyFont: "Nunito",
    bodyTextMode: "dark",
    buttonTextMode: "light",
  }),
  // Dark backgrounds
  buildTheme({
    id: "onyx-lime",
    name: "Onyx Lime",
    bg: "#0F0F12",
    accent: "#A3E635",
    headingFont: "Bebas Neue",
    bodyFont: "Inter",
    bodyTextMode: "light",
    buttonTextMode: "dark",
  }),
  buildTheme({
    id: "midnight-gold",
    name: "Midnight Gold",
    bg: "#0F1B2D",
    accent: "#F5C518",
    headingFont: "Playfair Display",
    bodyFont: "Inter",
    bodyTextMode: "light",
    buttonTextMode: "dark",
  }),
  buildTheme({
    id: "charcoal-cyan",
    name: "Charcoal Cyan",
    bg: "#1F2228",
    accent: "#06B6D4",
    headingFont: "Space Grotesk",
    bodyFont: "Inter",
    bodyTextMode: "light",
    buttonTextMode: "light",
  }),
  buildTheme({
    id: "forest-peach",
    name: "Forest Peach",
    bg: "#102820",
    accent: "#FCA17B",
    headingFont: "Sora",
    bodyFont: "DM Sans",
    bodyTextMode: "light",
    buttonTextMode: "dark",
  }),
  buildTheme({
    id: "burgundy-cream",
    name: "Burgundy Cream",
    bg: "#3A1414",
    accent: "#F4E4B8",
    headingFont: "Playfair Display",
    bodyFont: "DM Sans",
    bodyTextMode: "light",
    buttonTextMode: "dark",
  }),
  buildTheme({
    id: "ink-magenta",
    name: "Ink Magenta",
    bg: "#1A1412",
    accent: "#EC4899",
    headingFont: "Outfit",
    bodyFont: "DM Sans",
    bodyTextMode: "light",
    buttonTextMode: "light",
  }),
];

/** Default theme per game type */
export const DEFAULT_THEME: Record<GameType, GameTheme> = {
  price_is_right: THEME_PRESETS[0], // Snow Indigo — clean default
  trivia: THEME_PRESETS[3], // Sky Plum — quiz-friendly accent
};

export function getThemeById(id: string): GameTheme | undefined {
  return THEME_PRESETS.find((t) => t.id === id);
}
