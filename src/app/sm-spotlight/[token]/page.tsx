"use client";

import { useEffect, useState, use } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import type { StalkMarketQuestion } from "@/lib/types";

/**
 * Public page where the Spotlight (guest of honor) types their answers
 * privately ahead of a Pre-Loaded mode game. Access is gated only by the
 * unguessable URL token; no auth.
 */
export default function SpotlightPreloadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<{ id: string; title: string } | null>(null);
  const [questions, setQuestions] = useState<StalkMarketQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: g } = await supabase
        .from("games")
        .select("id, title, sm_game_mode")
        .eq("sm_spotlight_token", token)
        .maybeSingle();
      if (!g) {
        setError(
          "This link is invalid or has expired. Ask the host to send a new one."
        );
        setLoading(false);
        return;
      }
      setGame({ id: g.id, title: g.title });
      const { data: qs } = await supabase
        .from("stalk_market_questions")
        .select("*")
        .eq("game_id", g.id)
        .order("question_order", { ascending: true });
      const list = (qs || []) as StalkMarketQuestion[];
      setQuestions(list);
      const initial: Record<string, string> = {};
      for (const q of list) initial[q.id] = q.preloaded_answer || "";
      setAnswers(initial);
      setLoading(false);
    }
    load();
  }, [token]);

  async function saveAnswer(questionId: string) {
    setSavingId(questionId);
    try {
      const res = await fetch("/api/sm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_preloaded_answer",
          token,
          questionId,
          answer: answers[questionId] || "",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Save failed");
      }
      setQuestions((qs) =>
        qs.map((q) =>
          q.id === questionId ? { ...q, preloaded_answer: answers[questionId] } : q
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
    setSavingId(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bone">
        <Spinner />
      </div>
    );
  }
  if (error && !game) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bone p-6">
        <p className="max-w-md text-center text-coral">{error}</p>
      </div>
    );
  }
  const filledCount = questions.filter(
    (q) => (answers[q.id] || "").trim().length > 0
  ).length;

  return (
    <div className="min-h-screen bg-bone p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <header className="mb-6">
          <p className="text-sm text-smoke uppercase tracking-wider mb-1">
            You&apos;re the Spotlight
          </p>
          <h1 className="text-3xl font-bold text-ink mb-2">{game?.title}</h1>
          <p className="text-sm text-smoke">
            Type your honest answers below. They stay private until the game.
            Your friends will be guessing what you wrote.
          </p>
          <p className="text-xs text-smoke mt-2">
            Saved {filledCount} / {questions.length}
          </p>
        </header>

        <div className="space-y-4">
          {questions.map((q, idx) => {
            const value = answers[q.id] || "";
            const saved = (q.preloaded_answer || "").trim() === value.trim();
            return (
              <div
                key={q.id}
                className="bg-paper rounded-2xl p-5 space-y-3 border border-dune"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs text-smoke uppercase tracking-wider">
                      Question {idx + 1}
                    </span>
                    <p className="font-bold text-ink mt-1">{q.prompt}</p>
                  </div>
                  {saved && value.trim() && (
                    <span className="text-emerald-700 text-xs font-medium shrink-0 mt-1">
                      ✓ Saved
                    </span>
                  )}
                </div>
                <textarea
                  className="w-full px-3 py-2 bg-bone border border-dune rounded-lg text-ink min-h-[80px] focus:outline-none focus:border-ink"
                  value={value}
                  onChange={(e) =>
                    setAnswers({ ...answers, [q.id]: e.target.value })
                  }
                  placeholder="Type your honest answer…"
                />
                <div className="flex justify-end">
                  <Button
                    variant="cta"
                    size="sm"
                    loading={savingId === q.id}
                    disabled={!value.trim() || saved}
                    onClick={() => saveAnswer(q.id)}
                  >
                    {saved ? "Saved" : "Save"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {error && game && <p className="text-coral text-sm mt-4">{error}</p>}

        <p className="text-xs text-smoke text-center mt-8">
          You can come back to this link to edit answers any time before the game.
        </p>
      </div>
    </div>
  );
}
