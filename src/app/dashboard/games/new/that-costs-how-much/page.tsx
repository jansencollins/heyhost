"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import { DEFAULT_THEME } from "@/lib/theme-presets";

export default function NewPIRGamePage() {
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
            topic: "That Costs How Much!?",
            game_type: "price_is_right",
            speed_bonus: false,
            penalty_margin: 70,
            theme: DEFAULT_THEME.price_is_right,
          })
          .select()
          .single();

        if (gameError) throw gameError;

        router.replace(`/dashboard/games/${game.id}/that-costs-how-much?tab=settings`);
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
