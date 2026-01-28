"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import type { AgeRange, Difficulty, GeneratedQuestion } from "@/lib/types";

const AGE_OPTIONS = [
  { value: "teenagers", label: "Teenagers" },
  { value: "young_adults", label: "Young Adults" },
  { value: "older_adults", label: "Older Adults" },
  { value: "mix", label: "Mix" },
];

const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
  { value: "mix", label: "Mix" },
];

export default function NewGamePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [ageRange, setAgeRange] = useState<AgeRange>("mix");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [questionCount, setQuestionCount] = useState(10);
  const [timerSeconds, setTimerSeconds] = useState(30);
  const [speedBonus, setSpeedBonus] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [error, setError] = useState("");

  async function handleGenerate() {
    if (!topic.trim()) {
      setError("Please enter a topic");
      return;
    }
    setError("");
    setGenerating(true);

    try {
      const res = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          ageRange,
          difficulty,
          count: questionCount,
        }),
      });

      if (!res.ok) throw new Error("Failed to generate questions");

      const data = await res.json();
      setQuestions(data.questions);
      if (!title.trim()) {
        setTitle(topic.trim());
      }
    } catch {
      setError("Failed to generate questions. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      setError("Please enter a title");
      return;
    }
    if (questions.length === 0) {
      setError("Generate questions first");
      return;
    }

    setError("");
    setSaving(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create game
      const { data: game, error: gameError } = await supabase
        .from("games")
        .insert({
          host_id: user.id,
          title: title.trim(),
          topic: topic.trim(),
          age_range: ageRange,
          difficulty,
          timer_seconds: timerSeconds,
          speed_bonus: speedBonus,
        })
        .select()
        .single();

      if (gameError) throw gameError;

      // Create questions and choices
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const { data: question, error: qError } = await supabase
          .from("game_questions")
          .insert({
            game_id: game.id,
            question_order: i,
            prompt: q.prompt,
            explanation: q.explanation || null,
          })
          .select()
          .single();

        if (qError) throw qError;

        const choices = q.choices.map((c, j) => ({
          question_id: question.id,
          choice_text: c.text,
          is_correct: c.isCorrect,
          choice_order: j,
        }));

        const { error: cError } = await supabase
          .from("game_question_choices")
          .insert(choices);

        if (cError) throw cError;
      }

      router.push(`/dashboard/games/${game.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save game");
    } finally {
      setSaving(false);
    }
  }

  // Editing individual questions
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
              choices: q.choices.map((c, j) =>
                j === cIdx ? { ...c, text } : c
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
              choices: q.choices.map((c, j) => ({
                ...c,
                isCorrect: j === cIdx,
              })),
            }
          : q
      )
    );
  }

  function removeQuestion(idx: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveQuestion(idx: number, direction: -1 | 1) {
    setQuestions((prev) => {
      const next = [...prev];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">
        Create New Game
      </h1>

      {/* Settings */}
      <Card className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
          Game Settings
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., 90s Pop Culture Trivia"
          />
          <Input
            label="Topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., 90s movies and music"
          />
          <Select
            label="Age Range"
            value={ageRange}
            onChange={(e) => setAgeRange(e.target.value as AgeRange)}
            options={AGE_OPTIONS}
          />
          <Select
            label="Difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            options={DIFFICULTY_OPTIONS}
          />
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Questions ({questionCount})
            </label>
            <input
              type="range"
              min={3}
              max={20}
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value))}
              className="w-full accent-indigo-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Timer ({timerSeconds}s)
            </label>
            <input
              type="range"
              min={10}
              max={60}
              step={5}
              value={timerSeconds}
              onChange={(e) => setTimerSeconds(Number(e.target.value))}
              className="w-full accent-indigo-600"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={speedBonus}
                onChange={(e) => setSpeedBonus(e.target.checked)}
                className="rounded accent-indigo-600"
              />
              Speed bonus (faster answers earn more points)
            </label>
          </div>
        </div>

        <div className="mt-6">
          <Button onClick={handleGenerate} loading={generating}>
            {questions.length > 0 ? "Regenerate Questions" : "Generate Questions"}
          </Button>
        </div>
      </Card>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Questions Editor */}
      {questions.length > 0 && (
        <div className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Questions ({questions.length})
          </h2>
          {questions.map((q, qIdx) => (
            <Card key={qIdx}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
                  Q{qIdx + 1}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => moveQuestion(qIdx, -1)}
                    disabled={qIdx === 0}
                    className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 disabled:opacity-30"
                    title="Move up"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                  </button>
                  <button
                    onClick={() => moveQuestion(qIdx, 1)}
                    disabled={qIdx === questions.length - 1}
                    className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 disabled:opacity-30"
                    title="Move down"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  <button
                    onClick={() => removeQuestion(qIdx)}
                    className="p-1 text-red-400 hover:text-red-600"
                    title="Remove question"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
              <textarea
                value={q.prompt}
                onChange={(e) => updateQuestionPrompt(qIdx, e.target.value)}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                rows={2}
              />
              <div className="space-y-2">
                {q.choices.map((c, cIdx) => (
                  <div key={cIdx} className="flex items-center gap-2">
                    <button
                      onClick={() => setCorrectChoice(qIdx, cIdx)}
                      className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                        c.isCorrect
                          ? "border-green-500 bg-green-500 text-white"
                          : "border-zinc-300 dark:border-zinc-600 hover:border-green-400"
                      }`}
                      title={c.isCorrect ? "Correct answer" : "Mark as correct"}
                    >
                      {c.isCorrect && (
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      )}
                    </button>
                    <input
                      value={c.text}
                      onChange={(e) =>
                        updateChoiceText(qIdx, cIdx, e.target.value)
                      }
                      className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {questions.length > 0 && (
        <div className="flex gap-3">
          <Button onClick={handleSave} loading={saving} size="lg">
            Save Game
          </Button>
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard")}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
