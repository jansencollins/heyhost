"use client";

import { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Modal } from "@/components/ui/modal";
import { generateGameCode } from "@/lib/game-code";
import type { Game, GameQuestionWithChoices, AgeRange, Difficulty } from "@/lib/types";

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

type Tab = "settings" | "questions";

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
  const [startingSession, setStartingSession] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("settings");
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
  const [generatingWrongIdx, setGeneratingWrongIdx] = useState<number | null>(null);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [bulkCount, setBulkCount] = useState(10);
  const [generatingBulk, setGeneratingBulk] = useState(false);

  // Editable settings state
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [ageRange, setAgeRange] = useState<AgeRange>("mix");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [timerSeconds, setTimerSeconds] = useState(30);
  const [speedBonus, setSpeedBonus] = useState(true);

  // Autosave refs
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const questionTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const questionsRef = useRef(questions);
  questionsRef.current = questions;
  const lastSavedSettingsRef = useRef({
    title: "", topic: "", ageRange: "mix" as AgeRange, difficulty: "medium" as Difficulty,
    timerSeconds: 30, speedBonus: true,
  });
  const savedStatusTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    loadGame();
    return () => {
      clearTimeout(settingsTimerRef.current);
      clearTimeout(savedStatusTimerRef.current);
      questionTimersRef.current.forEach((t) => clearTimeout(t));
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

    setGame(gameData);
    setTitle(gameData.title);
    setTopic(gameData.topic);
    setAgeRange(gameData.age_range);
    setDifficulty(gameData.difficulty);
    setTimerSeconds(gameData.timer_seconds);
    setSpeedBonus(gameData.speed_bonus);
    lastSavedSettingsRef.current = {
      title: gameData.title, topic: gameData.topic,
      ageRange: gameData.age_range, difficulty: gameData.difficulty,
      timerSeconds: gameData.timer_seconds, speedBonus: gameData.speed_bonus,
    };

    const { data: questionsData } = await supabase
      .from("game_questions")
      .select("*, game_question_choices(*)")
      .eq("game_id", gameId)
      .order("question_order", { ascending: true });

    setQuestions(
      (questionsData || []).map((q) => ({
        ...q,
        game_question_choices: (q.game_question_choices || []).sort(
          (a: { choice_order: number }, b: { choice_order: number }) =>
            a.choice_order - b.choice_order
        ),
      }))
    );
    setLoading(false);
  }

  // Autosave settings when any value changes
  useEffect(() => {
    if (!game) return;
    const last = lastSavedSettingsRef.current;
    if (
      title === last.title && topic === last.topic &&
      ageRange === last.ageRange && difficulty === last.difficulty &&
      timerSeconds === last.timerSeconds && speedBonus === last.speedBonus
    ) return;

    clearTimeout(settingsTimerRef.current);
    settingsTimerRef.current = setTimeout(async () => {
      if (!title.trim() || !topic.trim()) return;
      setSaveStatus("saving");
      setError("");
      try {
        const supabase = createClient();
        const { error: updateError } = await supabase
          .from("games")
          .update({
            title: title.trim(),
            topic: topic.trim(),
            age_range: ageRange,
            difficulty,
            timer_seconds: timerSeconds,
            speed_bonus: speedBonus,
          })
          .eq("id", game.id);

        if (updateError) throw updateError;

        lastSavedSettingsRef.current = {
          title: title.trim(), topic: topic.trim(),
          ageRange, difficulty, timerSeconds, speedBonus,
        };
        setGame((g) =>
          g ? { ...g, title: title.trim(), topic: topic.trim(), age_range: ageRange, difficulty, timer_seconds: timerSeconds, speed_bonus: speedBonus } : g
        );
        setSaveStatus("saved");
        clearTimeout(savedStatusTimerRef.current);
        savedStatusTimerRef.current = setTimeout(() => setSaveStatus((s) => s === "saved" ? "idle" : s), 2000);
      } catch {
        setSaveStatus("error");
      }
    }, 800);

    return () => clearTimeout(settingsTimerRef.current);
  }, [title, topic, ageRange, difficulty, timerSeconds, speedBonus, game]);

  function scheduleQuestionSave(questionId: string) {
    const existing = questionTimersRef.current.get(questionId);
    if (existing) clearTimeout(existing);

    questionTimersRef.current.set(
      questionId,
      setTimeout(async () => {
        questionTimersRef.current.delete(questionId);
        const q = questionsRef.current.find((qn) => qn.id === questionId);
        if (!q) return;
        setSaveStatus("saving");
        setError("");
        try {
          const supabase = createClient();
          await supabase
            .from("game_questions")
            .update({ prompt: q.prompt })
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
          setSaveStatus("saved");
          clearTimeout(savedStatusTimerRef.current);
          savedStatusTimerRef.current = setTimeout(() => setSaveStatus((s) => s === "saved" ? "idle" : s), 2000);
        } catch {
          setSaveStatus("error");
        }
      }, 800)
    );
  }

  async function handleRegenerateQuestion(qIdx: number) {
    if (!game) return;
    setRegeneratingIdx(qIdx);
    setError("");

    try {
      const res = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: game.topic,
          ageRange: game.age_range,
          difficulty: game.difficulty,
          count: 1,
        }),
      });

      if (!res.ok) throw new Error("Failed to generate question");

      const data = await res.json();
      const newQ = data.questions[0];

      // Update the question in the DB
      const supabase = createClient();
      const oldQ = questions[qIdx];

      await supabase
        .from("game_questions")
        .update({ prompt: newQ.prompt, explanation: newQ.explanation || null })
        .eq("id", oldQ.id);

      // Delete old choices and insert new ones
      await supabase
        .from("game_question_choices")
        .delete()
        .eq("question_id", oldQ.id);

      const newChoices = newQ.choices.map(
        (c: { text: string; isCorrect: boolean }, j: number) => ({
          question_id: oldQ.id,
          choice_text: c.text,
          is_correct: c.isCorrect,
          choice_order: j,
        })
      );

      const { data: insertedChoices } = await supabase
        .from("game_question_choices")
        .insert(newChoices)
        .select();

      setQuestions((prev) =>
        prev.map((q, i) =>
          i === qIdx
            ? {
                ...q,
                prompt: newQ.prompt,
                explanation: newQ.explanation || null,
                game_question_choices: (insertedChoices || []).sort(
                  (a: { choice_order: number }, b: { choice_order: number }) =>
                    a.choice_order - b.choice_order
                ),
              }
            : q
        )
      );
    } catch {
      setError("Failed to regenerate question");
    } finally {
      setRegeneratingIdx(null);
    }
  }

  async function handleGenerateWrongAnswers(qIdx: number) {
    if (!game) return;
    const q = questions[qIdx];
    const correctChoice = q.game_question_choices.find((c) => c.is_correct);
    if (!correctChoice) {
      setError("Mark a correct answer first");
      return;
    }

    setGeneratingWrongIdx(qIdx);
    setError("");

    try {
      const res = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "wrong_answers",
          questionPrompt: q.prompt,
          correctAnswer: correctChoice.choice_text,
          topic: game.topic,
        }),
      });

      if (!res.ok) throw new Error("Failed to generate wrong answers");

      const data = await res.json();
      const wrongAnswers: string[] = data.wrongAnswers;

      // Update the wrong choices in the DB and state
      const supabase = createClient();
      const wrongChoices = q.game_question_choices.filter((c) => !c.is_correct);

      // We need to match up to 4 wrong answers with existing wrong choice slots
      for (let i = 0; i < wrongChoices.length && i < wrongAnswers.length; i++) {
        await supabase
          .from("game_question_choices")
          .update({ choice_text: wrongAnswers[i] })
          .eq("id", wrongChoices[i].id);
      }

      setQuestions((prev) =>
        prev.map((question, i) => {
          if (i !== qIdx) return question;
          let wrongIdx = 0;
          return {
            ...question,
            game_question_choices: question.game_question_choices.map((c) => {
              if (c.is_correct) return c;
              if (wrongIdx < wrongAnswers.length) {
                return { ...c, choice_text: wrongAnswers[wrongIdx++] };
              }
              return c;
            }),
          };
        })
      );
    } catch {
      setError("Failed to generate wrong answers");
    } finally {
      setGeneratingWrongIdx(null);
    }
  }

  async function handleAddQuestion() {
    if (!game) return;
    setAddingQuestion(true);
    setError("");

    try {
      const supabase = createClient();
      const newOrder = questions.length;

      const { data: newQuestion, error: qError } = await supabase
        .from("game_questions")
        .insert({
          game_id: game.id,
          question_order: newOrder,
          prompt: "New question — edit me",
          explanation: null,
        })
        .select()
        .single();

      if (qError) throw qError;

      const defaultChoices = [
        { question_id: newQuestion.id, choice_text: "Correct answer", is_correct: true, choice_order: 0 },
        { question_id: newQuestion.id, choice_text: "Wrong answer A", is_correct: false, choice_order: 1 },
        { question_id: newQuestion.id, choice_text: "Wrong answer B", is_correct: false, choice_order: 2 },
        { question_id: newQuestion.id, choice_text: "Wrong answer C", is_correct: false, choice_order: 3 },
      ];

      const { data: insertedChoices, error: cError } = await supabase
        .from("game_question_choices")
        .insert(defaultChoices)
        .select();

      if (cError) throw cError;

      setQuestions((prev) => [
        ...prev,
        {
          ...newQuestion,
          game_question_choices: (insertedChoices || []).sort(
            (a: { choice_order: number }, b: { choice_order: number }) =>
              a.choice_order - b.choice_order
          ),
        },
      ]);
    } catch {
      setError("Failed to add question");
    } finally {
      setAddingQuestion(false);
    }
  }

  async function handleGenerateBulk() {
    if (!game) return;
    setGeneratingBulk(true);
    setError("");

    try {
      const res = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: game.topic,
          ageRange: game.age_range,
          difficulty: game.difficulty,
          count: bulkCount,
        }),
      });

      if (!res.ok) throw new Error("Failed to generate questions");

      const data = await res.json();
      const supabase = createClient();

      const newQuestions: GameQuestionWithChoices[] = [];

      for (let i = 0; i < data.questions.length; i++) {
        const q = data.questions[i];
        const { data: newQuestion, error: qError } = await supabase
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
          question_id: newQuestion.id,
          choice_text: c.text,
          is_correct: c.isCorrect,
          choice_order: j,
        }));

        const { data: insertedChoices, error: cError } = await supabase
          .from("game_question_choices")
          .insert(choices)
          .select();

        if (cError) throw cError;

        newQuestions.push({
          ...newQuestion,
          game_question_choices: (insertedChoices || []).sort(
            (a: { choice_order: number }, b: { choice_order: number }) =>
              a.choice_order - b.choice_order
          ),
        });
      }

      setQuestions(newQuestions);
    } catch {
      setError("Failed to generate questions");
    } finally {
      setGeneratingBulk(false);
    }
  }

  async function handleRemoveQuestion(qIdx: number) {
    const q = questions[qIdx];
    setError("");

    try {
      const supabase = createClient();
      // Choices cascade-delete via FK
      await supabase.from("game_questions").delete().eq("id", q.id);

      setQuestions((prev) => prev.filter((_, i) => i !== qIdx));
    } catch {
      setError("Failed to remove question");
    }
  }

  async function handleMoveQuestion(qIdx: number, direction: -1 | 1) {
    const target = qIdx + direction;
    if (target < 0 || target >= questions.length) return;

    setQuestions((prev) => {
      const next = [...prev];
      [next[qIdx], next[target]] = [next[target], next[qIdx]];
      return next;
    });

    // Persist new order
    const supabase = createClient();
    const a = questions[qIdx];
    const b = questions[target];
    await supabase
      .from("game_questions")
      .update({ question_order: target })
      .eq("id", a.id);
    await supabase
      .from("game_questions")
      .update({ question_order: qIdx })
      .eq("id", b.id);
  }

  function handleDragStart(idx: number) {
    setDragIdx(idx);
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setDragOverIdx(idx);
  }

  async function handleDrop(dropIdx: number) {
    if (dragIdx === null || dragIdx === dropIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }

    const reordered = [...questions];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(dropIdx, 0, moved);
    setQuestions(reordered);
    setDragIdx(null);
    setDragOverIdx(null);

    // Persist all new orders
    const supabase = createClient();
    for (let i = 0; i < reordered.length; i++) {
      await supabase
        .from("game_questions")
        .update({ question_order: i })
        .eq("id", reordered[i].id);
    }
  }

  async function handleStartSession() {
    if (!game || questions.length === 0) return;
    setStartingSession(true);
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
      setError(
        err instanceof Error ? err.message : "Failed to start session"
      );
      setStartingSession(false);
    }
  }

  async function handleDeleteGame() {
    const supabase = createClient();
    await supabase.from("games").delete().eq("id", gameId);
    router.push("/dashboard");
  }

  function updateQuestionPrompt(idx: number, prompt: string) {
    const questionId = questions[idx]?.id;
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, prompt } : q))
    );
    if (questionId) scheduleQuestionSave(questionId);
  }

  function updateChoiceText(qIdx: number, cIdx: number, text: string) {
    const questionId = questions[qIdx]?.id;
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
    if (questionId) scheduleQuestionSave(questionId);
  }

  function moveChoice(qIdx: number, cIdx: number, direction: -1 | 1) {
    const target = cIdx + direction;
    const q = questions[qIdx];
    if (!q || target < 0 || target >= q.game_question_choices.length) return;
    const questionId = q.id;
    setQuestions((prev) =>
      prev.map((question, i) => {
        if (i !== qIdx) return question;
        const choices = [...question.game_question_choices];
        [choices[cIdx], choices[target]] = [choices[target], choices[cIdx]];
        return {
          ...question,
          game_question_choices: choices.map((c, j) => ({ ...c, choice_order: j })),
        };
      })
    );
    if (questionId) scheduleQuestionSave(questionId);
  }

  function setCorrectChoice(qIdx: number, cIdx: number) {
    const questionId = questions[qIdx]?.id;
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
    if (questionId) scheduleQuestionSave(questionId);
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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {game.title}
          </h1>
          <div className="flex items-center gap-2">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {game.topic} &middot; {game.difficulty} &middot;{" "}
              {game.age_range.replace("_", " ")} &middot; {game.timer_seconds}s
            </p>
            {saveStatus === "saving" && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500 animate-pulse">Saving...</span>
            )}
            {saveStatus === "saved" && (
              <span className="text-xs text-green-500">Saved</span>
            )}
            {saveStatus === "error" && (
              <span className="text-xs text-red-500">Save failed</span>
            )}
          </div>
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

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-700 mb-6">
        <button
          onClick={() => setActiveTab("settings")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "settings"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          }`}
        >
          General Settings
        </button>
        <button
          onClick={() => setActiveTab("questions")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "questions"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          }`}
        >
          Questions ({questions.length})
        </button>
      </div>

      {/* General Settings Tab */}
      {activeTab === "settings" && (
        <Card>
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
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer pb-2">
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
        </Card>
      )}

      {/* Questions Tab */}
      {activeTab === "questions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Questions ({questions.length})
            </h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAddQuestion}
              loading={addingQuestion}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add Question
            </Button>
          </div>

          {questions.length === 0 ? (
            <Card className="text-center py-12">
              <svg className="h-10 w-10 mx-auto text-zinc-300 dark:text-zinc-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
              <p className="text-zinc-500 dark:text-zinc-400 mb-6">
                No questions yet. Generate them with AI or add one manually.
              </p>
              <div className="max-w-xs mx-auto">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Number of questions ({bulkCount})
                </label>
                <input
                  type="range"
                  min={3}
                  max={20}
                  value={bulkCount}
                  onChange={(e) => setBulkCount(Number(e.target.value))}
                  className="w-full accent-indigo-600 mb-4"
                />
                <Button
                  onClick={handleGenerateBulk}
                  loading={generatingBulk}
                  className="w-full"
                >
                  Generate {bulkCount} Questions
                </Button>
              </div>
            </Card>
          ) : (
            questions.map((q, qIdx) => (
              <div
                key={q.id}
                draggable
                onDragStart={() => handleDragStart(qIdx)}
                onDragOver={(e) => handleDragOver(e, qIdx)}
                onDragEnd={() => {
                  setDragIdx(null);
                  setDragOverIdx(null);
                }}
                onDrop={() => handleDrop(qIdx)}
                className={`transition-all ${
                  dragIdx === qIdx ? "opacity-40" : ""
                } ${
                  dragOverIdx === qIdx && dragIdx !== qIdx
                    ? "ring-2 ring-indigo-400 rounded-lg"
                    : ""
                }`}
              >
                <Card>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      {/* Drag handle */}
                      <button
                        className="cursor-grab active:cursor-grabbing text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400"
                        title="Drag to reorder"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <svg
                          className="h-5 w-5"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <circle cx="9" cy="6" r="1.5" />
                          <circle cx="15" cy="6" r="1.5" />
                          <circle cx="9" cy="12" r="1.5" />
                          <circle cx="15" cy="12" r="1.5" />
                          <circle cx="9" cy="18" r="1.5" />
                          <circle cx="15" cy="18" r="1.5" />
                        </svg>
                      </button>
                      <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
                        Q{qIdx + 1}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleMoveQuestion(qIdx, -1)}
                        disabled={qIdx === 0}
                        className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 disabled:opacity-30"
                        title="Move up"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 15l7-7 7 7"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleMoveQuestion(qIdx, 1)}
                        disabled={qIdx === questions.length - 1}
                        className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 disabled:opacity-30"
                        title="Move down"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleRemoveQuestion(qIdx)}
                        className="p-1 text-red-400 hover:text-red-600"
                        title="Remove question"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={q.prompt}
                    onChange={(e) => updateQuestionPrompt(qIdx, e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    rows={2}
                  />
                  <div className="space-y-2 mb-3">
                    {q.game_question_choices.map((c, cIdx) => (
                      <div key={c.id} className="flex items-center gap-1.5">
                        <button
                          onClick={() => setCorrectChoice(qIdx, cIdx)}
                          className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                            c.is_correct
                              ? "border-green-500 bg-green-500 text-white"
                              : "border-zinc-300 dark:border-zinc-600 hover:border-green-400"
                          }`}
                          title={
                            c.is_correct ? "Correct answer" : "Mark as correct"
                          }
                        >
                          {c.is_correct && (
                            <svg
                              className="h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </button>
                        <Input
                          value={c.choice_text}
                          onChange={(e) =>
                            updateChoiceText(qIdx, cIdx, e.target.value)
                          }
                        />
                        <div className="flex flex-col flex-shrink-0">
                          <button
                            onClick={() => moveChoice(qIdx, cIdx, -1)}
                            disabled={cIdx === 0}
                            className="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 disabled:opacity-30"
                            title="Move up"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => moveChoice(qIdx, cIdx, 1)}
                            disabled={cIdx === q.game_question_choices.length - 1}
                            className="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 disabled:opacity-30"
                            title="Move down"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* AI action buttons */}
                  <div className="flex gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-700">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRegenerateQuestion(qIdx)}
                      loading={regeneratingIdx === qIdx}
                      disabled={regeneratingIdx !== null}
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      Regenerate Question
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleGenerateWrongAnswers(qIdx)}
                      loading={generatingWrongIdx === qIdx}
                      disabled={generatingWrongIdx !== null}
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      Rewrite Wrong Answers
                    </Button>
                  </div>
                </Card>
              </div>
            ))
          )}
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
