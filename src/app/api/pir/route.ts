/**
 * Price Is Right API — handles all game phase transitions
 * POST /api/pir with { action, sessionId, ... }
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { getScoreData } from "@/lib/pir-scoring";

export async function POST(req: NextRequest) {
  const supabase = await createServiceSupabase();
  const body = await req.json();
  const { action, sessionId } = body;

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  try {
    switch (action) {
      case "start_game": return await startGame(supabase, sessionId);
      case "submit_guess": return await submitGuess(supabase, body);
      case "show_price_result": return await showPriceResult(supabase, sessionId);
      case "pay_the_price": return await payThePrice(supabase, sessionId);
      case "paid_the_price": return await paidThePrice(supabase, body);
      case "show_leaderboard": return await showLeaderboard(supabase, sessionId);
      case "next_item": return await nextItem(supabase, sessionId);
      case "finish_game": return await finishGame(supabase, sessionId);
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = Awaited<ReturnType<typeof createServiceSupabase>>;

async function getSessionWithGame(supabase: SB, sessionId: string) {
  const { data: session } = await supabase
    .from("sessions")
    .select("*, games(*, price_is_right_items(*))")
    .eq("id", sessionId)
    .single();
  if (!session) throw new Error("Session not found");
  return session;
}

async function startGame(supabase: SB, sessionId: string) {
  const session = await getSessionWithGame(supabase, sessionId);
  const items = (session.games?.price_is_right_items || []).sort(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a: any, b: any) => a.item_order - b.item_order
  );

  if (items.length === 0) {
    return NextResponse.json({ error: "No items in game" }, { status: 400 });
  }

  const firstItem = items[0];

  // Clear any existing guesses
  await supabase.from("price_guesses").delete().eq("session_id", sessionId);

  // Update session
  await supabase.from("sessions").update({
    status: "playing",
    current_question_index: 0,
    pir_current_item_id: firstItem.id,
    pir_current_item_order: 0,
    pir_item_end_timestamp: new Date(Date.now() + 30_000).toISOString(),
    pir_phase: "guessing",
  }).eq("id", sessionId);

  return NextResponse.json({ success: true });
}

async function submitGuess(supabase: SB, body: { sessionId: string; playerId: string; itemId: string; guess: number }) {
  const { sessionId, playerId, itemId, guess } = body;

  // Get the item to calculate score
  const { data: item } = await supabase
    .from("price_is_right_items")
    .select("*")
    .eq("id", itemId)
    .single();

  if (!item) throw new Error("Item not found");

  const scoreData = getScoreData(guess, item.price);

  // Upsert guess
  await supabase.from("price_guesses").upsert({
    session_id: sessionId,
    player_id: playerId,
    item_id: itemId,
    guess,
    score_awarded: scoreData.scoreAwarded,
    tier: scoreData.tier,
    guess_accuracy: scoreData.guessAccuracy,
    paid_the_price: false,
  }, {
    onConflict: "session_id,player_id,item_id",
  });

  return NextResponse.json({ success: true, ...scoreData });
}

async function showPriceResult(supabase: SB, sessionId: string) {
  const session = await getSessionWithGame(supabase, sessionId);
  const currentItemId = session.pir_current_item_id;

  if (!currentItemId) throw new Error("No current item");

  // Get the item for correct price
  const { data: item } = await supabase
    .from("price_is_right_items")
    .select("*")
    .eq("id", currentItemId)
    .single();

  if (!item) throw new Error("Item not found");

  // Get all active players
  const { data: players } = await supabase
    .from("session_players")
    .select("id")
    .eq("session_id", sessionId)
    .eq("is_removed", false);

  // Get existing guesses for this item
  const { data: guesses } = await supabase
    .from("price_guesses")
    .select("player_id")
    .eq("session_id", sessionId)
    .eq("item_id", currentItemId);

  const guessedPlayerIds = new Set((guesses || []).map(g => g.player_id));

  // Create zero-guesses for non-guessers
  const nonGuessers = (players || []).filter(p => !guessedPlayerIds.has(p.id));
  if (nonGuessers.length > 0) {
    await supabase.from("price_guesses").insert(
      nonGuessers.map(p => ({
        session_id: sessionId,
        player_id: p.id,
        item_id: currentItemId,
        guess: 0,
        score_awarded: 0,
        tier: "beyond50",
        guess_accuracy: 0,
        paid_the_price: false,
      }))
    );
  }

  await supabase.from("sessions").update({
    pir_phase: "price_result",
  }).eq("id", sessionId);

  return NextResponse.json({ success: true });
}

async function payThePrice(supabase: SB, sessionId: string) {
  await supabase.from("sessions").update({
    pir_phase: "pay_the_price",
  }).eq("id", sessionId);

  return NextResponse.json({ success: true });
}

async function paidThePrice(supabase: SB, body: { sessionId: string; playerId: string }) {
  const { sessionId, playerId } = body;

  const session = await getSessionWithGame(supabase, sessionId);
  const currentItemId = session.pir_current_item_id;

  if (!currentItemId) throw new Error("No current item");

  // Set this player's guess score to 0 and mark paid_the_price
  await supabase.from("price_guesses").update({
    score_awarded: 0,
    paid_the_price: true,
    tier: "Paid the Price",
  }).match({
    session_id: sessionId,
    player_id: playerId,
    item_id: currentItemId,
  });

  return NextResponse.json({ success: true });
}

async function showLeaderboard(supabase: SB, sessionId: string) {
  await supabase.from("sessions").update({
    pir_phase: "leaderboard",
  }).eq("id", sessionId);

  return NextResponse.json({ success: true });
}

async function nextItem(supabase: SB, sessionId: string) {
  const session = await getSessionWithGame(supabase, sessionId);
  const items = (session.games?.price_is_right_items || []).sort(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a: any, b: any) => a.item_order - b.item_order
  );

  const currentOrder = session.pir_current_item_order || 0;
  const nextOrder = currentOrder + 1;

  if (nextOrder >= items.length) {
    // No more items — finish game
    await supabase.from("sessions").update({
      status: "finished",
      ended_at: new Date().toISOString(),
    }).eq("id", sessionId);

    return NextResponse.json({ success: true, finished: true });
  }

  const nextItemData = items[nextOrder];

  await supabase.from("sessions").update({
    pir_current_item_id: nextItemData.id,
    pir_current_item_order: nextOrder,
    pir_item_end_timestamp: new Date(Date.now() + 30_000).toISOString(),
    pir_phase: "guessing",
    current_question_index: nextOrder,
  }).eq("id", sessionId);

  return NextResponse.json({ success: true, finished: false });
}

async function finishGame(supabase: SB, sessionId: string) {
  await supabase.from("sessions").update({
    status: "finished",
    ended_at: new Date().toISOString(),
  }).eq("id", sessionId);

  return NextResponse.json({ success: true });
}
