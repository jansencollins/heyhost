"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import { THEME_FONTS } from "@/lib/theme-presets";
import { getFontFamily, getGoogleFontsUrl } from "@/lib/theme-fonts";
import { getStyleSpec, getCardCss, getButtonCss, getButtonInnerCss, getButtonTextStyle } from "@/lib/theme-styles";
import { AVATAR_COLORS } from "@/lib/avatar-colors";
import type { GameTheme, ThemeCorners, ThemeFont } from "@/lib/types";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] uppercase tracking-wider text-smoke font-semibold mb-2">
      {children}
    </label>
  );
}

// ─── Color & Font helpers (unchanged behavior) ───────────────────────────
function FontSelect({
  value, onChange, compact = false, label,
}: {
  value: ThemeFont; onChange: (font: ThemeFont) => void; compact?: boolean; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);
  const allFontsUrl = getGoogleFontsUrl(THEME_FONTS.map((f) => f.value));
  return (
    <div ref={ref} className="relative">
      {allFontsUrl && <link rel="stylesheet" href={allFontsUrl} />}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full bg-paper border border-dune rounded-lg text-ink text-left cursor-pointer flex items-center justify-between gap-2 hover:border-ink/40 transition-colors ${compact ? "px-2 py-1.5 text-xs" : "px-3 py-2.5 text-sm"}`}
        style={{ fontFamily: getFontFamily(value) }}
        aria-label={label}
      >
        <span className="truncate">{value}</span>
        <svg className={`w-3 h-3 shrink-0 text-smoke transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className={`absolute z-50 mt-1 w-full overflow-y-auto rounded-lg border border-dune bg-paper shadow-[0_10px_40px_-16px_rgba(26,20,18,0.2)] ${compact ? "max-h-56" : "max-h-64"}`}>
          {THEME_FONTS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => { onChange(f.value); setOpen(false); }}
              className={`w-full text-left transition-colors ${compact ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"} ${
                value === f.value ? "bg-dune text-ink" : "text-smoke hover:bg-dune/50 hover:text-ink"
              }`}
              style={{ fontFamily: getFontFamily(f.value) }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ColorInput({
  value, onChange, compact = false,
}: {
  value: string; onChange: (color: string) => void; compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <label
        className={`rounded-lg cursor-pointer border border-dune overflow-hidden shrink-0 ${compact ? "w-7 h-7" : "w-10 h-10"}`}
        style={{ background: value }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="opacity-0 w-full h-full cursor-pointer"
        />
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value);
        }}
        className={`flex-1 min-w-0 bg-paper border border-dune rounded-lg font-mono text-ink focus:outline-none focus:border-ink/50 ${compact ? "px-2 py-1 text-[11px]" : "px-3 py-2 text-sm"}`}
        maxLength={7}
      />
    </div>
  );
}

function SwatchInput({
  value, onChange, compact = false,
}: {
  value: string; onChange: (color: string) => void; compact?: boolean;
}) {
  return (
    <label
      className={`relative rounded-md cursor-pointer border border-dune overflow-hidden block hover:border-ink/50 transition-colors ${compact ? "w-7 h-7" : "w-9 h-9"}`}
      style={{ background: value }}
      title={value}
    >
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="opacity-0 w-full h-full cursor-pointer"
      />
    </label>
  );
}

const DEFAULT_PLAYER_COLORS: readonly string[] = AVATAR_COLORS;

// ─── Main picker ─────────────────────────────────────────────────────────
export function ThemePicker({
  value,
  onChange,
  compact = false,
}: {
  value: GameTheme;
  onChange: (theme: GameTheme) => void;
  compact?: boolean;
}) {
  const updateField = useCallback(
    <K extends keyof GameTheme>(field: K, val: GameTheme[K]) => {
      onChange({ ...value, [field]: val });
    },
    [value, onChange]
  );

  const applyMode = useCallback(
    (mode: "light" | "dark") => {
      const spec = getStyleSpec(value.style);
      const colors = spec.modes[mode] ?? spec.modes.light ?? spec.modes.dark!;
      onChange({
        ...value,
        mode,
        bg: colors.bg,
        surface: colors.surface,
        surfaceLight: colors.surfaceLight,
        accent: colors.accent,
        textPrimary: colors.textPrimary,
        textMuted: colors.textMuted,
        textDim: colors.textDim,
        border: colors.border,
        bodyTextMode: colors.bodyTextMode,
        buttonTextMode: colors.buttonTextMode,
      });
    },
    [value, onChange]
  );

  const applyCorners = useCallback(
    (corners: ThemeCorners) => {
      onChange({ ...value, corners });
    },
    [value, onChange]
  );

  const allFontsUrl = getGoogleFontsUrl([value.headingFont, value.bodyFont]);
  const gap = compact ? "space-y-3" : "space-y-5";
  const corners: ThemeCorners = value.corners ?? "rounded";

  return (
    <div className={gap}>
      {allFontsUrl && (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link rel="stylesheet" href={allFontsUrl} />
      )}

      {/* Mode toggle */}
      <div>
        <SectionLabel>Mode</SectionLabel>
        <div className="flex gap-1.5">
          {(["light", "dark"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => applyMode(mode)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all ${compact ? "py-1 text-[11px]" : "py-2 text-sm"}`}
              style={{
                background: value.mode === mode ? "var(--dune)" : "var(--paper)",
                border: value.mode === mode ? "1px solid var(--ink)" : "1px solid var(--dune)",
                color: value.mode === mode ? "var(--ink)" : "var(--smoke)",
              }}
            >
              <span
                className={`rounded-full border ${compact ? "w-3 h-3" : "w-4 h-4"}`}
                style={{ background: mode === "light" ? "#FFFFFF" : "#1A1A1A", borderColor: "var(--ink)" }}
              />
              {mode === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>
      </div>

      {/* Corners toggle */}
      <div>
        <SectionLabel>Corners</SectionLabel>
        <div className="flex gap-1.5">
          {([
            { id: "square", label: "Square" },
            { id: "rounded", label: "Rounded" },
          ] as const).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => applyCorners(id)}
              className={`flex-1 flex items-center justify-center gap-2 font-medium transition-all ${compact ? "py-1 text-[11px]" : "py-2 text-sm"}`}
              style={{
                background: corners === id ? "var(--dune)" : "var(--paper)",
                border: corners === id ? "1px solid var(--ink)" : "1px solid var(--dune)",
                color: corners === id ? "var(--ink)" : "var(--smoke)",
                borderRadius: 8,
              }}
            >
              <span
                className={`border border-ink/70 ${compact ? "w-3 h-3" : "w-4 h-4"}`}
                style={{ borderRadius: id === "rounded" ? 9999 : 0 }}
              />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <SectionLabel>Background</SectionLabel>
          <ColorInput value={value.bg} onChange={(c) => updateField("bg", c)} compact={compact} />
        </div>
        <div>
          <SectionLabel>Accent</SectionLabel>
          <ColorInput value={value.accent} onChange={(c) => updateField("accent", c)} compact={compact} />
        </div>
      </div>

      {/* Fonts */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <SectionLabel>Heading Font</SectionLabel>
          <FontSelect value={value.headingFont} onChange={(f) => updateField("headingFont", f)} compact={compact} label="Heading font" />
        </div>
        <div>
          <SectionLabel>Body Font</SectionLabel>
          <FontSelect value={value.bodyFont} onChange={(f) => updateField("bodyFont", f)} compact={compact} label="Body font" />
        </div>
      </div>

      {/* Player colors */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>Player Colors</SectionLabel>
          <button
            type="button"
            onClick={() => updateField("playerColors", Array.from(DEFAULT_PLAYER_COLORS))}
            className="text-[10px] uppercase tracking-wider text-smoke hover:text-ink transition-colors mb-2 cursor-pointer"
          >
            Reset
          </button>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {Array.from({ length: 12 }).map((_, i) => {
            const palette = value.playerColors ?? DEFAULT_PLAYER_COLORS;
            const color = palette[i] ?? DEFAULT_PLAYER_COLORS[i];
            return (
              <SwatchInput
                key={i}
                value={color}
                onChange={(c) => {
                  const next = Array.from(palette);
                  while (next.length < 12) next.push(DEFAULT_PLAYER_COLORS[next.length]);
                  next[i] = c;
                  updateField("playerColors", next.slice(0, 12));
                }}
                compact={compact}
              />
            );
          })}
        </div>
      </div>

      {/* Live preview — bigger, full-width */}
      {!compact && (
        <div>
          <SectionLabel>Preview</SectionLabel>
          <div
            className="rounded-xl overflow-hidden p-4 flex flex-col gap-3"
            style={{ background: value.bg, color: value.textPrimary }}
          >
            <h3 className="text-lg font-bold" style={{ fontFamily: getFontFamily(value.headingFont) }}>
              Heading Text
            </h3>
            <p className="text-sm" style={{ color: value.textMuted, fontFamily: getFontFamily(value.bodyFont) }}>
              Body text with the selected font and colors.
            </p>
            <div className="p-3 mt-1 text-xs" style={{ ...getCardCss(value), color: value.textDim, fontFamily: getFontFamily(value.bodyFont) }}>
              Card surface preview
            </div>
            <button
              className="mt-1 py-2 px-4 text-sm self-start"
              style={{ ...getButtonCss(value), ...getButtonTextStyle(value), fontFamily: getFontFamily(value.headingFont) }}
            >
              <span style={getButtonInnerCss(value)}>Button</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
