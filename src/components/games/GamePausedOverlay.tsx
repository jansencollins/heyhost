"use client";

import { useGameTheme } from "@/lib/theme-context";

export function GamePausedOverlay() {
  const theme = useGameTheme();
  return (
    <div
      // absolute (not fixed) so the overlay is scoped to the nearest positioned
      // ancestor — the game shell (which is always `relative`). This keeps the
      // overlay confined to the phone frame in the dev preview and to the page
      // in production.
      className="absolute inset-0 z-[200] flex flex-col items-center justify-center px-6 text-center backdrop-blur-md"
      style={{ background: `color-mix(in srgb, ${theme.bg} 86%, black)` }}
    >
      <div
        className="rounded-3xl border-2 px-10 py-12 max-w-md w-full"
        style={{
          background: theme.surface,
          borderColor: theme.accent,
          boxShadow: `0 25px 60px ${theme.accent}33`,
        }}
      >
        <p
          className="text-xs uppercase tracking-[0.3em] mb-3"
          style={{ color: theme.textMuted }}
        >
          Hold tight
        </p>
        <h2
          className="text-4xl font-extrabold mb-3"
          style={{ color: theme.textPrimary }}
        >
          Game Paused
        </h2>
        <p className="text-base" style={{ color: theme.textMuted }}>
          The host paused the game. It&apos;ll pick right back up where you left off.
        </p>
      </div>
    </div>
  );
}
