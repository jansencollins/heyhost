"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { Game } from "@/lib/types";

export default function DashboardPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadGames() {
      const supabase = createClient();
      const { data } = await supabase
        .from("games")
        .select("*")
        .order("created_at", { ascending: false });
      setGames(data || []);
      setLoading(false);
    }
    loadGames();
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            My Games
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Create and manage your trivia games
          </p>
        </div>
        <Link href="/dashboard/games/new">
          <Button>New Game</Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : games.length === 0 ? (
        <Card className="text-center py-16">
          <div className="text-zinc-400 dark:text-zinc-500 mb-4">
            <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            No games yet
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            Create your first trivia game to get started
          </p>
          <Link href="/dashboard/games/new">
            <Button>Create Game</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <Link key={game.id} href={`/dashboard/games/${game.id}`}>
              <Card className="h-full">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                  {game.title}
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
                  {game.topic}
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                    {game.difficulty}
                  </span>
                  <span className="px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
                    {game.age_range.replace("_", " ")}
                  </span>
                  <span className="px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
                    {game.timer_seconds}s timer
                  </span>
                </div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-3">
                  Created {new Date(game.created_at).toLocaleDateString()}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
