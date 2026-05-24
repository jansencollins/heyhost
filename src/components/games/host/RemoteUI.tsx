"use client";

import Link from "next/link";
import type { ReactNode, ButtonHTMLAttributes } from "react";

// Shared visual language for all host remotes. Black palette, tactile-feeling
// "physical remote" frame. Intentionally NOT tied to the game theme — the
// host's controller looks the same regardless of which game they're running.

export function RemoteFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-start justify-center bg-black">
      <div className="w-full max-w-md px-3 sm:px-4 pt-3 sm:pt-4 pb-6 text-zinc-100">
        {children}
      </div>
    </div>
  );
}

// Top "LED screen" — code, phase, status indicators.
export function RemoteScreen({
  title,
  code,
  phase,
  meta,
  screenHref,
}: {
  title: string;
  code: string;
  phase: string;
  meta?: ReactNode;
  screenHref?: string;
}) {
  return (
    <div
      className="rounded-xl px-3 py-2 mb-3"
      style={{
        background:
          "linear-gradient(180deg, #0c0c0c 0%, #131313 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "inset 0 2px 8px rgba(0,0,0,0.7)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 truncate">
            {title}
          </p>
          <p
            className="font-mono font-bold text-xl leading-tight truncate"
            style={{ color: "#7CFCB6", textShadow: "0 0 10px rgba(124,252,182,0.35)" }}
          >
            {code}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500">
            Phase
          </p>
          <p className="text-[11px] font-bold text-zinc-100 uppercase tracking-wider">
            {phase}
          </p>
        </div>
      </div>
      {(meta || screenHref) && (
        <div className="mt-1.5 pt-1.5 border-t border-white/5 flex items-center justify-between gap-3">
          <p className="text-[10px] text-zinc-500 truncate flex-1">{meta}</p>
          {screenHref && (
            <Link
              href={screenHref}
              target="_blank"
              className="text-[10px] text-zinc-400 hover:text-zinc-100 underline underline-offset-2 shrink-0"
            >
              Screen ↗
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

type RemoteButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT_STYLE: Record<RemoteButtonVariant, React.CSSProperties> = {
  primary: {
    background: "linear-gradient(180deg, #2d2d2d 0%, #1a1a1a 100%)",
    color: "#ffffff",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.6)",
  },
  secondary: {
    background: "linear-gradient(180deg, #1a1a1a 0%, #0c0c0c 100%)",
    color: "#d4d4d4",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 4px rgba(0,0,0,0.5)",
  },
  danger: {
    background: "linear-gradient(180deg, #5a1414 0%, #2a0808 100%)",
    color: "#fecaca",
    border: "1px solid rgba(239,68,68,0.4)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.6)",
  },
  ghost: {
    background: "transparent",
    color: "#a1a1aa",
    border: "1px solid transparent",
  },
};

export function RemoteButton({
  variant = "primary",
  size = "md",
  children,
  className = "",
  style,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> & {
  variant?: RemoteButtonVariant;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2.5 text-sm",
    lg: "px-5 py-3.5 text-base",
  };
  return (
    <button
      {...rest}
      style={{ ...VARIANT_STYLE[variant], ...style }}
      className={`${sizes[size]} font-semibold rounded-full transition active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 ${className}`}
    >
      {children}
    </button>
  );
}

export function RemoteSection({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl px-3 py-2.5 mb-2 ${className}`}
      style={{
        background:
          "linear-gradient(180deg, #181818 0%, #0e0e0e 100%)",
        border: "1px solid rgba(255,255,255,0.05)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), 0 1px 2px rgba(0,0,0,0.4)",
      }}
    >
      {title && (
        <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mb-1.5">
          {title}
        </p>
      )}
      {children}
    </section>
  );
}

export function RemotePlayerRow({
  name,
  color,
  rightSlot,
  onClick,
  active = false,
  onKick,
}: {
  name: string;
  color?: string;
  rightSlot?: ReactNode;
  onClick?: () => void;
  active?: boolean;
  onKick?: () => void;
}) {
  return (
    <div
      className={`flex items-center rounded-lg border transition ${
        active
          ? "border-amber-400/60"
          : "border-white/5 hover:border-white/10"
      }`}
      style={{
        background: active
          ? "linear-gradient(180deg, rgba(251,191,36,0.12) 0%, rgba(251,191,36,0.04) 100%)"
          : "linear-gradient(180deg, #121212 0%, #0a0a0a 100%)",
      }}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-1.5 text-left disabled:cursor-default"
      >
        {active && (
          <span className="text-amber-400 text-xs shrink-0" aria-label="Spotlight">
            ★
          </span>
        )}
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: color ?? "#71717a" }}
        />
        <span className="text-sm text-zinc-100 truncate flex-1">{name}</span>
        {rightSlot && <span className="shrink-0 ml-1">{rightSlot}</span>}
      </button>
      {onKick && (
        <button
          type="button"
          onClick={onKick}
          title="Remove player"
          className="px-2 py-1.5 text-zinc-600 hover:text-red-400 text-xs shrink-0"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function RemoteStatus({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "live" | "paused" | "warn";
}) {
  const tones: Record<string, { bg: string; color: string; dot: string }> = {
    neutral: { bg: "rgba(255,255,255,0.04)", color: "#d4d4d8", dot: "#71717a" },
    live: { bg: "rgba(34,197,94,0.12)", color: "#86efac", dot: "#22c55e" },
    paused: { bg: "rgba(251,191,36,0.12)", color: "#fde68a", dot: "#f59e0b" },
    warn: { bg: "rgba(239,68,68,0.12)", color: "#fca5a5", dot: "#ef4444" },
  };
  const t = tones[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
      style={{ background: t.bg, color: t.color }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: t.dot, boxShadow: `0 0 4px ${t.dot}` }}
      />
      {label}
    </span>
  );
}
