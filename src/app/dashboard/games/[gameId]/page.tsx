"use client";

import { useEffect, useState, useRef, use } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Modal } from "@/components/ui/modal";
import { generateGameCode } from "@/lib/game-code";
import { getGameTypeConfig } from "@/lib/game-registry";
import { ThemePicker } from "@/components/games/ThemePicker";
import { DEFAULT_THEME } from "@/lib/theme-presets";
import type { Game, GameQuestionWithChoices, AgeRange, Difficulty, GameTheme, GeneratedQuestion } from "@/lib/types";

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
  { bg: "bg-coral/8", border: "border-coral/25", dot: "bg-coral", label: "A" },
  { bg: "bg-coral/8", border: "border-coral/25", dot: "bg-coral", label: "B" },
  { bg: "bg-sunflower/8", border: "border-sunflower/25", dot: "bg-sunflower", label: "C" },
  { bg: "bg-teal-brand/8", border: "border-teal-brand/25", dot: "bg-teal-brand", label: "D" },
];

type Tab = "howto" | "settings" | "questions" | "preview";

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
  const [activeTab, setActiveTab] = useState<Tab>("questions");
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
  const [generatingWrongIdx, setGeneratingWrongIdx] = useState<number | null>(null);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [bulkCount, setBulkCount] = useState(10);
  const [generatingBulk, setGeneratingBulk] = useState(false);

  // Index of the question currently showing a delete-confirmation popover
  const [confirmDeleteQIdx, setConfirmDeleteQIdx] = useState<number | null>(null);

  // AI generation modal — count → loading → review
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiStep, setAiStep] = useState<"count" | "loading" | "review">("count");
  const [aiCount, setAiCount] = useState(5);
  const [aiGenerated, setAiGenerated] = useState<GeneratedQuestion[]>([]);
  const [aiIncluded, setAiIncluded] = useState<Set<number>>(new Set());
  const [aiSaving, setAiSaving] = useState(false);

  // Editable settings state
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [ageRange, setAgeRange] = useState<AgeRange>("mix");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [timerSeconds, setTimerSeconds] = useState(30);
  const [speedBonus, setSpeedBonus] = useState(true);
  const [isShared, setIsShared] = useState(false);
  const [theme, setTheme] = useState<GameTheme>(DEFAULT_THEME.trivia);

  // Autosave refs
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const questionTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const questionsRef = useRef(questions);
  questionsRef.current = questions;
  const lastSavedSettingsRef = useRef({
    title: "", topic: "", ageRange: "mix" as AgeRange, difficulty: "medium" as Difficulty,
    timerSeconds: 30, speedBonus: true, isShared: false,
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

    // Redirect PIR games to dedicated edit page
    if (gameData.game_type === "price_is_right") {
      router.replace(`/dashboard/games/${gameId}/that-costs-how-much`);
      return;
    }

    setGame(gameData);
    setTitle(gameData.title);
    setTopic(gameData.topic);
    setAgeRange(gameData.age_range);
    setDifficulty(gameData.difficulty);
    setTimerSeconds(gameData.timer_seconds);
    setSpeedBonus(gameData.speed_bonus);
    setIsShared(gameData.is_shared || false);
    setTheme(gameData.theme || DEFAULT_THEME.trivia);
    lastSavedSettingsRef.current = {
      title: gameData.title, topic: gameData.topic,
      ageRange: gameData.age_range, difficulty: gameData.difficulty,
      timerSeconds: gameData.timer_seconds, speedBonus: gameData.speed_bonus,
      isShared: gameData.is_shared || false,
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
      timerSeconds === last.timerSeconds && speedBonus === last.speedBonus &&
      isShared === last.isShared
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
            is_shared: isShared,
            theme,
          })
          .eq("id", game.id);

        if (updateError) throw updateError;

        lastSavedSettingsRef.current = {
          title: title.trim(), topic: topic.trim(),
          ageRange, difficulty, timerSeconds, speedBonus, isShared,
        };
        setGame((g) =>
          g ? { ...g, title: title.trim(), topic: topic.trim(), age_range: ageRange, difficulty, timer_seconds: timerSeconds, speed_bonus: speedBonus, is_shared: isShared } : g
        );
        setSaveStatus("saved");
        clearTimeout(savedStatusTimerRef.current);
        savedStatusTimerRef.current = setTimeout(() => setSaveStatus((s) => s === "saved" ? "idle" : s), 2000);
      } catch {
        setSaveStatus("error");
      }
    }, 800);

    return () => clearTimeout(settingsTimerRef.current);
  }, [title, topic, ageRange, difficulty, timerSeconds, speedBonus, isShared, theme, game]);

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

  function openAIGenerator() {
    setError("");
    setAiGenerated([]);
    setAiIncluded(new Set());
    setAiStep("count");
    setAiModalOpen(true);
  }

  async function runAIGeneration() {
    if (!game) return;
    setAiStep("loading");
    setError("");
    try {
      const res = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: game.topic,
          ageRange: game.age_range,
          difficulty: game.difficulty,
          count: aiCount,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate questions");
      const data = await res.json();
      const generated: GeneratedQuestion[] = data.questions || [];
      setAiGenerated(generated);
      // Default: include all
      setAiIncluded(new Set(generated.map((_, i) => i)));
      setAiStep("review");
    } catch {
      setAiModalOpen(false);
      setError("Failed to generate questions");
    }
  }

  async function saveAIQuestions() {
    if (!game) return;
    const toAdd = aiGenerated.filter((_, i) => aiIncluded.has(i));
    if (toAdd.length === 0) {
      setAiModalOpen(false);
      return;
    }
    setAiSaving(true);
    setError("");
    try {
      const supabase = createClient();
      const startOrder = questions.length;
      const inserted: GameQuestionWithChoices[] = [];

      for (let i = 0; i < toAdd.length; i++) {
        const q = toAdd[i];
        const { data: newQuestion, error: qError } = await supabase
          .from("game_questions")
          .insert({
            game_id: game.id,
            question_order: startOrder + i,
            prompt: q.prompt,
            explanation: q.explanation || null,
          })
          .select()
          .single();
        if (qError) throw qError;

        const choices = q.choices.map((c, j) => ({
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

        inserted.push({
          ...newQuestion,
          game_question_choices: (insertedChoices || []).sort(
            (a: { choice_order: number }, b: { choice_order: number }) =>
              a.choice_order - b.choice_order
          ),
        });
      }

      setQuestions((prev) => [...prev, ...inserted]);
      setAiModalOpen(false);
    } catch {
      setError("Failed to save generated questions");
    } finally {
      setAiSaving(false);
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

      // Route to unified host page
      if (typeof window !== "undefined") {
        window.open(`/host/${session.id}`, "_blank", "noopener,noreferrer");
      }
      setStartingSession(false);
      return;
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

  /* ─── Silent loading: the editor shell renders immediately and dynamic
        values fall back to empty strings until `game` arrives. ─── */

  const difficultyLabel: Record<string, { text: string; color: string }> = {
    easy: { text: "Easy", color: "text-teal-brand" },
    medium: { text: "Medium", color: "text-sunflower" },
    hard: { text: "Hard", color: "text-coral" },
    mix: { text: "Mix", color: "text-violet-brand" },
  };

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
          style={{ background: "var(--violet)" }}
        >
          <Image
            src="/straight-off-dome-icon.svg"
            alt=""
            width={28}
            height={28}
            className="nav-icon-light"
          />
        </span>

        <div className="flex-1 min-w-0">
          <h1 className="font-display font-bold text-[32px] text-ink tracking-[-0.025em] leading-[1.05] truncate">
            Straight Off The Dome
          </h1>
          {game?.title && (
            <p className="text-[14px] text-smoke font-medium mt-1 truncate">
              <span className="italic">{game.title}</span> Edition
            </p>
          )}
          {(saveStatus === "saving" || saveStatus === "saved" || saveStatus === "error") && (
            <p className="text-[13px] flex items-center gap-2 mt-1">
              {saveStatus === "saving" && <span className="text-smoke/70">Saving…</span>}
              {saveStatus === "saved" && <span className="text-teal-brand">Saved</span>}
              {saveStatus === "error" && <span className="text-coral">Save failed</span>}
            </p>
          )}
        </div>

        {/* Start cluster */}
        <button
          type="button"
          onClick={handleStartSession}
          disabled={questions.length === 0 || startingSession}
          className="flex items-center gap-2 px-5 py-1.5 text-[14px] font-display font-semibold tracking-[-0.01em] rounded-full border-2 border-ink transition-[filter,transform] disabled:opacity-60 disabled:cursor-not-allowed hover:brightness-95 active:scale-[0.98]"
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

      {/* Tabs */}
      {(() => {
        const tabs: Tab[] = ["howto", "settings", "questions", "preview"];
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
        );
      })()}
      </div>

      {error && (
        <div className="mt-4 px-4 py-3 rounded-xl bg-coral/10 border border-coral/20 text-coral text-sm flex items-center gap-2">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
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
          <TriviaHowToPlay />
        </div>
      )}

      {/* ═══════ Settings Tab ═══════ */}
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
            {/* Row 1 — Title (wide) + Host Network (narrow) */}
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
                  placeholder="e.g., 90s Pop Culture Trivia"
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

            {/* Row 2 — Topic + Audience */}
            <section className="card-rebrand p-6 lg:col-span-3">
              <SettingsHeader
                title="Question Topic"
                description="What the AI should write questions about. Be specific — narrow topics make for punchier rounds."
              />
              <div className="mt-5">
                <Input
                  variant="paper"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., 90s movies and music"
                />
              </div>
            </section>

            <section className="card-rebrand p-6 lg:col-span-3">
              <SettingsHeader
                title="Audience"
                description="Age range and difficulty shape how the AI writes the questions."
              />
              <div className="mt-5 grid grid-cols-2 gap-4">
                <Select
                  variant="paper"
                  label="Age range"
                  value={ageRange}
                  onChange={(e) => setAgeRange(e.target.value as AgeRange)}
                  options={AGE_OPTIONS}
                />
                <Select
                  variant="paper"
                  label="Difficulty"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                  options={DIFFICULTY_OPTIONS}
                />
              </div>
            </section>

            {/* Row 3 — Round Rules (timer + speed bonus) */}
            <section className="card-rebrand p-6 lg:col-span-6">
              <SettingsHeader
                title="Round Rules"
                description="How long each question stays on screen and whether being faster earns more points."
              />
              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div>
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="font-display font-bold text-[36px] text-ink leading-none tabular-nums">
                      {timerSeconds}
                    </span>
                    <span className="font-display font-bold text-[18px] text-smoke">sec</span>
                    <span className="ml-auto text-[12px] text-smoke">per question</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={60}
                    step={5}
                    value={timerSeconds}
                    onChange={(e) => setTimerSeconds(Number(e.target.value))}
                    className="range-rebrand w-full"
                    style={{
                      background: `linear-gradient(to right, var(--coral) 0%, var(--coral) ${((timerSeconds - 10) / 50) * 100}%, var(--dune) ${((timerSeconds - 10) / 50) * 100}%, var(--dune) 100%)`,
                    }}
                  />
                  <div className="mt-3 flex items-center justify-between text-[11px] text-smoke">
                    <span>Quick (10s)</span>
                    <span>Generous (60s)</span>
                  </div>
                </div>

                <label className="flex items-start gap-3 rounded-2xl border-2 border-dune px-4 py-3 cursor-pointer select-none hover:border-ink/40 transition-colors">
                  <span
                    role="switch"
                    aria-checked={speedBonus}
                    className={`relative w-11 h-6 rounded-full border-2 border-ink shrink-0 transition-colors mt-0.5 ${
                      speedBonus ? "bg-coral" : "bg-paper"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={speedBonus}
                      onChange={(e) => setSpeedBonus(e.target.checked)}
                      className="sr-only"
                    />
                    <span
                      className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-ink transition-transform"
                      style={{ transform: speedBonus ? "translateX(20px)" : "translateX(0)" }}
                    />
                  </span>
                  <span className="flex-1">
                    <span className="block text-[14px] font-display font-semibold text-ink">
                      Speed bonus
                    </span>
                    <span className="block text-[12px] text-smoke leading-snug mt-0.5">
                      Faster correct answers earn more points. Turn off for a slower, knowledge-only game.
                    </span>
                  </span>
                </label>
              </div>
            </section>

            {/* Row 4 — Theme */}
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

      {/* ═══════ Questions Tab ═══════ */}
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
          {/* Header row */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-coral">
              {questions.length} {questions.length === 1 ? "Question" : "Questions"}
            </h2>
            <button
              type="button"
              onClick={openAIGenerator}
              className="inline-flex items-center gap-2 px-4 py-2 text-[14px] font-display font-semibold tracking-[-0.01em] rounded-full border-2 border-ink transition-[filter,transform] hover:brightness-95 active:scale-[0.98]"
              style={{ background: "var(--coral)", color: "#FFFFFF" }}
            >
              <Image
                src="/magic-icon.svg"
                alt=""
                width={18}
                height={18}
                className="nav-icon-light"
              />
              Generate Questions For Me
            </button>
          </div>

          {questions.length === 0 ? (
            /* ─── Empty State ─── */
            <div className="card-rebrand p-10 text-center border border-violet-brand/20">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-coral/10 flex items-center justify-center">
                <svg className="h-8 w-8 text-coral" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-ink mb-2">
                No questions yet
              </h3>
              <p className="text-smoke mb-8 max-w-sm mx-auto">
                Generate questions with AI or add them one by one. The AI will match your topic, difficulty, and age range.
              </p>
              <div className="max-w-xs mx-auto">
                <label className="block text-sm font-medium text-ink mb-2">
                  How many questions?
                </label>
                <div className="flex items-center gap-3 mb-5">
                  <input
                    type="range"
                    min={3}
                    max={20}
                    value={bulkCount}
                    onChange={(e) => setBulkCount(Number(e.target.value))}
                    className="range-rebrand flex-1"
                  />
                  <span className="text-lg font-bold text-coral tabular-nums w-8 text-center">
                    {bulkCount}
                  </span>
                </div>
                <Button variant="cta"
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
                    <div className="h-0.5 bg-violet-brand rounded-full mb-2" />
                  )}

                  <article className="card-rebrand p-5">
                    {/* Card header — grip + #N chip + AI actions + delete */}
                    <div className="flex items-center gap-3 mb-4">
                      <span
                        className="flex items-center justify-center text-smoke hover:text-ink cursor-grab active:cursor-grabbing select-none"
                        title="Drag to reorder"
                        aria-label="Drag to reorder"
                        onMouseDown={(e) => e.stopPropagation()}
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
                      <span className="inline-flex items-center px-3 h-9 rounded-full bg-dune border border-ink/20 font-display font-medium text-[13px] text-ink tabular-nums shrink-0 leading-none whitespace-nowrap">
                        Question #{qIdx + 1}
                      </span>

                      <div className="flex-1" />

                      {/* AI actions */}
                      <button
                        onClick={() => handleRegenerateQuestion(qIdx)}
                        disabled={regeneratingIdx !== null}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-display font-semibold rounded-full border border-dune text-ink hover:border-ink/40 hover:bg-dune/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        title="Regenerate the question with AI"
                      >
                        {regeneratingIdx === qIdx ? (
                          <Spinner className="h-3.5 w-3.5" />
                        ) : (
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        )}
                        Regenerate a New Question
                      </button>
                      <button
                        onClick={() => handleGenerateWrongAnswers(qIdx)}
                        disabled={generatingWrongIdx !== null}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-display font-semibold rounded-full border border-dune text-ink hover:border-ink/40 hover:bg-dune/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        title="Rewrite the wrong answer choices"
                      >
                        {generatingWrongIdx === qIdx ? (
                          <Spinner className="h-3.5 w-3.5" />
                        ) : (
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        )}
                        Rewrite Wrong Answers
                      </button>

                      {/* Move + delete */}
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          onClick={() => handleMoveQuestion(qIdx, -1)}
                          disabled={qIdx === 0}
                          className="p-1.5 rounded-full text-smoke hover:text-ink hover:bg-dune/60 disabled:opacity-20 disabled:hover:bg-transparent transition"
                          title="Move up"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleMoveQuestion(qIdx, 1)}
                          disabled={qIdx === questions.length - 1}
                          className="p-1.5 rounded-full text-smoke hover:text-ink hover:bg-dune/60 disabled:opacity-20 disabled:hover:bg-transparent transition"
                          title="Move down"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <div className="relative">
                          <button
                            onClick={() => setConfirmDeleteQIdx(qIdx)}
                            className={`p-1.5 rounded-full transition ${
                              confirmDeleteQIdx === qIdx
                                ? "text-coral bg-[color-mix(in_srgb,var(--coral)_10%,var(--paper))]"
                                : "text-smoke hover:text-coral hover:bg-[color-mix(in_srgb,var(--coral)_10%,var(--paper))]"
                            }`}
                            title="Remove question"
                            aria-label="Remove question"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                          {confirmDeleteQIdx === qIdx && (
                            <div
                              className="absolute right-0 top-full mt-2 z-20 w-60 rounded-2xl p-3 shadow-[0_10px_40px_-16px_rgba(26,20,18,0.25)]"
                              style={{ background: "var(--paper)", border: "2px solid var(--ink)" }}
                            >
                              <p className="text-[13px] text-ink font-medium mb-3">
                                Delete this question?
                              </p>
                              <div className="flex gap-2 justify-end">
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteQIdx(null)}
                                  className="px-3 py-1.5 text-[13px] font-display font-semibold rounded-full border border-dune text-ink hover:bg-dune/60 transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleRemoveQuestion(qIdx);
                                    setConfirmDeleteQIdx(null);
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

                    {/* Question prompt */}
                    <textarea
                      value={q.prompt}
                      onChange={(e) => updateQuestionPrompt(qIdx, e.target.value)}
                      className="w-full bg-paper border-2 border-dune rounded-2xl outline-none resize-none font-body font-bold text-[18px] text-ink leading-snug placeholder:text-ink/30 focus:border-ink/40 px-4 py-3 transition-colors mb-4"
                      rows={2}
                      placeholder="Type your question…"
                    />

                    {/* Answer choices — 2 cols, lettered tile per choice */}
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {q.game_question_choices.map((c, cIdx) => {
                        const color = CHOICE_COLORS[cIdx % CHOICE_COLORS.length];
                        return (
                          <label
                            key={c.id}
                            className={`group/choice flex items-center gap-2.5 rounded-2xl border-2 px-3 py-2.5 transition-colors cursor-text ${
                              c.is_correct
                                ? "border-ink bg-[color-mix(in_srgb,var(--teal)_18%,var(--paper))]"
                                : "border-dune bg-paper hover:border-ink/40"
                            }`}
                          >
                            {/* Letter / correct-answer toggle */}
                            <button
                              type="button"
                              onClick={() => setCorrectChoice(qIdx, cIdx)}
                              className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-display font-bold text-[13px] border-2 border-ink transition-colors ${
                                c.is_correct
                                  ? "bg-teal-brand text-paper"
                                  : "bg-paper text-ink hover:bg-dune"
                              }`}
                              title={c.is_correct ? "Correct answer" : "Mark as correct"}
                              aria-label={c.is_correct ? `${color.label} — correct answer` : `Mark ${color.label} as correct`}
                            >
                              {c.is_correct ? (
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                color.label
                              )}
                            </button>

                            {/* Choice text */}
                            <input
                              value={c.choice_text}
                              onChange={(e) => updateChoiceText(qIdx, cIdx, e.target.value)}
                              className="flex-1 min-w-0 bg-transparent border-0 outline-none font-body text-[14px] text-ink placeholder:text-ink/30"
                              placeholder={`Answer ${color.label}`}
                            />

                            {/* Reorder arrows — only visible on hover of the choice */}
                            <div className="flex flex-col shrink-0 opacity-0 group-hover/choice:opacity-100 focus-within:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => moveChoice(qIdx, cIdx, -1)}
                                disabled={cIdx === 0}
                                className="p-0.5 text-smoke hover:text-ink disabled:opacity-20 transition-colors"
                                title="Move up"
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => moveChoice(qIdx, cIdx, 1)}
                                disabled={cIdx === q.game_question_choices.length - 1}
                                className="p-0.5 text-smoke hover:text-ink disabled:opacity-20 transition-colors"
                                title="Move down"
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </article>
                </div>
              ))}

              {/* Add question manually — dashed tile at the bottom of the list */}
              <button
                onClick={handleAddQuestion}
                disabled={addingQuestion}
                className="group w-full mt-3 rounded-2xl border-2 border-dashed border-dune hover:border-ink transition-colors flex items-center justify-center gap-3 py-4 text-center disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span className="w-9 h-9 rounded-full flex items-center justify-center border-2 border-ink bg-coral transition-transform duration-200 group-hover:scale-110">
                  <svg className="w-4 h-4 text-paper" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                  </svg>
                </span>
                <span className="font-display font-semibold text-[14px] text-ink">
                  {addingQuestion ? "Adding…" : "Add question manually"}
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Game Preview Tab — placeholder */}
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

      {/* ═══════ AI Generation Modal ═══════ */}
      <Modal
        open={aiModalOpen}
        onClose={() => !aiSaving && setAiModalOpen(false)}
        title={
          aiStep === "count"
            ? "Generate questions with AI"
            : aiStep === "loading"
              ? "Generating…"
              : `Review ${aiGenerated.length} question${aiGenerated.length === 1 ? "" : "s"}`
        }
      >
        {aiStep === "count" && (
          <div>
            <p className="text-[14px] text-smoke leading-relaxed mb-5">
              How many questions should we draft? We&apos;ll use your topic
              {game?.topic ? <> (<span className="italic">{game.topic}</span>)</> : ""}, age range, and
              difficulty. You&apos;ll review each one before anything gets added.
            </p>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-smoke mb-2">
              Number of questions
            </label>
            <div className="flex items-center gap-4 mb-2">
              <input
                type="range"
                min={1}
                max={20}
                value={aiCount}
                onChange={(e) => setAiCount(Number(e.target.value))}
                className="range-rebrand flex-1"
                style={{
                  background: `linear-gradient(to right, var(--coral) 0%, var(--coral) ${((aiCount - 1) / 19) * 100}%, var(--dune) ${((aiCount - 1) / 19) * 100}%, var(--dune) 100%)`,
                }}
              />
              <span className="font-display font-bold text-[28px] text-ink tabular-nums w-12 text-right">
                {aiCount}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-smoke mb-6">
              <span>1</span>
              <span>20</span>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="cta-ghost" onClick={() => setAiModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="cta" onClick={runAIGeneration}>
                Generate
              </Button>
            </div>
          </div>
        )}

        {aiStep === "loading" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Spinner className="h-8 w-8" />
            <p className="text-[14px] text-smoke">Drafting {aiCount} question{aiCount === 1 ? "" : "s"}…</p>
          </div>
        )}

        {aiStep === "review" && (
          <div>
            <p className="text-[13px] text-smoke mb-4">
              Toggle the ones you want to keep. {aiIncluded.size} of {aiGenerated.length} selected.
            </p>
            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1 -mr-1">
              {aiGenerated.map((q, i) => {
                const included = aiIncluded.has(i);
                return (
                  <div
                    key={i}
                    className={`rounded-2xl border-2 px-4 py-3 transition-colors ${
                      included ? "border-ink bg-paper" : "border-dune bg-paper opacity-55"
                    }`}
                  >
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={(e) => {
                          setAiIncluded((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(i);
                            else next.delete(i);
                            return next;
                          });
                        }}
                        className="checkbox-rebrand mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-body font-bold text-[15px] text-ink leading-snug mb-2">
                          {q.prompt}
                        </p>
                        <ul className="space-y-1 text-[13px]">
                          {q.choices.map((c, ci) => {
                            const letter = ["A", "B", "C", "D"][ci] || "";
                            return (
                              <li
                                key={ci}
                                className={`flex items-start gap-2 ${
                                  c.isCorrect ? "text-ink font-semibold" : "text-smoke"
                                }`}
                              >
                                <span
                                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-display font-bold border shrink-0 mt-0.5 ${
                                    c.isCorrect
                                      ? "bg-teal-brand text-paper border-ink"
                                      : "bg-paper text-smoke border-dune"
                                  }`}
                                >
                                  {c.isCorrect ? "✓" : letter}
                                </span>
                                <span>{c.text}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2 justify-end mt-5 pt-4 border-t border-dune">
              <Button variant="cta-ghost" onClick={() => setAiModalOpen(false)} disabled={aiSaving}>
                Discard all
              </Button>
              <Button
                variant="cta"
                onClick={saveAIQuestions}
                loading={aiSaving}
                disabled={aiIncluded.size === 0}
              >
                Add {aiIncluded.size} to game
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══════ Delete Modal ═══════ */}
      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Game"
      >
        <p className="text-sm text-ink mb-6">
          Are you sure you want to delete <strong className="text-ink">&quot;{game?.title ?? ""}&quot;</strong>? This action cannot be undone and all questions will be permanently removed.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
          <Button variant="cta-danger" onClick={handleDeleteGame}>
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

// ============================================================
// How-to-play tab content (trivia)
// ============================================================

function TriviaHowToPlay() {
  const steps: { title: string; body: string }[] = [
    {
      title: "You host, they play",
      body:
        "Share the on-screen code and join link. Everyone joins from their phone. You drive the pace from the host remote.",
    },
    {
      title: "A question appears",
      body:
        "Each round a multiple-choice question pops on the main display. Everyone sees the prompt and the four answer choices.",
    },
    {
      title: "Players lock in an answer",
      body:
        "Players have until the timer runs out to pick a choice on their phone. Only the first answer counts — no take-backs.",
    },
    {
      title: "Speed matters (if you want it to)",
      body:
        "With speed bonus on, faster correct answers score more. Turn it off for a calmer, purely-knowledge-based game.",
    },
    {
      title: "Leaderboard and finale",
      body:
        "Scores update after every question. After the last one, the leaderboard crowns the winner. Rematch, swap games, or end the night from your host remote.",
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
      <div className="space-y-4 self-start" style={{ animationDelay: "0ms" }}>
        <section className="card-rebrand p-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1 max-w-2xl">
              <h2 className="font-display font-bold text-[28px] text-ink tracking-[-0.02em] leading-[1.05] mb-2">
                How <span className="italic">Straight Off The Dome</span> plays
              </h2>
              <p className="text-[14px] text-smoke leading-relaxed">
                Rapid-fire multiple-choice trivia. You pick the topic and difficulty, we generate the questions,
                players race to answer first. 2–12 players works best.
              </p>
            </div>
            <div className="flex gap-2 text-[12px] text-smoke shrink-0">
              <span className="chip-rebrand chip-accent-violet">2–12 players</span>
              <span className="chip-rebrand chip-accent-coral">~10 min</span>
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
              <span>10–15 questions is the sweet spot. Long rounds drag; short ones leave folks wanting more.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-ink font-semibold mt-0.5">•</span>
              <span>Specific topics (&ldquo;90s sitcoms&rdquo;, &ldquo;F1 history&rdquo;) beat broad ones — players know when they&apos;re supposed to know.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-ink font-semibold mt-0.5">•</span>
              <span>Speed bonus on = competitive. Off = forgiving. Read the room before starting.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-ink font-semibold mt-0.5">•</span>
              <span>Review and tweak AI-generated questions before hosting — you know your crowd better than we do.</span>
            </li>
          </ul>
        </section>
      </aside>
    </div>
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
