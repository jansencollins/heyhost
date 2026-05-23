"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { subscribeToSession, unsubscribe } from "@/lib/realtime";
import { Spinner } from "@/components/ui/spinner";
import { isInPenaltyZone } from "@/lib/pir-scoring";
import {
  RemoteFrame,
  RemoteScreen,
  RemoteSection,
  RemoteButton,
  RemotePlayerRow,
} from "@/components/games/host/RemoteUI";
import type {
  Session,
  SessionPlayer,
  PriceIsRightItem,
  PriceGuess,
} from "@/lib/types";
import type { HostRemoteProps } from "@/lib/game-registry";

export interface PIRHostDevMode {
  session?: Session | null;
  players?: SessionPlayer[];
  items?: PriceIsRightItem[];
  guesses?: PriceGuess[];
  onAction?: (action: string, payload?: Record<string, unknown>) => void;
}

export default function PIRHostRemote({ sessionId, devMode }: HostRemoteProps & { devMode?: PIRHostDevMode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(devMode?.session ?? null);
  const [players, setPlayers] = useState<SessionPlayer[]>(devMode?.players ?? []);
  const [items, setItems] = useState<PriceIsRightItem[]>(devMode?.items ?? []);
  const [guesses, setGuesses] = useState<PriceGuess[]>(devMode?.guesses ?? []);
  const [loading, setLoading] = useState(!devMode);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!devMode) return;
    if (devMode.session !== undefined) setSession(devMode.session);
    if (devMode.players !== undefined) setPlayers(devMode.players);
    if (devMode.items !== undefined) setItems(devMode.items);
    if (devMode.guesses !== undefined) setGuesses(devMode.guesses);
  }, [devMode]);

  useEffect(() => {
    if (devMode) return;
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
    if (devMode) return;
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
      if (devMode?.onAction) { devMode.onAction(action, extra); return; }
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
    [sessionId, devMode]
  );

  const kickPlayer = useCallback(async (playerId: string) => {
    if (devMode?.onAction) { devMode.onAction("kick_player", { playerId }); return; }
    const supabase = createClient();
    await supabase
      .from("session_players")
      .update({ is_removed: true })
      .eq("id", playerId);
  }, [devMode]);

  const togglePause = useCallback(async () => {
    if (!session) return;
    if (devMode?.onAction) { devMode.onAction("toggle_pause"); return; }
    const supabase = createClient();
    await supabase
      .from("sessions")
      .update({ is_paused: !session.is_paused })
      .eq("id", session.id);
  }, [session, devMode]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
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

  const phaseLabel = isLobby ? "Lobby" : isPlaying ? phase.replace("_", " ") : "Finished";
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <RemoteFrame>
      <RemoteScreen
        title="That Costs How Much!?"
        code={session.code}
        phase={phaseLabel}
        meta={`${players.length} player${players.length === 1 ? "" : "s"} · ${items.length} items`}
        screenHref={`/screen/${session.code}`}
      />

      {isLobby && (
        <>
          <RemoteSection title={`Players · ${players.length}`}>
            {players.length === 0 ? (
              <p className="text-sm text-zinc-500 italic text-center py-3">
                Waiting for players to join…
              </p>
            ) : (
              <div className="space-y-2">
                {players.map((p) => (
                  <RemotePlayerRow
                    key={p.id}
                    name={p.display_name}
                    color={p.avatar_color}
                    onKick={() => kickPlayer(p.id)}
                  />
                ))}
              </div>
            )}
          </RemoteSection>

          <RemoteButton
            onClick={() => callAction("start_game")}
            disabled={players.length === 0 || actionLoading}
            size="lg"
            className="w-full"
          >
            Start Game · {items.length} items
          </RemoteButton>
        </>
      )}

      {isPlaying && !currentItem && (
        <RemoteSection>
          <div className="flex items-center justify-center py-6">
            <Spinner />
          </div>
        </RemoteSection>
      )}

      {isPlaying && currentItem && (
        <>
          <RemoteSection title={`Item ${currentItemIndex + 1} / ${items.length}`}>
            <p className="text-sm text-zinc-200 leading-snug">{currentItem.name}</p>
            <p className="mt-2 text-[11px] text-zinc-500">
              Guesses: {guesses.length} / {players.length}
            </p>
          </RemoteSection>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <RemoteButton onClick={togglePause} variant="secondary">
              {session.is_paused ? "Resume" : "Pause"}
            </RemoteButton>
            {phase === "guessing" && (
              <RemoteButton onClick={() => callAction("show_price_result")} disabled={actionLoading}>
                Reveal Price
              </RemoteButton>
            )}
            {phase === "price_result" && (
              penaltyPlayers.length > 0 ? (
                <RemoteButton
                  onClick={() => callAction("pay_the_price")}
                  variant="danger"
                  disabled={actionLoading}
                >
                  Pay The Price · {penaltyPlayers.length}
                </RemoteButton>
              ) : (
                <RemoteButton
                  onClick={() => callAction("show_leaderboard")}
                  disabled={actionLoading}
                >
                  Show Leaderboard
                </RemoteButton>
              )
            )}
            {phase === "pay_the_price" && (
              <RemoteButton
                onClick={() => callAction("show_leaderboard")}
                disabled={actionLoading}
              >
                Show Leaderboard
              </RemoteButton>
            )}
            {phase === "leaderboard" && (
              <RemoteButton
                onClick={() => callAction("next_item")}
                disabled={actionLoading}
              >
                {isLastItem ? "Finish Game" : "Next Item"}
              </RemoteButton>
            )}
          </div>

          <RemoteSection title="Leaderboard">
            <div className="space-y-2">
              {sortedPlayers.slice(0, 5).map((p, i) => (
                <RemotePlayerRow
                  key={p.id}
                  name={p.display_name}
                  color={p.avatar_color}
                  rightSlot={
                    <span className="font-mono text-xs text-zinc-400">
                      #{i + 1} · {p.score}
                    </span>
                  }
                  onKick={() => kickPlayer(p.id)}
                />
              ))}
            </div>
          </RemoteSection>

          <RemoteButton
            onClick={() => callAction("finish_game")}
            variant="danger"
            size="sm"
            className="w-full"
            disabled={actionLoading}
          >
            End Game Now
          </RemoteButton>
        </>
      )}

      {isFinished && (
        <>
          <RemoteSection title="Final Scores">
            <div className="space-y-2">
              {sortedPlayers.map((p, i) => (
                <RemotePlayerRow
                  key={p.id}
                  name={p.display_name}
                  color={p.avatar_color}
                  rightSlot={
                    <span className="font-mono text-xs text-zinc-300 font-bold">
                      #{i + 1} · {p.score}
                    </span>
                  }
                />
              ))}
            </div>
          </RemoteSection>
          <Link href="/dashboard" className="block">
            <RemoteButton className="w-full">Back to Dashboard</RemoteButton>
          </Link>
        </>
      )}
    </RemoteFrame>
  );
}
