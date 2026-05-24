"use client";

import { useEffect, useState, use, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Modal } from "@/components/ui/modal";
import { SMGamePreview } from "@/components/games/sm/Preview";
import { generateGameCode } from "@/lib/game-code";
import { DEFAULT_THEME } from "@/lib/theme-presets";
import type {
  Game,
  GameTheme,
  SMGameMode,
  SMScoringVersion,
  StalkMarketQuestion,
} from "@/lib/types";

type Tab = "howto" | "settings" | "questions" | "preview";

export default function StalkMarketEditPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const t = searchParams?.get("tab");
    return t === "howto" || t === "settings" || t === "questions" || t === "preview" ? t : "howto";
  });
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<Game | null>(null);
  const [questions, setQuestions] = useState<StalkMarketQuestion[]>([]);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [starting, setStarting] = useState(false);
  const [origin, setOrigin] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // editable form state
  const [title, setTitle] = useState("");
  const [scoring, setScoring] = useState<SMScoringVersion>("pari_mutuel");
  const [mode, setMode] = useState<SMGameMode>("live");
  const [seconds, setSeconds] = useState<number>(60);
  const [theme, setTheme] = useState<GameTheme>(DEFAULT_THEME.stalk_market);

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: gameData, error: gameErr } = await supabase
      .from("games")
      .select("*")
      .eq("id", gameId)
      .single();
    if (gameErr || !gameData) {
      setError("Game not found");
      setLoading(false);
      return;
    }
    if (gameData.game_type !== "stalk_market") {
      router.replace(`/dashboard/games/${gameId}`);
      return;
    }
    setGame(gameData as Game);
    setTitle(gameData.title || "");
    setScoring((gameData.sm_scoring_version || "pari_mutuel") as SMScoringVersion);
    setMode((gameData.sm_game_mode || "live") as SMGameMode);
    setSeconds(
      Number.isFinite(gameData.timer_seconds) && gameData.timer_seconds > 0
        ? gameData.timer_seconds
        : 60
    );
    setTheme((gameData.theme as GameTheme) || DEFAULT_THEME.stalk_market);

    const { data: qs } = await supabase
      .from("stalk_market_questions")
      .select("*")
      .eq("game_id", gameId)
      .order("question_order", { ascending: true });
    setQuestions((qs || []) as StalkMarketQuestion[]);
    setLoading(false);
  }, [gameId, router]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounced autosave on settings changes
  useEffect(() => {
    if (!game) return;
    const handle = setTimeout(async () => {
      setSaveStatus("saving");
      const supabase = createClient();
      const { error: upErr } = await supabase
        .from("games")
        .update({
          title: title.trim() || "Untitled",
          sm_scoring_version: scoring,
          sm_game_mode: mode,
          timer_seconds: Math.max(10, Math.min(300, Math.round(seconds))),
          theme,
          updated_at: new Date().toISOString(),
        })
        .eq("id", gameId);
      if (upErr) {
        setSaveStatus("error");
      } else {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1200);
      }
    }, 600);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, scoring, mode, seconds, theme]);

  async function touchGame() {
    const supabase = createClient();
    await supabase
      .from("games")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", gameId);
  }

  async function addQuestion() {
    const supabase = createClient();
    const { data, error: upErr } = await supabase
      .from("stalk_market_questions")
      .insert({
        game_id: gameId,
        prompt: "",
        question_order: questions.length,
      })
      .select()
      .single();
    if (!upErr && data) {
      setQuestions([...questions, data as StalkMarketQuestion]);
      touchGame();
    }
  }

  async function updateQuestionPrompt(id: string, prompt: string) {
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, prompt } : q)));
    const supabase = createClient();
    await supabase.from("stalk_market_questions").update({ prompt }).eq("id", id);
    touchGame();
  }

  async function updateQuestionPreloadedAnswer(id: string, value: string) {
    const next = value.trim() ? value : null;
    setQuestions((qs) =>
      qs.map((q) => (q.id === id ? { ...q, preloaded_answer: next } : q))
    );
    const supabase = createClient();
    await supabase
      .from("stalk_market_questions")
      .update({ preloaded_answer: next })
      .eq("id", id);
    touchGame();
  }

  async function deleteQuestion(id: string) {
    const supabase = createClient();
    await supabase.from("stalk_market_questions").delete().eq("id", id);
    setQuestions((qs) => qs.filter((q) => q.id !== id));
    touchGame();
  }

  async function moveQuestion(id: string, dir: -1 | 1) {
    const idx = questions.findIndex((q) => q.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= questions.length) return;
    const reordered = [...questions];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    setQuestions(reordered);
    const supabase = createClient();
    await Promise.all(
      reordered.map((q, i) =>
        supabase
          .from("stalk_market_questions")
          .update({ question_order: i })
          .eq("id", q.id)
      )
    );
    touchGame();
  }

  async function regenerateSpotlightToken() {
    if (!game) return;
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    const token = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const supabase = createClient();
    await supabase
      .from("games")
      .update({ sm_spotlight_token: token })
      .eq("id", gameId);
    setGame({ ...game, sm_spotlight_token: token });
  }

  async function handleStartSession() {
    if (!game || questions.length === 0) return;
    setStarting(true);
    setError("");
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
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

      const { data: session, error: sessionErr } = await supabase
        .from("sessions")
        .insert({
          game_id: game.id,
          host_id: user.id,
          code,
          status: "lobby",
          current_question_index: -1,
          timer_seconds: Math.max(10, Math.min(300, Math.round(seconds))),
          speed_bonus: false,
          sm_phase: "lobby",
          sm_current_question_order: 0,
          display_mode: "tv",
        })
        .select()
        .single();
      if (sessionErr) throw sessionErr;
      if (typeof window !== "undefined") {
        window.open(`/host/${session.id}`, "_blank", "noopener,noreferrer");
      }
      setStarting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session");
      setStarting(false);
    }
  }

  async function handleDeleteGame() {
    const supabase = createClient();
    await supabase.from("games").delete().eq("id", gameId);
    router.push("/dashboard");
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!game) {
    return <p className="text-coral">{error}</p>;
  }

  const spotlightLink =
    origin && game.sm_spotlight_token
      ? `${origin}/sm-spotlight/${game.sm_spotlight_token}`
      : "";
  const preloadedCount = questions.filter((q) => (q.preloaded_answer || "").trim()).length;
  const tabs: Tab[] = ["howto", "settings", "questions", "preview"];
  const activeIdx = tabs.indexOf(activeTab);
  const activeCenterPct = ((activeIdx + 0.5) / tabs.length) * 100;

  return (
    <div>
      {/* Header card + tabs (combined, connected to tab panel below) */}
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
            style={{ background: "var(--coral)" }}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="var(--paper)"
              strokeWidth={2.4}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 17l5-5 4 4 8-8"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14 8h6v6"
              />
            </svg>
          </span>

          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-[32px] text-ink tracking-[-0.025em] leading-[1.05] truncate">
              Stalk Market
            </h1>
            {title && (
              <p className="text-[18px] text-smoke font-medium mt-1 truncate">
                {title} Edition
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

          {/* Start cluster */}
          <div className="flex items-stretch rounded-full border-2 border-ink overflow-hidden shrink-0">
            <button
              type="button"
              onClick={handleStartSession}
              disabled={questions.length === 0 || starting}
              className="flex items-center gap-2 px-5 py-1.5 text-[14px] font-display font-semibold tracking-[-0.01em] transition-[filter,transform] disabled:opacity-60 disabled:cursor-not-allowed hover:brightness-95 active:scale-[0.98]"
              style={{ background: "var(--lime)", color: "var(--ink)" }}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.4}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
              </svg>
              {starting ? "Starting…" : "Start Game"}
            </button>
          </div>

          <button
            onClick={() => setShowDeleteModal(true)}
            className="p-2 rounded-full text-smoke hover:text-coral hover:bg-[color-mix(in_srgb,var(--coral)_12%,var(--paper))] transition shrink-0"
            title="Delete game"
            aria-label="Delete game"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="relative flex border-t border-dune divide-x divide-dune">
          {tabs.map((tab) => {
            const label =
              tab === "howto"
                ? "How to Play"
                : tab === "settings"
                  ? "Gameplay Settings"
                  : tab === "questions"
                    ? `Questions (${questions.length})`
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
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-[color-mix(in_srgb,var(--coral)_12%,var(--paper))] border border-[color-mix(in_srgb,var(--coral)_25%,transparent)] text-coral text-sm">
          {error}
        </div>
      )}

      {/* Settings tab */}
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
            {/* Row 1 — Spotlight person (combined name + role explanation) */}
            <section className="card-rebrand p-6 lg:col-span-6">
              <SettingsHeader
                title="Spotlight Person"
                description="The guest of honor. Every question is about them and they don't bet. Their name doubles as the game title on phones and the TV. You'll pick which player they are when the lobby fills up."
              />
              <div className="mt-5">
                <Input
                  variant="paper"
                  label="Name"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Sarah"
                  className="font-bold"
                />
              </div>
            </section>

            {/* Row 2 — Scoring version (large, two-up) */}
            <section className="card-rebrand p-6 lg:col-span-6">
              <SettingsHeader
                title="Scoring Version"
                description="How do payouts work when guesses are revealed? Pick one. They play very differently."
              />
              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setScoring("pari_mutuel")}
                  className={`text-left rounded-2xl border-2 px-5 py-4 transition ${
                    scoring === "pari_mutuel"
                      ? "border-ink bg-[color-mix(in_srgb,var(--dune)_60%,var(--paper))]"
                      : "border-dune bg-paper hover:border-ink/40"
                  }`}
                >
                  <div className="font-display font-bold text-[22px] text-ink mb-1">
                    Share the Pot
                  </div>
                  <div className="text-[13px] text-smoke leading-snug">
                    Every round each player gets $100 in chips to spread across guesses. Every chip bet
                    on a wrong answer goes into a shared pot, which is then split among players who bet
                    on the right answer (winners also get their own chips back). If most of the room
                    guesses right, the pot is small and payouts are modest. If only one or two players
                    saw it coming, they walk away with a huge cut.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setScoring("concentration")}
                  className={`text-left rounded-2xl border-2 px-5 py-4 transition ${
                    scoring === "concentration"
                      ? "border-ink bg-[color-mix(in_srgb,var(--dune)_60%,var(--paper))]"
                      : "border-dune bg-paper hover:border-ink/40"
                  }`}
                >
                  <div className="font-display font-bold text-[22px] text-ink mb-1">
                    All-In Bonus
                  </div>
                  <div className="text-[13px] text-smoke leading-snug">
                    Every round each player gets $100 in chips, and can split them across up to 5
                    different guesses. The fewer guesses you make, the bigger the multiplier on any
                    winning bet: 1 guess pays 2.5×, 2 pays 2×, 3 pays 1.75×, 4 pays 1.5×, and 5 pays
                    1.25×. Chips on wrong answers are lost. Payouts come from the bank, so what other
                    players did doesn&apos;t affect your return. It&apos;s a contest of your own
                    confidence vs. hedging.
                  </div>
                </button>
              </div>
            </section>

            {/* Row 3 — Game mode */}
            <section className="card-rebrand p-6 lg:col-span-6">
              <SettingsHeader
                title="Game Mode"
                description="When does the Spotlight answer? Live makes them part of the show; Pre-Loaded is for surprises."
              />
              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMode("live")}
                  className={`text-left rounded-2xl border-2 px-5 py-4 transition ${
                    mode === "live"
                      ? "border-ink bg-[color-mix(in_srgb,var(--dune)_60%,var(--paper))]"
                      : "border-dune bg-paper hover:border-ink/40"
                  }`}
                >
                  <div className="font-display font-bold text-[22px] text-ink mb-1">Live</div>
                  <div className="text-[13px] text-smoke leading-snug">
                    Spotlight types each answer in real time during the game. Best for in-person
                    reactions (&ldquo;you really thought I&apos;d say WHAT?&rdquo;).
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("preloaded")}
                  className={`text-left rounded-2xl border-2 px-5 py-4 transition ${
                    mode === "preloaded"
                      ? "border-ink bg-[color-mix(in_srgb,var(--dune)_60%,var(--paper))]"
                      : "border-dune bg-paper hover:border-ink/40"
                  }`}
                >
                  <div className="font-display font-bold text-[22px] text-ink mb-1">Pre-Loaded</div>
                  <div className="text-[13px] text-smoke leading-snug">
                    Spotlight fills in answers privately ahead of the party via a share link. Best
                    for surprises or async play.
                  </div>
                </button>
              </div>
            </section>

            {/* Row 4 — Seconds per question */}
            <section className="card-rebrand p-6 lg:col-span-6">
              <SettingsHeader
                title="Seconds per Question"
                description="How long bettors have to lock in their guesses after the host starts the timer."
              />
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {[30, 45, 60, 90, 120].map((s) => {
                  const active = seconds === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSeconds(s)}
                      className={`px-4 py-2 rounded-full border-2 text-[14px] font-semibold transition ${
                        active
                          ? "border-ink bg-[color-mix(in_srgb,var(--dune)_60%,var(--paper))] text-ink"
                          : "border-dune bg-paper text-smoke hover:border-ink/40"
                      }`}
                    >
                      {s}s
                    </button>
                  );
                })}
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-[12px] text-smoke">Custom</span>
                  <input
                    type="number"
                    min={10}
                    max={300}
                    value={seconds}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!Number.isNaN(v)) setSeconds(v);
                    }}
                    className="w-20 px-3 py-1.5 rounded-full border-2 border-dune bg-paper text-[14px] text-ink text-center focus:outline-none focus:border-ink"
                  />
                  <span className="text-[12px] text-smoke">sec</span>
                </div>
              </div>
            </section>

            {/* Row 5 — Spotlight pre-load link (only in preloaded mode) */}
            {mode === "preloaded" && (
              <section className="card-rebrand p-6 lg:col-span-6">
                <SettingsHeader
                  title="Spotlight Pre-Load Link"
                  description="Send this private link to the guest of honor. They'll fill in their answers ahead of the party. Don't share it with bettors."
                />
                <div className="mt-5 flex flex-col sm:flex-row gap-2">
                  <input
                    readOnly
                    value={spotlightLink}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 px-4 py-2.5 rounded-full bg-paper border-2 border-dune text-[13px] font-mono text-ink focus:outline-none focus:border-ink"
                  />
                  <Button
                    variant="cta-ghost"
                    size="sm"
                    onClick={() => {
                      if (spotlightLink) navigator.clipboard.writeText(spotlightLink);
                    }}
                  >
                    Copy
                  </Button>
                  <Button variant="cta-ghost" size="sm" onClick={regenerateSpotlightToken}>
                    Rotate
                  </Button>
                </div>
                <p className="mt-3 text-[12px] text-smoke">
                  {preloadedCount} of {questions.length} answers saved. Rotating the link
                  invalidates the previous one.
                </p>
              </section>
            )}

          </div>
        </div>
      )}

      {/* Preview tab */}
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
          <SMGamePreview
            theme={theme}
            onThemeChange={setTheme}
            gameTitle={title}
          />
        </div>
      )}

      {/* Questions tab */}
      {activeTab === "questions" && (
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
          <section className="card-rebrand p-6">
            <div className="flex items-start justify-between gap-4">
              <SettingsHeader
                title={`Questions (${questions.length})`}
                description="Write the prompts your bettors will guess against. The Spotlight answers each one — honestly."
              />
              <Button variant="cta" size="sm" onClick={addQuestion}>
                + Add Question
              </Button>
            </div>

            {questions.length === 0 ? (
              <p className="mt-5 text-sm text-smoke">
                No questions yet. Add at least one before launching.
              </p>
            ) : (
              <ul className="mt-5 space-y-3">
                {questions.map((q, idx) => (
                  <li
                    key={q.id}
                    className="rounded-2xl border-2 border-dune bg-paper px-4 py-3"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="w-7 h-7 rounded-full border-2 border-ink flex items-center justify-center text-[13px] font-display font-bold text-ink shrink-0 bg-[color-mix(in_srgb,var(--sunflower)_40%,var(--paper))]">
                        {idx + 1}
                      </span>
                      <span className="text-[12px] text-smoke">
                        {mode === "preloaded" &&
                          ((q.preloaded_answer || "").trim() ? (
                            <span className="text-teal-brand font-semibold">
                              ✓ pre-loaded
                            </span>
                          ) : (
                            <span className="text-coral">no pre-loaded answer yet</span>
                          ))}
                      </span>
                      <div className="ml-auto flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => moveQuestion(q.id, -1)}
                          disabled={idx === 0}
                          className="p-1.5 rounded text-smoke hover:text-ink hover:bg-dune/60 disabled:opacity-30"
                          title="Move up"
                          aria-label="Move up"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => moveQuestion(q.id, 1)}
                          disabled={idx === questions.length - 1}
                          className="p-1.5 rounded text-smoke hover:text-ink hover:bg-dune/60 disabled:opacity-30"
                          title="Move down"
                          aria-label="Move down"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => deleteQuestion(q.id)}
                          className="p-1.5 rounded text-smoke hover:text-coral hover:bg-[color-mix(in_srgb,var(--coral)_12%,var(--paper))]"
                          title="Delete"
                          aria-label="Delete"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <Input
                      variant="paper"
                      value={q.prompt}
                      onChange={(e) =>
                        setQuestions((qs) =>
                          qs.map((qq) =>
                            qq.id === q.id ? { ...qq, prompt: e.target.value } : qq
                          )
                        )
                      }
                      onBlur={(e) => updateQuestionPrompt(q.id, e.target.value)}
                      placeholder='e.g., "What did you want to be when you were 8?"'
                    />
                    {mode === "preloaded" && (
                      <div className="mt-2">
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-smoke mb-1">
                          Spotlight&apos;s answer
                        </label>
                        <Input
                          variant="paper"
                          value={q.preloaded_answer || ""}
                          onChange={(e) =>
                            setQuestions((qs) =>
                              qs.map((qq) =>
                                qq.id === q.id
                                  ? { ...qq, preloaded_answer: e.target.value }
                                  : qq
                              )
                            )
                          }
                          onBlur={(e) =>
                            updateQuestionPreloadedAnswer(q.id, e.target.value)
                          }
                          placeholder="What the Spotlight would honestly answer"
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* How to play tab */}
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

      {/* Delete modal */}
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

function HowToPlay() {
  const steps: { title: string; body: string }[] = [
    {
      title: "Pick your Spotlight",
      body:
        "One person — the guest of honor — is the focus of the game. They don't bet. Everyone else has $100 a round to wager on what the Spotlight said.",
    },
    {
      title: "A question appears",
      body:
        'Each round shows one prompt about the Spotlight: "What did you want to be when you were 8?", "Worst irrational fear?" — that kind of thing.',
    },
    {
      title: "Place your bets",
      body:
        "Bettors get ten $10 chips. Type up to 5 guesses on your phone and split chips across them. Concentrate or hedge — your call.",
    },
    {
      title: "Adjudication",
      body:
        "Guesses come in clustered by similarity. The host (or the Spotlight themselves) marks each one Match or No Match. Close calls are part of the fun.",
    },
    {
      title: "Reveal & payouts",
      body:
        "The Spotlight's real answer goes up on the big screen. Right answers pay out, wrong answers get burned. Share the Pot splits the room's losing bets among the winners; All-In Bonus pays a multiplier that's bigger the more chips you committed to one answer.",
    },
    {
      title: "Crash the market",
      body:
        "If the whole room whiffs a question, the market panics. A 10-second 'count in your head' mini-game starts — tap CASH OUT before it hits 10s. Land in the final second for a 1.5× precision bonus.",
    },
    {
      title: "Knowability score",
      body:
        "When the game ends, the Spotlight gets a Knowability Score: the % of total dollars that landed on correct answers. High score = the room knows them. Low score = beautiful enigma.",
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
      <div className="space-y-4 self-start" style={{ animationDelay: "0ms" }}>
        <section className="card-rebrand p-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1 max-w-2xl">
              <h2 className="font-display font-bold text-[28px] text-ink tracking-[-0.02em] leading-[1.05] mb-2">
                How Stalk Market plays
              </h2>
              <p className="text-[14px] text-smoke leading-relaxed">
                A real-time party game where players invest in their guesses about the guest of
                honor. Right answers pay out, wrong answers get burned, and a totally-whiffed
                question crashes the market. Best for birthdays, going-aways, anniversaries — any
                gathering with a clear centerpiece. 3–12 players works best.
              </p>
            </div>
            <div className="flex gap-2 text-[12px] text-smoke shrink-0">
              <span className="chip-rebrand chip-accent-coral">3–12 players</span>
              <span className="chip-rebrand chip-accent-violet">~20 min</span>
            </div>
          </div>
        </section>

        {steps.map((step, i) => (
          <article key={step.title} className="card-rebrand p-6 flex gap-5">
            <span className="w-11 h-11 rounded-full border-2 border-ink flex items-center justify-center shrink-0 font-display font-bold text-[18px] text-ink bg-[color-mix(in_srgb,var(--sunflower)_40%,var(--paper))]">
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

      <aside className="space-y-4 lg:sticky lg:top-4 self-start">
        <section className="card-rebrand p-6">
          <h3 className="font-display font-semibold text-[18px] text-ink tracking-[-0.01em] mb-2">
            Best for
          </h3>
          <ul className="text-[13px] text-smoke leading-relaxed space-y-1.5 list-disc list-inside">
            <li>Birthdays</li>
            <li>Going-away parties</li>
            <li>Bachelor / bachelorette</li>
            <li>Anniversaries</li>
            <li>Retirements</li>
            <li>Family reunions</li>
          </ul>
        </section>

        <section className="card-rebrand p-6">
          <h3 className="font-display font-semibold text-[18px] text-ink tracking-[-0.01em] mb-2">
            What you&apos;ll need
          </h3>
          <ul className="text-[13px] text-smoke leading-relaxed space-y-1.5 list-disc list-inside">
            <li>1 Spotlight (the honoree)</li>
            <li>2–11 betting players</li>
            <li>A phone for everyone, including the Spotlight</li>
            <li>A shared screen (TV / laptop / projector)</li>
            <li>A host to grade answers — can be the Spotlight themselves</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
