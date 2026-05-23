import type { CSSProperties } from "react";
import type { GameTheme, ThemeFont, ThemeStyle } from "./types";

/**
 * Per-style recipe for the gameplay UI. We currently ship only the "Basic"
 * (flat) style. Cards/buttons read `t.corners` so users can flip between
 * sharp ("square") and rounded ("rounded" → pill buttons) without picking a
 * separate style.
 *
 * Legacy themes saved with older style strings ("luxury", "vaporwave", etc.)
 * fall back to flat at runtime via `getStyleSpec`.
 */

type ColorSpec = {
  bg: string;
  surface: string;
  surfaceLight: string;
  accent: string;
  accentSecondary?: string;
  accentTertiary?: string;
  textPrimary: string;
  textMuted: string;
  textDim: string;
  border: string;
  bodyTextMode: "light" | "dark";
  buttonTextMode: "light" | "dark";
};

export type StyleSpec = {
  name: string;
  blurb: string;
  fonts: { heading: ThemeFont; body: ThemeFont };
  modes: { light?: ColorSpec; dark?: ColorSpec };
  accentCount: 1 | 2 | 3;
  shell: (t: GameTheme) => CSSProperties;
  card: (t: GameTheme, opts?: { glow?: boolean }) => CSSProperties;
  cardInner?: (t: GameTheme) => CSSProperties;
  button: (t: GameTheme, opts?: { variant?: "primary" | "ghost" }) => CSSProperties;
  buttonInner?: (t: GameTheme) => CSSProperties;
  buttonText?: { uppercase?: boolean; tracking?: string; weight?: number };
  headingCss?: CSSProperties;
};

function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const cardRadius = (t: GameTheme) => (t.corners === "square" ? 0 : 16);
const buttonRadius = (t: GameTheme) => (t.corners === "square" ? 0 : 9999);

export const STYLES: Record<ThemeStyle, StyleSpec> = {
  flat: {
    name: "Basic",
    blurb: "Clean blocks. Theme it your way with corners, colors, and fonts.",
    fonts: { heading: "Outfit", body: "Outfit" },
    accentCount: 1,
    modes: {
      light: {
        bg: "#FFFFFF",
        surface: "#F3F4F6",
        surfaceLight: "#FFFFFF",
        accent: "#3B82F6",
        textPrimary: "#111827",
        textMuted: "#4B5563",
        textDim: "#9CA3AF",
        border: "#E5E7EB",
        bodyTextMode: "dark",
        buttonTextMode: "light",
      },
      dark: {
        bg: "#111827",
        surface: "#1F2937",
        surfaceLight: "#374151",
        accent: "#60A5FA",
        textPrimary: "#F9FAFB",
        textMuted: "#D1D5DB",
        textDim: "#9CA3AF",
        border: "#374151",
        bodyTextMode: "light",
        buttonTextMode: "dark",
      },
    },
    shell: () => ({}),
    card: (t, { glow } = {}) => ({
      background: t.surface,
      border: `1px solid color-mix(in srgb, ${t.textPrimary} 12%, transparent)`,
      borderRadius: cardRadius(t),
      boxShadow: glow ? `0 0 24px ${rgba(t.accent, 0.18)}` : "none",
    }),
    button: (t, { variant = "primary" } = {}) => ({
      background: variant === "primary" ? t.accent : t.surface,
      color:
        variant === "primary"
          ? t.buttonTextMode === "light"
            ? "#FFFFFF"
            : "#111827"
          : t.textPrimary,
      border: variant === "primary"
        ? "none"
        : `1px solid color-mix(in srgb, ${t.textPrimary} 14%, transparent)`,
      borderRadius: buttonRadius(t),
      boxShadow: "none",
    }),
    buttonText: { weight: 600 },
  },
};

/** Curated picker order — only one style for now. */
export const STYLE_ORDER: ThemeStyle[] = ["flat"];

/** Safe spec lookup — falls back to flat for legacy theme ids. */
export function getStyleSpec(style: ThemeStyle | string): StyleSpec {
  return STYLES[style as ThemeStyle] ?? STYLES.flat;
}

export function getShellCss(t: GameTheme): CSSProperties {
  return getStyleSpec(t.style).shell(t);
}

export function getCardCss(t: GameTheme, opts?: { glow?: boolean }): CSSProperties {
  return getStyleSpec(t.style).card(t, opts);
}

export function getButtonCss(
  t: GameTheme,
  opts?: { variant?: "primary" | "ghost" }
): CSSProperties {
  return getStyleSpec(t.style).button(t, opts);
}

export function getButtonInnerCss(t: GameTheme): CSSProperties | undefined {
  return getStyleSpec(t.style).buttonInner?.(t);
}

export function getButtonTextStyle(t: GameTheme): CSSProperties {
  const cfg = getStyleSpec(t.style).buttonText;
  if (!cfg) return {};
  const out: CSSProperties = {};
  if (cfg.uppercase) out.textTransform = "uppercase";
  if (cfg.tracking) out.letterSpacing = cfg.tracking;
  if (cfg.weight) out.fontWeight = cfg.weight;
  return out;
}

export function getHeadingCss(t: GameTheme): CSSProperties {
  return getStyleSpec(t.style).headingCss ?? {};
}

export function listStyles(): { id: ThemeStyle; spec: StyleSpec }[] {
  return STYLE_ORDER.map((id) => ({ id, spec: STYLES[id] }));
}
