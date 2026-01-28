"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Modal } from "@/components/ui/modal";
import { generateGameCode } from "@/lib/game-code";
import type { Game, GameQuestionWithChoices } from "@/lib/types";

export default function GameDetailPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = use(params);
  const router = useRouter();
  const [game, setGame] = useState<Game | null>(null);
  const [questions, setQuestions] = useState<GameQuestionWithChoices[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadGame();
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

    setGame(gameData);

    const { data: questionsData } = await supabase
      .from("game_questions")
      .select("*, game_question_choices(*)")
      .eq("game_id", gameId)
      .order("question_order", { ascending: true });

    setQuestions(
      (questionsData || []).map((q) => ({
        ...q,
        game_question_choices: (q.game_question_choices || []).sort(
          (a: { choice_order: number }, b: { choice_order: number }) => a.choice_order - b.choice_order
        ),
      }))
    );
    setLoading(false);
  }

  async function handleSaveQuestion(qIdx: number) {
    const q = questions[qIdx];
    setSaving(true);
    setError("");

    try {
      const supabase = createClient();
      await supabase
        .from("game_questions")
        .update({ prompt: q.prompt, question_order: qIdx })
        .eq("id", q.id);

      for (const c of q.game_question_choices) {
        await supabase
          .from("game_question_choices")
          .update({
            choice_text: c.choice_text,
            is_correct: c.is_correct,
            choice_order: c.choice_order,
          })
          .eq("id", c.id);
      }
    } catch {
      setError("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleStartSession() {
    if (!game || questions.length === 0) return;
    setStartingSession(true);
    setError("");

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Generate unique code — retry on collision
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
          timer_seconds: game.timer_seconds,
          speed_bonus: game.speed_bonus,
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      router.push(`/host/session/${session.id}`);
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

  function updateQuestionPrompt(idx: number, prompt: string) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, prompt } : q))
    );
  }

  function updateChoiceText(qIdx: number, cIdx: number, text: string) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIdx
          ? {
              ...q,
              game_question_choices: q.game_question_choices.map((c, j) =>
                j === cIdx ? { ...c, choice_text: text } : c
              ),
            }
          : q
      )
    );
  }

  function setCorrectChoice(qIdx: number, cIdx: number) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIdx
          ? {
              ...q,
              game_question_choices: q.game_question_choices.map((c, j) => ({
                ...c,
                is_correct: j === cIdx,
              })),
            }
          : q
      )
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (!game) return null;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {game.title}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {game.topic} &middot; {game.difficulty} &middot;{" "}
            {game.age_range.replace("_", " ")} &middot; {game.timer_seconds}s
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowDeleteModal(true)}
          >
            Delete
          </Button>
          <Button
            onClick={handleStartSession}
            loading={startingSession}
            disabled={questions.length === 0}
          >
            Start Live Game
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {questions.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-zinc-500 dark:text-zinc-400">
            No questions yet. Go back and generate some.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Questions ({questions.length})
          </h2>
          {questions.map((q, qIdx) => (
            <Card key={q.id}>
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-medium text-zinc-400">
                  Q{qIdx + 1}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSaveQuestion(qIdx)}
                  loading={saving}
                >
                  Save
                </Button>
              </div>
              <textarea
                value={q.prompt}
                onChange={(e) => updateQuestionPrompt(qIdx, e.target.value)}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                rows={2}
              />
              <div className="space-y-2">
                {q.game_question_choices.map((c, cIdx) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <button
                      onClick={() => setCorrectChoice(qIdx, cIdx)}
                      className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                        c.is_correct
                          ? "border-green-500 bg-green-500 text-white"
                          : "border-zinc-300 dark:border-zinc-600 hover:border-green-400"
                      }`}
                    >
                      {c.is_correct && (
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      )}
                    </button>
                    <Input
                      value={c.choice_text}
                      onChange={(e) =>
                        updateChoiceText(qIdx, cIdx, e.target.value)
                      }
                    />
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Game"
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          Are you sure you want to delete &quot;{game.title}&quot;? This cannot
          be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteGame}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
