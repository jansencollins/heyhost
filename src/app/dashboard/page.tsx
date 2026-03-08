"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import type { Game } from "@/lib/types";

const GRADIENT_CLASSES = [
  "gradient-pink",
  "gradient-blue",
  "gradient-green",
  "gradient-orange",
  "gradient-purple",
  "gradient-cyan",
];

export default function DashboardPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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

  const filtered = games.filter(
    (g) =>
      g.title.toLowerCase().includes(search.toLowerCase()) ||
      g.topic.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Page Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-5xl font-bold text-white tracking-tight">
            GAME DASHBOARD
          </h1>
          <p className="text-base text-white mt-2">
            Click on any game to continue editing or start hosting it. Need inspiration?{" "}
            Visit the <span className="text-indigo-400 font-medium">Host Network</span> to explore pre-made games and templates.
          </p>
        </div>
        <Link
          href="/dashboard/games/new"
          className="btn-gradient-primary flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Game
        </Link>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-3 mt-6 mb-8">
        <div className="relative flex-1">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search Your Games..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass-input w-full pl-10 pr-4 py-2.5 text-sm"
          />
        </div>
        <select className="glass-select py-2.5 px-4 text-sm min-w-[140px]">
          <option>Filter By Game</option>
        </select>
        <select className="glass-select py-2.5 px-4 text-sm min-w-[140px]">
          <option>Filter By Theme</option>
        </select>
        <select className="glass-select py-2.5 px-4 text-sm min-w-[120px]">
          <option>Sort By</option>
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : filtered.length === 0 && games.length === 0 ? (
        <div className="gradient-card gradient-purple">
          <div className="gradient-card-inner p-12 text-center">
            <div className="text-text-muted mb-4">
              <svg className="h-14 w-14 mx-auto opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-text-primary mb-2">
              No games yet
            </h2>
            <p className="text-sm text-text-muted mb-6">
              Create your first trivia game to get started
            </p>
            <Link
              href="/dashboard/games/new"
              className="btn-gradient-primary inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold"
            >
              Create Game
            </Link>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          No games matching &ldquo;{search}&rdquo;
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 stagger-in">
          {filtered.map((game, i) => (
            <Link key={game.id} href={`/dashboard/games/${game.id}`}>
              <div className={`gradient-card ${GRADIENT_CLASSES[i % GRADIENT_CLASSES.length]}`}>
                <div className="gradient-card-inner p-5">
                  {/* Card thumbnail area */}
                  <div className="h-28 rounded-xl bg-gradient-to-br from-white/[0.03] to-white/[0.01] border border-white/[0.04] mb-4 flex items-center justify-center overflow-hidden">
                    <span className="text-2xl font-bold text-white/10 text-center px-3 leading-tight">
                      {game.title}
                    </span>
                  </div>

                  <h3 className="font-semibold text-text-primary text-sm mb-0.5 truncate">
                    {game.title}
                  </h3>
                  <p className="text-xs text-text-muted mb-3 truncate">
                    {game.topic}
                  </p>

                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/10">
                      {game.difficulty}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-white/5 text-text-secondary border border-white/5">
                      {game.timer_seconds}s
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted mt-3">
                    {new Date(game.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
