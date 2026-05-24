"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import { subscribeToSession, unsubscribe } from "@/lib/realtime";
import {
  RemoteFrame,
  RemoteScreen,
  RemoteSection,
  RemoteButton,
  RemotePlayerRow,
} from "@/components/games/host/RemoteUI";
import { formatCents } from "@/lib/sm-scoring";
import { useServerTimeOffset } from "@/lib/server-time";
import type {
  Game,
  Session,
  SessionPlayer,
  StalkMarketBet,
  StalkMarketCrashEvent,
  StalkMarketQuestion,
} from "@/lib/types";

export interface SMHostDevMode {
  session?: Session | null;
  game?: Game | null;
  players?: SessionPlayer[];
  questions?: StalkMarketQuestion[];
  bets?: StalkMarketBet[];
  crashEvents?: StalkMarketCrashEvent[];
  onAction?: (action: string, payload?: Record<string, unknown>) => void;
}

interface Props {
  sessionId: string;
  devMode?: SMHostDevMode;
}

export default function StalkMarketHostRemote({ sessionId, devMode }: Props) {
  const [session, setSession] = useState<Session | null>(devMode?.session ?? null);
  const [game, setGame] = useState<Game | null>(devMode?.game ?? null);
  const [players, setPlayers] = useState<SessionPlayer[]>(devMode?.players ?? []);
  const [questions, setQuestions] = useState<StalkMarketQuestion[]>(devMode?.questions ?? []);
  const [bets, setBets] = useState<StalkMarketBet[]>(devMode?.bets ?? []);
  const [crashEvents, setCrashEvents] = useState<StalkMarketCrashEvent[]>(devMode?.crashEvents ?? []);
  const [loading, setLoading] = useState(!devMode);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!devMode) return;
    if (devMode.session !== undefined) setSession(devMode.session);
    if (devMode.game !== undefined) setGame(devMode.game);
    if (devMode.players !== undefined) setPlayers(devMode.players);
    if (devMode.questions !== undefined) setQuestions(devMode.questions);
    if (devMode.bets !== undefined) setBets(devMode.bets);
    if (devMode.crashEvents !== undefined) setCrashEvents(devMode.crashEvents);
  }, [devMode]);

  // Track which guess_text strings the host has decided in adjudication
  // (adjudication state lives in DB on the bets themselves; this is just a UI lock)
  const [judging, setJudging] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data: s } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();
    if (!s) return;
    setSession(s as Session);
    const { data: g } = await supabase
      .from("games")
      .select("*")
      .eq("id", s.game_id)
      .single();
    if (g) setGame(g as Game);
    const { data: ps } = await supabase
      .from("session_players")
      .select("*")
      .eq("session_id", sessionId)
      .order("joined_at", { ascending: true });
    setPlayers((ps || []) as SessionPlayer[]);
    const { data: qs } = await supabase
      .from("stalk_market_questions")
      .select("*")
      .eq("game_id", s.game_id)
      .order("question_order", { ascending: true });
    setQuestions((qs || []) as StalkMarketQuestion[]);
    const { data: bs } = await supabase
      .from("stalk_market_bets")
      .select("*")
      .eq("session_id", sessionId);
    setBets((bs || []) as StalkMarketBet[]);
    const { data: cs } = await supabase
      .from("stalk_market_crash_events")
      .select("*")
      .eq("session_id", sessionId);
    setCrashEvents((cs || []) as StalkMarketCrashEvent[]);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    if (devMode) return;
    refresh();
    const ch = subscribeToSession(sessionId, {
      onSessionChange: refresh,
      onPlayerChange: refresh,
      onSMBetChange: refresh,
      onSMCrashChange: refresh,
    });
    return () => unsubscribe(ch);
  }, [sessionId, refresh, devMode]);

  const currentQuestion = useMemo(
    () => questions.find((q) => q.id === session?.sm_current_question_id) || null,
    [questions, session]
  );

  const bettors = useMemo(
    () =>
      players.filter(
        (p) => !p.is_removed && p.id !== session?.sm_spotlight_player_id
      ),
    [players, session]
  );
  const spotlight = useMemo(
    () => players.find((p) => p.id === session?.sm_spotlight_player_id) || null,
    [players, session]
  );

  // Bets for the current question
  const currentBets = useMemo(
    () => bets.filter((b) => b.question_id === session?.sm_current_question_id),
    [bets, session]
  );

  async function api(action: string, payload: Record<string, unknown> = {}) {
    if (devMode?.onAction) { devMode.onAction(action, payload); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/sm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sessionId, ...payload }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "Request failed");
      }
    } finally {
      setBusy(false);
    }
  }

  const togglePause = useCallback(async () => {
    if (!session) return;
    if (devMode?.onAction) { devMode.onAction("toggle_pause"); return; }
    const supabase = createClient();
    await supabase
      .from("sessions")
      .update({ is_paused: !session.is_paused })
      .eq("id", session.id);
  }, [session, devMode]);

  const kickPlayer = useCallback(async (playerId: string) => {
    if (devMode?.onAction) { devMode.onAction("kick_player", { playerId }); return; }
    const supabase = createClient();
    await supabase
      .from("session_players")
      .update({ is_removed: true })
      .eq("id", playerId);
  }, [devMode]);

  if (loading || !session || !game) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Spinner />
      </div>
    );
  }

  const phase = session.sm_phase;
  const code = session.code;
  const phaseLabel =
    phase === "adjudication" ? "Grading" : phase.replace("_", " ");

  return (
    <RemoteFrame>
      {phase !== "investing" && phase !== "adjudication" && (
        <RemoteScreen
          title={game.title}
          code={code}
          phase={phaseLabel}
          meta={`${bettors.length} bettor${bettors.length === 1 ? "" : "s"} · ${
            game.sm_scoring_version === "pari_mutuel" ? "Share the Pot" : "All-In Bonus"
          } · ${game.sm_game_mode === "live" ? "Live" : "Pre-Loaded"}`}
          screenHref={`/screen/${code}`}
        />
      )}

      {phase === "lobby" && (
        <LobbyControls
          sessionId={sessionId}
          players={players}
          spotlightId={session.sm_spotlight_player_id}
          isPreloaded={game.sm_game_mode === "preloaded"}
          onSetSpotlight={(playerId) => api("set_spotlight", { playerId })}
          onKickPlayer={kickPlayer}
          onStart={() => api("start_game")}
          canStart={
            (game.sm_game_mode === "preloaded" ||
              !!session.sm_spotlight_player_id) &&
            bettors.length >= 1 &&
            questions.length > 0
          }
          busy={busy}
        />
      )}

      {phase !== "lobby" && session.status === "playing" && (
        <RoundBar
          currentOrder={session.sm_current_question_order || 0}
          total={questions.length}
          spotlightName={spotlight?.display_name || "Spotlight"}
          currentQuestion={currentQuestion}
          isPaused={!!session.is_paused}
          onTogglePause={phase === "adjudication" ? undefined : togglePause}
        />
      )}

        {phase === "spotlight_answer" && (
        <>
          <RemoteSection title="Waiting on the Spotlight">
            <p className="text-sm text-zinc-400">
              {spotlight?.display_name || "Spotlight"} is typing their answer.
            </p>
            {session.sm_current_spotlight_answer && (
              <div
                className="mt-3 rounded-lg p-3"
                style={{
                  background: "linear-gradient(180deg, #0a0a0a 0%, #050505 100%)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                  Spotlight answered
                </p>
                <p className="text-white text-sm mt-1">
                  {session.sm_current_spotlight_answer}
                </p>
              </div>
            )}
          </RemoteSection>
          <RemoteButton
            onClick={() => api("open_investing")}
            disabled={busy || !session.sm_current_spotlight_answer}
            size="lg"
            className="w-full"
          >
            Open Investing Phase
          </RemoteButton>
        </>
      )}

        {phase === "investing" && (
        <InvestingControls
          bets={currentBets}
          bettors={bettors}
          endsAt={session.sm_phase_end_timestamp}
          players={players}
          spotlightAnswer={session.sm_current_spotlight_answer || ""}
          judging={judging}
          onMark={async (betId, is_correct) => {
            if (!currentQuestion) return;
            setJudging(betId);
            await api("mark_guesses", {
              questionId: currentQuestion.id,
              decisions: [{ betId, is_correct }],
            });
            setJudging(null);
          }}
          onReopenBets={async (playerId) => {
            if (!currentQuestion) return;
            await api("reopen_bets", {
              questionId: currentQuestion.id,
              playerId,
            });
          }}
          onStartTimer={() => api("start_investing_timer")}
          onReveal={() => api("reveal")}
          busy={busy}
        />
      )}

        {phase === "reveal" && currentQuestion && (
          <RevealControls
            bets={currentBets}
            players={players}
            spotlightAnswer={session.sm_current_spotlight_answer || ""}
            judging={judging}
            onMark={async (betId, is_correct) => {
              setJudging(betId);
              await api("mark_guesses", {
                questionId: currentQuestion.id,
                decisions: [{ betId, is_correct }],
              });
              setJudging(null);
            }}
            onAdvance={() => api("advance_to_leaderboard")}
            onTriggerCrash={() => api("trigger_crash")}
            busy={busy}
          />
        )}

        {phase === "crash" && (
          <CrashControls
            crashStartedAt={session.sm_crash_start_timestamp}
            crashEvents={crashEvents.filter(
              (c) => c.question_id === session.sm_current_question_id
            )}
            bettors={bettors}
            onResolve={async () => {
              await api("resolve_crash");
              await api("advance_to_leaderboard");
            }}
            busy={busy}
          />
        )}

      {phase === "leaderboard" && (
        <LeaderboardControls
          players={bettors}
          isLast={
            (session.sm_current_question_order || 0) >= questions.length - 1
          }
          onNext={() => api("next_question")}
          onFinish={() => api("finish_game")}
          busy={busy}
          sessionFinished={session.status === "finished"}
        />
      )}
    </RemoteFrame>
  );
}

// ─── Subcomponents ───

function LobbyControls(props: {
  sessionId: string;
  players: SessionPlayer[];
  spotlightId: string | null;
  isPreloaded: boolean;
  onSetSpotlight: (id: string | null) => void;
  onKickPlayer: (playerId: string) => void;
  onStart: () => void;
  canStart: boolean;
  busy: boolean;
}) {
  const active = props.players.filter((p) => !p.is_removed);
  const ordered = [...active].sort((a, b) => {
    if (a.id === props.spotlightId) return -1;
    if (b.id === props.spotlightId) return 1;
    return 0;
  });
  return (
    <>
      <RemoteSection
        title={props.isPreloaded ? "Players" : "Pick the Spotlight"}
      >
        <p className="text-[11px] text-zinc-500 mb-2">
          {props.isPreloaded
            ? "Spotlight answers are pre-loaded — every player is a bettor."
            : "Tap who's in the spotlight tonight."}
        </p>
        {ordered.length === 0 ? (
          <p className="text-xs text-zinc-500 italic text-center py-2">
            Waiting for players to join…
          </p>
        ) : (
          <div className="space-y-1.5">
            {ordered.map((p) => (
              <RemotePlayerRow
                key={p.id}
                name={p.display_name}
                color={p.avatar_color}
                active={!props.isPreloaded && p.id === props.spotlightId}
                onClick={
                  props.isPreloaded
                    ? undefined
                    : () =>
                        props.onSetSpotlight(
                          p.id === props.spotlightId ? null : p.id
                        )
                }
                onKick={() => props.onKickPlayer(p.id)}
              />
            ))}
          </div>
        )}
      </RemoteSection>
      <RemoteButton
        onClick={props.onStart}
        disabled={!props.canStart || props.busy}
        size="lg"
        className="w-full"
      >
        {props.canStart
          ? "Start Game"
          : !props.isPreloaded && !props.spotlightId
            ? "Pick a Spotlight first"
            : "Need at least 1 bettor"}
      </RemoteButton>
    </>
  );
}

function RoundBar(props: {
  currentOrder: number;
  total: number;
  spotlightName: string;
  currentQuestion: StalkMarketQuestion | null;
  isPaused: boolean;
  onTogglePause?: () => void;
}) {
  return (
    <section
      className="rounded-xl mb-2 overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #181818 0%, #0e0e0e 100%)",
        border: "1px solid rgba(255,255,255,0.05)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), 0 1px 2px rgba(0,0,0,0.4)",
      }}
    >
      <p className="px-3 py-1.5 border-b border-white/5 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
        Q {props.currentOrder + 1} / {props.total} · ★ {props.spotlightName}
      </p>
      <div className="flex items-stretch">
        <div className="flex-1 min-w-0 px-3 py-2">
          {props.currentQuestion && (
            <p className="text-sm text-zinc-100 leading-snug">
              {props.currentQuestion.prompt}
            </p>
          )}
        </div>
        {props.onTogglePause && (
          <button
            type="button"
            onClick={props.onTogglePause}
            title={props.isPaused ? "Resume" : "Pause"}
            style={{ width: 64 }}
            className={`shrink-0 py-1.5 border-l border-white/5 flex flex-col items-center justify-center gap-0.5 transition ${
              props.isPaused
                ? "bg-amber-400/10 text-amber-300 hover:bg-amber-400/20"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5"
            }`}
          >
            <span className="text-xl leading-none">
              {props.isPaused ? "▶" : "❚❚"}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider leading-none">
              {props.isPaused ? "Resume" : "Pause"}
            </span>
          </button>
        )}
      </div>
    </section>
  );
}

function InvestingControls(props: {
  bets: StalkMarketBet[];
  bettors: SessionPlayer[];
  endsAt: string | null;
  players: SessionPlayer[];
  spotlightAnswer: string;
  judging: string | null;
  onMark: (betId: string, is_correct: boolean) => void;
  onReopenBets: (playerId: string) => void | Promise<void>;
  onStartTimer: () => void;
  onReveal: () => void;
  busy: boolean;
}) {
  const submittedPlayerIds = new Set(props.bets.map((b) => b.player_id));
  const submittedCount = submittedPlayerIds.size;
  const bettorCount = props.bettors.length;
  const undecidedCount = props.bets.filter((b) => b.is_correct === null).length;
  const offset = useServerTimeOffset();
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    const t = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(t);
  }, [offset]);
  const timerStarted = !!props.endsAt;
  const remainingMs = props.endsAt
    ? Math.max(0, new Date(props.endsAt).getTime() - now)
    : 0;
  const remainingS = Math.ceil(remainingMs / 1000);
  const pct =
    bettorCount === 0
      ? 0
      : Math.min(100, (submittedCount / bettorCount) * 100);
  // Players who have already locked in — host can reopen each one's bet so they
  // can re-submit if they hit Lock too early. Collapsed by default since it's
  // rarely needed.
  const submittedBettors = props.bettors.filter((b) =>
    submittedPlayerIds.has(b.id)
  );
  const [lockedOpen, setLockedOpen] = useState(false);

  return (
    <>
      {/* Tight one-line status strip: timer left, submitted right, with spotlight
          answer + progress underneath. Same info as before but less chrome. */}
      <section
        className="rounded-xl px-3 py-2 mb-2"
        style={{
          background: "linear-gradient(180deg, #181818 0%, #0e0e0e 100%)",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <span
            className="text-3xl font-bold tabular-nums leading-none"
            style={{ color: timerStarted ? "#f4f4f5" : "#52525b" }}
          >
            {timerStarted ? `${remainingS}s` : "—"}
          </span>
          <div className="text-right leading-tight">
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">
              Submitted
            </p>
            <p className="text-sm font-bold tabular-nums text-zinc-100">
              {submittedCount} / {bettorCount}
            </p>
          </div>
        </div>
        {props.spotlightAnswer && (
          <p
            className="text-[11px] mt-1.5 truncate"
            title={props.spotlightAnswer}
          >
            <span className="text-zinc-500 mr-1">★ Spotlight said</span>
            <span className="font-bold text-amber-400">
              {props.spotlightAnswer}
            </span>
          </p>
        )}
        <div
          className="h-1 mt-2 rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </section>

      {!timerStarted ? (
        <RemoteButton
          onClick={props.onStartTimer}
          disabled={props.busy}
          size="lg"
          className="w-full"
        >
          Start Timer
        </RemoteButton>
      ) : (
        <>
          {/* Locked-in players — collapsed accordion. One tap to manage if
              someone hit Lock too early. */}
          {submittedBettors.length > 0 && (
            <section className="mb-2 rounded-xl overflow-hidden border border-white/5 bg-white/[0.02]">
              <button
                type="button"
                onClick={() => setLockedOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/[0.03] transition"
              >
                <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
                  {submittedBettors.length} locked in
                </span>
                <span className="text-xs text-zinc-500">
                  {lockedOpen ? "Hide" : "Manage"} {lockedOpen ? "▴" : "▾"}
                </span>
              </button>
              {lockedOpen && (
                <ul className="px-2 pb-2 space-y-1 border-t border-white/5 pt-2">
                  {submittedBettors.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-white/[0.03]"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: p.avatar_color }}
                        />
                        <span className="text-sm text-zinc-100 truncate">
                          {p.display_name}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => props.onReopenBets(p.id)}
                        disabled={props.busy}
                        className="text-[11px] font-semibold px-2 py-1 rounded-full bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 disabled:opacity-50 transition"
                      >
                        ↺ Reopen
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <GuessClusters
            bets={props.bets}
            players={props.players}
            judging={props.judging}
            onMark={props.onMark}
          />

          <RemoteButton
            onClick={props.onReveal}
            disabled={props.busy}
            size="md"
            className="w-full mt-2 whitespace-nowrap"
          >
            Reveal Payouts
            {undecidedCount > 0 && ` · ${undecidedCount} unmarked → wrong`}
          </RemoteButton>
        </>
      )}
    </>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}


function GuessClusters(props: {
  bets: StalkMarketBet[];
  players: SessionPlayer[];
  /** Bet id currently being POSTed so we can disable that row. */
  judging: string | null;
  onMark: (betId: string, is_correct: boolean) => void;
}) {
  const playerName = (id: string) =>
    props.players.find((p) => p.id === id)?.display_name || "?";
  // One row per individual bet, single line, tap-to-flip. Ungraded bets read as
  // "wrong" visually (matching how the server treats null on reveal).
  const rows = [...props.bets].sort((a, b) => b.chips - a.chips);
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500 italic">No guesses yet.</p>;
  }
  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const isCorrect = r.is_correct === true;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => props.onMark(r.id, !isCorrect)}
            disabled={props.judging === r.id}
            aria-pressed={isCorrect}
            title={isCorrect ? "Tap to mark wrong" : "Tap to mark correct"}
            className="w-full text-left rounded-lg border px-3 py-2 transition disabled:opacity-50 flex items-center gap-2.5 min-w-0"
            style={{
              background: isCorrect
                ? "linear-gradient(180deg, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0.04) 100%)"
                : "linear-gradient(180deg, #141414 0%, #0a0a0a 100%)",
              borderColor: isCorrect
                ? "rgba(16,185,129,0.55)"
                : "rgba(255,255,255,0.08)",
            }}
          >
            <span
              className={`shrink-0 ${isCorrect ? "text-emerald-400" : "text-zinc-500"}`}
            >
              {isCorrect ? (
                <CheckIcon className="w-4 h-4" />
              ) : (
                <XIcon className="w-4 h-4" />
              )}
            </span>
            <span className="font-semibold text-zinc-100 truncate flex-1 min-w-0">
              {r.guess_text}
            </span>
            <span className="text-xs text-zinc-500 truncate max-w-[80px] shrink-0">
              {playerName(r.player_id)}
            </span>
            <span className="text-xs text-zinc-300 tabular-nums shrink-0 font-semibold">
              {formatCents(r.chips * 1000)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function RevealControls(props: {
  bets: StalkMarketBet[];
  players: SessionPlayer[];
  spotlightAnswer: string;
  judging: string | null;
  onMark: (betId: string, is_correct: boolean) => void;
  onAdvance: () => void;
  onTriggerCrash: () => void;
  busy: boolean;
}) {
  // Compute net per player for this question
  const byPlayer = new Map<string, { stake: number; payout: number }>();
  for (const b of props.bets) {
    const cur = byPlayer.get(b.player_id) || { stake: 0, payout: 0 };
    cur.stake += b.chips * 1000;
    cur.payout += b.payout_cents;
    byPlayer.set(b.player_id, cur);
  }
  // The per-round $100 is a fresh allowance, not the player's own money —
  // round net is the gross payout (never negative).
  const rows = Array.from(byPlayer.entries())
    .map(([player_id, v]) => ({
      player_id,
      name:
        props.players.find((p) => p.id === player_id)?.display_name || "?",
      net: v.payout,
    }))
    .sort((a, b) => b.net - a.net);
  // If nobody won anything this round, offer the crash mini-game as an
  // alternative to the standard leaderboard advance.
  const anyWinners = props.bets.some((b) => b.is_correct);
  const crashEligible = props.bets.length > 0 && !anyWinners;
  return (
    <>
      <RemoteSection title="Spotlight answer">
        <p className="font-bold text-amber-400 text-lg">
          {props.spotlightAnswer || "(no answer)"}
        </p>
      </RemoteSection>
      <RemoteSection title="Round Net">
        <ul className="text-sm space-y-1">
          {rows.map((r) => (
            <li key={r.player_id} className="flex justify-between">
              <span className="text-zinc-200">{r.name}</span>
              <span
                className={
                  r.net > 0
                    ? "text-emerald-400 font-bold"
                    : r.net < 0
                      ? "text-zinc-400"
                      : "text-zinc-500"
                }
              >
                {formatCents(r.net)}
              </span>
            </li>
          ))}
        </ul>
      </RemoteSection>
      <RemoteSection title="Corrections — flip a grade to fix payouts">
        <GuessClusters
          bets={props.bets}
          players={props.players}
          judging={props.judging}
          onMark={props.onMark}
        />
      </RemoteSection>
      {crashEligible && (
        <RemoteButton
          onClick={props.onTriggerCrash}
          disabled={props.busy}
          variant="danger"
          size="lg"
          className="w-full mb-2"
        >
          📉 Trigger Crash Alert
        </RemoteButton>
      )}
      <RemoteButton
        onClick={props.onAdvance}
        disabled={props.busy}
        size="lg"
        className="w-full"
      >
        Show Leaderboard
      </RemoteButton>
    </>
  );
}

function CrashControls(props: {
  crashStartedAt: string | null;
  crashEvents: StalkMarketCrashEvent[];
  bettors: SessionPlayer[];
  onResolve: () => void;
  busy: boolean;
}) {
  const cashedCount = props.crashEvents.length;
  const total = props.bettors.length;
  return (
    <>
      <section
        className="rounded-2xl p-4 mb-3"
        style={{
          background: "linear-gradient(180deg, #2a0808 0%, #140404 100%)",
          border: "1px solid rgba(239,68,68,0.35)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 8px rgba(0,0,0,0.6)",
        }}
      >
        <p className="text-[10px] uppercase tracking-[0.25em] text-red-400 font-bold mb-2">
          📉 Market Crash
        </p>
        <p className="text-sm text-red-200">
          Each player runs their own 10-second timer and taps CASH OUT before time&apos;s up.
        </p>
        <p className="text-xs text-red-300/80 mt-2 font-semibold tabular-nums">
          {cashedCount} of {total} bettors cashed out
        </p>
      </section>
      <RemoteButton
        onClick={props.onResolve}
        disabled={props.busy}
        size="lg"
        className="w-full"
      >
        Resolve Crash & Show Standings
      </RemoteButton>
    </>
  );
}

function LeaderboardControls(props: {
  players: SessionPlayer[];
  isLast: boolean;
  onNext: () => void;
  onFinish: () => void;
  busy: boolean;
  sessionFinished: boolean;
}) {
  const sorted = [...props.players].sort((a, b) => b.score - a.score);
  return (
    <>
      <RemoteSection title="Standings">
        <ul className="text-sm space-y-1.5">
          {sorted.map((p, i) => (
            <li key={p.id} className="flex justify-between items-center">
              <span className="text-zinc-200">
                <span className="text-zinc-500 mr-2">#{i + 1}</span>
                {p.display_name}
              </span>
              <span
                className={`font-mono ${
                  p.score > 0
                    ? "text-emerald-400 font-bold"
                    : p.score < 0
                      ? "text-zinc-400"
                      : "text-zinc-500"
                }`}
              >
                {formatCents(p.score)}
              </span>
            </li>
          ))}
        </ul>
      </RemoteSection>
      {!props.sessionFinished && (
        <div className="flex gap-2">
          {!props.isLast && (
            <RemoteButton
              onClick={props.onNext}
              disabled={props.busy}
              size="lg"
              className="flex-1"
            >
              Next Question
            </RemoteButton>
          )}
          <RemoteButton
            onClick={props.onFinish}
            disabled={props.busy}
            variant="danger"
            size="lg"
            className={props.isLast ? "flex-1" : ""}
          >
            {props.isLast ? "Finish Game" : "End Game"}
          </RemoteButton>
        </div>
      )}
      {props.sessionFinished && (
        <p className="text-center text-zinc-400 text-sm">Game over.</p>
      )}
    </>
  );
}
