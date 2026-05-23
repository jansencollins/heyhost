"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { GameTheme } from "@/lib/types";
import { getFontFamily } from "@/lib/theme-fonts";

// Shared stock-market-styled primitives. All theme-driven so swapping the
// game's accent/danger/surface flips the palette but keeps the trading-app
// feel.

export function TickerCard({
  theme,
  title,
  action,
  className = "",
  tall = false,
  tallAlign = "center",
  children,
}: {
  theme: GameTheme;
  title?: string;
  action?: ReactNode;
  className?: string;
  /** When true the card grows to fill remaining flex space. */
  tall?: boolean;
  /** How the body is aligned when tall. Defaults to vertically centered. */
  tallAlign?: "center" | "top";
  children: ReactNode;
}) {
  const overlay = theme.mode === "dark" ? "rgb(255,255,255)" : "rgb(0,0,0)";
  // Card body is derived from bg + a small overlay tint, so changing the bg
  // color in the theme editor visibly shifts every card. The gradient adds
  // a subtle top-to-bottom lift.
  const cardTop = `color-mix(in srgb, ${theme.bg} 92%, ${overlay})`;
  const cardBottom = `color-mix(in srgb, ${theme.bg} 86%, ${overlay})`;
  return (
    <section
      className={`rounded-lg p-3 ${tall ? "flex-1 flex flex-col" : ""} ${className}`}
      style={{
        background: `linear-gradient(180deg, ${cardTop} 0%, ${cardBottom} 100%)`,
        border: `1px solid ${theme.border}`,
        boxShadow: `0 1px 2px ${theme.textPrimary}08, 0 8px 24px -12px ${theme.textPrimary}10`,
      }}
    >
      {(title || action) && (
        <div className="flex items-center justify-between mb-2">
          {title && (
            <p
              className="text-sm font-semibold"
              style={{ color: theme.textPrimary }}
            >
              {title}
            </p>
          )}
          {action}
        </div>
      )}
      {tall ? (
        <div
          className={`flex-1 min-h-0 flex flex-col overflow-y-auto ${
            tallAlign === "top" ? "justify-start" : "justify-center"
          }`}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

// $SYMBOL · Company Name — the recognisable stock-detail header.
export function TickerSymbol({
  theme,
  symbol,
  name,
  size = "md",
}: {
  theme: GameTheme;
  symbol: string;
  name?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: { sym: "text-base", name: "text-[11px]" },
    md: { sym: "text-xl", name: "text-xs" },
    lg: { sym: "text-3xl", name: "text-sm" },
  };
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span
        className={`${sizes[size].sym} font-extrabold tracking-tight tabular-nums`}
        style={{
          color: theme.textPrimary,
          fontFamily: getFontFamily(theme.headingFont),
        }}
      >
        ${symbol.toUpperCase()}
      </span>
      {name && (
        <span
          className={`${sizes[size].name} truncate`}
          style={{ color: theme.textMuted }}
        >
          {name}
        </span>
      )}
    </div>
  );
}

// ▲ +$60 (+2.34%) — green if direction up, red if down.
export function PriceDelta({
  theme,
  amount,
  direction,
  percent,
  size = "md",
}: {
  theme: GameTheme;
  amount: string; // formatted, e.g. "$60.00" or "+$60"
  direction: "up" | "down" | "neutral";
  percent?: string; // optional, e.g. "2.34%"
  size?: "sm" | "md" | "lg";
}) {
  const color =
    direction === "up"
      ? theme.accent
      : direction === "down"
        ? theme.danger
        : theme.textMuted;
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "·";
  const sizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };
  return (
    <span
      className={`${sizes[size]} font-semibold inline-flex items-baseline gap-1 tabular-nums`}
      style={{ color }}
    >
      <span className="text-[0.85em]">{arrow}</span>
      <span>{amount}</span>
      {percent && <span className="opacity-80">({percent})</span>}
    </span>
  );
}

// Big-number price display, used at the top of stock cards.
export function PriceQuote({
  theme,
  amount,
  size = "lg",
}: {
  theme: GameTheme;
  amount: string;
  size?: "md" | "lg" | "xl";
}) {
  const sizes = {
    md: "text-lg",
    lg: "text-xl",
    xl: "text-2xl",
  };
  return (
    <span
      className={`${sizes[size]} font-bold tabular-nums tracking-tight`}
      style={{
        color: theme.textPrimary,
        fontFamily: getFontFamily(theme.headingFont),
      }}
    >
      {amount}
    </span>
  );
}

// Tiny inline sparkline (for player rows / portfolio summaries).
export function Sparkline({
  data,
  color,
  width = 60,
  height = 20,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data
    .map((v, i) => `${i * step},${height - ((v - min) / range) * height}`)
    .join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Scrolling "live ticker" strip at the top of a screen. Pure decoration but
// strongly cues the market-app theme.
export function LiveTickerStrip({
  theme,
  items,
}: {
  theme: GameTheme;
  items: { symbol: string; price: string; direction: "up" | "down" }[];
}) {
  // Duration randomized once on mount so the scroll isn't on a clean second.
  const [duration] = useState(() => (18 + Math.random() * 14).toFixed(2));
  const repeated = [...items, ...items];
  return (
    <div
      className="relative w-full overflow-hidden rounded-xl"
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
      }}
    >
      <div
        className="flex gap-5 py-2 px-3 whitespace-nowrap"
        style={{
          animation: `live-ticker-scroll ${duration}s linear infinite`,
          width: "fit-content",
        }}
      >
        {repeated.map((it, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 text-xs">
            <span
              className="font-bold tabular-nums"
              style={{ color: theme.textPrimary }}
            >
              ${it.symbol.toUpperCase()}
            </span>
            <span
              className="tabular-nums"
              style={{ color: theme.textMuted }}
            >
              {it.price}
            </span>
            <span
              style={{
                color: it.direction === "up" ? theme.accent : theme.danger,
              }}
            >
              {it.direction === "up" ? "▲" : "▼"}
            </span>
          </span>
        ))}
      </div>
      <style>{`
        @keyframes live-ticker-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

// Tab row mimicking the 1D/1W/1M/etc. period selector. Generic — just labels
// + selected state.
export function PeriodTabs({
  theme,
  options,
  value,
  onChange,
}: {
  theme: GameTheme;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold transition shrink-0"
            style={{
              background: active ? theme.accent : "transparent",
              color: active
                ? theme.buttonTextMode === "light"
                  ? "#ffffff"
                  : "#1a1a1a"
                : theme.textMuted,
              border: `1px solid ${active ? theme.accent : theme.border}`,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Primary CTA in the "Deposit" / "Buy" style — pill, accent fill.
export function MarketButton({
  theme,
  variant = "primary",
  onClick,
  disabled,
  children,
  className = "",
}: {
  theme: GameTheme;
  variant?: "primary" | "outline" | "danger";
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const base =
    "w-full py-2.5 rounded-full font-semibold text-sm transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed";
  const styles: React.CSSProperties =
    variant === "primary"
      ? {
          background: theme.accent,
          color: theme.buttonTextMode === "light" ? "#ffffff" : "#1a1a1a",
          border: `1px solid ${theme.accent}`,
        }
      : variant === "danger"
        ? {
            background: theme.danger,
            color: "#ffffff",
            border: `1px solid ${theme.danger}`,
          }
        : {
            background: "transparent",
            color: theme.textPrimary,
            border: `1px solid ${theme.border}`,
          };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${className}`}
      style={styles}
    >
      {children}
    </button>
  );
}

// Inline stepper for adjusting numeric position size. Uses ▲/▼ arrows so it
// reads as buy/sell rather than +/−.
export function PositionStepper({
  theme,
  onDecrement,
  onIncrement,
  canIncrement,
  canDecrement,
  label,
}: {
  theme: GameTheme;
  onDecrement: () => void;
  onIncrement: () => void;
  canIncrement: boolean;
  canDecrement: boolean;
  label: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onDecrement}
        disabled={!canDecrement}
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold disabled:opacity-30 transition"
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          color: theme.danger,
        }}
        aria-label="Lower bet"
      >
        −
      </button>
      <div
        className="min-w-[60px] text-center font-semibold tabular-nums text-sm"
        style={{ color: theme.textPrimary }}
      >
        {label}
      </div>
      <button
        type="button"
        onClick={onIncrement}
        disabled={!canIncrement}
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold disabled:opacity-30 transition"
        style={{
          background: theme.accent,
          color: theme.buttonTextMode === "light" ? "#ffffff" : "#1a1a1a",
          border: `1px solid ${theme.accent}`,
        }}
        aria-label="Raise bet"
      >
        +
      </button>
    </div>
  );
}
