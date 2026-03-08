"use client";

import { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
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

const CHOICE_COLORS = [
  { bg: "bg-accent-pink/8", border: "border-accent-pink/25", dot: "bg-accent-pink", label: "A" },
  { bg: "bg-accent-blue/8", border: "border-accent-blue/25", dot: "bg-accent-blue", label: "B" },
  { bg: "bg-accent-yellow/8", border: "border-accent-yellow/25", dot: "bg-accent-yellow", label: "C" },
  { bg: "bg-accent-green/8", border: "border-accent-green/25", dot: "bg-accent-green", label: "D" },
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

      const supabase = createClient();
      const oldQ = questions[qIdx];

      await supabase
        .from("game_questions")
        .update({ prompt: newQ.prompt, explanation: newQ.explanation || null })
        .eq("id", oldQ.id);

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

      const supabase = createClient();
      const wrongChoices = q.game_question_choices.filter((c) => !c.is_correct);

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

  /* ─── Loading state ─── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Spinner className="h-10 w-10" />
        <p className="text-text-muted text-sm">Loading game...</p>
      </div>
    );
  }

  if (!game) return null;

  const difficultyLabel: Record<string, { text: string; color: string }> = {
    easy: { text: "Easy", color: "text-accent-green" },
    medium: { text: "Medium", color: "text-accent-yellow" },
    hard: { text: "Hard", color: "text-accent-pink" },
    mix: { text: "Mix", color: "text-accent-purple" },
  };

  return (
    <div className="max-w-6xl mx-auto pb-12">
      {/* ═══════ Hero Header ═══════ */}
      <div className="mb-8" style={{ animation: "slide-up 0.4s ease" }}>
        {/* Back link */}
        <button
          onClick={() => router.push("/dashboard")}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-indigo-400 transition-colors mb-4"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All Games
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold tracking-tight text-text-primary mb-2">
              {game.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-text-secondary">{game.topic}</span>
              <span className="text-text-muted">|</span>
              <span className={difficultyLabel[game.difficulty]?.color || "text-text-secondary"}>
                {difficultyLabel[game.difficulty]?.text || game.difficulty}
              </span>
              <span className="text-text-muted">|</span>
              <span className="text-text-secondary">
                {game.age_range.replace("_", " ")}
              </span>
              <span className="text-text-muted">|</span>
              <span className="text-accent-blue">{game.timer_seconds}s</span>

              {/* Save status */}
              {saveStatus === "saving" && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-yellow animate-pulse" />
                  Saving
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-accent-green">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                  Saved
                </span>
              )}
              {saveStatus === "error" && (
                <span className="ml-2 text-xs text-accent-pink">Save failed</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 pt-1">
            <button
              onClick={() => setShowDeleteModal(true)}
              className="p-2 rounded-xl text-text-muted hover:text-accent-pink hover:bg-accent-pink/10 transition-all"
              title="Delete game"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <Button
              onClick={handleStartSession}
              loading={startingSession}
              disabled={questions.length === 0}
              size="lg"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Start Live
            </Button>
          </div>
        </div>
      </div>

      {/* ═══════ Error banner ═══════ */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-accent-pink/10 border border-accent-pink/20 text-accent-pink text-sm flex items-center gap-2" style={{ animation: "slide-up 0.3s ease" }}>
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
        </div>
      )}

      {/* ═══════ Tabs ═══════ */}
      <div className="flex gap-1 mb-8 p-1 rounded-2xl bg-surface-raised border border-surface-border" style={{ animation: "slide-up 0.5s ease" }}>
        {(["settings", "questions"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 ${
              activeTab === tab
                ? "bg-white/10 text-text-primary shadow-sm backdrop-blur-xl border border-white/10"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            {tab === "settings" ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Questions ({questions.length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════ Settings Tab ═══════ */}
      {activeTab === "settings" && (
        <div style={{ animation: "slide-up 0.3s ease" }}>
          <div className="glass-card p-8">
            <h2 className="text-xl font-bold text-accent-blue mb-6">
              Game Settings
            </h2>
            <div className="grid gap-5 sm:grid-cols-2">
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

              {/* Timer slider */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Timer
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={10}
                    max={60}
                    step={5}
                    value={timerSeconds}
                    onChange={(e) => setTimerSeconds(Number(e.target.value))}
                    className="glass-range flex-1"
                  />
                  <span className="text-sm font-bold text-accent-blue tabular-nums w-10 text-right">
                    {timerSeconds}s
                  </span>
                </div>
              </div>

              {/* Speed bonus toggle */}
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-3 text-sm text-text-secondary cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={speedBonus}
                    onChange={(e) => setSpeedBonus(e.target.checked)}
                    className="glass-checkbox"
                  />
                  <span className="group-hover:text-text-primary transition-colors">
                    Speed bonus (faster answers earn more)
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ Questions Tab ═══════ */}
      {activeTab === "questions" && (
        <div style={{ animation: "slide-up 0.3s ease" }}>
          {/* Header row */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-accent-blue">
              {questions.length} {questions.length === 1 ? "Question" : "Questions"}
            </h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAddQuestion}
              loading={addingQuestion}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Question
            </Button>
          </div>

          {questions.length === 0 ? (
            /* ─── Empty State ─── */
            <div className="glass-card p-10 text-center border border-accent-purple/20">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-accent-blue/10 flex items-center justify-center">
                <svg className="h-8 w-8 text-accent-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-2">
                No questions yet
              </h3>
              <p className="text-text-muted mb-8 max-w-sm mx-auto">
                Generate questions with AI or add them one by one. The AI will match your topic, difficulty, and age range.
              </p>
              <div className="max-w-xs mx-auto">
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  How many questions?
                </label>
                <div className="flex items-center gap-3 mb-5">
                  <input
                    type="range"
                    min={3}
                    max={20}
                    value={bulkCount}
                    onChange={(e) => setBulkCount(Number(e.target.value))}
                    className="glass-range flex-1"
                  />
                  <span className="text-lg font-bold text-accent-blue tabular-nums w-8 text-center">
                    {bulkCount}
                  </span>
                </div>
                <Button
                  onClick={handleGenerateBulk}
                  loading={generatingBulk}
                  className="w-full"
                  size="lg"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate {bulkCount} Questions
                </Button>
              </div>
            </div>
          ) : (
            /* ─── Question Cards ─── */
            <div className="space-y-4 stagger-in">
              {questions.map((q, qIdx) => (
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
                  className={`transition-all duration-200 ${
                    dragIdx === qIdx ? "opacity-30 scale-[0.98]" : ""
                  } ${
                    dragOverIdx === qIdx && dragIdx !== qIdx
                      ? "translate-y-1"
                      : ""
                  }`}
                >
                  {/* Drop indicator line */}
                  {dragOverIdx === qIdx && dragIdx !== qIdx && (
                    <div className="h-0.5 bg-accent-purple rounded-full mb-2" />
                  )}

                  <div className="glass-card p-5">
                    {/* Card header */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        {/* Drag handle */}
                        <button
                          className="cursor-grab active:cursor-grabbing text-text-muted hover:text-indigo-400 transition-colors"
                          title="Drag to reorder"
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                            <circle cx="9" cy="6" r="1.5" />
                            <circle cx="15" cy="6" r="1.5" />
                            <circle cx="9" cy="12" r="1.5" />
                            <circle cx="15" cy="12" r="1.5" />
                            <circle cx="9" cy="18" r="1.5" />
                            <circle cx="15" cy="18" r="1.5" />
                          </svg>
                        </button>
                        <span className="text-xs font-bold text-text-secondary tabular-nums">
                          Question {qIdx + 1}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {/* AI action buttons */}
                        <button
                          onClick={() => handleRegenerateQuestion(qIdx)}
                          disabled={regeneratingIdx !== null}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/20 disabled:opacity-30 transition-all"
                        >
                          {regeneratingIdx === qIdx ? (
                            <Spinner className="h-3.5 w-3.5" />
                          ) : (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          )}
                          Regenerate Question
                        </button>
                        <button
                          onClick={() => handleGenerateWrongAnswers(qIdx)}
                          disabled={generatingWrongIdx !== null}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-30 transition-all"
                        >
                          {generatingWrongIdx === qIdx ? (
                            <Spinner className="h-3.5 w-3.5" />
                          ) : (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          )}
                          Rewrite Wrong Answers
                        </button>

                        <div className="w-px h-4 bg-surface-border mx-0.5" />

                        {/* Reorder & delete */}
                        <button
                          onClick={() => handleMoveQuestion(qIdx, -1)}
                          disabled={qIdx === 0}
                          className="p-1.5 rounded-lg text-text-muted hover:text-indigo-400 hover:bg-indigo-500/10 disabled:opacity-20 disabled:hover:bg-transparent transition-all"
                          title="Move up"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleMoveQuestion(qIdx, 1)}
                          disabled={qIdx === questions.length - 1}
                          className="p-1.5 rounded-lg text-text-muted hover:text-indigo-400 hover:bg-indigo-500/10 disabled:opacity-20 disabled:hover:bg-transparent transition-all"
                          title="Move down"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <div className="w-px h-4 bg-surface-border mx-0.5" />
                        <button
                          onClick={() => handleRemoveQuestion(qIdx)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-accent-pink hover:bg-accent-pink/10 transition-all"
                          title="Remove question"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Question prompt */}
                    <textarea
                      value={q.prompt}
                      onChange={(e) => updateQuestionPrompt(qIdx, e.target.value)}
                      className="glass-input w-full px-3.5 py-2.5 text-sm mb-4 resize-none"
                      rows={2}
                      placeholder="Type your question..."
                    />

                    {/* Answer choices */}
                    <div className="grid gap-2 sm:grid-cols-2 mb-4">
                      {q.game_question_choices.map((c, cIdx) => {
                        const color = CHOICE_COLORS[cIdx % CHOICE_COLORS.length];
                        return (
                          <div
                            key={c.id}
                            className={`relative flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${
                              c.is_correct
                                ? "bg-accent-green/10 border-accent-green/30 shadow-sm"
                                : "border-surface-border hover:border-surface-border"
                            }`}
                          >
                            {/* Correct answer toggle */}
                            <button
                              onClick={() => setCorrectChoice(qIdx, cIdx)}
                              className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                                c.is_correct
                                  ? "bg-emerald-600 text-white shadow-[0_0_10px_rgba(5,150,105,0.4)]"
                                  : "bg-surface-raised text-text-muted hover:text-text-primary border border-surface-border"
                              }`}
                              title={c.is_correct ? "Correct answer" : "Mark as correct"}
                            >
                              {c.is_correct ? (
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                color.label
                              )}
                            </button>

                            {/* Choice text */}
                            <input
                              value={c.choice_text}
                              onChange={(e) => updateChoiceText(qIdx, cIdx, e.target.value)}
                              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none min-w-0"
                              placeholder={`Choice ${color.label}`}
                            />

                            {/* Reorder arrows */}
                            <div className="flex flex-col flex-shrink-0 -mr-1">
                              <button
                                onClick={() => moveChoice(qIdx, cIdx, -1)}
                                disabled={cIdx === 0}
                                className="p-0.5 text-text-muted hover:text-indigo-400 disabled:opacity-20 transition-colors"
                                title="Move up"
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                </svg>
                              </button>
                              <button
                                onClick={() => moveChoice(qIdx, cIdx, 1)}
                                disabled={cIdx === q.game_question_choices.length - 1}
                                className="p-0.5 text-text-muted hover:text-indigo-400 disabled:opacity-20 transition-colors"
                                title="Move down"
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════ Delete Modal ═══════ */}
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Game"
      >
        <p className="text-sm text-text-secondary mb-6">
          Are you sure you want to delete <strong className="text-text-primary">&quot;{game.title}&quot;</strong>? This action cannot be undone and all questions will be permanently removed.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteGame}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete Forever
          </Button>
        </div>
      </Modal>
    </div>
  );
}
