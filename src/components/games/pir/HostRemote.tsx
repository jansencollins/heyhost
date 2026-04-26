"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { subscribeToSession, unsubscribe } from "@/lib/realtime";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { isInPenaltyZone } from "@/lib/pir-scoring";
import type {
  Session,
  SessionPlayer,
  PriceIsRightItem,
  PriceGuess,
} from "@/lib/types";
import type { HostRemoteProps } from "@/lib/game-registry";

export default function PIRHostRemote({ sessionId }: HostRemoteProps) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [items, setItems] = useState<PriceIsRightItem[]>([]);
  const [guesses, setGuesses] = useState<PriceGuess[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const { data: sessionData } = await supabase
        .from("sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (!sessionData) {
        router.push("/dashboard");
        return;
      }

      setSession(sessionData);

      const { data: gameData } = await supabase
        .from("games")
        .select("*, price_is_right_items(*)")
        .eq("id", sessionData.game_id)
        .maybeSingle();

      if (gameData?.price_is_right_items) {
        setItems(
          gameData.price_is_right_items.sort(
            (a: PriceIsRightItem, b: PriceIsRightItem) => a.item_order - b.item_order
          )
        );
      }

      const { data: playersData } = await supabase
        .from("session_players")
        .select("*")
        .eq("session_id", sessionId)
        .eq("is_removed", false);

      setPlayers(playersData || []);

      if (sessionData.pir_current_item_id) {
        const { data: guessData } = await supabase
          .from("price_guesses")
          .select("*")
          .eq("session_id", sessionId)
          .eq("item_id", sessionData.pir_current_item_id);
        setGuesses(guessData || []);
      }

      setLoading(false);
    }

    load();
  }, [sessionId, router]);

  useEffect(() => {
    if (!session) return;

    const channel = subscribeToSession(session.id, {
      onSessionChange: (payload) => {
        setSession(payload.new as Session);
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
  }, [session?.id]);

  useEffect(() => {
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

  const callAction = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      setActionLoading(true);
      try {
        const res = await fetch("/api/pir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, sessionId, ...extra }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        if (action === "next_item" || action === "start_game") {
          setGuesses([]);
        }

        return data;
      } catch (err) {
        console.error(`Action ${action} failed:`, err);
      } finally {
        setActionLoading(false);
      }
    },
    [sessionId]
  );

  const kickPlayer = useCallback(async (playerId: string) => {
    const supabase = createClient();
    await supabase
      .from("session_players")
      .update({ is_removed: true })
      .eq("id", playerId);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-background">
        <Spinner />
      </div>
    );
  }

  if (!session) return null;

  const isLobby = session.status === "lobby";
  const isPlaying = session.status === "playing";
  const isFinished = session.status === "finished";
  const phase = session.pir_phase;
  const currentItem = items.find((i) => i.id === session.pir_current_item_id);
  const currentItemIndex = session.pir_current_item_order || 0;
  const isLastItem = currentItemIndex >= items.length - 1;

  const penaltyPlayers = guesses.filter(
    (g) => g.tier && isInPenaltyZone(g.tier)
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-background flex flex-col">
      <header className="bg-white dark:bg-slate-800 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
              That Costs How Much!? - Host
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Code:{" "}
              <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                {session.code}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/screen/${session.code}`}
              target="_blank"
              className="text-xs text-indigo-600 dark:text-indigo-400 underline"
            >
              Open Screen
            </Link>
          </div>
        </div>
      </header>

      <div className="flex-1 p-4 space-y-4 max-w-lg mx-auto w-full">
        <div className="text-center">
          <span
            className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
              isLobby
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                : isPlaying
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                : "bg-zinc-100 text-zinc-800 dark:bg-slate-800 dark:text-zinc-200"
            }`}
          >
            {isLobby ? "Lobby" : isPlaying ? `Playing - ${phase}` : "Finished"}
          </span>
        </div>

        {isLobby && (
          <>
            <div className="text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">
                Players ({players.length})
              </p>
              <div className="flex flex-wrap justify-center gap-2 mb-4">
                {players.map((p) => (
                  <div key={p.id} className="flex items-center gap-1">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: p.avatar_color }}
                    >
                      {p.display_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">
                      {p.display_name}
                    </span>
                    <button
                      onClick={() => kickPlayer(p.id)}
                      className="text-red-400 hover:text-red-600 ml-1"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              {players.length === 0 && (
                <p className="text-zinc-400 text-sm">Waiting for players...</p>
              )}
            </div>

            <Button
              onClick={() => callAction("start_game")}
              disabled={players.length === 0}
              loading={actionLoading}
              className="w-full"
              size="lg"
            >
              Start Game ({items.length} items)
            </Button>
          </>
        )}

        {isPlaying && !currentItem && (
          <div className="text-center py-8">
            <Spinner />
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">Loading item...</p>
          </div>
        )}

        {isPlaying && currentItem && (
          <>
            <div className="text-center">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Item {currentItemIndex + 1} of {items.length}
              </p>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mt-1">
                {currentItem.name}
              </p>
            </div>

            <div className="text-center text-sm text-zinc-500 dark:text-zinc-400">
              Guesses: {guesses.length} / {players.length}
            </div>

            {phase === "guessing" && (
              <Button
                onClick={() => callAction("show_price_result")}
                loading={actionLoading}
                className="w-full"
                size="lg"
              >
                Reveal Price
              </Button>
            )}

            {phase === "price_result" && (
              <div className="space-y-3">
                <p className="text-center text-sm font-medium text-green-600 dark:text-green-400">
                  Showing price result
                </p>
                {penaltyPlayers.length > 0 ? (
                  <Button
                    onClick={() => callAction("pay_the_price")}
                    loading={actionLoading}
                    className="w-full"
                    size="lg"
                    variant="danger"
                  >
                    Pay The Price! ({penaltyPlayers.length} players)
                  </Button>
                ) : (
                  <Button
                    onClick={() => callAction("show_leaderboard")}
                    loading={actionLoading}
                    className="w-full"
                    size="lg"
                  >
                    Show Leaderboard
                  </Button>
                )}
              </div>
            )}

            {phase === "pay_the_price" && (
              <div className="space-y-3">
                <p className="text-center text-sm font-medium text-red-600 dark:text-red-400">
                  Spinning the wheel...
                </p>
                <Button
                  onClick={() => callAction("show_leaderboard")}
                  loading={actionLoading}
                  className="w-full"
                  size="lg"
                >
                  Show Leaderboard
                </Button>
              </div>
            )}

            {phase === "leaderboard" && (
              <div className="space-y-3">
                <p className="text-center text-sm font-medium text-indigo-600 dark:text-indigo-400">
                  Showing leaderboard
                </p>
                <Button
                  onClick={async () => {
                    const result = await callAction("next_item");
                    if (result?.finished) {
                      // Game ended
                    }
                  }}
                  loading={actionLoading}
                  className="w-full"
                  size="lg"
                >
                  {isLastItem ? "Finish Game" : "Next Item"}
                </Button>
              </div>
            )}

            <div className="mt-4">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Leaderboard
              </h3>
              <div className="space-y-1">
                {[...players]
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 5)
                  .map((p, i) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 text-sm px-3 py-1.5 rounded bg-white dark:bg-slate-800"
                    >
                      <span className="font-bold text-zinc-400 w-6">{i + 1}</span>
                      <div
                        className="w-5 h-5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: p.avatar_color }}
                      />
                      <span className="flex-1 text-zinc-900 dark:text-zinc-100 truncate">
                        {p.display_name}
                      </span>
                      <span className="font-mono text-zinc-600 dark:text-zinc-400">
                        {p.score}
                      </span>
                      <button
                        onClick={() => kickPlayer(p.id)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}

        {isFinished && (
          <div className="text-center">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
              Game Over
            </h2>
            <div className="space-y-2 mb-6">
              {[...players]
                .sort((a, b) => b.score - a.score)
                .map((p, i) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 text-sm px-3 py-2 rounded bg-white dark:bg-slate-800"
                  >
                    <span className="font-bold text-zinc-400 w-6">#{i + 1}</span>
                    <div
                      className="w-6 h-6 rounded-full"
                      style={{ backgroundColor: p.avatar_color }}
                    />
                    <span className="flex-1 text-zinc-900 dark:text-zinc-100">
                      {p.display_name}
                    </span>
                    <span className="font-mono font-bold text-zinc-600 dark:text-zinc-300">
                      {p.score}
                    </span>
                  </div>
                ))}
            </div>
            <Link href="/dashboard">
              <Button>Back to Dashboard</Button>
            </Link>
          </div>
        )}

        {isPlaying && (
          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <Button
              variant="danger"
              size="sm"
              onClick={() => callAction("finish_game")}
              loading={actionLoading}
              className="w-full"
            >
              End Game Now
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
