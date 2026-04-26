"use client";

import { useEffect, useState, use } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import { getGameTypeConfig } from "@/lib/game-registry";
import { ThemeProvider } from "@/lib/theme-context";
import { DEFAULT_THEME } from "@/lib/theme-presets";
import type { GameType, GameTheme } from "@/lib/types";
import type { ComponentType } from "react";
import type { PlayerPageProps } from "@/lib/game-registry";

export default function PlayerSessionPage({
  params,
}: {
  params: Promise<{ sessionCode: string }>;
}) {
  const { sessionCode } = use(params);
  const [DynamicComponent, setDynamicComponent] = useState<ComponentType<PlayerPageProps> | null>(null);
  const [theme, setTheme] = useState<GameTheme | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadGameType() {
      const supabase = createClient();
      const { data: session } = await supabase
        .from("sessions")
        .select("game_id")
        .eq("code", sessionCode.toUpperCase())
        .neq("status", "finished")
        .maybeSingle();

      let gameType: GameType = "trivia";

      if (session) {
        const { data: game } = await supabase
          .from("games")
          .select("game_type, theme")
          .eq("id", session.game_id)
          .maybeSingle();

        gameType = (game?.game_type || "trivia") as GameType;
        setTheme((game?.theme as GameTheme) || DEFAULT_THEME[gameType]);

        const config = getGameTypeConfig(gameType);
        const mod = await config.components.PlayerPage();
        setDynamicComponent(() => mod.default);
      } else {
        setTheme(DEFAULT_THEME[gameType]);
        const config = getGameTypeConfig(gameType);
        const mod = await config.components.PlayerPage();
        setDynamicComponent(() => mod.default);
      }

      setLoading(false);
    }

    loadGameType();
  }, [sessionCode]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-background">
        <Spinner />
      </div>
    );
  }

  if (!DynamicComponent || !theme) return null;

  return (
    <ThemeProvider theme={theme}>
      <DynamicComponent sessionCode={sessionCode} />
    </ThemeProvider>
  );
}
