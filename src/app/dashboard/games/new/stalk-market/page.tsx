"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import { DEFAULT_THEME } from "@/lib/theme-presets";

function makeToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export default function NewStalkMarketPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { data: game, error: gameError } = await supabase
          .from("games")
          .insert({
            host_id: user.id,
            title: "Untitled Game",
            topic: "Stalk Market",
            game_type: "stalk_market",
            timer_seconds: 60,
            speed_bonus: false,
            penalty_margin: 70,
            sm_scoring_version: "pari_mutuel",
            sm_game_mode: "live",
            sm_spotlight_token: makeToken(),
            theme: DEFAULT_THEME.stalk_market,
          })
          .select()
          .single();

        if (gameError) throw gameError;

        router.replace(`/dashboard/games/${game.id}/stalk-market?tab=settings`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to create game");
      }
    })();
  }, [router]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="p-4 rounded-lg bg-[color-mix(in_srgb,var(--coral)_12%,var(--paper))] text-coral text-sm">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-24">
      <Spinner />
    </div>
  );
}
