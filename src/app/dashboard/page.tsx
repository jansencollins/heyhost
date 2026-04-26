"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import { getGameTypeConfig } from "@/lib/game-registry";
import { generateGameCode } from "@/lib/game-code";
import type { Game } from "@/lib/types";

/** Short relative-time helper: "just now", "5m ago", "3d ago", "2mo ago". */
function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

type FilterKey = "all" | "trivia" | "price_is_right";
type SortKey = "recent" | "title";

const FILTERS: { key: FilterKey; label: React.ReactNode }[] = [
  { key: "all", label: "All" },
  { key: "trivia", label: "Straight Off The Dome" },
  {
    key: "price_is_right",
    label: (
      <>
        That Costs <span className="italic">How</span> Much!?
      </>
    ),
  },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Most recent" },
  { key: "title", label: "Title A–Z" },
];

// Per game-type: accent (chip color) + thumbnail artwork that sits on a solid palette background
const GAME_TYPE_ACCENT: Record<Game["game_type"], "violet" | "lime"> = {
  trivia: "violet",
  price_is_right: "lime",
};
const GAME_TYPE_CARD: Record<
  Game["game_type"],
  { bg: string; thumb: string; thumbAnchor?: "bottom" | "center"; thumbScale?: number }
> = {
  trivia: {
    bg: "linear-gradient(135deg, var(--violet) 0%, color-mix(in srgb, var(--violet) 70%, var(--ink)) 100%)",
    thumb: "/straight-off-dome-thumb.png",
    thumbScale: 0.85,
  },
  price_is_right: {
    bg: "linear-gradient(135deg, var(--lime) 0%, color-mix(in srgb, var(--lime) 70%, var(--ink)) 100%)",
    thumb: "/that-costs-how-much-thumb.png",
    thumbAnchor: "bottom",
  },
};

export default function DashboardPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("recent");

  useEffect(() => {
    async function loadGames() {
      const supabase = createClient();
      const { data: gamesData } = await supabase
        .from("games")
        .select("*")
        .order("created_at", { ascending: false });
      const list: Game[] = gamesData || [];
      setGames(list);

      // Batched counts: questions for trivia, items for price-is-right.
      const triviaIds = list.filter((g) => g.game_type === "trivia").map((g) => g.id);
      const pirIds = list.filter((g) => g.game_type === "price_is_right").map((g) => g.id);
      const counts: Record<string, number> = {};
      if (triviaIds.length > 0) {
        const { data: qRows } = await supabase
          .from("game_questions")
          .select("game_id")
          .in("game_id", triviaIds);
        qRows?.forEach((r: { game_id: string }) => {
          counts[r.game_id] = (counts[r.game_id] || 0) + 1;
        });
      }
      if (pirIds.length > 0) {
        const { data: iRows } = await supabase
          .from("price_is_right_items")
          .select("game_id")
          .in("game_id", pirIds);
        iRows?.forEach((r: { game_id: string }) => {
          counts[r.game_id] = (counts[r.game_id] || 0) + 1;
        });
      }
      setItemCounts(counts);
      setLoading(false);
    }
    loadGames();
  }, []);

  const filtered = games
    .filter((g) => {
      if (filter !== "all" && g.game_type !== filter) return false;
      const q = search.toLowerCase();
      return !q || g.title.toLowerCase().includes(q) || g.topic.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  return (
    <div>
      {/* Page Header — paper card, matches the game editor header treatment */}
      <header
        className="card-rebrand card-anchor relative z-10 p-6 lg:p-7"
        style={{
          background: "var(--paper)",
          borderColor: "rgba(0,0,0,0.18)",
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          borderBottomWidth: 0,
          overflow: "visible",
        }}
      >
        <div className="flex items-center gap-4 mb-3">
          <span
            className="w-12 h-12 rounded-full flex items-center justify-center border-2 border-ink shrink-0"
            style={{ background: "var(--coral)" }}
          >
            <Image
              src="/my-games.svg"
              alt=""
              width={36}
              height={36}
              className="nav-icon-light"
            />
          </span>
          <h1 className="font-display font-bold text-[32px] tracking-[-0.025em] leading-[1.05] text-ink">
            Your Games
          </h1>
        </div>
        <p className="text-[15px] text-smoke leading-relaxed max-w-3xl">
          Pick a game to keep editing or host it live. Need inspiration? Visit the{" "}
          <Link href="/dashboard/network" className="text-coral font-medium hover:underline">
            Host Network
          </Link>{" "}
          for pre-made games and templates.
        </p>
      </header>

      {/* Panel — matches the game editor tab-panel treatment */}
      <div
        className="card-rebrand card-anchor tab-panel p-5 lg:p-6 pt-7 lg:pt-8 border-t-0"
        style={{
          background: "#ECE3D0",
          borderColor: "rgba(0,0,0,0.18)",
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          boxShadow: "inset 0 6px 12px -6px rgba(0,0,0,0.18)",
        }}
      >
        {/* Search + filter row */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-[280px] max-w-md">
            <svg className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-smoke" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search your games"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-rebrand input-rebrand-pill w-full pl-11 text-[14px]"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`filter-pill ${filter === f.key ? "is-active" : ""}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="ml-auto">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="filter-pill appearance-none pr-8 cursor-pointer"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B625A' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 12px center",
              }}
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-24">
            <Spinner />
          </div>
        ) : games.length === 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <CreateCard firstTime />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-smoke text-[15px]">
            Nothing matches &ldquo;{search}&rdquo;.
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                accent={GAME_TYPE_ACCENT[game.game_type]}
                count={itemCounts[game.id] ?? 0}
              />
            ))}
            <CreateCard />
          </div>
        )}
      </div>
    </div>
  );
}

function GameCard({
  game,
  count,
}: {
  game: Game;
  accent: "violet" | "lime";
  count: number;
}) {
  const cfg = getGameTypeConfig(game.game_type);
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const card = GAME_TYPE_CARD[game.game_type];
  const unitLabel = game.game_type === "price_is_right" ? "product" : "question";
  const modifiedIso = (game as unknown as { updated_at?: string }).updated_at || game.created_at;
  const canStart = count > 0 && !starting;

  async function handleStart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!canStart) return;
    setStarting(true);
    setStartError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      let code = generateGameCode();
      for (let i = 0; i < 5; i++) {
        const { data: existing } = await supabase
          .from("sessions")
          .select("id")
          .eq("code", code)
          .neq("status", "finished")
          .maybeSingle();
        if (!existing) break;
        code = generateGameCode();
      }

      const { data: session, error: sessionError } = await supabase
        .from("sessions")
        .insert({
          game_id: game.id,
          host_id: user.id,
          code,
          status: "lobby",
          current_question_index: -1,
          timer_seconds: game.timer_seconds,
          speed_bonus: game.speed_bonus,
          display_mode: "tv",
        })
        .select()
        .single();
      if (sessionError) throw sessionError;

      if (typeof window !== "undefined") {
        window.open(`/host/${session.id}`, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setStarting(false);
    }
  }

  return (
    <article className="card-rebrand h-full flex flex-col p-3 group">
      <Link href={cfg.editRoute(game.id)} className="block">
        <div
          className="relative aspect-[16/10] overflow-hidden rounded-2xl flex items-stretch"
          style={{ background: card.bg }}
        >
          {/* Left — game brand name */}
          <div className="flex-1 min-w-0 flex flex-col justify-center px-5 py-4">
            <h3
              className="font-display font-bold text-[26px] tracking-[-0.025em] leading-[1.02]"
              style={{
                color: "#FFFFFF",
                WebkitTextStroke: "1.5px var(--ink)",
                paintOrder: "stroke fill",
                textShadow: "0 2px 8px rgba(26,20,18,0.25)",
              }}
            >
              {game.game_type === "price_is_right" ? (
                <>
                  That Costs <span className="italic">How</span> Much!?
                </>
              ) : (
                cfg.label
              )}
            </h3>
          </div>

          {/* Right — thumbnail artwork */}
          <div
            className={`shrink-0 w-[44%] flex justify-center transition-transform duration-500 group-hover:scale-[1.06] ${
              card.thumbAnchor === "bottom"
                ? "items-end pt-3 pb-0 px-2"
                : "items-center p-2"
            }`}
            style={{
              transformOrigin: card.thumbAnchor === "bottom" ? "bottom center" : "center",
            }}
          >
            <Image
              src={card.thumb}
              alt={game.title}
              width={320}
              height={240}
              className="w-auto h-auto max-w-full max-h-full object-contain"
              style={{
                transform: `scale(${card.thumbScale ?? 1})`,
                transformOrigin:
                  card.thumbAnchor === "bottom" ? "bottom center" : "center",
              }}
            />
          </div>
        </div>

        {game.title && (
          <p className="pt-3 px-1 text-[22px] text-ink font-display font-semibold tracking-[-0.02em] leading-[1.1] line-clamp-2">
            {game.title} Edition
          </p>
        )}
      </Link>

      {/* Stats — each on its own line */}
      <div className="mt-3 px-1 flex flex-col gap-1.5 text-[14px] text-smoke">
        <span className="inline-flex items-center gap-2.5">
          <Image
            src={
              game.game_type === "price_is_right"
                ? "/cart-link.svg"
                : "/straight-off-dome-icon.svg"
            }
            alt=""
            width={18}
            height={18}
            className="w-[18px] h-[18px] opacity-70"
          />
          {count} {unitLabel}{count === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-2.5">
          <svg className="w-[18px] h-[18px] text-smoke" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l2.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Edited {relativeTime(modifiedIso)}
        </span>
      </div>

      {/* Actions */}
      <div className="mt-3 px-1 grid grid-cols-3 gap-2 flex-1 items-end">
        <button
          type="button"
          onClick={() => router.push(cfg.editRoute(game.id))}
          className="btn-cta-ghost col-span-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px]"
        >
          <Image src="/edit-icon.svg" alt="" width={16} height={16} className="w-4 h-4" />
          Edit
        </button>
        <button
          type="button"
          onClick={handleStart}
          disabled={!canStart}
          className="col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-display font-semibold tracking-[-0.01em] rounded-full border-2 border-ink text-ink transition-[filter,transform] hover:brightness-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "var(--lime)" }}
          title={canStart ? "Start a live session" : `Add at least one ${unitLabel} first`}
        >
          <span className="inline-flex items-center justify-center w-4 h-4">
            <Image
              src="/host-game.svg"
              alt=""
              width={16}
              height={16}
              className="nav-icon-light"
            />
          </span>
          {starting ? "Starting…" : "Start Game"}
        </button>
      </div>

      {startError && <p className="mt-2 px-1 text-[11px] text-coral">{startError}</p>}
    </article>
  );
}

function CreateCard({ firstTime = false }: { firstTime?: boolean }) {
  const title = firstTime ? "Create your first game" : "New Game";
  const subtitle = firstTime
    ? "Pick a format from the library and host it in minutes."
    : "Start building another one";

  return (
    <Link
      href="/dashboard/library"
      className="block group h-full rounded-[24px] border-2 border-dashed border-dune hover:border-ink transition-colors"
    >
      <article className="h-full flex flex-col items-center justify-center text-center p-8 gap-4 min-h-[340px]">
        <span className="w-14 h-14 rounded-full flex items-center justify-center border-2 border-ink bg-coral transition-transform duration-200 group-hover:scale-110">
          <svg className="w-5 h-5 text-paper" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
          </svg>
        </span>
        <div>
          <h3 className="font-display font-semibold text-[20px] text-ink tracking-[-0.02em] leading-[1.1] mb-1">
            {title}
          </h3>
          <p className="text-[13px] text-smoke max-w-[220px]">
            {subtitle}
          </p>
        </div>
      </article>
    </Link>
  );
}
