"use client";

import { use, useEffect, useState, Suspense, lazy } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import { getGameTypeConfig } from "@/lib/game-registry";
import type { GameType } from "@/lib/types";
import type { ComponentType } from "react";
import type { HostRemoteProps } from "@/lib/game-registry";

export default function HostPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const [GameComponent, setGameComponent] = useState<ComponentType<HostRemoteProps> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadGameType() {
      const supabase = createClient();

      const { data: session } = await supabase
        .from("sessions")
        .select("game_id")
        .eq("id", sessionId)
        .single();

      if (!session) {
        setLoading(false);
        return;
      }

      const { data: game } = await supabase
        .from("games")
        .select("game_type")
        .eq("id", session.game_id)
        .single();

      const gameType = (game?.game_type || "trivia") as GameType;
      const config = getGameTypeConfig(gameType);
      const mod = await config.components.HostRemote();
      setGameComponent(() => mod.default);
      setLoading(false);
    }

    loadGameType();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-background">
        <Spinner />
      </div>
    );
  }

  if (!GameComponent) return null;

  return <GameComponent sessionId={sessionId} />;
}
