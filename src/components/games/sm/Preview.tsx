"use client";

import { useState } from "react";
import { ThemeProvider, useGameTheme } from "@/lib/theme-context";
import { ThemePicker } from "@/components/games/ThemePicker";
import { AVATAR_COLORS } from "@/lib/avatar-colors";
import { formatCents } from "@/lib/sm-scoring";
import type { GameTheme } from "@/lib/types";

// ─── Phases ─────────────────────────────────────────────────────────────

type SMPreviewPhase =
  | "lobby"
  | "investing"
  | "reveal"
  | "crash"
  | "leaderboard"
  | "finished";

const PHASES: { id: SMPreviewPhase; label: string }[] = [
  { id: "lobby", label: "Lobby" },
  { id: "investing", label: "Investing" },
  { id: "reveal", label: "Reveal" },
  { id: "crash", label: "Crash" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "finished", label: "Finished" },
];

// Mock data shared across renderers
const MOCK_NAMES = [
  "Alice", "Bob", "Charlie", "Diana", "Eve", "Frank",
  "Grace", "Henry", "Ivy", "Jack", "Kate", "Liam",
];
const SPOTLIGHT_NAME = "Sarah";
const MOCK_QUESTION = "What did you want to be when you were 8?";
const MOCK_ANSWER = "Marine biologist";

interface MockPlayer {
  name: string;
  color: string;
  score: number;
}

function buildPlayers(palette: string[]): MockPlayer[] {
  // Pre-baked cumulative scores in cents (positive and negative)
  const scores = [12500, 9800, 5200, 2100, -1500, -3400, 4500, -2200, 1100, 800, -4000, -800];
  return MOCK_NAMES.map((name, i) => ({
    name,
    color: palette[i] ?? palette[i % palette.length] ?? "#6366f1",
    score: scores[i] ?? 0,
  }));
}

// Same luminance/text-color normalizer used by GamePreview, copied to keep
// this component self-contained.
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function normalizeTextForMode(theme: GameTheme): GameTheme {
  if (theme.mode === "dark" && luminance(theme.textPrimary) < 0.6) {
    return { ...theme, textPrimary: "#F9FAFB", textMuted: "#D1D5DB", textDim: "#9CA3AF", bodyTextMode: "light" };
  }
  if (theme.mode === "light" && luminance(theme.textPrimary) > 0.6) {
    return { ...theme, textPrimary: "#111827", textMuted: "#4B5563", textDim: "#9CA3AF", bodyTextMode: "dark" };
  }
  return theme;
}

// ─── Component ──────────────────────────────────────────────────────────

export function SMGamePreview({
  theme,
  onThemeChange,
  gameTitle = "",
}: {
  theme: GameTheme;
  onThemeChange: (theme: GameTheme) => void;
  gameTitle?: string;
}) {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [deviceView, setDeviceView] = useState<"tv" | "phone">("tv");
  const activePhase = PHASES[Math.min(phaseIdx, PHASES.length - 1)].id;
  const previewTheme = normalizeTextForMode(theme);

  const palette =
    previewTheme.playerColors && previewTheme.playerColors.length > 0
      ? previewTheme.playerColors
      : Array.from(AVATAR_COLORS);
  const players = buildPlayers(palette);

  const screenKey = `${activePhase}-${previewTheme.style}-${previewTheme.mode}-${previewTheme.bg}-${previewTheme.surface}-${previewTheme.accent}-${previewTheme.textPrimary}-${previewTheme.headingFont}-${previewTheme.bodyFont}-${previewTheme.corners}-${previewTheme.pattern ?? ""}-${palette.join(",")}`;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Sidebar */}
      <aside className="lg:w-[260px] shrink-0 flex flex-col gap-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-smoke mb-3">
            Device
          </p>
          <div className="inline-flex bg-paper border border-dune rounded-full p-1 w-full">
            {(["tv", "phone"] as const).map((dev) => {
              const isActive = deviceView === dev;
              return (
                <button
                  key={dev}
                  type="button"
                  onClick={() => setDeviceView(dev)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold uppercase tracking-wider transition-colors ${
                    isActive ? "bg-ink text-paper" : "text-smoke hover:text-ink"
                  }`}
                  aria-pressed={isActive}
                >
                  {dev === "tv" ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <rect x="3" y="5" width="18" height="12" rx="2" />
                      <path strokeLinecap="round" d="M9 20h6" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <rect x="7" y="3" width="10" height="18" rx="2" />
                      <path strokeLinecap="round" d="M11 18h2" />
                    </svg>
                  )}
                  {dev === "tv" ? "TV" : "Phone"}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-smoke mb-3">
            Theme
          </p>
          <div
            className="rounded-2xl border border-dune p-4"
            style={{ background: "var(--paper)" }}
          >
            <ThemePicker value={theme} onChange={onThemeChange} compact />
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col gap-5">
        {/* Phase tabs */}
        <div className="flex gap-2 flex-wrap">
          {PHASES.map((p, i) => {
            const isActive = phaseIdx === i;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPhaseIdx(i)}
                className={`px-4 py-1.5 rounded-full text-[12px] font-semibold uppercase tracking-wider transition-colors ${
                  isActive
                    ? "bg-ink text-paper border border-ink"
                    : "bg-paper text-ink border border-dune hover:border-ink/40"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Active mockup */}
        <div className="flex justify-center">
          {deviceView === "tv" ? (
            <div className="w-full max-w-[900px]">
              <div className="bg-zinc-900 rounded-2xl p-2 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)]">
                <div
                  key={`tv-${screenKey}`}
                  className="aspect-video w-full overflow-hidden rounded-md bg-black"
                >
                  <ThemeProvider theme={previewTheme}>
                    <SMTvFrame phase={activePhase} title={gameTitle} players={players} />
                  </ThemeProvider>
                </div>
              </div>
              <div className="mx-auto w-2/5 max-w-[180px]">
                <div className="h-2 bg-zinc-700 rounded-b-lg" />
                <div className="h-1 bg-zinc-800 rounded mt-px" />
              </div>
            </div>
          ) : (
            <div className="w-[280px]">
              <div className="relative bg-zinc-900 rounded-[40px] px-1 py-2 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)]">
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-4 bg-zinc-900 rounded-full z-10" />
                <div
                  key={`phone-${screenKey}`}
                  className="aspect-[390/844] overflow-hidden rounded-[32px] bg-black"
                >
                  <ThemeProvider theme={previewTheme}>
                    <SMPhoneFrame phase={activePhase} players={players} />
                  </ThemeProvider>
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="text-[11px] text-smoke text-center">
          Sample data shown — actual gameplay will use your title, questions, and players.
        </p>
      </div>
    </div>
  );
}

// ─── TV (Screen) Frames ─────────────────────────────────────────────────

function SMTvFrame({
  phase,
  title,
  players,
}: {
  phase: SMPreviewPhase;
  title: string;
  players: MockPlayer[];
}) {
  const t = useGameTheme();
  return (
    <div
      className="w-full h-full flex flex-col p-8"
      style={{ background: t.bg, color: t.textPrimary }}
    >
      <header className="flex items-start justify-between">
        <div>
          <p
            className="text-sm uppercase tracking-widest"
            style={{ color: t.textMuted }}
          >
            Stalk Market
          </p>
          <h1 className="text-4xl font-extrabold" style={{ color: t.textPrimary }}>
            {title || "Game Title"}
          </h1>
          <p className="mt-1 text-lg" style={{ color: t.textMuted }}>
            ★ Spotlight:{" "}
            <span style={{ color: t.accent, fontWeight: 700 }}>{SPOTLIGHT_NAME}</span>
          </p>
        </div>
        <div className="text-right">
          {phase === "lobby" ? (
            <>
              <p className="text-sm uppercase tracking-widest" style={{ color: t.textMuted }}>
                Join code
              </p>
              <p
                className="text-5xl font-extrabold tabular-nums"
                style={{ color: t.textPrimary }}
              >
                DEMO
              </p>
            </>
          ) : (
            <>
              <p className="text-sm uppercase tracking-widest" style={{ color: t.textMuted }}>
                Question
              </p>
              <p
                className="text-3xl font-bold tabular-nums"
                style={{ color: t.textPrimary }}
              >
                3 / 8
              </p>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center mt-4">
        {phase === "lobby" && <TvLobby players={players} t={t} />}
        {phase === "investing" && <TvInvesting players={players} t={t} />}
        {phase === "reveal" && <TvReveal players={players} t={t} />}
        {phase === "crash" && <TvCrash players={players} t={t} />}
        {phase === "leaderboard" && <TvLeaderboard players={players} t={t} />}
        {phase === "finished" && <TvFinished players={players} t={t} />}
      </div>
    </div>
  );
}

function TvLobby({ players, t }: { players: MockPlayer[]; t: GameTheme }) {
  const spotlight = { name: SPOTLIGHT_NAME, color: "#fbbf24" };
  return (
    <div className="w-full max-w-5xl">
      <p className="text-2xl text-center mb-6" style={{ color: t.textMuted }}>
        Open <span className="font-bold" style={{ color: t.textPrimary }}>play.heyhost.app</span>{" "}
        and enter code <span className="font-extrabold" style={{ color: t.accent }}>DEMO</span>
      </p>
      <div className="grid grid-cols-6 gap-2">
        <div
          className="rounded-2xl border-2 p-2 text-center"
          style={{ borderColor: "#fbbf24", background: "rgba(251,191,36,0.1)" }}
        >
          <span
            className="inline-block w-4 h-4 rounded-full mb-1"
            style={{ background: spotlight.color }}
          />
          <p className="font-bold text-xs truncate" style={{ color: t.textPrimary }}>
            {spotlight.name}
          </p>
          <p className="text-[8px] font-bold uppercase" style={{ color: "#d97706" }}>
            ★ Spotlight
          </p>
        </div>
        {players.slice(0, 11).map((p) => (
          <div
            key={p.name}
            className="rounded-2xl border p-2 text-center"
            style={{ background: t.surface, borderColor: t.border }}
          >
            <span
              className="inline-block w-4 h-4 rounded-full mb-1"
              style={{ background: p.color }}
            />
            <p className="font-medium text-xs truncate" style={{ color: t.textPrimary }}>
              {p.name}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TvInvesting({ players, t }: { players: MockPlayer[]; t: GameTheme }) {
  const submitted = new Set(["Alice", "Charlie", "Diana", "Frank", "Grace", "Ivy"]);
  return (
    <div className="text-center max-w-4xl">
      <p className="text-xl uppercase tracking-widest mb-3" style={{ color: t.textMuted }}>
        Place your bets
      </p>
      <h2
        className="text-3xl font-extrabold leading-tight mb-4"
        style={{ color: t.textPrimary }}
      >
        “{MOCK_QUESTION}”
      </h2>
      <p className="text-6xl font-extrabold tabular-nums mb-4" style={{ color: t.accent }}>
        18s
      </p>
      <div className="flex flex-wrap justify-center gap-2 max-w-3xl">
        {players.slice(0, 11).map((p) => {
          const isSubmitted = submitted.has(p.name);
          return (
            <div
              key={p.name}
              className="px-3 py-1 rounded-full text-xs border-2 flex items-center gap-1.5"
              style={{
                background: isSubmitted ? t.accent : "transparent",
                borderColor: isSubmitted ? t.accent : t.border,
                color: isSubmitted ? "#fff" : t.textPrimary,
                opacity: isSubmitted ? 1 : 0.6,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: isSubmitted ? "#fff" : p.color }}
              />
              {p.name} {isSubmitted && "✓"}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TvReveal({ players, t }: { players: MockPlayer[]; t: GameTheme }) {
  // Pick a few "winners" from the player list
  const wins = [
    { name: "Alice", net: 23300 },
    { name: "Charlie", net: 6700 },
    { name: "Eve", net: -10000 },
    { name: "Frank", net: -10000 },
    { name: "Grace", net: -10000 },
    { name: "Bob", net: 4500 },
  ];
  return (
    <div className="text-center max-w-5xl w-full">
      <p className="text-xl uppercase tracking-widest mb-2" style={{ color: t.textMuted }}>
        Spotlight said
      </p>
      <p className="text-6xl font-extrabold mb-6" style={{ color: t.accent }}>
        {MOCK_ANSWER}
      </p>
      <div className="grid grid-cols-3 gap-3 max-w-4xl mx-auto">
        {wins.map((w) => {
          const player = players.find((p) => p.name === w.name);
          return (
            <div
              key={w.name}
              className="rounded-xl border-2 px-3 py-2 flex items-center justify-between"
              style={{
                background: w.net > 0 ? "rgba(16,185,129,0.1)" : t.surface,
                borderColor: w.net > 0 ? "#10b981" : t.border,
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: player?.color || "#888" }}
                />
                <span className="font-medium text-sm" style={{ color: t.textPrimary }}>
                  {w.name}
                </span>
              </div>
              <span
                className="font-extrabold tabular-nums text-sm"
                style={{ color: w.net > 0 ? "#059669" : "#dc2626" }}
              >
                {formatCents(w.net)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TvCrash({ players, t }: { players: MockPlayer[]; t: GameTheme }) {
  const cashed = new Set(["Alice", "Bob", "Charlie", "Eve"]);
  return (
    <div className="text-center w-full max-w-5xl">
      <p className="text-2xl font-bold mb-2" style={{ color: "#dc2626" }}>
        📉 MARKET CRASH
      </p>
      <p
        className="text-7xl font-extrabold tabular-nums mb-4"
        style={{ color: t.textPrimary }}
      >
        7.42
      </p>
      <p className="text-base mb-6" style={{ color: t.textMuted }}>
        Bettors are tapping CASH OUT. They can&apos;t see each other&apos;s timing.
      </p>
      <div className="flex flex-wrap justify-center gap-2 max-w-3xl mx-auto">
        {players.slice(0, 11).map((p) => {
          const did = cashed.has(p.name);
          return (
            <div
              key={p.name}
              className="px-3 py-1 rounded-full text-xs border-2 flex items-center gap-1.5"
              style={{
                background: did ? "#fff" : "transparent",
                borderColor: did ? "#fff" : t.border,
                color: did ? "#000" : t.textPrimary,
                opacity: did ? 1 : 0.6,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: p.color }}
              />
              {p.name} {did && "💸"}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TvLeaderboard({ players, t }: { players: MockPlayer[]; t: GameTheme }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const maxAbs = Math.max(1, ...sorted.map((p) => Math.abs(p.score)));
  return (
    <div className="w-full max-w-4xl">
      <p
        className="text-xl uppercase tracking-widest text-center mb-4"
        style={{ color: t.textMuted }}
      >
        Standings
      </p>
      <div className="space-y-1">
        {sorted.slice(0, 8).map((p, i) => {
          const widthPct = (Math.abs(p.score) / maxAbs) * 100;
          const isPos = p.score >= 0;
          return (
            <div key={p.name} className="flex items-center gap-2">
              <span
                className="w-6 text-right font-bold text-sm"
                style={{ color: t.textMuted }}
              >
                {i + 1}
              </span>
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: p.color }}
              />
              <span
                className="w-24 truncate font-medium text-sm"
                style={{ color: t.textPrimary }}
              >
                {p.name}
              </span>
              <div
                className="flex-1 h-5 rounded relative"
                style={{ background: t.surface }}
              >
                <div
                  className="h-full rounded"
                  style={{
                    width: `${widthPct}%`,
                    background: isPos ? t.accent : "#dc2626",
                  }}
                />
              </div>
              <span
                className="w-20 text-right font-extrabold tabular-nums text-sm"
                style={{ color: isPos ? "#059669" : "#dc2626" }}
              >
                {formatCents(p.score)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TvFinished({ players, t }: { players: MockPlayer[]; t: GameTheme }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const podium = sorted.slice(0, 3);
  const colors = { 1: "#fbbf24", 2: "#cbd5e1", 3: "#fb923c" } as const;
  const medals = { 1: "🥇", 2: "🥈", 3: "🥉" } as const;
  const heights = { 1: "h-24", 2: "h-16", 3: "h-12" } as const;
  return (
    <div className="w-full max-w-4xl text-center">
      <p className="text-2xl font-extrabold mb-2" style={{ color: t.textPrimary }}>
        🏁 Game Over
      </p>
      <p className="text-base mb-4" style={{ color: t.textMuted }}>
        Knowability of{" "}
        <span style={{ color: t.accent, fontWeight: 700 }}>{SPOTLIGHT_NAME}</span>:{" "}
        <span style={{ color: t.textPrimary, fontWeight: 700 }}>62%</span>
      </p>
      <div className="flex items-end justify-center gap-3 mb-2">
        {[2, 1, 3].map((order) => {
          const player = podium[order - 1];
          if (!player) return null;
          const place = order as 1 | 2 | 3;
          return (
            <div key={player.name} className="flex flex-col items-center">
              <span className="text-2xl">{medals[place]}</span>
              <span className="font-bold text-sm" style={{ color: t.textPrimary }}>
                {player.name}
              </span>
              <span
                className="font-extrabold tabular-nums text-xs"
                style={{ color: player.score >= 0 ? "#059669" : "#dc2626" }}
              >
                {formatCents(player.score)}
              </span>
              <div
                className={`${heights[place]} w-16 rounded-t-lg mt-1`}
                style={{ background: colors[place] }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Phone (Player) Frames ──────────────────────────────────────────────

function SMPhoneFrame({
  phase,
  players,
}: {
  phase: SMPreviewPhase;
  players: MockPlayer[];
}) {
  const t = useGameTheme();
  const me: MockPlayer = players[0] || { name: "Alice", color: "#6366f1", score: 12500 };
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ background: t.bg }}
    >
      <div className="w-full max-w-md mx-auto px-4 py-4 space-y-3">
        {/* Player header (always shown) */}
        <div
          className="flex items-center justify-between rounded-2xl border px-3 py-2"
          style={{ background: t.surface, borderColor: t.border }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ background: me.color }}
            />
            <span className="font-bold text-xs" style={{ color: t.textPrimary }}>
              {me.name}
            </span>
          </div>
          <div className="text-right">
            <p className="text-[8px] uppercase tracking-wider" style={{ color: t.textMuted }}>
              Total
            </p>
            <p
              className="font-bold tabular-nums text-xs"
              style={{ color: me.score > 0 ? "#059669" : me.score < 0 ? "#dc2626" : t.textPrimary }}
            >
              {formatCents(me.score)}
            </p>
          </div>
        </div>

        {phase === "lobby" && <PhoneLobby t={t} />}
        {phase === "investing" && <PhoneInvesting t={t} />}
        {phase === "reveal" && <PhoneReveal t={t} />}
        {phase === "crash" && <PhoneCrash t={t} />}
        {phase === "leaderboard" && <PhoneLeaderboard players={players} me={me} t={t} />}
        {phase === "finished" && <PhoneFinished players={players} me={me} t={t} />}
      </div>
    </div>
  );
}

function PhoneLobby({ t }: { t: GameTheme }) {
  return (
    <div
      className="rounded-2xl border p-6 text-center"
      style={{ background: t.surface, borderColor: t.border }}
    >
      <p className="text-3xl mb-2">📈</p>
      <p className="font-bold mb-2 text-sm" style={{ color: t.textPrimary }}>
        Waiting for the host to start
      </p>
      <p className="text-xs" style={{ color: t.textMuted }}>
        Each round you&apos;ll get $100 (ten chips) to bet on what the spotlight said.
      </p>
    </div>
  );
}

function PhoneInvesting({ t }: { t: GameTheme }) {
  const guesses = [
    { text: "Astronaut", chips: 4 },
    { text: "Veterinarian", chips: 3 },
    { text: "Marine biologist", chips: 3 },
  ];
  const totalChips = guesses.reduce((s, g) => s + g.chips, 0);
  const remaining = 10 - totalChips;
  return (
    <div
      className="rounded-2xl border p-3 space-y-2"
      style={{ background: t.surface, borderColor: t.border }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider" style={{ color: t.textMuted }}>
          Place your bets
        </p>
        <span className="text-base font-bold tabular-nums" style={{ color: t.textPrimary }}>
          18s
        </span>
      </div>
      <p className="font-bold text-xs" style={{ color: t.textPrimary }}>
        {MOCK_QUESTION}
      </p>

      <div
        className="rounded-xl px-2 py-1.5 flex items-center justify-between border"
        style={{ background: t.bg, borderColor: t.border }}
      >
        <span className="text-[9px] uppercase tracking-wider" style={{ color: t.textMuted }}>
          Chips left
        </span>
        <div className="flex gap-0.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: i < remaining ? t.accent : "rgba(0,0,0,0.15)",
              }}
            />
          ))}
        </div>
        <span className="text-[10px] font-bold tabular-nums" style={{ color: t.textPrimary }}>
          ${remaining * 10}
        </span>
      </div>

      <div className="space-y-1.5">
        {guesses.map((g, i) => (
          <div
            key={i}
            className="rounded-xl border p-1.5 flex items-center justify-between gap-2"
            style={{ borderColor: t.border }}
          >
            <span
              className="flex-1 text-xs truncate"
              style={{ color: t.textPrimary }}
            >
              {g.text}
            </span>
            <span
              className="font-bold tabular-nums text-xs"
              style={{ color: t.textPrimary }}
            >
              ${g.chips * 10}
            </span>
          </div>
        ))}
      </div>

      <button
        className="w-full py-2 rounded-full text-xs font-bold"
        style={{ background: t.accent, color: "#fff" }}
      >
        Lock In Bets
      </button>
    </div>
  );
}

function PhoneReveal({ t }: { t: GameTheme }) {
  return (
    <div
      className="rounded-2xl border p-4 space-y-2"
      style={{ background: t.surface, borderColor: t.border }}
    >
      <p className="text-[10px] uppercase tracking-wider" style={{ color: t.textMuted }}>
        Spotlight said
      </p>
      <p className="text-xl font-bold" style={{ color: t.textPrimary }}>
        {MOCK_ANSWER}
      </p>
      <div
        className="border-t pt-2 mt-2 space-y-1"
        style={{ borderColor: t.border }}
      >
        <p className="text-[10px] uppercase tracking-wider" style={{ color: t.textMuted }}>
          Your round
        </p>
        <ul className="text-xs space-y-0.5">
          <li className="flex justify-between">
            <span className="text-emerald-600 font-bold">✓ Marine biologist ($30)</span>
            <span style={{ color: t.textMuted }}>+$66.67</span>
          </li>
          <li className="flex justify-between" style={{ color: t.textPrimary }}>
            <span>Astronaut ($40)</span>
            <span style={{ color: t.textMuted }}>+$0.00</span>
          </li>
          <li className="flex justify-between" style={{ color: t.textPrimary }}>
            <span>Veterinarian ($30)</span>
            <span style={{ color: t.textMuted }}>+$0.00</span>
          </li>
        </ul>
        <p
          className="text-right font-bold tabular-nums text-base"
          style={{ color: "#dc2626" }}
        >
          Net −$33.33
        </p>
      </div>
    </div>
  );
}

function PhoneCrash({ t }: { t: GameTheme }) {
  return (
    <div
      className="rounded-2xl border p-6 text-center space-y-3"
      style={{ background: t.surface, borderColor: t.border }}
    >
      <p className="text-4xl font-extrabold" style={{ color: "#dc2626" }}>
        GO
      </p>
      <p className="text-xs" style={{ color: t.textPrimary }}>
        Market crashes at <span className="font-bold">10.000s</span>. No timer. Count in your
        head.
      </p>
      <button
        className="w-full py-5 rounded-2xl text-xl font-extrabold uppercase tracking-wider"
        style={{ background: "#dc2626", color: "#fff" }}
      >
        Cash Out
      </button>
      <p className="text-[10px]" style={{ color: t.textPrimary }}>
        9–10s = precision bonus (1.5×). 10s+ = wipeout.
      </p>
    </div>
  );
}

function PhoneLeaderboard({
  players,
  me,
  t,
}: {
  players: MockPlayer[];
  me: MockPlayer;
  t: GameTheme;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div
      className="rounded-2xl border p-3 space-y-1"
      style={{ background: t.surface, borderColor: t.border }}
    >
      <p
        className="text-[10px] uppercase tracking-wider"
        style={{ color: t.textMuted }}
      >
        Standings
      </p>
      {sorted.slice(0, 7).map((p, i) => (
        <div
          key={p.name}
          className="flex justify-between items-center px-2 py-1 rounded text-xs"
          style={{
            background: i === 0 ? "rgba(251,191,36,0.15)" : "transparent",
          }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: p.color }}
            />
            <span style={{ color: t.textPrimary }}>
              {i + 1}. {p.name}
              {p.name === me.name && " (you)"}
            </span>
          </div>
          <span
            className="font-bold tabular-nums"
            style={{
              color:
                p.score > 0 ? "#059669" : p.score < 0 ? "#dc2626" : t.textPrimary,
            }}
          >
            {formatCents(p.score)}
          </span>
        </div>
      ))}
    </div>
  );
}

function PhoneFinished({
  players,
  me,
  t,
}: {
  players: MockPlayer[];
  me: MockPlayer;
  t: GameTheme;
}) {
  return (
    <div className="space-y-2">
      <div
        className="rounded-2xl border p-4 text-center"
        style={{ background: t.surface, borderColor: t.border }}
      >
        <p className="text-2xl mb-1">🏁</p>
        <p className="text-base font-bold" style={{ color: t.textPrimary }}>
          Game over
        </p>
        <p className="text-xs mt-1" style={{ color: t.textMuted }}>
          Knowability of {SPOTLIGHT_NAME}:{" "}
          <span className="font-bold" style={{ color: t.textPrimary }}>
            62%
          </span>
        </p>
      </div>
      <PhoneLeaderboard players={players} me={me} t={t} />
    </div>
  );
}
