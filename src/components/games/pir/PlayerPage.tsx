"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { subscribeToSession, unsubscribe } from "@/lib/realtime";
import { PlayerCardIcon } from "@/components/pir/PlayerCardIcon";
import { CountdownTimer } from "@/components/pir/CountdownTimer";
import {
  formatPrice,
  getTierLabel,
  getAccuracyColor,
  isInPenaltyZone,
} from "@/lib/pir-scoring";
import { WheelOfPain } from "@/components/pir/WheelOfPain";
import { AVATAR_COLORS } from "@/lib/avatar-colors";
import { useGameTheme } from "@/lib/theme-context";
import { getFontFamily, getGoogleFontsUrl } from "@/lib/theme-fonts";
import { getPatternBg } from "@/lib/theme-patterns";
import type {
  Session,
  SessionPlayer,
  PriceIsRightItem,
  PriceGuess,
  GameTheme,
} from "@/lib/types";

type PlayerPhase =
  | "joining"
  | "lobby"
  | "guessing"
  | "guessed"
  | "price_result"
  | "pay_the_price"
  | "leaderboard"
  | "finished"
  | "removed"
  | "error";

export interface PIRPlayerDevMode {
  phase: "joining" | "lobby" | "guessing" | "guessed" | "price_result" | "pay_the_price" | "leaderboard" | "finished" | "removed" | "error";
  session?: Session | null;
  player?: SessionPlayer | null;
  players?: SessionPlayer[];
  currentItem?: PriceIsRightItem | null;
  myGuess?: PriceGuess | null;
  showPercent?: boolean;
  gameName?: string;
  error?: string;
  guessHistory?: { itemName: string; guess: number; actualPrice: number; score: number; tier: string; accuracy: number }[];
  penaltyPlayers?: { name: string; color: string; playerId: string }[];
}

/* ─── Theme-aware helper components ─── */

function BankShell({ children, t }: { children: React.ReactNode; t: GameTheme }) {
  const fontsUrl = getGoogleFontsUrl([t.headingFont, t.bodyFont]);
  const headingFontCss = getFontFamily(t.headingFont);
  const patternBg = getPatternBg(t.pattern, t.accent);
  return (
    <div
      className="min-h-full flex flex-col themed-shell overflow-x-hidden"
      style={{
        backgroundColor: t.bg,
        backgroundImage: patternBg ?? undefined,
        backgroundRepeat: patternBg ? "repeat" : undefined,
        color: t.textPrimary,
        fontFamily: getFontFamily(t.bodyFont),
      }}
    >
      {fontsUrl && (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link rel="stylesheet" href={fontsUrl} />
      )}
      <style>{`
        .themed-shell h1,.themed-shell h2,.themed-shell h3{
          font-family:${headingFontCss};
          letter-spacing:-0.02em;
          line-height:1.05;
        }
        .themed-shell input::placeholder{color:${t.textDim}}
      `}</style>
      {children}
    </div>
  );
}

function BankCard({
  children,
  className = "",
  glow = false,
  t,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  t: GameTheme;
}) {
  return (
    <div
      className={`rounded-3xl p-4 overflow-hidden ${className}`}
      style={{
        background: t.surface,
        // Ink-tinted hairline border — works on any theme bg
        border: `1.5px solid color-mix(in srgb, ${t.textPrimary} 18%, transparent)`,
        // Soft, warm depth shadow (subtle on dark themes, slightly more visible on light)
        boxShadow: glow
          ? `0 0 30px ${t.accentDim}`
          : `0 8px 24px -16px rgba(0,0,0,0.45)`,
      }}
    >
      {children}
    </div>
  );
}

function BankButton({
  children,
  onClick,
  disabled = false,
  loading = false,
  variant = "primary",
  className = "",
  t,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "ghost" | "danger";
  className?: string;
  t: GameTheme;
}) {
  const base =
    "w-full py-3.5 rounded-full font-display font-semibold text-[16px] tracking-[-0.01em] transition-[filter,transform,background] duration-200 flex items-center justify-center gap-2 active:scale-[0.98] hover:brightness-95";
  const buttonTextColor = t.buttonTextMode === "light" ? "#FFFFFF" : "#1A1A1A";
  const inkBorder = `2px solid color-mix(in srgb, ${t.textPrimary} 90%, transparent)`;
  const variantStyles: Record<string, React.CSSProperties> = {
    primary: { background: t.accent, color: buttonTextColor, border: inkBorder },
    ghost: {
      background: "transparent",
      border: `1.5px solid color-mix(in srgb, ${t.textPrimary} 25%, transparent)`,
      color: t.textPrimary,
    },
    danger: { background: t.danger, color: "#FFFFFF", border: inkBorder },
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      style={variantStyles[variant]}
    >
      {loading && (
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

function PulsingDot({ t }: { t: GameTheme }) {
  return (
    <span className="relative flex h-3 w-3">
      <span
        className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
        style={{ background: t.accent }}
      />
      <span
        className="relative inline-flex rounded-full h-3 w-3"
        style={{ background: t.accent }}
      />
    </span>
  );
}

function BankHeader({ title, subtitle, t }: { title: string; subtitle?: string; t: GameTheme }) {
  return (
    <div className="px-5 pt-6 pb-3 text-center">
      <h1 className="text-[28px] font-bold tracking-[-0.025em] leading-[1.05]">{title}</h1>
      {subtitle && (
        <p className="text-[14px] mt-1.5" style={{ color: t.textMuted }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function TransactionRow({
  icon,
  name,
  detail,
  amount,
  amountColor,
  highlight = false,
  className = "",
  style,
  t,
}: {
  icon: React.ReactNode;
  name: string;
  detail: string;
  amount: string;
  amountColor?: string;
  highlight?: boolean;
  className?: string;
  style?: React.CSSProperties;
  t: GameTheme;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-3 transition-colors ${className}`}
      style={{
        background: highlight ? t.accentDim : "transparent",
        borderTop: `1px solid color-mix(in srgb, ${t.textPrimary} 6%, transparent)`,
        ...style,
      }}
    >
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="font-display font-semibold text-[14px] tracking-[-0.01em] truncate">{name}</p>
        <p className="text-[12px]" style={{ color: t.textDim }}>
          {detail}
        </p>
      </div>
      <span
        className="font-display font-bold text-[15px] tracking-[-0.01em] whitespace-nowrap tabular-nums"
        style={{ color: amountColor || t.accent }}
      >
        {amount}
      </span>
    </div>
  );
}

export default function PIRPlayerPage({ sessionCode, devMode }: { sessionCode: string; devMode?: PIRPlayerDevMode }) {
  const t = useGameTheme();
  const [phase, setPhase] = useState<PlayerPhase>(devMode?.phase || "joining");
  const [session, setSession] = useState<Session | null>(devMode?.session ?? null);
  const [player, setPlayer] = useState<SessionPlayer | null>(devMode?.player ?? null);
  const [players, setPlayers] = useState<SessionPlayer[]>(devMode?.players ?? []);
  const [currentItem, setCurrentItem] = useState<PriceIsRightItem | null>(devMode?.currentItem ?? null);
  const [myGuess, setMyGuess] = useState<PriceGuess | null>(devMode?.myGuess ?? null);
  const [guessInput, setGuessInput] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarColor, setAvatarColor] = useState<string>(AVATAR_COLORS[0]);
  const [error, setError] = useState(devMode?.error || "");
  const [joinLoading, setJoinLoading] = useState(false);
  const [showPercent, setShowPercent] = useState(devMode?.showPercent ?? false);
  const [gameName, setGameName] = useState(devMode?.gameName ?? "");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [penaltyPlayers, setPenaltyPlayers] = useState<{ name: string; color: string; playerId: string }[]>(devMode?.penaltyPlayers ?? []);

  const [guessHistory, setGuessHistory] = useState<
    { itemName: string; guess: number; actualPrice: number; score: number; tier: string; accuracy: number }[]
  >(devMode?.guessHistory ?? []);
  const [lobbyTab, setLobbyTab] = useState<"prices" | "scores" | "help">("prices");

  // Load session
  useEffect(() => {
    if (devMode) return;
    async function findSession() {
      const supabase = createClient();
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("code", sessionCode.toUpperCase())
        .neq("status", "finished")
        .maybeSingle();

      if (!data) {
        setError("Game not found. Check the code and try again.");
        setPhase("error");
        return;
      }

      setSession(data);

      const { data: gameData } = await supabase
        .from("games")
        .select("name, show_percent")
        .eq("id", data.game_id)
        .maybeSingle();
      if (gameData) {
        setShowPercent(gameData.show_percent || false);
        setGameName(gameData.name || "");
      }

      const { data: playersData } = await supabase
        .from("session_players")
        .select("*")
        .eq("session_id", data.id)
        .eq("is_removed", false);
      setPlayers(playersData || []);

      const storedPlayerId = localStorage.getItem(`heyhost-player-${data.id}`);
      if (storedPlayerId) {
        const { data: existingPlayer } = await supabase
          .from("session_players")
          .select("*")
          .eq("id", storedPlayerId)
          .maybeSingle();

        if (existingPlayer && !existingPlayer.is_removed) {
          setPlayer(existingPlayer);
          if (data.status === "lobby") {
            setPhase("lobby");
          } else if (data.status === "playing") {
            setPhase(data.pir_phase as PlayerPhase);
          } else {
            setPhase("finished");
          }
        } else if (existingPlayer?.is_removed) {
          setPhase("removed");
        }
      }
    }

    findSession();
  }, [sessionCode]);

  // Load current item when session changes
  useEffect(() => {
    if (devMode) return;
    if (!session?.pir_current_item_id) return;

    async function loadItem() {
      const supabase = createClient();
      const { data } = await supabase
        .from("price_is_right_items")
        .select("*")
        .eq("id", session!.pir_current_item_id!)
        .maybeSingle();
      if (data) setCurrentItem(data);
    }

    loadItem();
  }, [session?.pir_current_item_id]);

  // Check for existing guess when item changes
  useEffect(() => {
    if (devMode) return;
    if (!session?.pir_current_item_id || !player) return;

    async function checkGuess() {
      const supabase = createClient();
      const { data } = await supabase
        .from("price_guesses")
        .select("*")
        .eq("session_id", session!.id)
        .eq("player_id", player!.id)
        .eq("item_id", session!.pir_current_item_id!)
        .maybeSingle();

      if (data) {
        setMyGuess(data);
        if (session!.pir_phase === "guessing") {
          setPhase("guessed");
        }
      } else {
        setMyGuess(null);
        setGuessInput("");
      }
    }

    checkGuess();
  }, [session?.pir_current_item_id, player?.id, session?.pir_phase]);

  // Subscribe to realtime
  useEffect(() => {
    if (devMode) return;
    if (!session) return;

    const channel = subscribeToSession(session.id, {
      onSessionChange: async (payload) => {
        const s = payload.new as Session;
        setSession(s);

        if (s.status === "finished") {
          setPhase("finished");
        } else if (s.status === "playing") {
          const pirPhase = s.pir_phase;
          if (pirPhase === "guessing") {
            setMyGuess(null);
            setGuessInput("");
            setPhase("guessing");
          } else {
            if (pirPhase === "pay_the_price" && s.display_mode === "on_the_go" && s.pir_current_item_id) {
              // Fetch penalty players for on-the-go wheel
              const supabase = createClient();
              const { data: guessesData } = await supabase
                .from("price_guesses")
                .select("player_id, guess_accuracy")
                .eq("session_id", s.id)
                .eq("item_id", s.pir_current_item_id);
              if (guessesData) {
                const penaltyPlayerIds = guessesData
                  .filter((g) => isInPenaltyZone(g.guess_accuracy))
                  .map((g) => g.player_id);
                setPenaltyPlayers(
                  players
                    .filter((p) => penaltyPlayerIds.includes(p.id))
                    .map((p) => ({ name: p.display_name, color: p.avatar_color, playerId: p.id }))
                );
              }
            }
            setPhase(pirPhase as PlayerPhase);
          }
        }
      },
      onPlayerChange: (payload) => {
        const p = payload.new as SessionPlayer;
        if (payload.eventType === "INSERT") {
          setPlayers((prev) => [...prev.filter((x) => x.id !== p.id), p]);
        } else if (payload.eventType === "UPDATE") {
          if (player && p.id === player.id) {
            setPlayer(p);
            if (p.is_removed) {
              setPhase("removed");
              return;
            }
          }
          setPlayers((prev) =>
            prev.map((x) => (x.id === p.id ? p : x)).filter((x) => !x.is_removed)
          );
        }
      },
      onPriceGuessChange: (payload) => {
        const g = payload.new as PriceGuess;
        if (player && g.player_id === player.id) {
          setMyGuess(g);
        }
      },
    });

    return () => unsubscribe(channel);
  }, [session?.id, player?.id]);

  const handleJoin = useCallback(async () => {
    if (devMode) return;
    if (!session || !displayName.trim()) {
      setError("Enter a display name");
      return;
    }

    setJoinLoading(true);
    setError("");

    try {
      const supabase = createClient();

      const { data: existing } = await supabase
        .from("session_players")
        .select("display_name")
        .eq("session_id", session.id)
        .eq("is_removed", false);

      let finalName = displayName.trim();
      const names = (existing || []).map((p) => p.display_name.toLowerCase());
      if (names.includes(finalName.toLowerCase())) {
        let counter = 2;
        while (names.includes(`${finalName.toLowerCase()}${counter}`)) counter++;
        finalName = `${finalName}${counter}`;
      }

      const { data: newPlayer, error: insertError } = await supabase
        .from("session_players")
        .insert({
          session_id: session.id,
          display_name: finalName,
          avatar_color: avatarColor,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setPlayer(newPlayer);
      localStorage.setItem(`heyhost-player-${session.id}`, newPlayer.id);
      setPhase("lobby");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to join.");
    } finally {
      setJoinLoading(false);
    }
  }, [session, displayName, avatarColor]);

  const handleSubmitGuess = useCallback(async () => {
    if (devMode) return;
    if (!session || !player || !currentItem || !guessInput.trim()) return;

    const guessValue = parseFloat(guessInput.replace(/,/g, ""));
    if (isNaN(guessValue) || guessValue < 0) return;

    try {
      const res = await fetch("/api/pir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_guess",
          sessionId: session.id,
          playerId: player.id,
          itemId: currentItem.id,
          guess: showPercent ? guessValue : guessValue * 100,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMyGuess({
        id: "",
        session_id: session.id,
        player_id: player.id,
        item_id: currentItem.id,
        guess: showPercent ? guessValue : guessValue * 100,
        score_awarded: data.scoreAwarded,
        tier: data.tier,
        guess_accuracy: data.guessAccuracy,
        paid_the_price: false,
        created_at: new Date().toISOString(),
      });
      setPhase("guessed");

      setGuessHistory((prev) => [
        ...prev,
        {
          itemName: currentItem.name,
          guess: guessValue,
          actualPrice: currentItem.price,
          score: data.scoreAwarded,
          tier: data.tier,
          accuracy: data.guessAccuracy,
        },
      ]);
    } catch (err) {
      console.error("Failed to submit guess:", err);
    }
  }, [session, player, currentItem, guessInput, showPercent]);

  // ============ RENDER ============

  // ERROR
  if (phase === "error") {
    return (
      <BankShell t={t}>
        <div className="flex-1 flex flex-col items-center justify-center px-5">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ background: "rgba(185,28,28,0.12)" }}
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke={t.danger} strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-lg font-semibold mb-2">Oops!</p>
          <p className="text-sm text-center mb-8" style={{ color: t.textMuted }}>{error}</p>
          <Link href="/play" className="w-full max-w-xs">
            <BankButton t={t}>Try Again</BankButton>
          </Link>
        </div>
      </BankShell>
    );
  }

  // REMOVED
  if (phase === "removed") {
    return (
      <BankShell t={t}>
        <div className="flex-1 flex flex-col items-center justify-center px-5">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ background: "rgba(185,28,28,0.12)" }}
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke={t.danger} strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <p className="text-xl font-bold mb-2">Account Closed</p>
          <p className="text-sm text-center mb-8" style={{ color: t.textMuted }}>
            The host removed you from this session.
          </p>
          <Link href="/play" className="w-full max-w-xs">
            <BankButton t={t}>Join Another Game</BankButton>
          </Link>
        </div>
      </BankShell>
    );
  }

  // LOADING
  if (!session) {
    return (
      <BankShell t={t}>
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-10 h-10 border-3 rounded-full animate-spin" style={{ borderColor: `${t.accent} transparent transparent transparent` }} />
          <p className="text-sm" style={{ color: t.textMuted }}>Connecting to server...</p>
        </div>
      </BankShell>
    );
  }

  // ─── JOIN FORM (like Account Opening) ───
  if (phase === "joining") {
    return (
      <BankShell t={t}>
        <div className="flex-1 flex flex-col justify-center px-4 py-3">
          {/* Game Artwork Card */}
          <div className="relative mb-3">
            {/* Game code pill - centered on top border */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
              <div
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full"
                style={{ background: t.bg, border: `1px solid ${t.accent}` }}
              >
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke={t.accent} strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <span className="font-mono font-bold text-xs tracking-[0.15em]" style={{ color: t.accent }}>
                  {sessionCode}
                </span>
              </div>
            </div>
            <div
              className="rounded-2xl overflow-hidden pt-4"
              style={{ border: `1px solid ${t.border}`, background: t.surface }}
            >
              <h1 className="text-sm font-bold px-3 pb-2 mt-2 text-center">{gameName || "That Costs How Much!?"}</h1>
              <div className="flex justify-center">
                <Image
                  src="/that-costs-how-much.png"
                  alt="That Costs How Much!?"
                  width={150}
                  height={150}
                  className="h-36 w-auto object-contain"
                  priority
                />
              </div>
            </div>
          </div>

          {/* Name Input */}
          <BankCard t={t} className="!p-3 mb-2">
            <label className="block text-[10px] font-medium mb-1 uppercase tracking-wider text-center" style={{ color: t.textDim }}>
              Account Holder
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
              autoFocus
              className="w-full bg-transparent text-lg font-bold text-center focus:outline-none"
              style={{ color: t.textPrimary, caretColor: t.accent }}
            />
          </BankCard>

          {/* Card Picker */}
          <div className="flex flex-col mb-2">
            <h2 className="text-sm font-bold text-center mt-2 mb-2">Select Your Player Card</h2>
            <div className="grid grid-cols-4 gap-x-1.5 gap-y-1.5">
              {AVATAR_COLORS.map((color) => {
                const selected = avatarColor === color;
                return (
                  <button
                    key={color}
                    onClick={() => setAvatarColor(color)}
                    className="relative rounded-md transition-all duration-150 flex items-center justify-center"
                    style={{
                      background: selected ? t.accentDim : "transparent",
                      border: selected ? `2px solid ${t.accent}` : `1px solid ${t.border}`,
                      padding: "4px",
                    }}
                  >
                    <PlayerCardIcon color={color} size={999} className="w-full h-auto max-h-full" />
                    {selected && (
                      <div
                        className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold"
                        style={{ background: t.accent, color: t.buttonTextMode === "light" ? "#FFFFFF" : "#1A1A1A" }}
                      >
                        ✓
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="text-xs text-center font-medium mb-1" style={{ color: t.danger }}>
              {error}
            </p>
          )}

          {/* Join Button */}
          <BankButton t={t} onClick={handleJoin} loading={joinLoading}>
            Open Account
          </BankButton>
        </div>
      </BankShell>
    );
  }

  // ─── LOBBY (Dashboard View) ───
  if (phase === "lobby" || (session.status === "lobby" && player)) {
    const sortedPlayers = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));

    return (
      <BankShell t={t}>
        {/* Greeting Header */}
        <div className="px-5 pt-6 pb-4 flex items-center justify-between">
          <div>
            <p className="text-sm" style={{ color: t.textMuted }}>Welcome back!</p>
            <h1 className="text-2xl font-bold">{player?.display_name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <PulsingDot t={t} />
            <span className="text-xs font-medium" style={{ color: t.accent }}>LIVE</span>
          </div>
        </div>

        <div className="flex-1 px-5 pb-6 flex flex-col gap-4 overflow-y-auto">
          {/* Player Card + Balance */}
          <BankCard t={t} glow className="flex items-center gap-4">
            <PlayerCardIcon color={player?.avatar_color || "#666"} size={64} />
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: t.textDim }}>
                Current Balance
              </p>
              <p
                className="text-2xl font-bold tracking-[-0.025em] tabular-nums"
                style={{ color: t.accent, fontFamily: getFontFamily(t.headingFont) }}
              >
                {player?.score || 0}
                <span
                  className="text-sm font-normal ml-1 tracking-normal"
                  style={{ color: t.textMuted, fontFamily: getFontFamily(t.bodyFont) }}
                >
                  pts
                </span>
              </p>
            </div>
          </BankCard>

          {/* Tab Buttons */}
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: "prices" as const, icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", label: "Prices" },
              { key: "scores" as const, icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", label: "Scores" },
              { key: "help" as const, icon: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z", label: "Help" },
            ]).map(({ key, icon, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setLobbyTab(key)}
                className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl transition-all"
                style={{
                  background: lobbyTab === key ? t.accentDim : t.surface,
                  border: `1px solid ${lobbyTab === key ? t.accent + "40" : t.border}`,
                }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={lobbyTab === key ? t.accent : t.textDim} strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                </svg>
                <span className="text-[10px] font-medium" style={{ color: lobbyTab === key ? t.accent : t.textDim }}>{label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {lobbyTab === "prices" && (
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-sm font-bold">Your Guesses</h3>
                <span className="text-xs font-medium" style={{ color: t.textMuted }}>
                  {guessHistory.length} {guessHistory.length === 1 ? "item" : "items"}
                </span>
              </div>
              {guessHistory.length > 0 ? (
                <BankCard t={t} className="!p-0">
                  <div className="divide-y" style={{ borderColor: t.border }}>
                    {guessHistory.map((h, i) => (
                      <div key={i} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold text-sm truncate flex-1 min-w-0 mr-2">{h.itemName}</p>
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                            style={{ background: t.accentDim, color: t.accent }}
                          >
                            {h.accuracy}%
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs" style={{ color: t.textMuted }}>
                          <span>
                            Your guess: <strong style={{ color: t.textPrimary }}>
                              {showPercent ? `${h.guess}%` : `$${h.guess.toLocaleString("en-US")}`}
                            </strong>
                          </span>
                          <span style={{ color: t.textDim }}>|</span>
                          <span>
                            Actual: <strong style={{ color: t.textPrimary }}>
                              {showPercent ? `${h.actualPrice / 100}%` : `$${(h.actualPrice / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                            </strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[10px]" style={{ color: t.textDim }}>
                          <span>+{h.score} pts</span>
                          <span>&middot;</span>
                          <span>{getTierLabel(h.tier)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </BankCard>
              ) : (
                <BankCard t={t} className="text-center !py-8">
                  <svg className="w-10 h-10 mx-auto mb-2" style={{ color: t.textDim }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-medium" style={{ color: t.textDim }}>No guesses yet</p>
                  <p className="text-xs mt-1" style={{ color: t.textDim }}>Your price guesses will appear here</p>
                </BankCard>
              )}
            </div>
          )}

          {lobbyTab === "scores" && (
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-sm font-bold">Leaderboard</h3>
                <span className="text-xs font-medium" style={{ color: t.textMuted }}>
                  {players.length} {players.length === 1 ? "player" : "players"}
                </span>
              </div>
              <BankCard t={t} className="!p-2">
                <div>
                  {sortedPlayers.map((p, i) => (
                    <TransactionRow t={t}
                      key={p.id}
                      icon={<PlayerCardIcon color={p.avatar_color} size={36} />}
                      name={p.display_name}
                      detail={`#${i + 1}${p.id === player?.id ? " · You" : ""}`}
                      amount={`${p.score || 0} pts`}
                      highlight={p.id === player?.id}
                      className={`${i === 0 ? "rounded-t-xl" : ""} ${i === sortedPlayers.length - 1 ? "rounded-b-xl" : ""} ${i < sortedPlayers.length - 1 ? "border-b" : ""}`}
                      style={{ borderColor: "rgba(255,255,255,0.07)" }}
                    />
                  ))}
                  {players.length === 0 && (
                    <p className="text-center text-sm py-4" style={{ color: t.textDim }}>
                      No players yet...
                    </p>
                  )}
                </div>
              </BankCard>
            </div>
          )}

          {lobbyTab === "help" && (
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-sm font-bold">How to Play</h3>
              </div>
              <BankCard t={t} className="!p-4">
                <div className="space-y-4">
                  {[
                    { step: "1", title: "See the Item", desc: "A product will appear on your screen with its name and description." },
                    { step: "2", title: "Guess the Price", desc: "Enter your best guess for the retail price before the timer runs out." },
                    { step: "3", title: "Earn Points", desc: "The closer your guess, the more points you earn. Perfect guesses get bonus points!" },
                    { step: "4", title: "Watch the Results", desc: "After each round, see how your guess compares to the actual price and other players." },
                  ].map(({ step, title, desc }) => (
                    <div key={step} className="flex gap-3">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ background: t.accentDim, color: t.accent }}
                      >
                        {step}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold mb-0.5">{title}</p>
                        <p className="text-xs" style={{ color: t.textMuted }}>{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${t.border}` }}>
                  <p className="text-xs font-semibold mb-2">Scoring Tiers</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { tier: "Bullseye", range: "95–100%" },
                      { tier: "Hot", range: "80–94%" },
                      { tier: "Warm", range: "60–79%" },
                      { tier: "Cold", range: "Below 60%" },
                    ].map(({ tier, range }) => (
                      <div
                        key={tier}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs"
                        style={{ background: t.surfaceLight }}
                      >
                        <span className="font-medium">{tier}</span>
                        <span style={{ color: t.textDim }}>{range}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </BankCard>
            </div>
          )}

          {/* Waiting Indicator */}
          <div
            className="flex items-center justify-center gap-3 py-3 rounded-2xl shrink-0"
            style={{ background: t.accentDim }}
          >
            <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: `${t.accent} transparent transparent transparent` }} />
            <span className="text-sm font-medium" style={{ color: t.accent }}>
              Waiting for the host to start...
            </span>
          </div>
        </div>
      </BankShell>
    );
  }

  // ─── GUESSING / GUESSED (Transfer Screen) ───
  if ((phase === "guessing" || phase === "guessed") && currentItem) {
    return (
      <BankShell t={t}>
        {/* Top Bar */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
              style={{ background: t.accentDim, color: t.accent }}
            >
              {(session.pir_current_item_order || 0) + 1}
            </div>
            <span className="text-sm font-medium" style={{ color: t.textMuted }}>
              Price Check
            </span>
          </div>
          <CountdownTimer
            endsAt={session.pir_item_end_timestamp}
            totalSeconds={30}
            size="sm"
          />
        </div>

        <div className="flex-1 px-4 pb-4 flex flex-col gap-3 min-h-0">
          {/* Item Card — grows to fill available space */}
          <BankCard t={t} glow className="text-center !p-3 flex-1 min-h-0 flex flex-col">
            {currentItem.image ? (
              <button
                type="button"
                onClick={() => setLightboxSrc(currentItem.image!)}
                className="flex-1 min-h-0 block w-full cursor-zoom-in mb-2"
              >
                <img
                  src={currentItem.image}
                  alt={currentItem.name}
                  className="w-full h-full object-cover rounded-lg"
                />
              </button>
            ) : (
              <div
                className="flex-1 min-h-0 rounded-lg mb-2 flex items-center justify-center"
                style={{ background: t.surfaceLight, border: `1px dashed ${t.border}` }}
              >
                <svg className="w-10 h-10" style={{ color: t.textDim }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21zm14.25-13.5a1.125 1.125 0 11-2.25 0 1.125 1.125 0 012.25 0z" />
                </svg>
              </div>
            )}
            <h2 className="text-lg font-bold mb-0.5 shrink-0">{currentItem.name}</h2>
            {currentItem.description && (
              <p className="text-xs shrink-0" style={{ color: t.textMuted }}>
                {currentItem.description}
              </p>
            )}
          </BankCard>

          {phase === "guessed" && myGuess ? (
            /* Locked In — blurred price, waiting for reveal */
            <>
              <BankCard t={t} className="!p-3">
                <label className="block text-[10px] font-medium mb-2 uppercase tracking-wider" style={{ color: t.textDim }}>
                  {showPercent ? "Your Percentage" : "Your Price"}
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold" style={{ color: t.textDim }}>
                    {showPercent ? "%" : "$"}
                  </span>
                  <span
                    className="flex-1 text-3xl font-bold select-none"
                    style={{ color: t.textPrimary, filter: "blur(7px)", WebkitFilter: "blur(7px)", opacity: 0.7 }}
                  >
                    {showPercent
                      ? myGuess.guess
                      : (myGuess.guess / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke={t.accent} strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </div>
              </BankCard>
              <div
                className="flex items-center justify-center gap-3 py-3 rounded-xl"
                style={{ background: t.accentDim }}
              >
                <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: `${t.accent} transparent transparent transparent` }} />
                <span className="text-xs font-medium" style={{ color: t.accent }}>
                  Locked in — waiting for reveal...
                </span>
              </div>
            </>
          ) : (
            /* Price Input */
            <>
              <BankCard t={t} className="!p-3">
                <label className="block text-[10px] font-medium mb-2 uppercase tracking-wider" style={{ color: t.textDim }}>
                  {showPercent ? "Enter Percentage" : "Enter Price"}
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold" style={{ color: t.textDim }}>
                    {showPercent ? "%" : "$"}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={guessInput}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, "");
                      if (!raw) { setGuessInput(""); return; }
                      setGuessInput(Number(raw).toLocaleString("en-US"));
                    }}
                    placeholder="0"
                    className="flex-1 min-w-0 bg-transparent text-3xl font-bold focus:outline-none"
                    style={{ color: t.textPrimary, caretColor: t.accent }}
                    autoFocus
                  />
                </div>
              </BankCard>
              <BankButton t={t}
                onClick={handleSubmitGuess}
                disabled={!guessInput.trim()}
              >
                Lock In Guess
              </BankButton>
            </>
          )}
        </div>

        {/* Lightbox */}
        {lightboxSrc && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setLightboxSrc(null)}
          >
            <button
              type="button"
              onClick={() => setLightboxSrc(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img
              src={lightboxSrc}
              alt="Item preview"
              className="max-w-full max-h-full rounded-xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </BankShell>
    );
  }

  // ─── PRICE RESULT (Transaction Complete) ───
  if (phase === "price_result" && currentItem) {
    return (
      <BankShell t={t}>
        <div className="flex-1 px-5 py-6 flex flex-col items-center justify-center gap-4">
          <BankCard t={t} glow className="w-full text-center">
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: t.textDim }}>
              Actual Price
            </p>
            <p className="text-5xl font-bold" style={{ color: t.accent }}>
              {formatPrice(currentItem.price, showPercent)}
            </p>
          </BankCard>

          {myGuess && (
            <BankCard t={t} className="w-full">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-wider" style={{ color: t.textDim }}>
                  Your Estimate
                </span>
                <span className="text-lg font-bold">
                  {showPercent
                    ? `${myGuess.guess}%`
                    : `$${(myGuess.guess / 100).toFixed(2)}`}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div
                  className="rounded-xl py-3 px-2 text-center"
                  style={{ background: t.surfaceLight }}
                >
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: t.textDim }}>Accuracy</p>
                  <p className="text-xl font-bold" style={{ color: t.accent }}>
                    {myGuess.guess_accuracy}%
                  </p>
                </div>
                <div
                  className="rounded-xl py-3 px-2 text-center"
                  style={{ background: t.surfaceLight }}
                >
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: t.textDim }}>Points</p>
                  <p className="text-xl font-bold" style={{ color: t.accent }}>
                    +{myGuess.score_awarded}
                  </p>
                </div>
              </div>
              {isInPenaltyZone(myGuess.guess_accuracy) ? (
                <div
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                  style={{ background: "rgba(185,28,28,0.10)", border: `1px solid rgba(185,28,28,0.25)` }}
                >
                  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke={t.danger} strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="text-sm font-bold" style={{ color: t.danger }}>Fraud Detected</p>
                    <p className="text-[10px]" style={{ color: "rgba(185,28,28,0.85)" }}>Your points for this round are at risk. You may have to <strong>pay the price</strong> in the <strong>penalty audit</strong>.</p>
                  </div>
                </div>
              ) : (
                <div
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                  style={{ background: "rgba(21,128,61,0.10)", border: `1px solid rgba(21,128,61,0.22)` }}
                >
                  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="#15803d" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  <div>
                    <p className="text-sm font-bold" style={{ color: "#15803d" }}>Account Safe</p>
                    <p className="text-[10px]" style={{ color: "rgba(21,128,61,0.75)" }}>You are safe from the Pay the Price penalty audit</p>
                  </div>
                </div>
              )}
            </BankCard>
          )}

          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{ background: t.accentDim }}
          >
            <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: `${t.accent} transparent transparent transparent` }} />
            <span className="text-xs font-medium" style={{ color: t.accent }}>Processing next transaction...</span>
          </div>
        </div>
      </BankShell>
    );
  }

  // ─── PAY THE PRICE (Fraud Alert!) ───
  if (phase === "pay_the_price") {
    const isOnTheGo = session?.display_mode === "on_the_go";
    const playerAtRisk = penaltyPlayers.some((p) => p.playerId === player?.id);

    return (
      <BankShell t={t}>
        <div className="flex-1 flex flex-col items-center justify-center px-5">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mb-2"
            style={{ background: `${t.textPrimary}15` }}
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke={t.textPrimary} strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-4 text-center" style={{ color: t.textPrimary }}>
            Pay the Price<br />Penalty Audit
          </h2>

          {isOnTheGo && penaltyPlayers.length > 0 ? (
            /* On the Go — wheel on player's phone */
            <div className="w-full max-w-xs mx-auto">
              <WheelOfPain
                contestants={penaltyPlayers}
                inline
                onResult={async (playerId) => {
                  if (!session) return;
                  try {
                    await fetch("/api/pir", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "paid_the_price",
                        sessionId: session.id,
                        playerId,
                      }),
                    });
                  } catch (err) {
                    console.error("Failed to report wheel result:", err);
                  }
                }}
                onClose={() => {}}
              />
            </div>
          ) : (
            /* TV mode — watch the big screen */
            <>
              <p className="text-center text-xs font-bold uppercase tracking-wider mb-2" style={{ color: t.danger }}>
                Audit In Progress
              </p>
              <p className="text-center text-sm mb-8" style={{ color: t.textMuted }}>
                Watch the screen!
              </p>
              <div
                className="w-full max-w-xs h-1 rounded-full overflow-hidden"
                style={{ background: "rgba(185,28,28,0.18)" }}
              >
                <div
                  className="h-full rounded-full animate-pulse"
                  style={{ background: t.danger, width: "60%" }}
                />
              </div>
            </>
          )}

          {/* Safe / At Risk status */}
          {playerAtRisk ? (
            <div
              className="flex flex-col items-center text-center rounded-xl px-3 py-2.5 mt-4 w-full max-w-xs"
              style={{ background: "rgba(185,28,28,0.10)", border: `1px solid rgba(185,28,28,0.25)` }}
            >
              <svg className="w-5 h-5 mb-1.5" fill="none" viewBox="0 0 24 24" stroke={t.danger} strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm font-bold" style={{ color: t.danger }}>Account At Risk</p>
              <p className="text-[10px] mt-0.5" style={{ color: "rgba(185,28,28,0.85)" }}>If the audit lands on your name, your points for this round will be forfeited.</p>
            </div>
          ) : (
            <div
              className="flex flex-col items-center text-center rounded-xl px-3 py-2.5 mt-4 w-full max-w-xs"
              style={{ background: "rgba(21,128,61,0.10)", border: `1px solid rgba(21,128,61,0.22)` }}
            >
              <svg className="w-5 h-5 mb-1.5" fill="none" viewBox="0 0 24 24" stroke="#15803d" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <p className="text-sm font-bold" style={{ color: "#15803d" }}>Account Safe</p>
              <p className="text-[10px] mt-0.5" style={{ color: "rgba(21,128,61,0.75)" }}>Your account cleared the audit — no risk this round</p>
            </div>
          )}
        </div>
      </BankShell>
    );
  }

  // ─── LEADERBOARD (Account Statement) ───
  if (phase === "leaderboard") {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    return (
      <BankShell t={t}>
        <BankHeader t={t} title="Standings" subtitle="Account Statement" />

        <div className="flex-1 px-5 pb-6 flex flex-col gap-4 overflow-y-auto">
          {/* Top 3 Podium */}
          {sorted.length >= 3 && (
            <div className="flex items-end justify-center gap-3 pt-2 pb-4">
              {[sorted[1], sorted[0], sorted[2]].map((p, i) => {
                const rank = i === 0 ? 2 : i === 1 ? 1 : 3;
                const heights = ["h-20", "h-28", "h-16"];
                const isMe = p.id === player?.id;
                return (
                  <div key={p.id} className="flex flex-col items-center gap-2 flex-1">
                    <PlayerCardIcon color={p.avatar_color} size={rank === 1 ? 48 : 36} />
                    <p className="text-xs font-bold truncate max-w-[80px]" style={{ color: isMe ? t.accent : t.textPrimary }}>
                      {p.display_name}
                    </p>
                    <div
                      className={`w-full ${heights[i]} rounded-t-xl flex flex-col items-center justify-center`}
                      style={{
                        background: rank === 1 ? t.accentDim : t.surface,
                        border: rank === 1 ? `1px solid ${t.accent}` : `1px solid ${t.border}`,
                      }}
                    >
                      <span className="text-lg font-bold" style={{ color: rank === 1 ? t.accent : t.textPrimary }}>
                        #{rank}
                      </span>
                      <span className="text-xs font-medium" style={{ color: t.textDim }}>
                        {p.score} pts
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full Rankings */}
          <BankCard t={t} className="!p-2">
            <div>
              {sorted.slice(0, 10).map((p, i) => (
                <TransactionRow t={t}
                  key={p.id}
                  icon={<PlayerCardIcon color={p.avatar_color} size={36} />}
                  name={p.display_name}
                  detail={`#${i + 1}${p.id === player?.id ? " · You" : ""}`}
                  amount={`${p.score} pts`}
                  highlight={p.id === player?.id}
                  className={`${i === 0 ? "rounded-t-xl" : ""} ${i === sorted.length - 1 || i === 9 ? "rounded-b-xl" : ""} ${i < Math.min(sorted.length, 10) - 1 ? "border-b" : ""}`}
                  style={{ borderColor: "rgba(255,255,255,0.07)" }}
                />
              ))}
            </div>
          </BankCard>

          {/* Guess History */}
          {guessHistory.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-sm font-bold">Transaction History</h3>
                <span className="text-xs" style={{ color: t.textDim }}>
                  {guessHistory.length} items
                </span>
              </div>
              <BankCard t={t} className="!p-2">
                <div className="divide-y" style={{ borderColor: t.border }}>
                  {guessHistory.map((h, i) => (
                    <TransactionRow t={t}
                      key={i}
                      icon={
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: t.accentDim }}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke={t.accent} strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                        </div>
                      }
                      name={h.itemName}
                      detail={`${h.accuracy}% accurate`}
                      amount={`+${h.score}`}
                    />
                  ))}
                </div>
              </BankCard>
            </div>
          )}

          <div
            className="flex items-center justify-center gap-2 py-3 rounded-2xl"
            style={{ background: t.accentDim }}
          >
            <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: `${t.accent} transparent transparent transparent` }} />
            <span className="text-xs font-medium" style={{ color: t.accent }}>
              Next item loading...
            </span>
          </div>
        </div>
      </BankShell>
    );
  }

  // ─── FINISHED (Account Summary) ───
  if (phase === "finished") {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const myRank = sorted.findIndex((p) => p.id === player?.id) + 1;

    return (
      <BankShell t={t}>
        <BankHeader t={t} title="Game Over" subtitle="Final Account Summary" />

        <div className="flex-1 px-5 pb-6 flex flex-col gap-4 overflow-y-auto">
          {/* Final Score Card */}
          {player && (
            <BankCard t={t} glow className="text-center py-6">
              <PlayerCardIcon color={player.avatar_color} size={80} className="mx-auto" />
              <p className="text-sm mt-3 mb-1" style={{ color: t.textMuted }}>
                {player.display_name}
              </p>
              <p
                className="text-4xl font-bold tracking-[-0.025em] tabular-nums"
                style={{ color: t.accent, fontFamily: getFontFamily(t.headingFont) }}
              >
                {player.score}
                <span
                  className="text-lg font-normal ml-1 tracking-normal"
                  style={{ color: t.textMuted, fontFamily: getFontFamily(t.bodyFont) }}
                >
                  pts
                </span>
              </p>
              <div
                className="inline-flex items-center gap-1.5 mt-3 px-4 py-1.5 rounded-full text-sm font-bold"
                style={{ background: t.accentDim, color: t.accent }}
              >
                Rank #{myRank}
              </div>
            </BankCard>
          )}

          {/* Final Standings */}
          <div>
            <h3 className="text-sm font-bold mb-2 px-1">Final Standings</h3>
            <BankCard t={t} className="!p-2">
              <div>
                {sorted.slice(0, 10).map((p, i) => (
                  <TransactionRow t={t}
                    key={p.id}
                    icon={<PlayerCardIcon color={p.avatar_color} size={36} />}
                    name={p.display_name}
                    detail={`#${i + 1}${p.id === player?.id ? " · You" : ""}`}
                    amount={`${p.score} pts`}
                    highlight={p.id === player?.id}
                    className={`${i === 0 ? "rounded-t-xl" : ""} ${i === sorted.length - 1 || i === 9 ? "rounded-b-xl" : ""} ${i < Math.min(sorted.length, 10) - 1 ? "border-b" : ""}`}
                    style={{ borderColor: "rgba(255,255,255,0.07)" }}
                  />
                ))}
              </div>
            </BankCard>
          </div>

          <Link href="/play" className="mt-auto">
            <BankButton t={t}>Play Again</BankButton>
          </Link>
        </div>
      </BankShell>
    );
  }

  // ─── Default Loading ───
  return (
    <BankShell t={t}>
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-3 rounded-full animate-spin" style={{ borderColor: `${t.accent} transparent transparent transparent` }} />
        <p className="text-sm" style={{ color: t.textMuted }}>Loading...</p>
      </div>
    </BankShell>
  );
}
