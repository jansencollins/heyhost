/**
 * Stalk Market API — handles all phase transitions and bet processing.
 * POST /api/sm with { action, sessionId, ... }
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import {
  computeRoundPayouts,
  resolveCrash,
  shouldCrash,
  ROUND_STAKE_CENTS,
  CRASH_DURATION_MS,
  normalizeGuess,
  type BetInput,
} from "@/lib/sm-scoring";
import type { SMScoringVersion } from "@/lib/types";

export async function POST(req: NextRequest) {
  const supabase = await createServiceSupabase();
  const body = await req.json();
  const { action } = body;

  try {
    switch (action) {
      case "save_preloaded_answer":
        return await savePreloadedAnswer(supabase, body);
      case "set_spotlight":
        return await setSpotlight(supabase, body);
      case "start_game":
        return await startGame(supabase, body.sessionId);
      case "submit_spotlight_answer":
        return await submitSpotlightAnswer(supabase, body);
      case "open_investing":
        return await openInvesting(supabase, body.sessionId);
      case "start_investing_timer":
        return await startInvestingTimer(supabase, body.sessionId);
      case "submit_bets":
        return await submitBets(supabase, body);
      case "open_adjudication":
        return await openAdjudication(supabase, body.sessionId);
      case "mark_guesses":
        return await markGuesses(supabase, body);
      case "reveal":
        return await reveal(supabase, body.sessionId);
      case "cashout":
        return await cashout(supabase, body);
      case "resolve_crash":
        return await resolveCrashAction(supabase, body.sessionId);
      case "advance_to_leaderboard":
        return await advanceToLeaderboard(supabase, body.sessionId);
      case "next_question":
        return await nextQuestion(supabase, body.sessionId);
      case "finish_game":
        return await finishGame(supabase, body.sessionId);
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type SB = Awaited<ReturnType<typeof createServiceSupabase>>;

async function getSessionWithGame(supabase: SB, sessionId: string) {
  const { data: session } = await supabase
    .from("sessions")
    .select("*, games(*, stalk_market_questions(*))")
    .eq("id", sessionId)
    .single();
  if (!session) throw new Error("Session not found");
  return session;
}

// ─── Pre-loaded answer save (called by Spotlight from /sm-spotlight/[token]) ───
async function savePreloadedAnswer(
  supabase: SB,
  body: { token: string; questionId: string; answer: string }
) {
  const { token, questionId, answer } = body;
  if (!token || !questionId) throw new Error("token and questionId required");

  // Verify the question belongs to a game with this token
  const { data: q } = await supabase
    .from("stalk_market_questions")
    .select("id, game_id, games!inner(sm_spotlight_token)")
    .eq("id", questionId)
    .single();
  if (!q || (q as { games?: { sm_spotlight_token?: string } }).games?.sm_spotlight_token !== token) {
    throw new Error("Invalid token for question");
  }

  await supabase
    .from("stalk_market_questions")
    .update({ preloaded_answer: answer })
    .eq("id", questionId);

  return NextResponse.json({ success: true });
}

// ─── Lobby: host designates one player as the Spotlight ───
async function setSpotlight(
  supabase: SB,
  body: { sessionId: string; playerId: string | null }
) {
  await supabase
    .from("sessions")
    .update({ sm_spotlight_player_id: body.playerId })
    .eq("id", body.sessionId);
  return NextResponse.json({ success: true });
}

// ─── Start the game: load first question, set phase ───
async function startGame(supabase: SB, sessionId: string) {
  const session = await getSessionWithGame(supabase, sessionId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const game = session.games as any;
  const questions = (game?.stalk_market_questions || []).sort(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a: any, b: any) => a.question_order - b.question_order
  );
  if (questions.length === 0) throw new Error("No questions in game");
  const mode = game.sm_game_mode as "live" | "preloaded";
  if (mode === "live" && !session.sm_spotlight_player_id)
    throw new Error("Spotlight not set");

  const first = questions[0];

  const update: Record<string, unknown> = {
    status: "playing",
    current_question_index: 0,
    sm_current_question_id: first.id,
    sm_current_question_order: 0,
    sm_current_spotlight_answer:
      mode === "preloaded" ? first.preloaded_answer || "" : null,
    sm_phase_end_timestamp: null,
    sm_crash_start_timestamp: null,
  };

  if (mode === "preloaded") {
    // Skip spotlight typing — go straight to investing, host starts timer
    update.sm_phase = "investing";
    update.sm_phase_end_timestamp = null;
  } else {
    update.sm_phase = "spotlight_answer";
    update.sm_phase_end_timestamp = new Date(
      Date.now() + timerMs(game)
    ).toISOString();
  }

  await supabase.from("sessions").update(update).eq("id", sessionId);

  // Clear any stale bets/crash events for this session (fresh run)
  await supabase.from("stalk_market_bets").delete().eq("session_id", sessionId);
  await supabase
    .from("stalk_market_crash_events")
    .delete()
    .eq("session_id", sessionId);

  return NextResponse.json({ success: true });
}

// ─── Live mode: spotlight submits their answer for the current question ───
async function submitSpotlightAnswer(
  supabase: SB,
  body: { sessionId: string; answer: string }
) {
  await supabase
    .from("sessions")
    .update({
      sm_current_spotlight_answer: body.answer,
    })
    .eq("id", body.sessionId);
  return NextResponse.json({ success: true });
}

// ─── Host moves from spotlight_answer → investing ───
async function openInvesting(supabase: SB, sessionId: string) {
  await supabase
    .from("sessions")
    .update({
      sm_phase: "investing",
      // Timer doesn't start yet — host reads the question, then taps Start.
      sm_phase_end_timestamp: null,
    })
    .eq("id", sessionId);
  return NextResponse.json({ success: true });
}

// ─── Host explicitly starts the investing countdown ───
async function startInvestingTimer(supabase: SB, sessionId: string) {
  const session = await getSessionWithGame(supabase, sessionId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const game = session.games as any;
  await supabase
    .from("sessions")
    .update({
      sm_phase_end_timestamp: new Date(
        Date.now() + timerMs(game)
      ).toISOString(),
    })
    .eq("id", sessionId);
  return NextResponse.json({ success: true });
}

// Resolve the configured seconds-per-question into ms, with a sane default
// for older games that haven't picked a value.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function timerMs(game: any): number {
  const raw = Number(game?.timer_seconds);
  const seconds = Number.isFinite(raw) && raw > 0 ? raw : 60;
  return seconds * 1000;
}

// ─── Player submits all their bets atomically (replaces any prior submission for this round) ───
async function submitBets(
  supabase: SB,
  body: {
    sessionId: string;
    questionId: string;
    playerId: string;
    bets: { guess_text: string; chips: number }[];
  }
) {
  const { sessionId, questionId, playerId, bets } = body;
  if (!Array.isArray(bets) || bets.length === 0) throw new Error("No bets");
  if (bets.length > 5) throw new Error("Max 5 guesses");

  // Validate chip total + dedup guess texts (case-insensitive)
  const totalChips = bets.reduce((s, b) => s + b.chips, 0);
  if (totalChips !== 10) throw new Error("Must place all 10 chips");
  const seen = new Set<string>();
  for (const b of bets) {
    if (!b.guess_text || !b.guess_text.trim()) throw new Error("Empty guess");
    if (b.chips < 1 || b.chips > 10) throw new Error("Invalid chip count");
    const key = normalizeGuess(b.guess_text);
    if (seen.has(key)) throw new Error("Duplicate guess");
    seen.add(key);
  }

  // Replace any existing bets for this player on this question
  await supabase
    .from("stalk_market_bets")
    .delete()
    .eq("session_id", sessionId)
    .eq("question_id", questionId)
    .eq("player_id", playerId);

  await supabase.from("stalk_market_bets").insert(
    bets.map((b) => ({
      session_id: sessionId,
      question_id: questionId,
      player_id: playerId,
      guess_text: b.guess_text.trim(),
      chips: b.chips,
      is_correct: null,
      payout_cents: 0,
    }))
  );

  return NextResponse.json({ success: true });
}

// ─── Host moves from investing → adjudication ───
// Auto-marks any guess that exact-matches (case-insensitive) the spotlight's answer.
async function openAdjudication(supabase: SB, sessionId: string) {
  const session = await getSessionWithGame(supabase, sessionId);
  const questionId = session.sm_current_question_id;
  if (!questionId) throw new Error("No current question");
  const answer = session.sm_current_spotlight_answer || "";
  const normalized = normalizeGuess(answer);

  if (normalized) {
    const { data: matches } = await supabase
      .from("stalk_market_bets")
      .select("id, guess_text")
      .eq("session_id", sessionId)
      .eq("question_id", questionId);
    const ids = (matches || [])
      .filter((b) => normalizeGuess(b.guess_text) === normalized)
      .map((b) => b.id);
    if (ids.length > 0) {
      await supabase
        .from("stalk_market_bets")
        .update({ is_correct: true })
        .in("id", ids);
    }
  }

  await supabase
    .from("sessions")
    .update({ sm_phase: "adjudication" })
    .eq("id", sessionId);

  return NextResponse.json({ success: true });
}

// ─── Host marks one or more unique guess strings as correct/incorrect ───
async function markGuesses(
  supabase: SB,
  body: {
    sessionId: string;
    questionId: string;
    decisions: { guess_text: string; is_correct: boolean }[];
  }
) {
  const { sessionId, questionId, decisions } = body;
  for (const d of decisions) {
    const norm = normalizeGuess(d.guess_text);
    const { data: rows } = await supabase
      .from("stalk_market_bets")
      .select("id, guess_text")
      .eq("session_id", sessionId)
      .eq("question_id", questionId);
    const ids = (rows || [])
      .filter((r) => normalizeGuess(r.guess_text) === norm)
      .map((r) => r.id);
    if (ids.length > 0) {
      await supabase
        .from("stalk_market_bets")
        .update({ is_correct: d.is_correct })
        .in("id", ids);
    }
  }
  return NextResponse.json({ success: true });
}

// ─── Reveal: compute payouts, store, and decide whether to crash ───
async function reveal(supabase: SB, sessionId: string) {
  const session = await getSessionWithGame(supabase, sessionId);
  const questionId = session.sm_current_question_id;
  if (!questionId) throw new Error("No current question");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const game = session.games as any;
  const version = (game.sm_scoring_version || "pari_mutuel") as SMScoringVersion;

  const { data: betRows } = await supabase
    .from("stalk_market_bets")
    .select("*")
    .eq("session_id", sessionId)
    .eq("question_id", questionId);

  // Coerce nulls (un-adjudicated → wrong) to false so payout math is defined.
  const bets: BetInput[] = (betRows || []).map((b) => ({
    player_id: b.player_id,
    guess_text: b.guess_text,
    chips: b.chips,
    is_correct: !!b.is_correct,
  }));

  // Persist any null is_correct as false so the trigger sums correctly later.
  const unscored = (betRows || []).filter((b) => b.is_correct === null);
  if (unscored.length > 0) {
    await supabase
      .from("stalk_market_bets")
      .update({ is_correct: false })
      .in(
        "id",
        unscored.map((b) => b.id)
      );
  }

  if (bets.length > 0 && shouldCrash(bets)) {
    // Don't pay anyone out — instead enter the crash mini-game.
    await supabase
      .from("sessions")
      .update({
        sm_phase: "crash",
        sm_crash_start_timestamp: new Date().toISOString(),
        sm_phase_end_timestamp: new Date(
          Date.now() + CRASH_DURATION_MS + 1500
        ).toISOString(),
      })
      .eq("id", sessionId);
    return NextResponse.json({ success: true, crashed: true });
  }

  const payouts = computeRoundPayouts(bets, version);
  // Persist payout_cents per bet row (match by player_id + guess_text)
  const rowById = new Map((betRows || []).map((r) => [`${r.player_id}|${normalizeGuess(r.guess_text)}`, r]));
  for (const p of payouts) {
    const key = `${p.player_id}|${normalizeGuess(p.guess_text)}`;
    const row = rowById.get(key);
    if (!row) continue;
    await supabase
      .from("stalk_market_bets")
      .update({ payout_cents: p.payout_cents })
      .eq("id", row.id);
  }

  await supabase
    .from("sessions")
    .update({
      sm_phase: "reveal",
      sm_phase_end_timestamp: null,
    })
    .eq("id", sessionId);

  return NextResponse.json({ success: true, crashed: false });
}

// ─── A bettor taps CASH OUT during the crash phase ───
async function cashout(
  supabase: SB,
  body: { sessionId: string; questionId: string; playerId: string }
) {
  const session = await getSessionWithGame(supabase, body.sessionId);
  if (session.sm_phase !== "crash") throw new Error("Not in crash phase");
  if (!session.sm_crash_start_timestamp) throw new Error("Crash not started");

  const startMs = new Date(session.sm_crash_start_timestamp).getTime();
  const elapsedMs = Math.max(0, Date.now() - startMs);
  const cashoutMs = Math.min(elapsedMs, CRASH_DURATION_MS);
  const result = resolveCrash(body.playerId, cashoutMs);

  // Upsert the crash event (prevent double-tap from creating duplicates)
  await supabase.from("stalk_market_crash_events").upsert(
    {
      session_id: body.sessionId,
      question_id: body.questionId,
      player_id: body.playerId,
      cashout_ms: result.cashout_ms,
      saved_cents: result.saved_cents,
      net_cents: result.net_cents,
    },
    { onConflict: "session_id,question_id,player_id" }
  );

  return NextResponse.json({ success: true, ...result });
}

// ─── After crash window closes, mark any non-cashed-out bettor as wipeout ───
async function resolveCrashAction(supabase: SB, sessionId: string) {
  const session = await getSessionWithGame(supabase, sessionId);
  const questionId = session.sm_current_question_id;
  if (!questionId) throw new Error("No current question");

  // All active bettors (non-spotlight)
  const { data: players } = await supabase
    .from("session_players")
    .select("id")
    .eq("session_id", sessionId)
    .eq("is_removed", false);
  const bettors = (players || []).filter(
    (p) => p.id !== session.sm_spotlight_player_id
  );

  const { data: existing } = await supabase
    .from("stalk_market_crash_events")
    .select("player_id")
    .eq("session_id", sessionId)
    .eq("question_id", questionId);
  const cashedIds = new Set((existing || []).map((e) => e.player_id));

  const wipeouts = bettors.filter((p) => !cashedIds.has(p.id));
  if (wipeouts.length > 0) {
    const wipeResults = wipeouts.map((p) => resolveCrash(p.id, null));
    await supabase.from("stalk_market_crash_events").insert(
      wipeResults.map((r) => ({
        session_id: sessionId,
        question_id: questionId,
        player_id: r.player_id,
        cashout_ms: null,
        saved_cents: r.saved_cents,
        net_cents: r.net_cents,
      }))
    );
  }

  return NextResponse.json({ success: true });
}

// ─── Move from reveal/crash → leaderboard ───
async function advanceToLeaderboard(supabase: SB, sessionId: string) {
  await supabase
    .from("sessions")
    .update({
      sm_phase: "leaderboard",
      sm_phase_end_timestamp: null,
      sm_crash_start_timestamp: null,
    })
    .eq("id", sessionId);
  return NextResponse.json({ success: true });
}

// ─── Move to next question (or finish game) ───
async function nextQuestion(supabase: SB, sessionId: string) {
  const session = await getSessionWithGame(supabase, sessionId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const game = session.games as any;
  const questions = (game?.stalk_market_questions || []).sort(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a: any, b: any) => a.question_order - b.question_order
  );
  const nextOrder = (session.sm_current_question_order || 0) + 1;
  if (nextOrder >= questions.length) {
    await supabase
      .from("sessions")
      .update({
        status: "finished",
        ended_at: new Date().toISOString(),
        sm_phase: "leaderboard",
      })
      .eq("id", sessionId);
    return NextResponse.json({ success: true, finished: true });
  }

  const next = questions[nextOrder];
  const mode = game.sm_game_mode as "live" | "preloaded";
  const goingToInvesting = mode === "preloaded";
  const update: Record<string, unknown> = {
    sm_current_question_id: next.id,
    sm_current_question_order: nextOrder,
    current_question_index: nextOrder,
    sm_current_spotlight_answer:
      mode === "preloaded" ? next.preloaded_answer || "" : null,
    // Preloaded mode skips spotlight_answer and lands in investing — wait for
    // the host to tap Start Timer before the countdown begins. Live mode still
    // gets the spotlight typing window straight away.
    sm_phase_end_timestamp: goingToInvesting
      ? null
      : new Date(Date.now() + timerMs(game)).toISOString(),
    sm_crash_start_timestamp: null,
  };
  update.sm_phase = goingToInvesting ? "investing" : "spotlight_answer";

  await supabase.from("sessions").update(update).eq("id", sessionId);
  return NextResponse.json({ success: true, finished: false });
}

async function finishGame(supabase: SB, sessionId: string) {
  await supabase
    .from("sessions")
    .update({
      status: "finished",
      ended_at: new Date().toISOString(),
      sm_phase: "leaderboard",
    })
    .eq("id", sessionId);
  return NextResponse.json({ success: true });
}

// Suppress unused warning for ROUND_STAKE_CENTS (re-exported from scoring lib)
void ROUND_STAKE_CENTS;
