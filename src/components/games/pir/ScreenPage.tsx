"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { subscribeToSession, unsubscribe } from "@/lib/realtime";
import { Spinner } from "@/components/ui/spinner";
import { CountdownTimer } from "@/components/pir/CountdownTimer";
import { BarcodePriceReveal } from "@/components/pir/BarcodePriceReveal";
import { WheelOfPain } from "@/components/pir/WheelOfPain";
import { PlayerCardIcon } from "@/components/pir/PlayerCardIcon";
import { useGameTheme } from "@/lib/theme-context";
import { getFontFamily, getGoogleFontsUrl } from "@/lib/theme-fonts";
import { getPatternBg } from "@/lib/theme-patterns";
import {
  formatPrice,
  isInPenaltyZone,
} from "@/lib/pir-scoring";
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

// ─── Themed Shell — locks to exactly 100vh, no scroll ───
function ScreenShell({ children, t }: { children: React.ReactNode; t: GameTheme }) {
  const fontsUrl = getGoogleFontsUrl([t.headingFont, t.bodyFont]);
  const headingFontCss = getFontFamily(t.headingFont);
  const patternBg = getPatternBg(t.pattern, t.accent);
  return (
    <div
      className="h-full flex flex-col overflow-hidden themed-screen"
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
      <style>{`.themed-screen h1,.themed-screen h2,.themed-screen h3{font-family:${headingFontCss}}`}</style>
      {children}
    </div>
  );
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
  const [showBarcodeReveal, setShowBarcodeReveal] = useState(false);
  const [showWheel, setShowWheel] = useState(false);

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

        if (s.pir_phase === "price_result" && prev.pir_phase === "guessing") {
          setShowBarcodeReveal(true);
        }

        if (s.pir_phase === "pay_the_price" && prev.pir_phase !== "pay_the_price") {
          setShowWheel(true);
        }

        if (s.pir_phase === "guessing" && prev.pir_phase !== "guessing") {
          setGuesses([]);
          setShowBarcodeReveal(false);
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
      typeof window !== "undefined" ? `${window.location.origin}/play?code=${session.code}` : ""
    )}`;

    return (
      <ScreenShell t={t}>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Main content — three columns */}
          <div className="flex-1 min-h-0 flex px-8">
            {/* Col 1 — title + players */}
            <div className="flex-1 min-w-0 flex flex-col justify-center min-h-0 z-10 pb-6">
              <h1
                className="text-7xl font-bold tracking-[-0.03em] leading-[0.95] mb-3 shrink-0"
                style={{ fontFamily: getFontFamily(t.headingFont) }}
              >
                That Costs<br /><em>How</em> Much<span style={{ color: t.accent }}>!?</span>
              </h1>
              {gameTopic && (
                <div
                  className="shrink-0 mt-3 mb-6 rounded-full py-2.5 px-5 inline-flex self-start"
                  style={{
                    background: t.accent,
                    border: `2px solid color-mix(in srgb, ${t.textPrimary} 90%, transparent)`,
                  }}
                >
                  <p
                    className="text-base font-bold uppercase tracking-[0.15em]"
                    style={{ color: t.buttonTextMode === "light" ? "#FFFFFF" : "#1A1A1A" }}
                  >
                    {gameTopic}
                  </p>
                </div>
              )}

              {/* Active Players card */}
              <div
                className="rounded-2xl p-5 flex flex-col overflow-hidden"
                style={{
                  background: t.surface,
                  border: `1.5px solid color-mix(in srgb, ${t.textPrimary} 22%, transparent)`,
                }}
              >
                <h2 className="text-2xl font-bold mb-4 shrink-0" style={{ color: t.accent }}>Active Players</h2>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <div className="grid grid-cols-3 gap-x-8 gap-y-4">
                    {players.map((p) => (
                      <div key={p.id} className="flex items-center gap-3">
                        <PlayerCardIcon color={p.avatar_color} size={52} />
                        <span className="text-base font-bold uppercase tracking-wide">{p.display_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {players.length === 0 && (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-base" style={{ color: t.textDim }}>Waiting for players to join...</p>
                  </div>
                )}
              </div>
            </div>

            {/* Col 2 — credit card hand (overlaps left and right, pinned to bottom) */}
            <div className="w-[300px] shrink-0 -mx-12 flex items-end justify-center min-h-0 z-20 relative -mb-0">
              <img
                src="/credit-card-hand.png"
                alt="Credit card"
                className="max-h-full object-contain drop-shadow-2xl"
              />
            </div>

            {/* Col 3 — receipt */}
            <div
              className="w-[280px] shrink-0 flex flex-col items-center justify-center min-h-0 z-10 pb-6"
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
                <div className="px-6" style={{ paddingTop: "100px", paddingBottom: "100px" }}>
                  <p className="text-2xl font-bold uppercase tracking-wider mb-2">Join the Game</p>
                  <div className="border-t border-dashed border-gray-300 my-2" />
                  <p className="text-sm text-gray-500 mb-1">
                    Scan the QR code or visit
                  </p>
                  <p className="text-sm mb-3">
                    <strong>{joinUrl}</strong> and enter the game code below:
                  </p>
                  <p className="text-xs uppercase tracking-wider text-gray-400 mt-4 mb-0.5">Game Code</p>
                  <p className="text-3xl font-bold font-mono tracking-[0.15em] mb-6" style={{ color: "#1a1a1a" }}>{session.code}</p>
                  <img
                    src={qrUrl}
                    alt="QR Code"
                    className="w-32 h-32 mx-auto"
                  />
                </div>
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
    const rest = sorted.slice(3, 8); // Cap at 5 extra to prevent overflow

    return (
      <ScreenShell t={t}>
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-6 overflow-hidden">
          <h1 className="text-4xl font-bold mb-6 shrink-0">Final Results</h1>

          <div className="flex items-end gap-5 mb-6 shrink-0">
            {podium[1] && (
              <div className="text-center">
                <PlayerCardIcon color={podium[1].avatar_color} size={64} />
                <p className="font-semibold text-base mt-1">{podium[1].display_name}</p>
                <p
                  className="text-base tracking-[-0.02em] tabular-nums"
                  style={{ color: t.textMuted, fontFamily: getFontFamily(t.headingFont) }}
                >
                  {podium[1].score} pts
                </p>
                <div
                  className="rounded-t-lg w-20 h-20 mt-2 flex items-center justify-center text-3xl font-bold"
                  style={{ background: t.surfaceLight, color: t.textDim }}
                >
                  2
                </div>
              </div>
            )}
            {podium[0] && (
              <div className="text-center">
                <div className="text-3xl mb-1" style={{ color: t.accent }}>&#x1F451;</div>
                <PlayerCardIcon color={podium[0].avatar_color} size={80} />
                <p className="font-bold text-lg mt-1">{podium[0].display_name}</p>
                <p
                  className="text-xl font-bold tracking-[-0.025em] tabular-nums"
                  style={{ color: t.accent, fontFamily: getFontFamily(t.headingFont) }}
                >
                  {podium[0].score} pts
                </p>
                <div
                  className="rounded-t-lg w-24 h-28 mt-2 flex items-center justify-center text-4xl font-bold"
                  style={{ background: t.accentDim, color: t.accent }}
                >
                  1
                </div>
              </div>
            )}
            {podium[2] && (
              <div className="text-center">
                <PlayerCardIcon color={podium[2].avatar_color} size={64} />
                <p className="font-semibold text-base mt-1">{podium[2].display_name}</p>
                <p
                  className="text-base tracking-[-0.02em] tabular-nums"
                  style={{ color: t.textMuted, fontFamily: getFontFamily(t.headingFont) }}
                >
                  {podium[2].score} pts
                </p>
                <div
                  className="rounded-t-lg w-20 h-14 mt-2 flex items-center justify-center text-3xl font-bold"
                  style={{ background: t.surface, color: t.textDim }}
                >
                  3
                </div>
              </div>
            )}
          </div>

          {rest.length > 0 && (
            <div className="w-full max-w-md flex flex-col gap-1.5 min-h-0 overflow-hidden">
              {rest.map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-4 py-1.5 rounded-lg shrink-0"
                  style={{ background: t.surface, border: `1px solid ${t.border}` }}
                >
                  <span className="font-bold w-8 text-sm" style={{ color: t.textDim }}>#{i + 4}</span>
                  <PlayerCardIcon color={p.avatar_color} size={32} />
                  <span className="flex-1 font-medium text-sm">{p.display_name}</span>
                  <span
                    className="text-base font-bold tracking-[-0.02em] tabular-nums"
                    style={{ fontFamily: getFontFamily(t.headingFont) }}
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
      <ScreenShell t={t}>
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

    // Scale player cards so they fill the panel without overflow.
    // Grid is 2 columns, so rows = ceil(count / 2). 2 players → 1 row → huge; 12 → 6 rows → compact.
    // On price result, name is the smaller secondary line and guess (price + accuracy) is the prominent one.
    const rows = Math.max(1, Math.ceil(players.length / 2));
    const cardTier = isResult
      ? (rows <= 1 ? { icon: 96, name: "text-2xl", guess: "text-2xl", barW: "w-24", barH: "h-2", score: "text-5xl", scoreUnit: "text-xl", gapY: "gap-y-8", py: "py-5", gapInner: "gap-5" }
        : rows <= 2 ? { icon: 80, name: "text-xl", guess: "text-xl", barW: "w-20", barH: "h-2", score: "text-4xl", scoreUnit: "text-base", gapY: "gap-y-7", py: "py-4", gapInner: "gap-4" }
        : rows <= 3 ? { icon: 64, name: "text-lg", guess: "text-lg", barW: "w-16", barH: "h-1.5", score: "text-3xl", scoreUnit: "text-sm", gapY: "gap-y-6", py: "py-3", gapInner: "gap-4" }
        : rows <= 4 ? { icon: 56, name: "text-base", guess: "text-base", barW: "w-14", barH: "h-1.5", score: "text-2xl", scoreUnit: "text-xs", gapY: "gap-y-5", py: "py-2.5", gapInner: "gap-3" }
        : rows <= 5 ? { icon: 48, name: "text-sm", guess: "text-sm", barW: "w-12", barH: "h-1", score: "text-xl", scoreUnit: "text-[10px]", gapY: "gap-y-4", py: "py-2", gapInner: "gap-3" }
        : { icon: 44, name: "text-xs", guess: "text-xs", barW: "w-10", barH: "h-1", score: "text-lg", scoreUnit: "text-[10px]", gapY: "gap-y-3", py: "py-1.5", gapInner: "gap-3" })
      : (rows <= 1 ? { icon: 96, name: "text-4xl", guess: "text-2xl", barW: "w-24", barH: "h-2", score: "text-5xl", scoreUnit: "text-xl", gapY: "gap-y-8", py: "py-5", gapInner: "gap-5" }
        : rows <= 2 ? { icon: 80, name: "text-3xl", guess: "text-xl", barW: "w-20", barH: "h-2", score: "text-4xl", scoreUnit: "text-base", gapY: "gap-y-7", py: "py-4", gapInner: "gap-4" }
        : rows <= 3 ? { icon: 64, name: "text-2xl", guess: "text-lg", barW: "w-16", barH: "h-1.5", score: "text-3xl", scoreUnit: "text-sm", gapY: "gap-y-6", py: "py-3", gapInner: "gap-4" }
        : rows <= 4 ? { icon: 56, name: "text-xl", guess: "text-base", barW: "w-14", barH: "h-1.5", score: "text-2xl", scoreUnit: "text-xs", gapY: "gap-y-5", py: "py-2.5", gapInner: "gap-3" }
        : rows <= 5 ? { icon: 48, name: "text-lg", guess: "text-sm", barW: "w-12", barH: "h-1", score: "text-xl", scoreUnit: "text-[10px]", gapY: "gap-y-4", py: "py-2", gapInner: "gap-3" }
        : { icon: 44, name: "text-base", guess: "text-sm", barW: "w-10", barH: "h-1", score: "text-lg", scoreUnit: "text-[10px]", gapY: "gap-y-3", py: "py-1.5", gapInner: "gap-3" });

    return (
      <ScreenShell t={t}>
        <div className="flex-1 min-h-0 flex flex-col p-6 gap-4 overflow-hidden">
          {/* Top bar */}
          <div
            className="shrink-0 flex items-center justify-between rounded-xl px-6 py-3"
            style={{ background: t.surface, border: `1px solid ${t.border}` }}
          >
            <div className="flex items-center gap-3">
              <img src="/security-chip.png" alt="" className="w-7 h-7" />
              <span className="text-base font-bold uppercase tracking-wider">
                Item {itemNum} of {items.length}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-base font-bold uppercase tracking-wider">Active Coupons</span>
              <span className="text-2xl font-bold" style={{ color: t.accent }}>{guesses.length}</span>
            </div>
          </div>

          {/* Main content — two columns */}
          <div className="flex-1 min-h-0 flex gap-6">
            {/* Left — product image (40% width) */}
            <div className="flex flex-col min-h-0" style={{ width: "40%" }}>
              <div
                className="flex-1 min-h-0 rounded-2xl overflow-hidden"
                style={{ background: t.surfaceLight }}
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
              </div>
              <div className="shrink-0 mt-3">
                <h3 className="text-3xl font-bold leading-tight">
                  {currentItem.name}
                </h3>
                {isResult && !showBarcodeReveal && (
                  <div className="mt-2">
                    <p className="text-sm mb-1" style={{ color: t.textMuted }}>Actual Price</p>
                    <p className="text-4xl font-bold" style={{ color: t.accent }}>
                      {formatPrice(currentItem.price, showPercent)}
                    </p>
                  </div>
                )}
                {isResult && showBarcodeReveal && (
                  <div className="mt-2">
                    <BarcodePriceReveal
                      price={currentItem.price}
                      showPercent={showPercent}
                      onComplete={() => setShowBarcodeReveal(false)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Right — timer + players */}
            <div className="flex-1 min-w-0 flex flex-col min-h-0 gap-4">
              {/* Timer row — right-aligned */}
              {!isResult && (
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
                className="flex-1 min-h-0 rounded-2xl p-5 overflow-hidden"
                style={{
                  background: t.surface,
                  border: `1.5px solid color-mix(in srgb, ${t.textPrimary} 22%, transparent)`,
                }}
              >
                <div className={`grid grid-cols-2 gap-x-4 ${cardTier.gapY} h-full content-center`}>
                  {players.map((p) => {
                    const guess = guesses.find((g) => g.player_id === p.id);
                    const hasGuessed = !!guess;
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center ${cardTier.gapInner} px-3 ${cardTier.py} rounded-xl`}
                        style={{ opacity: !isResult && hasGuessed ? 0.4 : 1 }}
                      >
                        <PlayerCardIcon color={p.avatar_color} size={cardTier.icon} />
                        <div className="flex-1 min-w-0">
                          <p
                            className={`${cardTier.name} font-bold uppercase tracking-wide truncate`}
                            style={{ fontFamily: getFontFamily(t.headingFont) }}
                          >
                            {p.display_name}
                          </p>
                          {isResult && !showBarcodeReveal && guess && (() => {
                            const accColor = isInPenaltyZone(guess.guess_accuracy ?? 100) ? "#B91C1C" : "#15803d";
                            return (
                              <div
                                className={`${cardTier.guess} font-bold tabular-nums leading-tight flex items-center gap-2`}
                                style={{ color: accColor, fontFamily: getFontFamily(t.headingFont) }}
                              >
                                <span>
                                  {showPercent
                                    ? `${guess.guess}%`
                                    : `$${(guess.guess / 100).toFixed(2)}`}
                                </span>
                                <span className={`flex flex-col items-end ${cardTier.barW} shrink-0`}>
                                  <span className={`${cardTier.scoreUnit} font-bold leading-none mb-0.5`}>
                                    {guess.guess_accuracy}%
                                  </span>
                                  <span
                                    className={`w-full ${cardTier.barH} rounded-full overflow-hidden`}
                                    style={{ background: `color-mix(in srgb, ${accColor} 22%, transparent)` }}
                                    aria-label={`${guess.guess_accuracy}% accuracy`}
                                  >
                                    <span
                                      className="block h-full rounded-full"
                                      style={{ width: `${Math.max(0, Math.min(100, guess.guess_accuracy ?? 0))}%`, background: accColor }}
                                    />
                                  </span>
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                        {isResult && !showBarcodeReveal && guess && (
                          <span
                            className={`${cardTier.score} font-bold tabular-nums shrink-0 flex items-baseline gap-0.5 justify-end`}
                            style={{
                              color: t.accent,
                              fontFamily: getFontFamily(t.headingFont),
                            }}
                          >
                            <span className="text-right" style={{ minWidth: "3ch" }}>
                              +{guess.score_awarded}
                            </span>
                            <span className={`${cardTier.scoreUnit} font-medium opacity-70`}>pts</span>
                          </span>
                        )}
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

    return (
      <ScreenShell t={t}>
        {showWheel && penaltyPlayers.length > 0 ? (
          <WheelOfPain
            contestants={penaltyPlayers}
            onResult={handleWheelResult}
            onClose={() => setShowWheel(false)}
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
    const sorted = [...players].sort((a, b) => b.score - a.score);

    return (
      <ScreenShell t={t}>
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-6 overflow-hidden">
          <h2 className="text-4xl font-bold mb-6 shrink-0">Leaderboard</h2>

          <div className="w-full max-w-2xl flex flex-col gap-1.5 min-h-0 overflow-hidden">
            {sorted.slice(0, 10).map((p, i) => {
              const guess = guesses.find((g) => g.player_id === p.id);
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-4 px-5 py-2.5 rounded-xl shrink-0 ${
                    guess?.paid_the_price ? "ring-2 ring-red-500 animate-pulse" : ""
                  }`}
                  style={{ background: t.surface, border: `1px solid ${t.border}` }}
                >
                  <span className="text-lg font-bold w-8" style={{ color: t.textDim }}>
                    {i + 1}
                  </span>
                  <PlayerCardIcon color={p.avatar_color} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{p.display_name}</p>
                    {guess && (
                      <div className="flex items-center gap-2 text-xs" style={{ color: t.textMuted }}>
                        {guess.paid_the_price ? (
                          <span style={{ color: t.danger }}>Paid the Price</span>
                        ) : (
                          <>
                            <span>+{guess.score_awarded} pts</span>
                            {guess.guess_accuracy !== null && (
                              <span>{guess.guess_accuracy}%</span>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <span
                    className="text-2xl font-bold tracking-[-0.025em] tabular-nums"
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
    <ScreenShell t={t}>
      <div className="flex-1 flex items-center justify-center">
        <Spinner className="h-10 w-10 text-white" />
      </div>
    </ScreenShell>
  );
}
