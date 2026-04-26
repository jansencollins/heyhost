import type { ThemeFont } from "./types";

/** Map theme font names to Google Fonts URL-encoded family strings */
const GOOGLE_FONT_FAMILIES: Record<ThemeFont, string> = {
  "Montserrat": "Montserrat:wght@400;500;600;700;800;900",
  "DM Sans": "DM+Sans:wght@400;500;600;700",
  "Inter": "Inter:wght@400;500;600;700;800;900",
  "Poppins": "Poppins:wght@400;500;600;700;800;900",
  "Space Grotesk": "Space+Grotesk:wght@400;500;600;700",
  "Outfit": "Outfit:wght@400;500;600;700;800;900",
  "Sora": "Sora:wght@400;500;600;700;800",
  "Raleway": "Raleway:wght@400;500;600;700;800;900",
  "Nunito": "Nunito:wght@400;500;600;700;800;900",
  "Bebas Neue": "Bebas+Neue",
  "Oswald": "Oswald:wght@400;500;600;700",
  "Playfair Display": "Playfair+Display:wght@400;500;600;700;800;900",
};

/** Fonts already loaded by next/font and don't need dynamic loading */
const BUILTIN_FONTS: ThemeFont[] = ["Montserrat", "DM Sans"];

/**
 * Returns a Google Fonts CSS URL for fonts that aren't built-in.
 * Returns null if all fonts are already loaded.
 */
export function getGoogleFontsUrl(fonts: ThemeFont[]): string | null {
  const needed = fonts.filter((f) => !BUILTIN_FONTS.includes(f));
  if (needed.length === 0) return null;
  const families = needed.map((f) => GOOGLE_FONT_FAMILIES[f]).join("&family=");
  return `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
}

/**
 * Get the CSS font-family value for a theme font.
 * Built-in fonts use the CSS variable; others use the name directly.
 */
export function getFontFamily(font: ThemeFont): string {
  if (font === "Montserrat") return "var(--font-montserrat), 'Montserrat', system-ui, sans-serif";
  if (font === "DM Sans") return "var(--font-dm-sans), 'DM Sans', system-ui, sans-serif";
  return `'${font}', system-ui, sans-serif`;
}
