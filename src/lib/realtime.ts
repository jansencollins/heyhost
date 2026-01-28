/**
 * Realtime Strategy: Row-level changes via Supabase Realtime postgres_changes
 *
 * We subscribe to INSERT/UPDATE/DELETE events on:
 * - sessions (status changes, current_question_index)
 * - session_players (joins, kicks, score updates)
 * - session_question_state (timer, pause, lock, results)
 * - session_answers (new answers for result distribution)
 *
 * This approach was chosen over broadcast because:
 * 1. The DB is the single source of truth — no reconciliation needed
 * 2. All state changes are durable and queryable
 * 3. Supabase handles fan-out to all connected clients
 * 4. Simpler to reason about compared to broadcast + DB writes
 *
 * Trade-off: slightly higher latency than pure broadcast (~100-200ms),
 * but acceptable for a trivia game with 30s question timers.
 */

import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RealtimeHandler = (payload: RealtimePostgresChangesPayload<any>) => void;

export function subscribeToSession(
  sessionId: string,
  handlers: {
    onSessionChange?: RealtimeHandler;
    onPlayerChange?: RealtimeHandler;
    onQuestionStateChange?: RealtimeHandler;
    onAnswerChange?: RealtimeHandler;
  }
): RealtimeChannel {
  const supabase = createClient();

  let channel = supabase.channel(`session:${sessionId}`);

  if (handlers.onSessionChange) {
    channel = channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "sessions",
        filter: `id=eq.${sessionId}`,
      },
      handlers.onSessionChange
    );
  }

  if (handlers.onPlayerChange) {
    channel = channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "session_players",
        filter: `session_id=eq.${sessionId}`,
      },
      handlers.onPlayerChange
    );
  }

  if (handlers.onQuestionStateChange) {
    channel = channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "session_question_state",
        filter: `session_id=eq.${sessionId}`,
      },
      handlers.onQuestionStateChange
    );
  }

  if (handlers.onAnswerChange) {
    channel = channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "session_answers",
        filter: `session_id=eq.${sessionId}`,
      },
      handlers.onAnswerChange
    );
  }

  channel.subscribe();

  return channel;
}

export function unsubscribe(channel: RealtimeChannel) {
  const supabase = createClient();
  supabase.removeChannel(channel);
}
