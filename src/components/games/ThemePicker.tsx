"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import { THEME_PRESETS, THEME_FONTS, buildTheme } from "@/lib/theme-presets";
import { getFontFamily, getGoogleFontsUrl } from "@/lib/theme-fonts";
import type { GameTheme, ThemeFont } from "@/lib/types";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] uppercase tracking-wider text-smoke font-semibold mb-2">
      {children}
    </label>
  );
}

function FontSelect({
  value,
  onChange,
  compact = false,
}: {
  value: ThemeFont;
  onChange: (font: ThemeFont) => void;
  compact?: boolean;
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
      >
        <span className="truncate">{value}</span>
        <svg className={`w-3 h-3 shrink-0 text-smoke transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className={`absolute z-50 mt-1 w-full overflow-y-auto rounded-lg border border-dune bg-paper shadow-[0_10px_40px_-16px_rgba(26,20,18,0.2)] ${compact ? "max-h-48" : "max-h-56"}`}>
          {THEME_FONTS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => { onChange(f.value); setOpen(false); }}
              className={`w-full text-left transition-colors ${compact ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"} ${
                value === f.value
                  ? "bg-dune text-ink"
                  : "text-smoke hover:bg-dune/50 hover:text-ink"
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
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (color: string) => void;
  compact?: boolean;
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

function ModeToggle({
  value,
  onChange,
  compact = false,
}: {
  value: "light" | "dark";
  onChange: (mode: "light" | "dark") => void;
  compact?: boolean;
}) {
  return (
    <div className="flex gap-1.5">
      {(["light", "dark"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all ${compact ? "py-1 text-[11px]" : "py-2 text-sm"}`}
          style={{
            background: value === mode ? "var(--dune)" : "var(--paper)",
            border: value === mode ? "1px solid var(--ink)" : "1px solid var(--dune)",
            color: value === mode ? "var(--ink)" : "var(--smoke)",
          }}
        >
          <span
            className={`rounded-full border ${compact ? "w-3 h-3" : "w-4 h-4"}`}
            style={{
              background: mode === "light" ? "#FFFFFF" : "#1A1A1A",
              borderColor: "var(--ink)",
            }}
          />
          {mode === "light" ? "Light" : "Dark"}
        </button>
      ))}
    </div>
  );
}

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

  const rebuildFromColors = useCallback(
    (bg: string, accent: string, bodyTextMode?: "light" | "dark", buttonTextMode?: "light" | "dark") => {
      const rebuilt = buildTheme({
        id: "custom",
        name: "Custom",
        bg,
        accent,
        headingFont: value.headingFont,
        bodyFont: value.bodyFont,
        bodyTextMode: bodyTextMode ?? value.bodyTextMode,
        buttonTextMode: buttonTextMode ?? value.buttonTextMode,
      });
      onChange(rebuilt);
    },
    [value, onChange]
  );

  const fontsUrl = getGoogleFontsUrl([value.headingFont, value.bodyFont]);
  const gap = compact ? "space-y-3" : "space-y-5";

  return (
    <div className={gap}>
      {fontsUrl && (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link rel="stylesheet" href={fontsUrl} />
      )}

      {/* Presets */}
      <div>
        <SectionLabel>Presets</SectionLabel>
        <div className={`grid gap-1.5 ${compact ? "grid-cols-8" : "grid-cols-8 gap-2"}`}>
          {THEME_PRESETS.map((preset) => {
            const selected = value.id === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onChange(preset)}
                title={preset.name}
                className="rounded-lg overflow-hidden transition-all aspect-square relative"
                style={{
                  background: preset.bg,
                  border: selected ? `2px solid var(--ink)` : "2px solid var(--dune)",
                  boxShadow: selected ? `0 0 0 2px var(--paper), 0 0 0 4px ${preset.accent}` : "none",
                }}
              >
                <div className="absolute bottom-0.5 left-0.5 right-0.5 h-1 rounded-sm" style={{ background: preset.accent }} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <SectionLabel>Background</SectionLabel>
          <ColorInput value={value.bg} onChange={(c) => rebuildFromColors(c, value.accent)} compact={compact} />
        </div>
        <div>
          <SectionLabel>Accent</SectionLabel>
          <ColorInput value={value.accent} onChange={(c) => rebuildFromColors(value.bg, c)} compact={compact} />
        </div>
      </div>

      {/* Text Mode Toggles */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <SectionLabel>Body Text</SectionLabel>
          <ModeToggle value={value.bodyTextMode} onChange={(m) => rebuildFromColors(value.bg, value.accent, m, value.buttonTextMode)} compact={compact} />
        </div>
        <div>
          <SectionLabel>Button Text</SectionLabel>
          <ModeToggle value={value.buttonTextMode} onChange={(m) => updateField("buttonTextMode", m)} compact={compact} />
        </div>
      </div>

      {/* Fonts */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <SectionLabel>Heading Font</SectionLabel>
          <FontSelect value={value.headingFont} onChange={(f) => updateField("headingFont", f)} compact={compact} />
        </div>
        <div>
          <SectionLabel>Body Font</SectionLabel>
          <FontSelect value={value.bodyFont} onChange={(f) => updateField("bodyFont", f)} compact={compact} />
        </div>
      </div>

      {/* Live Mini Preview */}
      {!compact && (
        <div>
          <SectionLabel>Preview</SectionLabel>
          <div
            className="rounded-xl overflow-hidden p-4 flex flex-col gap-2"
            style={{ background: value.bg, color: value.textPrimary }}
          >
            <h3
              className="text-lg font-bold"
              style={{ fontFamily: getFontFamily(value.headingFont) }}
            >
              Heading Text
            </h3>
            <p
              className="text-sm"
              style={{ color: value.textMuted, fontFamily: getFontFamily(value.bodyFont) }}
            >
              Body text with the selected font and colors.
            </p>
            <div
              className="rounded-lg p-3 mt-1"
              style={{ background: value.surface, border: `1px solid ${value.border}` }}
            >
              <p className="text-xs" style={{ color: value.textDim, fontFamily: getFontFamily(value.bodyFont) }}>
                Card surface preview
              </p>
            </div>
            <button
              className="mt-1 py-2 rounded-lg font-bold text-sm"
              style={{
                background: value.accent,
                color: value.buttonTextMode === "light" ? "#FFFFFF" : "#1A1A1A",
                fontFamily: getFontFamily(value.bodyFont),
              }}
            >
              Button Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
