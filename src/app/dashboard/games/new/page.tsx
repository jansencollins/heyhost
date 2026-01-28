"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import type { AgeRange, Difficulty } from "@/lib/types";

const AGE_OPTIONS = [
  { value: "teenagers", label: "Teenagers" },
  { value: "young_adults", label: "Young Adults (20s-40s)" },
  { value: "older_adults", label: "Older Adults (50s+)" },
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
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!topic.trim()) {
      setError("Please enter a topic");
      return;
    }

    setError("");
    setCreating(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const gameTitle = title.trim() || topic.trim();

      // Create game in DB
      const { data: game, error: gameError } = await supabase
        .from("games")
        .insert({
          host_id: user.id,
          title: gameTitle,
          topic: topic.trim(),
          age_range: ageRange,
          difficulty,
          timer_seconds: timerSeconds,
          speed_bonus: speedBonus,
        })
        .select()
        .single();

      if (gameError) throw gameError;

      // Generate questions
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

      // Save questions and choices
      for (let i = 0; i < data.questions.length; i++) {
        const q = data.questions[i];
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

        const choices = q.choices.map((c: { text: string; isCorrect: boolean }, j: number) => ({
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

      // Redirect to edit page where autosave works
      router.push(`/dashboard/games/${game.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create game");
      setCreating(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">
        Create New Game
      </h1>

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

        <div className="mt-6 flex gap-3">
          <Button onClick={handleCreate} loading={creating}>
            Create Game
          </Button>
          <Button variant="ghost" onClick={() => router.push("/dashboard")}>
            Cancel
          </Button>
        </div>
      </Card>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
