"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { subscribeToSession, unsubscribe } from "@/lib/realtime";
import { Spinner } from "@/components/ui/spinner";
import { CountdownTimer } from "@/components/pir/CountdownTimer";
import { BarcodeFlipReveal } from "@/components/pir/BarcodeFlipReveal";
import { WheelOfPain } from "@/components/pir/WheelOfPain";
import { PlayerCardIcon } from "@/components/pir/PlayerCardIcon";
import { useGameTheme } from "@/lib/theme-context";
import { getFontFamily, getGoogleFontsUrl } from "@/lib/theme-fonts";
import { getPatternBg } from "@/lib/theme-patterns";
import { getShellCss, getHeadingCss } from "@/lib/theme-styles";
import { GamePausedOverlay } from "@/components/games/GamePausedOverlay";
import { isInPenaltyZone, getTierLabel } from "@/lib/pir-scoring";
import type {
  Session,
  SessionPlayer,
  PriceIsRightItem,
  PriceGuess,
  GameTheme,
} from "@/lib/types";

export interface PIRScreenDevMode {
  session?: Session | null;
  players?: SessionPlayer[];
  items?: PriceIsRightItem[];
  guesses?: PriceGuess[];
  showPercent?: boolean;
  gameName?: string;
  gameTopic?: string;
}

function FullscreenToggle({ targetRef }: { targetRef: React.RefObject<HTMLDivElement | null> }) {
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    const handler = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  const toggle = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (targetRef.current) await targetRef.current.requestFullscreen();
    } catch {
      /* no-op */
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      title={isFs ? "Exit fullscreen" : "Enter fullscreen"}
      aria-label={isFs ? "Exit fullscreen" : "Enter fullscreen"}
      className="absolute top-3 right-3 z-50 w-9 h-9 rounded-full flex items-center justify-center bg-black/40 text-white backdrop-blur-sm hover:bg-black/65 transition opacity-25 hover:opacity-100 focus:opacity-100"
    >
      {isFs ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V5H5m14 0h-4v4m0 6v4h4M5 15v4h4" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4m8 0h4v4m0 8v4h-4m-8 0H4v-4" />
        </svg>
      )}
    </button>
  );
}

// ─── Themed Shell — CSS-only 16:9 box, scales via container queries ──────
// The wrapper is a `container-type: size` so descendants resolve
// `cqw`/`cqh`/`cqmin`. The inner uses `aspect-ratio: 16/9` and a `min()`
// width that picks the largest 16:9 box that fits without overflow. Inside,
// `--spacing` is rebound to a cqmin-based value (see globals.css) so every
// Tailwind size/padding/gap utility scales with the screen automatically.
function ScreenShell({ children, t, paused = false }: { children: React.ReactNode; t: GameTheme; paused?: boolean }) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const fontsUrl = getGoogleFontsUrl([t.headingFont, t.bodyFont]);
  const headingFontCss = getFontFamily(t.headingFont);
  const patternBg = getPatternBg(t.pattern, t.accent);
  const styleShell = getShellCss(t);
  const headingExtra = getHeadingCss(t);
  const shellBgImage = patternBg && styleShell.backgroundImage
    ? `${patternBg}, ${styleShell.backgroundImage}`
    : (patternBg ?? styleShell.backgroundImage);
  return (
    <div
      ref={shellRef}
      className="h-full w-full overflow-hidden relative flex items-center justify-center"
      style={{
        backgroundColor: t.bg,
        containerType: "size",
      }}
    >
      {fontsUrl && (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link rel="stylesheet" href={fontsUrl} />
      )}
      <style>{`
        .themed-screen h1,.themed-screen h2,.themed-screen h3,.themed-screen h4,.themed-screen h5,.themed-screen h6{
          color:inherit;
          font-family:${headingFontCss};
          letter-spacing:${(headingExtra.letterSpacing as string) ?? "-0.02em"};
          line-height:1.05;
          text-transform:${(headingExtra.textTransform as string) ?? "none"};
        }
      `}</style>
      <FullscreenToggle targetRef={shellRef} />
      <div
        className="themed-screen flex flex-col overflow-hidden relative"
        style={{
          width: "min(100cqw, calc(100cqh * 16 / 9))",
          aspectRatio: "16 / 9",
          ...styleShell,
          backgroundColor: t.bg,
          backgroundImage: shellBgImage,
          backgroundRepeat: shellBgImage ? "repeat" : undefined,
          color: t.textPrimary,
          fontFamily: getFontFamily(t.bodyFont),
        }}
      >
        {children}
      </div>
      {paused && <GamePausedOverlay />}
    </div>
  );
}

// Returns 0 when theme is in "square" mode, otherwise the supplied rounded
// pixel value. Used by every container that previously hard-coded
// rounded-{lg,xl,2xl,full} so the theme's corner setting reaches the TV UI.
function cornerR(t: GameTheme, base: number): number {
  return t.corners === "square" ? 0 : base;
}

// Pill color + accent per scoring tier. Used by the price-result reveal so
// each player's outcome reads as a category at a glance ("Within 10%" green,
// "Beyond 50%" red, etc.) instead of a tiny percent-bar.
function getTierStyle(tier: string | null | undefined): { bg: string; text: string; accent: string } {
  switch (tier) {
    case "Perfect Guess!": return { bg: "#F59E0B", text: "#1A1412", accent: "#F59E0B" };
    case "bullseye":       return { bg: "#F59E0B", text: "#1A1412", accent: "#F59E0B" };
    case "within10":       return { bg: "#15803D", text: "#FFFFFF", accent: "#15803D" };
    case "within20":       return { bg: "#16A34A", text: "#FFFFFF", accent: "#16A34A" };
    case "within30":       return { bg: "#2563EB", text: "#FFFFFF", accent: "#2563EB" };
    case "within40":       return { bg: "#EA580C", text: "#FFFFFF", accent: "#EA580C" };
    case "within50":       return { bg: "#DC2626", text: "#FFFFFF", accent: "#DC2626" };
    case "beyond50":       return { bg: "#991B1B", text: "#FFFFFF", accent: "#991B1B" };
    case "Paid the Price": return { bg: "#450A0A", text: "#FCA5A5", accent: "#B91C1C" };
    default:               return { bg: "#6B7280", text: "#FFFFFF", accent: "#6B7280" };
  }
}

export default function PIRScreenPage({ sessionCode, devMode }: { sessionCode: string; devMode?: PIRScreenDevMode }) {
  const theme = useGameTheme();
  const t = theme;

  const [session, setSession] = useState<Session | null>(devMode?.session ?? null);
  const [players, setPlayers] = useState<SessionPlayer[]>(devMode?.players ?? []);
  const [items, setItems] = useState<PriceIsRightItem[]>(devMode?.items ?? []);
  const [guesses, setGuesses] = useState<PriceGuess[]>(devMode?.guesses ?? []);
  const [showPercent, setShowPercent] = useState(devMode?.showPercent ?? false);
  const [gameName, setGameName] = useState(devMode?.gameName ?? "");
  const [gameTopic, setGameTopic] = useState(devMode?.gameTopic ?? "");
  const [showWheel, setShowWheel] = useState(false);
  // Bumped on every Play / Respin click in the dashboard preview to force
  // the wheel to remount and run a fresh spin. Production never bumps it —
  // the auto-spin path runs on initial mount instead.
  const [wheelSpinNonce, setWheelSpinNonce] = useState(0);

  // Multi-stage reveal sequence for price_result. Starts at "idle" (looks
  // identical to the guessing screen). The play button kicks off:
  //   idle → expanding (700ms layout shift)
  //        → barcode (mount BarcodeFlipReveal: scan 1.4s + flip 0.7s)
  //        → guesses (player price + accuracy + points reveal)
  type RevealStage = "idle" | "expanding" | "barcode" | "guesses";
  const [revealStage, setRevealStage] = useState<RevealStage>("idle");
  const revealTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearRevealTimers = useCallback(() => {
    revealTimersRef.current.forEach(clearTimeout);
    revealTimersRef.current = [];
  }, []);

  const startReveal = useCallback(() => {
    clearRevealTimers();
    // Brief reset so a replay cleanly collapses then expands again.
    setRevealStage("idle");
    revealTimersRef.current.push(setTimeout(() => setRevealStage("expanding"), 60));
    revealTimersRef.current.push(setTimeout(() => setRevealStage("barcode"), 60 + 700));
    revealTimersRef.current.push(setTimeout(() => setRevealStage("guesses"), 60 + 700 + 2100));
  }, [clearRevealTimers]);

  useEffect(() => () => clearRevealTimers(), [clearRevealTimers]);

  // Reset to idle whenever the phase or item changes.
  useEffect(() => {
    clearRevealTimers();
    setRevealStage("idle");
    setWheelSpinNonce(0);
  }, [session?.pir_phase, session?.pir_current_item_id, clearRevealTimers]);

  // Load session
  useEffect(() => {
    if (devMode) return;
    async function load() {
      const supabase = createClient();
      const { data: sessionData } = await supabase
        .from("sessions")
        .select("*")
        .eq("code", sessionCode.toUpperCase())
        .neq("status", "finished")
        .maybeSingle();

      if (!sessionData) {
        const { data: finishedData } = await supabase
          .from("sessions")
          .select("*")
          .eq("code", sessionCode.toUpperCase())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (finishedData) setSession(finishedData);
        return;
      }

      setSession(sessionData);

      const { data: gameData } = await supabase
        .from("games")
        .select("*, price_is_right_items(*)")
        .eq("id", sessionData.game_id)
        .maybeSingle();

      if (gameData) {
        setShowPercent(gameData.show_percent || false);
        setGameName(gameData.title || "");
        setGameTopic(gameData.topic || "");
        setItems(
          (gameData.price_is_right_items || []).sort(
            (a: PriceIsRightItem, b: PriceIsRightItem) => a.item_order - b.item_order
          )
        );
      }

      const { data: playersData } = await supabase
        .from("session_players")
        .select("*")
        .eq("session_id", sessionData.id)
        .eq("is_removed", false);
      setPlayers(playersData || []);

      if (sessionData.pir_current_item_id) {
        const { data: guessData } = await supabase
          .from("price_guesses")
          .select("*")
          .eq("session_id", sessionData.id)
          .eq("item_id", sessionData.pir_current_item_id);
        setGuesses(guessData || []);
      }
    }

    load();
  }, [sessionCode]);

  // Re-fetch items if session is playing but items are empty
  useEffect(() => {
    if (devMode) return;
    if (!session || session.status !== "playing" || items.length > 0) return;

    async function refetchItems() {
      const supabase = createClient();
      const { data: gameData } = await supabase
        .from("games")
        .select("*, price_is_right_items(*)")
        .eq("id", session!.game_id)
        .maybeSingle();

      if (gameData?.price_is_right_items?.length) {
        setItems(
          gameData.price_is_right_items.sort(
            (a: PriceIsRightItem, b: PriceIsRightItem) => a.item_order - b.item_order
          )
        );
      }
    }

    refetchItems();
  }, [session?.status, session?.game_id, items.length]);

  // Subscribe to realtime
  useEffect(() => {
    if (devMode) return;
    if (!session) return;

    const channel = subscribeToSession(session.id, {
      onSessionChange: (payload) => {
        const s = payload.new as Session;
        const prev = session;
        setSession(s);

        if (s.pir_phase === "pay_the_price" && prev.pir_phase !== "pay_the_price") {
          setShowWheel(true);
        }

        if (s.pir_phase === "guessing" && prev.pir_phase !== "guessing") {
          setGuesses([]);
          setShowWheel(false);
        }
      },
      onPlayerChange: (payload) => {
        const p = payload.new as SessionPlayer;
        if (payload.eventType === "INSERT") {
          setPlayers((prev) => [...prev.filter((x) => x.id !== p.id), p]);
        } else if (payload.eventType === "UPDATE") {
          if (p.is_removed) {
            setPlayers((prev) => prev.filter((x) => x.id !== p.id));
          } else {
            setPlayers((prev) => prev.map((x) => (x.id === p.id ? p : x)));
          }
        }
      },
      onPriceGuessChange: (payload) => {
        const g = payload.new as PriceGuess;
        if (payload.eventType === "INSERT") {
          setGuesses((prev) => [...prev.filter((x) => x.player_id !== g.player_id), g]);
        } else if (payload.eventType === "UPDATE") {
          setGuesses((prev) => prev.map((x) => (x.id === g.id ? g : x)));
        }
      },
    });

    return () => unsubscribe(channel);
  }, [session?.id, session?.pir_phase]);

  const handleWheelResult = useCallback(
    async (playerId: string) => {
      if (!session) return;
      await fetch("/api/pir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "paid_the_price",
          sessionId: session.id,
          playerId,
        }),
      });
      setShowWheel(false);
    },
    [session]
  );

  if (!session) {
    return (
      <ScreenShell t={t}>
        <div className="flex-1 flex items-center justify-center">
          <Spinner className="h-10 w-10 text-white" />
        </div>
      </ScreenShell>
    );
  }

  const currentItem = items.find((i) => i.id === session.pir_current_item_id);
  const phase = session.pir_phase;

  // ─── LOBBY ───
  if (session.status === "lobby") {
    const joinUrl = typeof window !== "undefined" ? `${window.location.host}/play` : "heyhostgames.com/play";
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
      typeof window !== "undefined" ? `${window.location.origin}/play/${session.code}` : ""
    )}`;

    return (
      <ScreenShell t={t} paused={!!session?.is_paused}>
        <div className="flex-1 min-h-0 flex px-10 py-8 gap-6">
          {/* Col 1 — title + edition + players (vertically centered) */}
          <div className="flex-1 min-w-0 flex flex-col justify-center min-h-0 z-10 gap-6">
            <div className="shrink-0">
              <h1
                className="text-8xl font-bold tracking-[-0.03em] leading-[0.95]"
                style={{ fontFamily: getFontFamily(t.headingFont) }}
              >
                That Costs <em>How</em> Much<span style={{ color: t.accent }}>!?</span>
              </h1>
              {gameTopic && (
                <div
                  className="mt-6 py-4 px-8 inline-flex"
                  style={{
                    background: t.accent,
                    border: `2px solid color-mix(in srgb, ${t.textPrimary} 90%, transparent)`,
                    borderRadius: cornerR(t, 9999),
                  }}
                >
                  <p
                    className="text-3xl font-bold uppercase tracking-[0.15em]"
                    style={{ color: t.buttonTextMode === "light" ? "#FFFFFF" : "#1A1A1A" }}
                  >
                    {gameTopic} Edition
                  </p>
                </div>
              )}
            </div>

            {/* Active Players card — natural height, sits with title block centered */}
            <div
              className="shrink-0 p-8 flex flex-col overflow-hidden"
              style={{
                background: t.surface,
                border: `1.5px solid color-mix(in srgb, ${t.textPrimary} 22%, transparent)`,
                borderRadius: cornerR(t, 16),
              }}
            >
              <h2 className="text-5xl font-bold mb-6 shrink-0" style={{ color: t.accent }}>Active Players</h2>
              {players.length > 0 ? (
                <div className="grid grid-cols-3 gap-x-8 gap-y-6">
                  {players.map((p) => (
                    <div key={p.id} className="flex items-center gap-4">
                      <PlayerCardIcon color={p.avatar_color} className="w-21 h-auto shrink-0" />
                      <span className="text-2xl font-bold uppercase tracking-wide truncate">{p.display_name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-2xl text-center" style={{ color: t.textDim }}>Waiting for players to join…</p>
              )}
            </div>
          </div>

          {/* Col 2 — credit card hand (overlaps left and right, pinned to very bottom edge) */}
          <div className="w-[16%] shrink-0 -mx-8 -mb-8 flex items-end justify-center min-h-0 z-20 relative">
            <img
              src="/credit-card-hand.png"
              alt="Credit card"
              className="max-h-full max-w-full object-contain drop-shadow-2xl"
            />
          </div>

          {/* Col 3 — receipt */}
          <div
            className="w-[26%] shrink-0 flex flex-col items-center justify-center min-h-0 z-10"
            style={{ filter: "drop-shadow(0 12px 18px rgba(26,20,18,0.22)) drop-shadow(0 4px 6px rgba(26,20,18,0.12))" }}
          >
            <div
              className="w-full text-center"
              style={{
                background: "#ffffff",
                color: "#1a1a1a",
                clipPath: "polygon(0 0, 5% 2%, 10% 0, 15% 2%, 20% 0, 25% 2%, 30% 0, 35% 2%, 40% 0, 45% 2%, 50% 0, 55% 2%, 60% 0, 65% 2%, 70% 0, 75% 2%, 80% 0, 85% 2%, 90% 0, 95% 2%, 100% 0, 100% 100%, 95% 98%, 90% 100%, 85% 98%, 80% 100%, 75% 98%, 70% 100%, 65% 98%, 60% 100%, 55% 98%, 50% 100%, 45% 98%, 40% 100%, 35% 98%, 30% 100%, 25% 98%, 20% 100%, 15% 98%, 10% 100%, 5% 98%, 0 100%)",
              }}
            >
              <div className="px-8 py-20">
                <p className="text-4xl font-bold uppercase tracking-wider mb-5">Join the Game</p>
                <div className="border-t border-dashed border-gray-300 my-5" />
                <p className="text-2xl text-gray-500 mb-2">Scan the QR code or visit</p>
                <p className="text-2xl mb-7">
                  <strong>{joinUrl}</strong> and enter the game code below:
                </p>
                <p className="text-xl uppercase tracking-wider text-gray-400 mb-2">Game Code</p>
                <p className="text-7xl font-bold font-mono tracking-[0.15em] mb-7" style={{ color: "#1a1a1a" }}>{session.code}</p>
                <img
                  src={qrUrl}
                  alt="QR Code"
                  className="w-56 h-56 mx-auto"
                />
              </div>
            </div>
          </div>
        </div>
      </ScreenShell>
    );
  }

  // ─── FINISHED ───
  if (session.status === "finished") {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const podium = sorted.slice(0, 3);
    const rest = sorted.slice(3, 12); // Show up to 9 extra (3 podium + 9 = 12 max)
    // When more than 6 standings rows would render, split across two columns.
    const useTwoCols = rest.length > 6;

    return (
      <ScreenShell t={t} paused={!!session?.is_paused}>
        <div className="flex-1 min-h-0 flex flex-col items-center px-12 py-10 gap-8 overflow-hidden">
          <h1 className="text-7xl font-bold tracking-[-0.025em] shrink-0">Final Results</h1>

          <div className="flex items-end gap-8 shrink-0">
            {podium[1] && (
              <div className="text-center">
                <PlayerCardIcon color={podium[1].avatar_color} className="w-24 h-auto mx-auto" />
                <p className="font-semibold text-3xl mt-2">{podium[1].display_name}</p>
                <p
                  className="text-3xl tracking-[-0.02em] tabular-nums"
                  style={{ color: t.textMuted, fontFamily: getFontFamily(t.headingFont) }}
                >
                  {podium[1].score} pts
                </p>
                <div
                  className="w-32 h-24 mt-2 mx-auto flex items-center justify-center text-5xl font-bold"
                  style={{
                    background: t.surfaceLight,
                    color: t.textDim,
                    borderTopLeftRadius: cornerR(t, 16),
                    borderTopRightRadius: cornerR(t, 16),
                  }}
                >
                  2
                </div>
              </div>
            )}
            {podium[0] && (
              <div className="text-center">
                <div className="text-4xl mb-1" style={{ color: t.accent }}>&#x1F451;</div>
                <PlayerCardIcon color={podium[0].avatar_color} className="w-32 h-auto mx-auto" />
                <p className="font-bold text-4xl mt-2">{podium[0].display_name}</p>
                <p
                  className="text-4xl font-bold tracking-[-0.025em] tabular-nums"
                  style={{ color: t.accent, fontFamily: getFontFamily(t.headingFont) }}
                >
                  {podium[0].score} pts
                </p>
                <div
                  className="w-40 h-36 mt-2 mx-auto flex items-center justify-center text-6xl font-bold"
                  style={{
                    background: t.accentDim,
                    color: t.accent,
                    borderTopLeftRadius: cornerR(t, 16),
                    borderTopRightRadius: cornerR(t, 16),
                  }}
                >
                  1
                </div>
              </div>
            )}
            {podium[2] && (
              <div className="text-center">
                <PlayerCardIcon color={podium[2].avatar_color} className="w-24 h-auto mx-auto" />
                <p className="font-semibold text-3xl mt-2">{podium[2].display_name}</p>
                <p
                  className="text-3xl tracking-[-0.02em] tabular-nums"
                  style={{ color: t.textMuted, fontFamily: getFontFamily(t.headingFont) }}
                >
                  {podium[2].score} pts
                </p>
                <div
                  className="w-32 h-16 mt-2 mx-auto flex items-center justify-center text-5xl font-bold"
                  style={{
                    background: t.surface,
                    color: t.textDim,
                    borderTopLeftRadius: cornerR(t, 16),
                    borderTopRightRadius: cornerR(t, 16),
                  }}
                >
                  3
                </div>
              </div>
            )}
          </div>

          {rest.length > 0 && (
            <div
              className={`w-full ${useTwoCols ? "grid grid-cols-2 gap-x-6 gap-y-3" : "max-w-3xl flex flex-col gap-2"} flex-1 min-h-0 overflow-hidden`}
              style={useTwoCols ? { gridTemplateRows: `repeat(${Math.ceil(rest.length / 2)}, minmax(0, 1fr))`, gridAutoFlow: "column" } : undefined}
            >
              {rest.map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center gap-5 px-6 py-3"
                  style={{
                    background: t.surface,
                    border: `1px solid color-mix(in srgb, ${t.textPrimary} 14%, transparent)`,
                    borderRadius: cornerR(t, 12),
                  }}
                >
                  <span className="font-bold w-12 text-2xl" style={{ color: t.textDim }}>#{i + 4}</span>
                  <PlayerCardIcon color={p.avatar_color} className="w-16 h-auto shrink-0" />
                  <span className="flex-1 font-semibold text-2xl truncate">{p.display_name}</span>
                  <span
                    className="text-3xl font-bold tracking-[-0.02em] tabular-nums"
                    style={{ color: t.accent, fontFamily: getFontFamily(t.headingFont) }}
                  >
                    {p.score}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScreenShell>
    );
  }

  // ─── PLAYING — loading ───
  if (!currentItem) {
    return (
      <ScreenShell t={t} paused={!!session?.is_paused}>
        <div className="flex-1 flex items-center justify-center">
          <Spinner className="h-10 w-10 text-white" />
        </div>
      </ScreenShell>
    );
  }

  // ─── GUESSING / PRICE RESULT (shared layout) ───
  if (phase === "guessing" || phase === "price_result") {
    const itemNum = (session.pir_current_item_order || 0) + 1;
    const isResult = phase === "price_result";

    // Grid is 2 columns, so rows = ceil(count / 2). Rows stretch via
    // gridTemplateRows so they fill the panel evenly regardless of count.
    const rows = Math.max(1, Math.ceil(players.length / 2));
    const isExpanded = isResult && revealStage !== "idle";
    const showBarcode = isResult && (revealStage === "barcode" || revealStage === "guesses");
    const showGuesses = isResult && revealStage === "guesses";
    // Fixed sizing per design: icon = 25% of cell width, content = 75%.
    // Name, price, and score are all text-4xl. Supporting elements (accuracy
    // %, "pts" suffix) use a smaller secondary size.
    const cardTier = {
      name: "text-4xl",
      guess: "text-4xl",
      score: "text-4xl",
      scoreUnit: "text-xl",
      gapY: rows <= 2 ? "gap-y-5" : rows <= 4 ? "gap-y-3" : "gap-y-4",
      py: rows <= 2 ? "py-4" : "py-3",
    };

    return (
      <ScreenShell t={t} paused={!!session?.is_paused}>
        {isResult && (
          <button
            type="button"
            onClick={startReveal}
            className="absolute top-3 right-16 z-50 w-9 h-9 rounded-full flex items-center justify-center bg-black/40 text-white backdrop-blur-sm hover:bg-black/65 transition opacity-25 hover:opacity-100 focus:opacity-100"
            title="Play reveal sequence"
            aria-label="Play reveal sequence"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        )}
        <div className="flex-1 min-h-0 flex flex-col p-6 gap-4 overflow-hidden">
          {/* Top bar */}
          <div
            className="shrink-0 flex items-center justify-between px-6 py-3"
            style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: cornerR(t, 12) }}
          >
            <div className="flex items-center gap-3">
              <img src="/security-chip.png" alt="" className="w-7 h-7" />
              <span className="text-base font-bold uppercase tracking-wider">
                Item {itemNum} of {items.length}
              </span>
            </div>
          </div>

          {/* Main content — two columns. On result, the player panel grows
              left (image col 40% → 33%) so player answers can be bigger. */}
          <div className="flex-1 min-h-0 flex gap-6">
            {/* Left — product image */}
            <div
              className="flex flex-col min-h-0 transition-[width] duration-700 ease-in-out"
              style={{ width: isExpanded ? "33%" : "40%" }}
            >
              <div
                className="flex-1 min-h-0 overflow-hidden relative"
                style={{ background: t.surfaceLight, borderRadius: cornerR(t, 16) }}
              >
                {currentItem.image ? (
                  <img
                    src={currentItem.image}
                    alt={currentItem.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-6xl opacity-30">?</span>
                  </div>
                )}
                {showBarcode && (
                  <BarcodeFlipReveal
                    price={currentItem.price}
                    showPercent={showPercent}
                    accent={t.accent}
                    corners={t.corners}
                  />
                )}
              </div>
              <div className="shrink-0 mt-3">
                <h3 className="text-3xl font-bold leading-tight">
                  {currentItem.name}
                </h3>
              </div>
            </div>

            {/* Right — timer + players */}
            <div className="flex-1 min-w-0 flex flex-col min-h-0 gap-4">
              {/* Timer row — right-aligned. Stays visible while the screen
                  still "looks like" guessing (idle stage of result). */}
              {!isExpanded && (
                <div className="shrink-0 flex justify-end items-center gap-3">
                  <p className="text-sm font-bold uppercase tracking-wider">Time Remaining</p>
                  <CountdownTimer
                    endsAt={session.pir_item_end_timestamp}
                    totalSeconds={30}
                  />
                </div>
              )}

              {/* Players list */}
              <div
                className="flex-1 min-h-0 p-5 overflow-hidden"
                style={{
                  background: t.surface,
                  border: `1.5px solid color-mix(in srgb, ${t.textPrimary} 22%, transparent)`,
                  borderRadius: cornerR(t, 16),
                }}
              >
                <div className={`grid grid-cols-2 gap-x-4 ${cardTier.gapY} h-full content-center`}>
                  {players.map((p, i) => {
                    const guess = guesses.find((g) => g.player_id === p.id);
                    const hasGuessed = !!guess;
                    // Staggered fade-in for the price/accuracy/score reveal.
                    const revealAnim: React.CSSProperties = showGuesses
                      ? {
                          animation: "priceRevealIn 0.9s cubic-bezier(0.22, 1, 0.36, 1) both",
                          animationDelay: `${i * 110}ms`,
                        }
                      : {};
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center gap-6 px-3 ${cardTier.py} rounded-xl min-w-0`}
                        style={{ opacity: !isExpanded && hasGuessed ? 0.4 : 1 }}
                      >
                        <div className="w-1/4 shrink-0 flex items-center justify-center">
                          <PlayerCardIcon color={p.avatar_color} className="w-full h-auto" />
                        </div>
                        <div className="w-3/4 min-w-0 flex flex-col justify-center">
                          <div className="flex items-baseline justify-between gap-3 min-w-0">
                            <p
                              className={`${showGuesses ? "text-3xl opacity-60" : cardTier.name} font-bold uppercase tracking-wide truncate min-w-0 transition-opacity`}
                              style={{ fontFamily: getFontFamily(t.headingFont) }}
                            >
                              {p.display_name}
                            </p>
                            {showGuesses && guess && (() => {
                              const tierStyle = getTierStyle(guess.tier);
                              return (
                                <span
                                  className={`${cardTier.score} font-bold tabular-nums shrink-0 flex items-baseline gap-1`}
                                  style={{
                                    color: tierStyle.accent,
                                    fontFamily: getFontFamily(t.headingFont),
                                    ...revealAnim,
                                  }}
                                >
                                  <span className="text-right" style={{ minWidth: "3ch" }}>
                                    +{guess.score_awarded}
                                  </span>
                                  <span className={`${cardTier.scoreUnit} font-medium opacity-70`}>pts</span>
                                </span>
                              );
                            })()}
                          </div>
                          {showGuesses && guess && (() => {
                            const tierStyle = getTierStyle(guess.tier);
                            const pct = Math.max(0, Math.min(100, guess.guess_accuracy ?? 0));
                            return (
                              <div
                                className="flex items-center gap-3 min-w-0 mt-2"
                                style={revealAnim}
                              >
                                <span
                                  className={`${cardTier.guess} font-bold tabular-nums leading-tight shrink-0`}
                                  style={{
                                    color: t.textPrimary,
                                    fontFamily: getFontFamily(t.headingFont),
                                  }}
                                >
                                  {showPercent
                                    ? `${guess.guess}%`
                                    : `$${(guess.guess / 100).toFixed(2)}`}
                                </span>
                                <span
                                  className="flex-1 min-w-0 h-5 rounded-full overflow-hidden"
                                  style={{ background: `color-mix(in srgb, ${tierStyle.accent} 18%, transparent)` }}
                                  aria-label={`${pct}% accuracy`}
                                >
                                  <span
                                    className="block h-full rounded-full transition-[width]"
                                    style={{ width: `${pct}%`, background: tierStyle.accent }}
                                  />
                                </span>
                                <span
                                  className={`${cardTier.scoreUnit} font-bold tabular-nums shrink-0`}
                                  style={{
                                    color: tierStyle.accent,
                                    fontFamily: getFontFamily(t.headingFont),
                                  }}
                                >
                                  {pct}%
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScreenShell>
    );
  }

  // ─── PAY THE PRICE ───
  if (phase === "pay_the_price") {
    const penaltyPlayers = guesses
      .filter((g) => g.tier && isInPenaltyZone(g.tier))
      .map((g) => {
        const p = players.find((p) => p.id === g.player_id);
        return p
          ? { name: p.display_name, color: p.avatar_color, playerId: p.id }
          : null;
      })
      .filter(Boolean) as { name: string; color: string; playerId: string }[];

    const isPreview = !!devMode;
    // Preview: wheel mounts immediately in a paused state when the host
    // toggles to this screen. Production: wheel mounts when showWheel flips
    // true (the existing realtime trigger) and auto-spins on first mount.
    const wheelMounted = penaltyPlayers.length > 0 && (isPreview || showWheel);
    // Auto-spin only after the user clicks Play in the preview, or always
    // in production.
    const wheelAutoSpin = !isPreview || wheelSpinNonce > 0;

    return (
      <ScreenShell t={t} paused={!!session?.is_paused}>
        {/* Preview-only Test Spin button. Hidden in production where the
            wheel auto-spins on phase entry. */}
        {isPreview && wheelMounted && (
          <button
            type="button"
            onClick={() => setWheelSpinNonce((n) => n + 1)}
            className="absolute top-6 left-6 z-[60] px-7 py-3 rounded-full text-sm font-bold uppercase tracking-[0.18em] bg-black/70 text-white backdrop-blur-sm hover:bg-black/85 transition flex items-center gap-2.5 shadow-lg"
            title="Test the wheel spin"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            Test Spin
          </button>
        )}

        {wheelMounted ? (
          <WheelOfPain
            key={`wheel-${wheelSpinNonce}`}
            contestants={penaltyPlayers}
            onResult={handleWheelResult}
            onClose={() => setShowWheel(false)}
            themeAccent={t.accent}
            headingFontFamily={getFontFamily(t.headingFont)}
            autoSpin={wheelAutoSpin}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-3">
              <Spinner className="h-6 w-6 text-white/50" />
              <p className="text-2xl" style={{ color: t.textMuted }}>
                Waiting for wheel spin...
              </p>
            </div>
          </div>
        )}
      </ScreenShell>
    );
  }

  // ─── LEADERBOARD ───
  if (phase === "leaderboard") {
    const sorted = [...players].sort((a, b) => b.score - a.score).slice(0, 12);
    const useTwoCols = sorted.length > 8;

    return (
      <ScreenShell t={t} paused={!!session?.is_paused}>
        <div className="flex-1 min-h-0 flex flex-col items-center px-12 py-10 gap-6 overflow-hidden">
          <h2 className="text-7xl font-bold tracking-[-0.025em] shrink-0">Leaderboard</h2>

          <div
            className={`w-full ${useTwoCols ? "grid grid-cols-2 gap-x-6 gap-y-3" : "max-w-3xl flex flex-col gap-2"} flex-1 min-h-0 overflow-hidden`}
            style={useTwoCols ? { gridTemplateRows: `repeat(${Math.ceil(sorted.length / 2)}, minmax(0, 1fr))`, gridAutoFlow: "column" } : undefined}
          >
            {sorted.map((p, i) => {
              const guess = guesses.find((g) => g.player_id === p.id);
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-5 px-6 py-3 ${
                    guess?.paid_the_price ? "ring-2 ring-red-500 animate-pulse" : ""
                  }`}
                  style={{
                    background: t.surface,
                    border: `1px solid color-mix(in srgb, ${t.textPrimary} 14%, transparent)`,
                    borderRadius: cornerR(t, 12),
                  }}
                >
                  <span className="font-bold text-2xl w-12" style={{ color: t.textDim }}>
                    #{i + 1}
                  </span>
                  <PlayerCardIcon color={p.avatar_color} className="w-16 h-auto shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate text-3xl">{p.display_name}</p>
                    {guess && (
                      <div className="text-2xl mt-1" style={{ color: t.textMuted }}>
                        {guess.paid_the_price ? (
                          <span style={{ color: t.danger }}>Paid the Price</span>
                        ) : (
                          <span>+{guess.score_awarded} pts</span>
                        )}
                      </div>
                    )}
                  </div>
                  <span
                    className="font-bold tracking-[-0.025em] tabular-nums text-3xl"
                    style={{ color: t.accent, fontFamily: getFontFamily(t.headingFont) }}
                  >
                    {p.score}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell t={t} paused={!!session?.is_paused}>
      <div className="flex-1 flex items-center justify-center">
        <Spinner className="h-10 w-10 text-white" />
      </div>
    </ScreenShell>
  );
}
