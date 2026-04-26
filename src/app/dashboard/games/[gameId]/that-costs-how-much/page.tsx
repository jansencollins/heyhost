"use client";

import { useEffect, useState, useRef, use } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Modal } from "@/components/ui/modal";
import { generateGameCode } from "@/lib/game-code";
import { ThemePicker } from "@/components/games/ThemePicker";
import { DEFAULT_THEME } from "@/lib/theme-presets";
import type { Game, PriceIsRightItem, GameTheme, DisplayMode } from "@/lib/types";

type Tab = "howto" | "settings" | "items" | "preview";

const PRODUCT_IMAGES_BUCKET = "product-images";

/**
 * Format a raw numeric string for display with thousands separators.
 * `whole` keeps integers only; otherwise preserves the user's decimal input
 * (including a trailing "." or "4." while they're typing).
 *
 * The raw `price` state stays un-formatted — this is display-only. All
 * autosave math parses from the raw state, so commas never reach the DB.
 */
function formatPriceDisplay(raw: string, whole: boolean): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  // Keep the trailing "." the user just typed (e.g. "4." -> "4.") so the cursor feels right
  const endsWithDot = trimmed.endsWith(".") && !whole;
  const [intPart, decPart] = trimmed.split(".");
  const intNum = intPart === "" ? "" : intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (whole) return intNum;
  if (decPart !== undefined) return `${intNum}.${decPart}`;
  return endsWithDot ? `${intNum}.` : intNum;
}

/**
 * If a given image URL points to an object in our product-images bucket,
 * returns the storage path. Otherwise returns null (e.g. external URLs
 * like Amazon CDN — we don't own those and shouldn't delete them).
 */
function getProductImagePath(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const marker = `/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx < 0) return null;
    return decodeURIComponent(u.pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
}

export default function PIRGameDetailPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = use(params);
  const router = useRouter();
  const [game, setGame] = useState<Game | null>(null);
  const [items, setItems] = useState<PriceIsRightItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingSession, setStartingSession] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("items");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("tv");

  // Editable settings
  const [title, setTitle] = useState("");
  const [showPercent, setShowPercent] = useState(false);
  const [roundPrices, setRoundPrices] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [penaltyMargin, setPenaltyMargin] = useState(70);
  const [theme, setTheme] = useState<GameTheme>(DEFAULT_THEME.price_is_right);

  // Autosave
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedStatusTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSavedRef = useRef({ title: "", showPercent: false, roundPrices: false, isShared: false, penaltyMargin: 70 });

  useEffect(() => {
    loadGame();
    return () => {
      clearTimeout(settingsTimerRef.current);
      clearTimeout(savedStatusTimerRef.current);
    };
  }, [gameId]);

  async function loadGame() {
    const supabase = createClient();
    const { data: gameData } = await supabase
      .from("games")
      .select("*")
      .eq("id", gameId)
      .single();

    if (!gameData) {
      router.push("/dashboard");
      return;
    }

    // If not PIR, redirect back
    if (gameData.game_type !== "price_is_right") {
      router.replace(`/dashboard/games/${gameId}`);
      return;
    }

    setGame(gameData);
    setTitle(gameData.title);
    setShowPercent(gameData.show_percent || false);
    setRoundPrices(gameData.round_prices || false);
    setIsShared(gameData.is_shared || false);
    setPenaltyMargin(gameData.penalty_margin ?? 70);
    setTheme(gameData.theme || DEFAULT_THEME.price_is_right);
    lastSavedRef.current = {
      title: gameData.title,
      showPercent: gameData.show_percent || false,
      roundPrices: gameData.round_prices || false,
      isShared: gameData.is_shared || false,
      penaltyMargin: gameData.penalty_margin ?? 70,
    };

    // Load items
    const { data: itemsData } = await supabase
      .from("price_is_right_items")
      .select("*")
      .eq("game_id", gameId)
      .order("item_order", { ascending: true });

    setItems(itemsData || []);
    setLoading(false);
  }

  // Autosave settings
  useEffect(() => {
    if (!game) return;
    const last = lastSavedRef.current;
    if (
      title === last.title &&
      showPercent === last.showPercent &&
      roundPrices === last.roundPrices &&
      isShared === last.isShared &&
      penaltyMargin === last.penaltyMargin
    ) return;

    clearTimeout(settingsTimerRef.current);
    settingsTimerRef.current = setTimeout(async () => {
      if (!title.trim()) return;
      setSaveStatus("saving");
      try {
        const supabase = createClient();
        const { error: updateError } = await supabase
          .from("games")
          .update({
            title: title.trim(),
            show_percent: showPercent,
            round_prices: roundPrices,
            penalty_cheap: null,
            penalty_expensive: null,
            is_shared: isShared,
            penalty_margin: penaltyMargin,
            theme,
          })
          .eq("id", game.id);

        if (updateError) throw updateError;

        lastSavedRef.current = {
          title: title.trim(),
          showPercent,
          roundPrices,
          isShared,
          penaltyMargin,
        };
        setSaveStatus("saved");
        clearTimeout(savedStatusTimerRef.current);
        savedStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("error");
      }
    }, 800);
  }, [title, showPercent, roundPrices, isShared, penaltyMargin, theme, game]);

  async function handleAddItem() {
    if (!game) return;
    const supabase = createClient();
    const newOrder = items.length;
    const { data, error: insertError } = await supabase
      .from("price_is_right_items")
      .insert({
        game_id: game.id,
        item_order: newOrder,
        name: "New Item",
        price: 0,
        difficulty: "medium",
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setItems([...items, data]);
  }

  async function handleImportProduct(url: string): Promise<void> {
    if (!game) return;
    setError("");
    const res = await fetch("/api/import-product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Import failed");

    const supabase = createClient();
    const newOrder = items.length;
    const priceCents = typeof data.price === "number" ? Math.round(data.price * 100) : 0;
    const { data: inserted, error: insertError } = await supabase
      .from("price_is_right_items")
      .insert({
        game_id: game.id,
        item_order: newOrder,
        name: (data.name as string | null)?.trim() || "Untitled product",
        price: priceCents,
        image: (data.image as string | null) || null,
        description: null,
        difficulty: "medium",
      })
      .select()
      .single();

    if (insertError) throw new Error(insertError.message);
    setItems((prev) => [...prev, inserted]);
  }

  async function handleUpdateItem(itemId: string, updates: Partial<PriceIsRightItem>) {
    const supabase = createClient();
    const current = items.find((it) => it.id === itemId);

    // If the image field is being changed (replaced or cleared), garbage-collect
    // the old file if we own it in the product-images bucket.
    if (
      current &&
      Object.prototype.hasOwnProperty.call(updates, "image") &&
      updates.image !== current.image
    ) {
      const oldPath = getProductImagePath(current.image);
      if (oldPath) {
        supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([oldPath]).catch(() => {});
      }
    }

    await supabase
      .from("price_is_right_items")
      .update(updates)
      .eq("id", itemId);

    setItems(items.map((item) => (item.id === itemId ? { ...item, ...updates } : item)));
  }

  async function handleReorderItems(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
    const reordered = [...items];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    // Optimistic local reorder + index refresh
    const withOrder = reordered.map((it, i) => ({ ...it, item_order: i }));
    setItems(withOrder);
    // Persist — bulk update item_order values
    const supabase = createClient();
    await Promise.all(
      withOrder.map((it, i) =>
        supabase
          .from("price_is_right_items")
          .update({ item_order: i })
          .eq("id", it.id)
      )
    );
  }

  async function handleDeleteItem(itemId: string) {
    const supabase = createClient();
    const current = items.find((it) => it.id === itemId);

    // Clean up the stored image file (if any) before the row is removed.
    if (current) {
      const path = getProductImagePath(current.image);
      if (path) {
        supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]).catch(() => {});
      }
    }

    await supabase
      .from("price_is_right_items")
      .delete()
      .eq("id", itemId);

    setItems(items.filter((item) => item.id !== itemId));
  }

  async function handleStartSession() {
    if (!game || items.length === 0) return;
    setStartingSession(true);
    setError("");

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let code = generateGameCode();
      let attempts = 0;
      while (attempts < 5) {
        const { data: existing } = await supabase
          .from("sessions")
          .select("id")
          .eq("code", code)
          .neq("status", "finished")
          .maybeSingle();

        if (!existing) break;
        code = generateGameCode();
        attempts++;
      }

      const { data: session, error: sessionError } = await supabase
        .from("sessions")
        .insert({
          game_id: game.id,
          host_id: user.id,
          code,
          status: "lobby",
          current_question_index: -1,
          timer_seconds: 30,
          speed_bonus: false,
          display_mode: displayMode,
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Open the host console in a new tab so the editor stays put
      if (typeof window !== "undefined") {
        window.open(`/host/${session.id}`, "_blank", "noopener,noreferrer");
      }
      setStartingSession(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start session");
      setStartingSession(false);
    }
  }

  async function handleDeleteGame() {
    const supabase = createClient();
    await supabase.from("games").delete().eq("id", gameId);
    router.push("/dashboard");
  }

  // Keep the editor shell on screen even before `game` has loaded so the
  // layout doesn't pop in. Dynamic values use null-safe fallbacks below.
  return (
    <div>
      {/* Header bar + tabs (combined, connected to tab panel below) */}
      <div
        className="card-rebrand card-anchor relative z-10"
        style={{
          background: "var(--paper)",
          borderColor: "rgba(0,0,0,0.18)",
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          borderBottomWidth: 0,
          overflow: "visible",
        }}
      >
      <div className="p-6 lg:p-7 flex items-center gap-4">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-smoke hover:text-ink transition shrink-0"
          aria-label="Back"
          title="Back to dashboard"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <span
          className="w-12 h-12 rounded-full flex items-center justify-center border-2 border-ink shrink-0"
          style={{ background: "var(--teal)" }}
        >
          <Image
            src="/costs-how-much-icon.svg"
            alt=""
            width={28}
            height={28}
            className="nav-icon-light"
          />
        </span>

        <div className="flex-1 min-w-0">
          <h1 className="font-display font-bold text-[32px] text-ink tracking-[-0.025em] leading-[1.05] truncate">
            That Costs How Much!?
          </h1>
          {game?.title && (
            <p className="text-[18px] text-smoke font-medium mt-1 truncate">
              {game.title} Edition
            </p>
          )}
          {(saveStatus === "saving" || saveStatus === "saved" || saveStatus === "error") && (
            <p className="text-[13px] flex items-center gap-2 mt-1">
              {saveStatus === "saving" && <span className="text-smoke/70">Saving…</span>}
              {saveStatus === "saved" && <span className="text-teal-brand">Saved</span>}
              {saveStatus === "error" && <span className="text-coral">Error saving</span>}
            </p>
          )}
        </div>

        {/* Unified start cluster: display target + start button */}
        <div className="flex items-stretch rounded-full border-2 border-ink overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setDisplayMode("tv")}
            aria-pressed={displayMode === "tv"}
            className="flex items-center gap-1.5 px-4 text-xs font-display font-semibold transition-colors"
            style={{
              background: displayMode === "tv" ? "var(--ink)" : "var(--paper)",
              color: displayMode === "tv" ? "var(--paper)" : "var(--ink)",
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            TV
          </button>
          <button
            type="button"
            onClick={() => setDisplayMode("on_the_go")}
            aria-pressed={displayMode === "on_the_go"}
            className="flex items-center gap-1.5 px-4 text-xs font-display font-semibold border-l-2 border-ink transition-colors"
            style={{
              background: displayMode === "on_the_go" ? "var(--ink)" : "var(--paper)",
              color: displayMode === "on_the_go" ? "var(--paper)" : "var(--ink)",
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
            </svg>
            Phone
          </button>
          <button
            type="button"
            onClick={handleStartSession}
            disabled={items.length === 0 || startingSession}
            className="flex items-center gap-2 px-5 py-1.5 text-[14px] font-display font-semibold tracking-[-0.01em] border-l-2 border-ink transition-[filter,transform] disabled:opacity-60 disabled:cursor-not-allowed hover:brightness-95 active:scale-[0.98]"
            style={{ background: "var(--lime)", color: "var(--ink)" }}
          >
            <span className="inline-flex items-center justify-center w-7 h-7">
              <Image
                src="/host-game.svg"
                alt=""
                width={24}
                height={24}
                className="nav-icon-light"
              />
            </span>
            {startingSession ? "Starting…" : "Start Game"}
          </button>
        </div>

        <button
          onClick={() => setShowDeleteModal(true)}
          className="p-2 rounded-full text-smoke hover:text-coral hover:bg-[color-mix(in_srgb,var(--coral)_12%,var(--paper))] transition shrink-0"
          title="Delete game"
          aria-label="Delete game"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Tabs (inside the same card as the header) */}
      {(() => {
        const tabs: Tab[] = ["howto", "settings", "items", "preview"];
        const activeIdx = tabs.indexOf(activeTab);
        const activeCenterPct = ((activeIdx + 0.5) / tabs.length) * 100;
        return (
          <div className="relative flex border-t border-dune divide-x divide-dune">
            {tabs.map((tab) => {
              const label =
                tab === "howto"
                  ? "How to Play"
                  : tab === "settings"
                    ? "Gameplay Settings"
                    : tab === "items"
                      ? `Products (${items.length})`
                      : "Game Preview";
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-5 py-4 text-[17px] font-semibold font-display tracking-[-0.01em] transition ${
                    activeTab === tab
                      ? "bg-ink text-paper"
                      : "text-smoke hover:bg-dune/60 hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              );
            })}
            {/* Active indicator triangle — sibling of the buttons so nothing inside a button can clip it */}
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: `${activeCenterPct}%`,
                transform: "translateX(-50%)",
                bottom: "-11px",
                width: 0,
                height: 0,
                borderLeft: "12px solid transparent",
                borderRight: "12px solid transparent",
                borderTop: "12px solid var(--ink)",
                zIndex: 30,
                pointerEvents: "none",
              }}
            />
          </div>
        );
      })()}
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-[color-mix(in_srgb,var(--coral)_12%,var(--paper))] border border-[color-mix(in_srgb,var(--coral)_25%,transparent)] text-coral text-sm">
          {error}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div
          className="card-rebrand card-anchor tab-panel p-5 lg:p-6 pt-7 lg:pt-8 border-t-0 tab-panel-enter"
          style={{
            background: "#ECE3D0",
            boxShadow: "inset 0 6px 12px -6px rgba(0,0,0,0.18)",
            borderColor: "rgba(0,0,0,0.18)",
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
          }}
        >
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-5">
          {/* Row 1 — Title (wide) + Share (narrow) */}
          <section className="card-rebrand p-6 lg:col-span-4">
            <SettingsHeader
              title="Game Title"
              description="Name your game — this is what your players will see on their phones and the TV."
            />
            <div className="mt-5">
              <Input
                variant="paper"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Grocery Store Showdown"
                className="font-bold"
              />
            </div>
          </section>

          <section className="card-rebrand p-6 lg:col-span-2">
            <div className="flex items-start gap-4 mb-4">
              <span
                className="w-11 h-11 rounded-full flex items-center justify-center border-2 border-ink shrink-0"
                style={{ background: "var(--magenta)" }}
              >
                <Image
                  src="/host-network.svg"
                  alt=""
                  width={24}
                  height={24}
                  className="nav-icon-light"
                />
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-semibold text-[24px] text-ink tracking-[-0.02em] leading-[1.1] mb-1.5">
                  Host Network
                </h3>
                <p className="text-[13px] text-smoke leading-relaxed">
                  Publish this game so other hosts can discover and play it. Great games climb the leaderboard.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <span
                role="switch"
                aria-checked={isShared}
                className={`relative w-11 h-6 rounded-full border-2 border-ink shrink-0 transition-colors ${
                  isShared ? "bg-magenta-brand" : "bg-paper"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isShared}
                  onChange={(e) => setIsShared(e.target.checked)}
                  className="sr-only"
                />
                <span
                  className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-ink transition-transform"
                  style={{ transform: isShared ? "translateX(20px)" : "translateX(0)" }}
                />
              </span>
              <span className="text-[13px] text-ink font-medium">
                {isShared ? "Published" : "Keep private"}
              </span>
            </label>
          </section>

          {/* Row 2 — Price Format + Penalty Wheel */}
          <section className="card-rebrand p-6 lg:col-span-3">
            <SettingsHeader
              title="Price Format"
              description="How prices are shown to players when they guess."
            />
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowPercent(false)}
                className={`flex-1 rounded-2xl border-2 px-4 py-4 text-left transition ${
                  !showPercent
                    ? "border-ink bg-[color-mix(in_srgb,var(--dune)_60%,var(--paper))]"
                    : "border-dune bg-paper hover:border-ink/40"
                }`}
              >
                <div className="font-display font-bold text-[22px] text-ink mb-1">$</div>
                <div className="text-[13px] font-semibold text-ink">Dollars</div>
                <div className="text-[12px] text-smoke leading-snug mt-0.5">
                  Players guess the real retail price in dollars.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setShowPercent(true)}
                className={`flex-1 rounded-2xl border-2 px-4 py-4 text-left transition ${
                  showPercent
                    ? "border-ink bg-[color-mix(in_srgb,var(--dune)_60%,var(--paper))]"
                    : "border-dune bg-paper hover:border-ink/40"
                }`}
              >
                <div className="font-display font-bold text-[22px] text-ink mb-1">%</div>
                <div className="text-[13px] font-semibold text-ink">Percentages</div>
                <div className="text-[12px] text-smoke leading-snug mt-0.5">
                  Useful for approval ratings, survey results, or any 0–100 quiz.
                </div>
              </button>
            </div>

            {/* Whole-number toggle */}
            <label className="mt-4 flex items-start gap-3 rounded-2xl border-2 border-dune px-4 py-3 cursor-pointer select-none hover:border-ink/40 transition-colors">
              <span
                role="switch"
                aria-checked={roundPrices}
                className={`relative w-11 h-6 rounded-full border-2 border-ink shrink-0 transition-colors mt-0.5 ${
                  roundPrices ? "bg-coral" : "bg-paper"
                }`}
              >
                <input
                  type="checkbox"
                  checked={roundPrices}
                  onChange={(e) => setRoundPrices(e.target.checked)}
                  className="sr-only"
                />
                <span
                  className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-ink transition-transform"
                  style={{ transform: roundPrices ? "translateX(20px)" : "translateX(0)" }}
                />
              </span>
              <span className="flex-1">
                <span className="block text-[14px] font-display font-semibold text-ink">
                  Whole numbers only
                </span>
                <span className="block text-[12px] text-smoke leading-snug mt-0.5">
                  Rounds product {showPercent ? "values" : "prices"} to the nearest whole{" "}
                  {showPercent ? "percent" : "dollar"} and stops players from entering decimals during the game.
                </span>
              </span>
            </label>
          </section>

          {/* Penalty wheel */}
          <section className="card-rebrand p-6 lg:col-span-3">
            <SettingsHeader
              title="Penalty Wheel"
              description="After each round, everyone who guessed worse than this accuracy gets added to the wheel. One spin picks who takes the penalty."
            />
            <div className="mt-5 flex items-center gap-6">
              <MiniWheel percent={penaltyMargin} />
              <div className="flex-1">
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="font-display font-bold text-[44px] text-ink leading-none tabular-nums">
                    {penaltyMargin}
                  </span>
                  <span className="font-display font-bold text-[22px] text-smoke">%</span>
                  <span className="ml-auto text-[12px] text-smoke">margin</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={penaltyMargin}
                  onChange={(e) => setPenaltyMargin(Number(e.target.value))}
                  className="range-rebrand w-full"
                  style={{
                    background: `linear-gradient(to right, var(--coral) 0%, var(--coral) ${penaltyMargin}%, var(--dune) ${penaltyMargin}%, var(--dune) 100%)`,
                  }}
                />
                <div className="mt-3 flex items-center justify-between text-[11px] text-smoke">
                  <span>Forgiving (1%)</span>
                  <span>Ruthless (100%)</span>
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-[color-mix(in_srgb,var(--sunflower)_18%,var(--paper))] border border-[color-mix(in_srgb,var(--sunflower)_40%,transparent)] px-4 py-3 text-[12px] text-ink leading-relaxed">
              <span className="font-semibold">Recommended: 70%.</span>{" "}
              Most groups land here. Lower numbers reward only near-perfect guesses.
            </div>
          </section>

          {/* Theme */}
          <section className="card-rebrand p-6 lg:col-span-6">
            <SettingsHeader
              title="Theme"
              description="How the game looks on the TV and on players' phones while you host."
            />
            <div className="mt-5">
              <ThemePicker value={theme} onChange={setTheme} />
            </div>
          </section>
        </div>
        </div>
      )}

      {/* Products Tab */}
      {activeTab === "items" && (
        <div
          className="card-rebrand card-anchor tab-panel p-5 lg:p-6 pt-7 lg:pt-8 border-t-0 tab-panel-enter"
          style={{
            background: "#ECE3D0",
            boxShadow: "inset 0 6px 12px -6px rgba(0,0,0,0.18)",
            borderColor: "rgba(0,0,0,0.18)",
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
          }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
            {/* Product list */}
            <ProductList
              gameId={gameId}
              items={items}
              showPercent={showPercent}
              roundPrices={roundPrices}
              onUpdate={handleUpdateItem}
              onDelete={handleDeleteItem}
              onReorder={handleReorderItems}
              onAdd={handleAddItem}
            />
            {/* Import sidebar */}
            <aside className="lg:sticky lg:top-4 lg:self-start">
              <UrlImport onImport={handleImportProduct} />
            </aside>
          </div>
        </div>
      )}

      {/* How to Play Tab */}
      {activeTab === "howto" && (
        <div
          className="card-rebrand card-anchor tab-panel p-5 lg:p-6 pt-7 lg:pt-8 border-t-0 tab-panel-enter"
          style={{
            background: "#ECE3D0",
            boxShadow: "inset 0 6px 12px -6px rgba(0,0,0,0.18)",
            borderColor: "rgba(0,0,0,0.18)",
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
          }}
        >
          <HowToPlay />
        </div>
      )}

      {/* Game Preview Tab — placeholder for now */}
      {activeTab === "preview" && (
        <div
          className="card-rebrand card-anchor tab-panel p-5 lg:p-6 pt-7 lg:pt-8 border-t-0 tab-panel-enter"
          style={{
            background: "#ECE3D0",
            boxShadow: "inset 0 6px 12px -6px rgba(0,0,0,0.18)",
            borderColor: "rgba(0,0,0,0.18)",
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
          }}
        >
          <div className="min-h-[320px] flex items-center justify-center text-center text-smoke text-[14px]">
            Game preview coming soon.
          </div>
        </div>
      )}

      {/* Delete Modal */}
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Game"
      >
        <p className="text-sm text-smoke mb-4">
          Are you sure you want to delete this game? This cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="cta-ghost" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
          <Button variant="cta-danger" onClick={handleDeleteGame}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================
// Product list — draggable compact rows
// ============================================================

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB raw input
const MAX_OUTPUT_PX = 1200;

function ProductList({
  gameId,
  items,
  showPercent,
  roundPrices,
  onUpdate,
  onDelete,
  onReorder,
  onAdd,
}: {
  gameId: string;
  items: PriceIsRightItem[];
  showPercent: boolean;
  roundPrices: boolean;
  onUpdate: (itemId: string, updates: Partial<PriceIsRightItem>) => void;
  onDelete: (itemId: string) => void;
  onReorder: (fromIdx: number, toIdx: number) => void;
  onAdd: () => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [preview, setPreview] = useState<
    { url: string; name: string; itemId: string } | null
  >(null);
  const [cropper, setCropper] = useState<{ file: File; itemId: string } | null>(null);
  const [picker, setPicker] = useState<{ itemId: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function handleDrop(toIdx: number) {
    if (dragFrom !== null) onReorder(dragFrom, toIdx);
    setDragFrom(null);
    setDragOver(null);
  }

  function openPicker(itemId: string) {
    setUploadError(null);
    setPicker({ itemId });
  }

  function startCropperWithFile(itemId: string, file: File) {
    setUploadError(null);
    if (!file.type.startsWith("image/")) {
      setUploadError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. Max allowed is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`
      );
      return;
    }
    setPicker(null);
    setCropper({ file, itemId });
  }

  async function handleCropSave(blob: Blob) {
    if (!cropper) return;
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const fileName = `${user.id}/${gameId}/${cropper.itemId}-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(fileName, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw upErr;
      const {
        data: { publicUrl },
      } = supabase.storage.from("product-images").getPublicUrl(fileName);
      onUpdate(cropper.itemId, { image: publicUrl });
      setCropper(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  // Close preview on Escape
  useEffect(() => {
    if (!preview) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPreview(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  return (
    <div>
      {items.length > 0 && (
        <div className="grid grid-cols-[24px_56px_minmax(0,1fr)_auto_80px] gap-3 px-4 mb-2 text-[10px] uppercase tracking-wider font-display font-semibold text-smoke">
          <span />
          <span />
          <span>Product</span>
          <span className="text-right">{showPercent ? "Value" : "Price"}</span>
          <span />
        </div>
      )}

      <div className="space-y-2">
        {items.map((item, idx) => (
          <PIRProductRow
            key={item.id}
            item={item}
            index={idx}
            showPercent={showPercent}
            roundPrices={roundPrices}
            isDragOver={dragOver === idx && dragFrom !== idx}
            onUpdate={(u) => onUpdate(item.id, u)}
            onDelete={() => onDelete(item.id)}
            onPreview={(url, name) => setPreview({ url, name, itemId: item.id })}
            onOpenPicker={() => openPicker(item.id)}
            onFileDropped={(file) => startCropperWithFile(item.id, file)}
            onDragStart={() => setDragFrom(idx)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(idx);
            }}
            onDragLeave={() => setDragOver((v) => (v === idx ? null : v))}
            onDragEnd={() => {
              setDragFrom(null);
              setDragOver(null);
            }}
            onDrop={() => handleDrop(idx)}
          />
        ))}
      </div>

      {uploadError && (
        <p className="mt-3 text-[12px] text-coral">{uploadError}</p>
      )}

      {picker && (
        <ImagePickerModal
          onCancel={() => setPicker(null)}
          onFile={(file) => startCropperWithFile(picker.itemId, file)}
          onUrl={(url) => {
            const target = picker.itemId;
            setPicker(null);
            onUpdate(target, { image: url });
          }}
        />
      )}

      {cropper && (
        <ImageCropperModal
          file={cropper.file}
          onCancel={() => setCropper(null)}
          onSave={handleCropSave}
        />
      )}

      <button
        onClick={onAdd}
        className="group w-full mt-3 rounded-2xl border-2 border-dashed border-dune hover:border-ink transition-colors flex items-center justify-center gap-3 py-4 text-center"
      >
        <span className="w-9 h-9 rounded-full flex items-center justify-center border-2 border-ink bg-coral transition-transform duration-200 group-hover:scale-110">
          <svg className="w-4 h-4 text-paper" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
          </svg>
        </span>
        <span className="font-display font-semibold text-[14px] text-ink">
          Add another product manually
        </span>
      </button>

      {preview && typeof document !== "undefined" && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview of ${preview.name}`}
          onClick={() => setPreview(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          style={{
            background: "color-mix(in srgb, var(--ink) 70%, transparent)",
            backdropFilter: "blur(8px)",
            animation: "modal-backdrop-enter 0.35s ease both",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card-rebrand p-4 max-w-3xl w-full"
            style={{ animation: "modal-card-enter 0.75s cubic-bezier(0.22, 1.2, 0.36, 1) both" }}
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <h3 className="font-display font-semibold text-[20px] text-ink tracking-[-0.02em] leading-[1.1] truncate">
                {preview.name}
              </h3>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="Close"
                className="p-1.5 rounded-full text-smoke hover:text-ink hover:bg-dune/60 transition shrink-0"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden bg-dune flex items-center justify-center max-h-[70vh]">
              <img
                src={preview.url}
                alt={preview.name}
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>
            <div className="mt-3 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  const id = preview.itemId;
                  setPreview(null);
                  onUpdate(id, { image: null });
                }}
                className="inline-flex items-center justify-center gap-1 px-4 py-2 text-[13px] font-display font-semibold rounded-full border border-dune text-smoke hover:text-coral hover:border-coral transition-colors"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = preview.itemId;
                  setPreview(null);
                  openPicker(id);
                }}
                className="btn-cta-ghost inline-flex items-center justify-center gap-2 px-4 py-2 text-[13px]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                Replace
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function PIRProductRow({
  item,
  index,
  showPercent,
  roundPrices,
  isDragOver,
  onUpdate,
  onDelete,
  onPreview,
  onOpenPicker,
  onFileDropped,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDragEnd,
  onDrop,
}: {
  item: PriceIsRightItem;
  index: number;
  showPercent: boolean;
  roundPrices: boolean;
  isDragOver: boolean;
  onUpdate: (updates: Partial<PriceIsRightItem>) => void;
  onDelete: () => void;
  onPreview: (url: string, name: string) => void;
  onOpenPicker: () => void;
  onFileDropped: (file: File) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(showPercent ? String(item.price) : String(item.price / 100));
  const [description, setDescription] = useState(item.description || "");
  const [imageError, setImageError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Image is controlled by the parent (updated via onUpdate). We read it
  // directly from `item` so cropper/remove actions instantly reflect here.
  const image = item.image || "";

  // File drag-and-drop (external files only — dataTransfer.types contains "Files")
  const [fileDragOver, setFileDragOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Track price input focus — format with commas only while blurred
  const [priceFocused, setPriceFocused] = useState(false);

  // Snap decimals out when whole-number mode toggles on
  useEffect(() => {
    if (!roundPrices) return;
    const n = parseFloat(price);
    if (isNaN(n)) return;
    const rounded = String(Math.round(n));
    if (rounded !== price) setPrice(rounded);
  }, [roundPrices]);

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      let priceValue: number;
      if (showPercent) {
        priceValue = parseInt(price) || 0;
      } else {
        const dollars = parseFloat(price) || 0;
        const normalized = roundPrices ? Math.round(dollars) : dollars;
        priceValue = Math.round(normalized * 100);
      }
      onUpdate({
        name: name.trim() || "Untitled",
        price: priceValue,
        description: description.trim() || null,
      });
    }, 800);
    return () => clearTimeout(timerRef.current);
  }, [name, price, description, roundPrices]);

  useEffect(() => {
    setImageError(false);
  }, [image]);

  const showImage = image && !imageError;

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
        onDragStart();
      }}
      onDragOver={(e) => {
        const isFile = Array.from(e.dataTransfer.types).includes("Files");
        if (isFile) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "copy";
          if (!fileDragOver) setFileDragOver(true);
          return;
        }
        onDragOver(e);
      }}
      onDragLeave={(e) => {
        if (fileDragOver) setFileDragOver(false);
        onDragLeave();
      }}
      onDragEnd={() => {
        setFileDragOver(false);
        onDragEnd();
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          setFileDragOver(false);
          onFileDropped(e.dataTransfer.files[0]);
          return;
        }
        onDrop();
      }}
      className={`card-rebrand px-3 py-3 relative transition-all ${
        fileDragOver
          ? "border-coral ring-2 ring-coral/40"
          : isDragOver
            ? "border-ink ring-2 ring-ink/20"
            : ""
      }`}
      style={{ overflow: "visible", zIndex: confirmDelete ? 30 : "auto" }}
    >
      <div className="grid grid-cols-[24px_56px_minmax(0,1fr)_auto_80px] gap-3 items-center">
        {/* Drag handle */}
        <span
          className="flex items-center justify-center text-smoke hover:text-ink cursor-grab active:cursor-grabbing select-none"
          title="Drag to reorder"
          aria-label="Drag to reorder"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
            <circle cx="7" cy="5" r="1.4" />
            <circle cx="7" cy="10" r="1.4" />
            <circle cx="7" cy="15" r="1.4" />
            <circle cx="13" cy="5" r="1.4" />
            <circle cx="13" cy="10" r="1.4" />
            <circle cx="13" cy="15" r="1.4" />
          </svg>
        </span>

        {/* Thumbnail — click to preview when an image is set, click to upload otherwise */}
        {showImage ? (
          <button
            type="button"
            onClick={() => onPreview(image, name || "Product")}
            className="w-14 h-14 rounded-xl bg-dune overflow-hidden relative shrink-0 cursor-zoom-in group/thumb focus:outline-none focus:ring-2 focus:ring-ink"
            title="View image"
          >
            <img
              src={image}
              alt={name}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
            <span className="absolute inset-0 bg-ink/0 group-hover/thumb:bg-ink/30 transition-colors flex items-center justify-center">
              <svg
                className="w-5 h-5 text-paper opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenPicker}
            title="Add image"
            aria-label="Add product image"
            className="w-14 h-14 rounded-xl bg-dune overflow-hidden relative shrink-0 cursor-pointer group/thumb border-2 border-dashed border-transparent hover:border-ink hover:bg-[color-mix(in_srgb,var(--dune)_80%,var(--paper))] transition-colors focus:outline-none focus:ring-2 focus:ring-ink"
          >
            <div className="absolute inset-0 flex items-center justify-center text-ink/40 group-hover/thumb:text-ink transition-colors">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
          </button>
        )}

        {/* Name — inline edit */}
        <div className="min-w-0 flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 mr-2 rounded-full bg-dune border border-ink/20 font-display font-medium text-[13px] text-ink tabular-nums shrink-0 leading-none">
            #{index + 1}
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Product name"
            className="flex-1 min-w-0 font-body font-bold text-[16px] text-ink bg-transparent border-0 outline-none focus:bg-[color-mix(in_srgb,var(--dune)_40%,transparent)] rounded-md px-2 -ml-2 py-1 placeholder:text-ink/30 transition-colors overflow-hidden text-ellipsis whitespace-nowrap"
            title={name}
          />
        </div>

        {/* Price compact — auto-widths to the typed number via `field-sizing: content` */}
        <label className="bg-paper border border-dune rounded-[var(--r-md)] inline-flex items-baseline gap-1 pl-4 pr-4 py-2 cursor-text focus-within:border-coral focus-within:shadow-[0_0_0_1px_var(--coral)] w-fit justify-self-end">
          {!showPercent && (
            <span className="font-body font-bold text-[14px] text-ink select-none">$</span>
          )}
          <input
            type="text"
            inputMode={roundPrices || showPercent ? "numeric" : "decimal"}
            value={priceFocused ? price : formatPriceDisplay(price, roundPrices || showPercent)}
            onFocus={() => setPriceFocused(true)}
            onBlur={() => setPriceFocused(false)}
            onChange={(e) => {
              // Strip commas and any non-numeric chars (except decimal)
              const cleaned = e.target.value.replace(/,/g, "");
              // Only allow digits and a single decimal (if fractions allowed)
              const allowDec = !(roundPrices || showPercent);
              const match = cleaned.match(allowDec ? /^\d*\.?\d*/ : /^\d*/);
              setPrice(match ? match[0] : "");
            }}
            size={1}
            placeholder={roundPrices || showPercent ? "0" : "0.00"}
            className="bg-transparent border-0 outline-none text-right font-body font-bold text-[14px] text-ink tabular-nums placeholder:text-ink/30 min-w-[3ch] [field-sizing:content]"
          />
          {showPercent && (
            <span className="font-body font-bold text-[14px] text-ink select-none">%</span>
          )}
        </label>

        {/* Actions */}
        <div className="flex items-center justify-end gap-1 ml-4">
          <button
            type="button"
            onClick={() => setExpanded((x) => !x)}
            aria-label={expanded ? "Hide details" : "Edit details"}
            title={expanded ? "Hide details" : "Edit details"}
            className={`p-1.5 rounded-full text-smoke hover:text-ink transition ${
              expanded ? "bg-dune text-ink" : "hover:bg-dune/50"
            }`}
          >
            <svg
              className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Remove"
              title="Remove"
              className={`p-1.5 rounded-full transition ${
                confirmDelete
                  ? "text-coral bg-[color-mix(in_srgb,var(--coral)_10%,var(--paper))]"
                  : "text-smoke hover:text-coral hover:bg-[color-mix(in_srgb,var(--coral)_10%,var(--paper))]"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            {confirmDelete && (
              <div
                className="absolute right-0 top-full mt-2 z-20 w-60 rounded-2xl p-3 shadow-[0_10px_40px_-16px_rgba(26,20,18,0.25)]"
                style={{ background: "var(--paper)", border: "2px solid var(--ink)" }}
              >
                <p className="text-[13px] text-ink font-medium mb-3">Delete this product?</p>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 text-[13px] font-display font-semibold rounded-full border border-dune text-ink hover:bg-dune/60 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDelete();
                      setConfirmDelete(false);
                    }}
                    className="px-3 py-1.5 text-[13px] font-display font-semibold rounded-full text-paper"
                    style={{ background: "#B91C1C" }}
                  >
                    Yes, delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pl-[95px] pr-1">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider font-semibold text-smoke mb-1">
              Description
            </span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              className="input-rebrand w-full text-[13px] py-2"
            />
          </label>
        </div>
      )}
    </article>
  );
}

// ============================================================
// URL import (paste retailer link to auto-fill product)
// ============================================================

function UrlImport({ onImport }: { onImport: (url: string) => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  async function run() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setMsg(null);
    try {
      await onImport(trimmed);
      setUrl("");
      setMsg({ kind: "info", text: "Added from link. Double-check the name and price before hosting." });
      window.setTimeout(() => setMsg(null), 5000);
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Import failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card-rebrand p-5">
      <div>
        <span
          className="w-14 h-14 rounded-full flex items-center justify-center border-2 border-ink bg-coral overflow-hidden mb-3"
          aria-hidden
        >
          <Image
            src="/cart-link.svg"
            alt=""
            width={28}
            height={28}
            className="nav-icon-light max-w-none"
          />
        </span>
        <div className="min-w-0">
          <h3 className="font-display font-semibold text-[24px] text-ink tracking-[-0.02em] leading-[1.1] mb-1.5">
            Paste a product link
          </h3>
          <p className="text-[13px] text-smoke mb-3 leading-relaxed">
            Drop in an Amazon, Target, Walmart, Best Buy, Etsy, or Shopify product URL and we&apos;ll pull in the name, price, and image. Amazon sometimes blocks automated requests — if that happens, add the product manually.
          </p>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!loading) run();
            }}
          >
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.amazon.com/dp/…"
              className="input-rebrand w-full text-[14px] py-2.5"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="btn-cta w-full px-5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Importing…" : "Import"}
            </button>
          </form>
          {msg && (
            <p
              className={`mt-3 text-[12px] ${
                msg.kind === "error" ? "text-coral" : "text-teal-brand"
              }`}
            >
              {msg.text}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Mini wheel visualization for the penalty margin slider
// ============================================================

function MiniWheel({ percent }: { percent: number }) {
  const size = 96;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const penaltyLength = (Math.min(Math.max(percent, 0), 100) / 100) * circumference;
  const center = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      aria-hidden
    >
      {/* Safe (ink) ring — full circle */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="transparent"
        stroke="var(--ink)"
        strokeWidth="14"
      />
      {/* Penalty (coral) arc — proportion of circle matching the margin */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="transparent"
        stroke="var(--coral)"
        strokeWidth="14"
        strokeDasharray={`${penaltyLength} ${circumference}`}
        transform={`rotate(-90 ${center} ${center})`}
      />
      {/* Ink outline rings to match card style */}
      <circle
        cx={center}
        cy={center}
        r={radius + 7}
        fill="transparent"
        stroke="var(--ink)"
        strokeWidth="1.5"
      />
      <circle
        cx={center}
        cy={center}
        r={radius - 7}
        fill="transparent"
        stroke="var(--ink)"
        strokeWidth="1.5"
      />
    </svg>
  );
}

// ============================================================
// Small reusable settings section header
// ============================================================

function SettingsHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="font-display font-semibold text-[24px] text-ink tracking-[-0.02em] leading-[1.1] mb-1.5">
        {title}
      </h3>
      <p className="text-[13px] text-smoke leading-relaxed">{description}</p>
    </div>
  );
}

// ============================================================
// How-to-play tab content
// ============================================================

function HowToPlay() {
  const steps: { title: string; body: string }[] = [
    {
      title: "You host, they play",
      body:
        "Share the on-screen code and join link. Everyone joins from their phone. You drive the pace from the host remote.",
    },
    {
      title: "A product appears",
      body:
        "Each round, one of your products shows on the TV or main display. Players see the name and image — but not the price.",
    },
    {
      title: "Players guess the price",
      body:
        "Everyone locks in a guess on their phone before the timer runs out. Closer guesses earn more points — an exact guess takes the round.",
    },
    {
      title: "The penalty wheel spins",
      body:
        "Anyone whose guess fell outside your margin gets their name added to the wheel. One spin picks who takes the penalty. Fast guesses still count — the wheel is pure luck.",
    },
    {
      title: "Leaderboard and finale",
      body:
        "Scores update after every round. After the last product, the leaderboard picks the winner. Rematch, switch games, or end the session from your host remote.",
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
      {/* Left column — hero + vertically stacked steps */}
      <div className="space-y-4 self-start" style={{ animationDelay: "0ms" }}>
        <section className="card-rebrand p-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1 max-w-2xl">
              <h2 className="font-display font-bold text-[28px] text-ink tracking-[-0.02em] leading-[1.05] mb-2">
                How That Costs How Much!? plays
              </h2>
              <p className="text-[14px] text-smoke leading-relaxed">
                Fast-paced, part guessing game, part retail trivia. Build a lineup of products, set the
                penalty wheel margin, and watch the room get competitive. 2–12 players works best.
              </p>
            </div>
            <div className="flex gap-2 text-[12px] text-smoke shrink-0">
              <span className="chip-rebrand chip-accent-teal">2–12 players</span>
              <span className="chip-rebrand chip-accent-violet">~15 min</span>
            </div>
          </div>
        </section>

        {steps.map((step, i) => (
          <article key={step.title} className="card-rebrand p-6 flex gap-5">
            <span
              className="w-11 h-11 rounded-full border-2 border-ink flex items-center justify-center shrink-0 font-display font-bold text-[18px] text-ink bg-[color-mix(in_srgb,var(--sunflower)_40%,var(--paper))]"
            >
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-semibold text-[18px] text-ink tracking-[-0.01em] mb-1.5">
                {step.title}
              </h3>
              <p className="text-[13px] text-smoke leading-relaxed">{step.body}</p>
            </div>
          </article>
        ))}
      </div>

      {/* Right sidebar — host tips */}
      <aside className="self-start" style={{ animationDelay: "0ms" }}>
        <section className="card-rebrand p-6">
          <div className="flex items-center gap-3 mb-4">
            <span
              className="w-9 h-9 rounded-full border-2 border-ink flex items-center justify-center shrink-0 bg-[color-mix(in_srgb,var(--sunflower)_40%,var(--paper))]"
              aria-hidden
            >
              <svg className="w-4 h-4 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </span>
            <h3 className="font-display font-semibold text-[18px] text-ink tracking-[-0.01em]">
              Host tips
            </h3>
          </div>
          <ul className="space-y-3 text-[13px] text-smoke leading-relaxed">
            <li className="flex gap-2">
              <span className="text-ink font-semibold mt-0.5">•</span>
              <span>6–10 products per game is the sweet spot. Any more and energy drops off.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-ink font-semibold mt-0.5">•</span>
              <span>Mix everyday items (milk, a light bulb) with oddly expensive ones (espresso machine, designer sneakers) for the best &ldquo;wait, really?&rdquo; reactions.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-ink font-semibold mt-0.5">•</span>
              <span>A 70% penalty wheel margin is the easy default. Drop it lower if the group is good, raise it if you want pure chaos.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-ink font-semibold mt-0.5">•</span>
              <span>Paste a retailer link in the Products tab to skip typing — we&apos;ll pull the name, image, and price.</span>
            </li>
          </ul>
        </section>
      </aside>
    </div>
  );
}

// ============================================================
// Image cropper — square crop + auto-resize to MAX_OUTPUT_PX
// ============================================================

function ImageCropperModal({
  file,
  onCancel,
  onSave,
}: {
  file: File;
  onCancel: () => void;
  onSave: (blob: Blob) => Promise<void> | void;
}) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const viewportSize = 380; // px

  // Read file into an image src
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () => setImageSrc(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }, [file]);

  // Decode image so we know natural dimensions
  useEffect(() => {
    if (!imageSrc) return;
    const image = new window.Image();
    image.onload = () => setImg(image);
    image.src = imageSrc;
  }, [imageSrc]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Base scale so the image covers the viewport at zoom=1
  const baseScale = img ? Math.max(viewportSize / img.naturalWidth, viewportSize / img.naturalHeight) : 1;
  const totalScale = baseScale * zoom;
  const displayW = img ? img.naturalWidth * totalScale : 0;
  const displayH = img ? img.naturalHeight * totalScale : 0;

  // Clamp offset so we can't pan the image out of the crop window
  function clampOffset(ox: number, oy: number) {
    const maxX = Math.max(0, (displayW - viewportSize) / 2);
    const maxY = Math.max(0, (displayH - viewportSize) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, ox)),
      y: Math.min(maxY, Math.max(-maxY, oy)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffset(clampOffset(dragStartRef.current.ox + dx, dragStartRef.current.oy + dy));
  }

  function onPointerUp() {
    setDragging(false);
    dragStartRef.current = null;
  }

  // Re-clamp offset when zoom changes so the image stays within bounds
  useEffect(() => {
    setOffset((o) => clampOffset(o.x, o.y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, img]);

  async function handleSave() {
    if (!img) return;
    setSaving(true);
    try {
      // In source-image coords, what rect are we cropping?
      // Viewport center in display space = center of image + offset.
      // So center of crop in image coords = (imgW/2 - offset.x / totalScale, imgH/2 - offset.y / totalScale)
      const cropSizeDisplay = viewportSize;
      const cropSizeSource = cropSizeDisplay / totalScale;
      const cx = img.naturalWidth / 2 - offset.x / totalScale;
      const cy = img.naturalHeight / 2 - offset.y / totalScale;
      const sx = Math.max(0, cx - cropSizeSource / 2);
      const sy = Math.max(0, cy - cropSizeSource / 2);
      const sw = Math.min(cropSizeSource, img.naturalWidth - sx);
      const sh = Math.min(cropSizeSource, img.naturalHeight - sy);

      // Output canvas size — capped at MAX_OUTPUT_PX
      const outputSize = Math.min(MAX_OUTPUT_PX, Math.round(cropSizeSource));
      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outputSize, outputSize);

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85)
      );
      if (!blob) throw new Error("Could not encode image");

      await onSave(blob);
    } catch (err) {
      console.error(err);
      setSaving(false);
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crop product image"
      className="fixed inset-0 z-[110] flex items-center justify-center p-6"
      style={{
        background: "color-mix(in srgb, var(--ink) 70%, transparent)",
        backdropFilter: "blur(8px)",
        animation: "modal-backdrop-enter 0.35s ease both",
      }}
    >
      <div
        className="card-rebrand p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "modal-card-enter 0.75s cubic-bezier(0.22, 1.2, 0.36, 1) both" }}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="font-display font-semibold text-[22px] text-ink tracking-[-0.02em] leading-[1.1]">
              Crop image
            </h3>
            <p className="text-[12px] text-smoke mt-0.5">
              Drag to pan, zoom with the slider. We&apos;ll resize to {MAX_OUTPUT_PX}px max.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="p-1.5 rounded-full text-smoke hover:text-ink hover:bg-dune/60 transition shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Crop viewport */}
        <div
          className="relative mx-auto rounded-2xl overflow-hidden bg-dune select-none"
          style={{ width: viewportSize, height: viewportSize, touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img.src}
              alt=""
              draggable={false}
              className="absolute top-1/2 left-1/2 max-w-none pointer-events-none"
              style={{
                width: displayW,
                height: displayH,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                cursor: dragging ? "grabbing" : "grab",
              }}
            />
          )}
          {/* Ink frame overlay so the crop region reads as a frame */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none rounded-2xl"
            style={{ boxShadow: "inset 0 0 0 2px var(--ink)" }}
          />
        </div>

        {/* Zoom control */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-smoke">Zoom</span>
            <span className="text-[11px] font-display font-semibold text-ink tabular-nums">
              {zoom.toFixed(1)}×
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={4}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="range-rebrand w-full"
          />
        </div>

        <div className="mt-6 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="btn-cta-ghost px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!img || saving}
            className="btn-cta px-5 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Uploading…" : "Save image"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ============================================================
// Image picker — unified modal for drag-drop, file upload, or URL
// ============================================================

function ImagePickerModal({
  onCancel,
  onFile,
  onUrl,
}: {
  onCancel: () => void;
  onFile: (file: File) => void;
  onUrl: (url: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [urlError, setUrlError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function submitUrl() {
    const trimmed = urlDraft.trim();
    if (!trimmed) return;
    try {
      const parsed = new URL(trimmed);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("bad");
      onUrl(parsed.toString());
    } catch {
      setUrlError("Enter a valid http(s) URL.");
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add product image"
      onClick={onCancel}
      className="fixed inset-0 z-[105] flex items-center justify-center p-6"
      style={{
        background: "color-mix(in srgb, var(--ink) 70%, transparent)",
        backdropFilter: "blur(8px)",
        animation: "modal-backdrop-enter 0.35s ease both",
      }}
    >
      <div
        className="card-rebrand p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "modal-card-enter 0.75s cubic-bezier(0.22, 1.2, 0.36, 1) both" }}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="font-display font-semibold text-[22px] text-ink tracking-[-0.02em] leading-[1.1]">
              Add image
            </h3>
            <p className="text-[12px] text-smoke mt-0.5">
              Drag an image in, browse for a file, or paste a URL.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="p-1.5 rounded-full text-smoke hover:text-ink hover:bg-dune/60 transition shrink-0"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            if (!Array.from(e.dataTransfer.types).includes("Files")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            if (!dragOver) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            if (!Array.from(e.dataTransfer.types).includes("Files")) return;
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
          className={`rounded-2xl border-2 border-dashed transition-colors px-6 py-10 text-center ${
            dragOver
              ? "border-coral bg-[color-mix(in_srgb,var(--coral)_10%,var(--paper))]"
              : "border-dune bg-[color-mix(in_srgb,var(--dune)_35%,var(--paper))] hover:border-ink/40"
          }`}
        >
          <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-coral border-2 border-ink flex items-center justify-center">
            <svg
              className="w-5 h-5 text-paper"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <p className="font-display font-semibold text-[15px] text-ink mb-1">
            Drop an image here
          </p>
          <p className="text-[12px] text-smoke mb-3">
            JPG or PNG, up to {MAX_UPLOAD_BYTES / 1024 / 1024}MB.
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-cta-ghost px-4 py-2 text-[13px]"
          >
            Browse files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                // Reset so selecting the same file twice still fires change
                e.target.value = "";
                onFile(f);
              }
            }}
          />
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <span className="flex-1 h-px bg-dune" />
          <span className="text-[11px] uppercase tracking-wider text-smoke">or</span>
          <span className="flex-1 h-px bg-dune" />
        </div>

        {/* URL paste */}
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider font-semibold text-smoke mb-1.5">
            Image URL
          </span>
          <div className="flex gap-2">
            <input
              type="url"
              value={urlDraft}
              onChange={(e) => {
                setUrlDraft(e.target.value);
                if (urlError) setUrlError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitUrl();
                }
              }}
              placeholder="https://…"
              className="input-rebrand flex-1 text-[14px] py-2.5"
            />
            <button
              type="button"
              onClick={submitUrl}
              disabled={!urlDraft.trim()}
              className="btn-cta px-5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Use
            </button>
          </div>
          {urlError && <p className="mt-1.5 text-[12px] text-coral">{urlError}</p>}
        </label>
      </div>
    </div>,
    document.body,
  );
}
