"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { subscribeToSession, unsubscribe } from "@/lib/realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { AVATAR_COLORS } from "@/lib/avatar-colors";
import type {
  Session,
  SessionPlayer,
  SessionQuestionState,
  GameQuestionWithChoices,
} from "@/lib/types";

type PlayerPhase =
  | "joining"
  | "lobby"
  | "question"
  | "answered"
  | "results"
  | "leaderboard"
  | "finished"
  | "removed"
  | "error";

export default function PlayerSessionPage({
  params,
}: {
  params: Promise<{ sessionCode: string }>;
}) {
  const { sessionCode } = use(params);
  const [phase, setPhase] = useState<PlayerPhase>("joining");
  const [session, setSession] = useState<Session | null>(null);
  const [player, setPlayer] = useState<SessionPlayer | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [questionState, setQuestionState] =
    useState<SessionQuestionState | null>(null);
  const [currentQuestion, setCurrentQuestion] =
    useState<GameQuestionWithChoices | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [avatarColor, setAvatarColor] = useState<string>(AVATAR_COLORS[0]);
  const [error, setError] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [answerResult, setAnswerResult] = useState<{
    correct: boolean;
    points: number;
  } | null>(null);

  // Load session by code
  useEffect(() => {
    async function findSession() {
      const supabase = createClient();
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("code", sessionCode.toUpperCase())
        .neq("status", "finished")
        .maybeSingle();

      if (!data) {
        setError("Game not found. Check the code and try again.");
        setPhase("error");
        return;
      }

      setSession(data);

      // Load players
      const { data: playersData } = await supabase
        .from("session_players")
        .select("*")
        .eq("session_id", data.id)
        .eq("is_removed", false);
      setPlayers(playersData || []);

      // Check if we already joined (stored in localStorage)
      const storedPlayerId = localStorage.getItem(
        `heyhost-player-${data.id}`
      );
      if (storedPlayerId) {
        const { data: existingPlayer } = await supabase
          .from("session_players")
          .select("*")
          .eq("id", storedPlayerId)
          .maybeSingle();

        if (existingPlayer && !existingPlayer.is_removed) {
          setPlayer(existingPlayer);
          if (data.status === "lobby") {
            setPhase("lobby");
          } else if (data.status === "playing") {
            setPhase("question");
          } else {
            setPhase("finished");
          }
        } else if (existingPlayer?.is_removed) {
          setPhase("removed");
        }
      }
    }

    findSession();
  }, [sessionCode]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!session) return;

    const channel = subscribeToSession(session.id, {
      onSessionChange: (payload) => {
        const s = payload.new as Session;
        setSession(s);
        if (s.status === "finished") {
          setPhase("finished");
        }
      },
      onPlayerChange: (payload) => {
        const p = payload.new as SessionPlayer;
        if (payload.eventType === "INSERT") {
          setPlayers((prev) => [...prev.filter((x) => x.id !== p.id), p]);
        } else if (payload.eventType === "UPDATE") {
          // Check if current player was removed
          if (player && p.id === player.id && p.is_removed) {
            setPhase("removed");
            return;
          }
          setPlayers((prev) =>
            prev
              .map((x) => (x.id === p.id ? p : x))
              .filter((x) => !x.is_removed)
          );
        }
      },
      onQuestionStateChange: (payload) => {
        const qs = payload.new as SessionQuestionState;
        setQuestionState(qs);

        if (payload.eventType === "INSERT") {
          // New question — reset answer state
          setSelectedChoiceId(null);
          setAnswerResult(null);
          setPhase("question");
        } else if (qs.show_leaderboard) {
          setPhase("leaderboard");
        } else if (qs.show_results) {
          setPhase("results");
        }
      },
    });

    return () => unsubscribe(channel);
  }, [session?.id, player?.id]);

  // Load current question when question state changes
  useEffect(() => {
    if (!questionState) return;

    async function loadQuestion() {
      const supabase = createClient();
      const { data } = await supabase
        .from("game_questions")
        .select("*, game_question_choices(*)")
        .eq("id", questionState!.question_id)
        .single();

      if (data) {
        setCurrentQuestion({
          ...data,
          game_question_choices: data.game_question_choices.sort(
            (a: { choice_order: number }, b: { choice_order: number }) =>
              a.choice_order - b.choice_order
          ),
        });
      }
    }

    loadQuestion();
  }, [questionState?.question_id]);

  // Check if player already answered this question
  useEffect(() => {
    if (!questionState || !player || !currentQuestion) return;

    async function checkExistingAnswer() {
      const supabase = createClient();
      const { data } = await supabase
        .from("session_answers")
        .select("*")
        .eq("session_id", session!.id)
        .eq("player_id", player!.id)
        .eq("question_id", questionState!.question_id)
        .maybeSingle();

      if (data) {
        setSelectedChoiceId(data.choice_id);
        setAnswerResult({
          correct: data.is_correct,
          points: data.points_awarded,
        });
        setPhase("answered");
      }
    }

    checkExistingAnswer();
  }, [questionState?.question_id, player?.id, currentQuestion?.id]);

  // Timer countdown
  useEffect(() => {
    if (!questionState || questionState.is_paused || questionState.is_locked)
      return;
    if (!questionState.ends_at) return;

    const interval = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil(
          (new Date(questionState.ends_at!).getTime() - Date.now()) / 1000
        )
      );
      setTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [questionState?.ends_at, questionState?.is_paused, questionState?.is_locked]);

  const handleJoin = useCallback(async () => {
    if (!session || !displayName.trim()) {
      setError("Enter a display name");
      return;
    }

    setJoinLoading(true);
    setError("");

    try {
      const supabase = createClient();

      // Check duplicate names
      const { data: existing } = await supabase
        .from("session_players")
        .select("display_name")
        .eq("session_id", session.id)
        .eq("is_removed", false);

      let finalName = displayName.trim();
      const names = (existing || []).map((p) => p.display_name.toLowerCase());
      if (names.includes(finalName.toLowerCase())) {
        let counter = 2;
        while (names.includes(`${finalName.toLowerCase()}${counter}`)) {
          counter++;
        }
        finalName = `${finalName}${counter}`;
      }

      const { data: newPlayer, error: insertError } = await supabase
        .from("session_players")
        .insert({
          session_id: session.id,
          display_name: finalName,
          avatar_color: avatarColor,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setPlayer(newPlayer);
      localStorage.setItem(`heyhost-player-${session.id}`, newPlayer.id);
      setPhase("lobby");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to join. Try again."
      );
    } finally {
      setJoinLoading(false);
    }
  }, [session, displayName, avatarColor]);

  const handleAnswer = useCallback(
    async (choiceId: string) => {
      if (
        !session ||
        !player ||
        !questionState ||
        !currentQuestion ||
        selectedChoiceId
      )
        return;

      setSelectedChoiceId(choiceId);
      setPhase("answered");

      const supabase = createClient();
      const startedAt = questionState.started_at
        ? new Date(questionState.started_at).getTime()
        : Date.now();
      const timeMs = Date.now() - startedAt;

      const choice = currentQuestion.game_question_choices.find(
        (c) => c.id === choiceId
      );
      const isCorrect = choice?.is_correct || false;

      // Calculate points using session settings (publicly readable)
      let points = 0;
      if (isCorrect) {
        points = 1000;
        if (session.speed_bonus) {
          const totalMs = session.timer_seconds * 1000;
          const fraction = Math.max(0, 1 - timeMs / totalMs);
          points += Math.round(500 * fraction);
        }
      }

      setAnswerResult({ correct: isCorrect, points });

      await supabase.from("session_answers").insert({
        session_id: session.id,
        player_id: player.id,
        question_id: questionState.question_id,
        choice_id: choiceId,
        is_correct: isCorrect,
        time_ms: timeMs,
        points_awarded: points,
      });
      // Score is auto-updated by a DB trigger on session_answers insert
    },
    [session, player, questionState, currentQuestion, selectedChoiceId]
  );

  // ============ RENDER ============

  if (phase === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-zinc-50 dark:bg-background">
        <div className="text-center">
          <p className="text-lg text-red-600 dark:text-red-400 mb-4">
            {error}
          </p>
          <Link href="/play">
            <Button>Try Again</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "removed") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-zinc-50 dark:bg-background">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            You were removed
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mb-6">
            The host removed you from the game.
          </p>
          <Link href="/play">
            <Button>Join Another Game</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-background">
        <Spinner />
      </div>
    );
  }

  // Join form
  if (phase === "joining") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-zinc-50 dark:bg-background">
        <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-8">
          HeyHost
        </h1>
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              Game Code
            </span>
            <p className="text-3xl font-bold font-mono tracking-widest text-zinc-900 dark:text-zinc-100">
              {sessionCode}
            </p>
          </div>

          <Input
            label="Your Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter your name"
            maxLength={20}
            autoFocus
          />

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Pick a Color
            </label>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setAvatarColor(color)}
                  className={`w-10 h-10 rounded-full transition-transform ${
                    avatarColor === color
                      ? "ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-zinc-950 scale-110"
                      : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <Button
            onClick={handleJoin}
            loading={joinLoading}
            className="w-full"
            size="lg"
          >
            Join Game
          </Button>
        </div>
      </div>
    );
  }

  // Lobby
  if (phase === "lobby" || (session.status === "lobby" && player)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-zinc-50 dark:bg-background">
        <h1 className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mb-2">
          HeyHost
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8">
          Waiting for the host to start...
        </p>

        <div
          className="w-20 h-20 rounded-full mb-4 flex items-center justify-center text-white text-2xl font-bold"
          style={{ backgroundColor: player?.avatar_color }}
        >
          {player?.display_name.charAt(0).toUpperCase()}
        </div>
        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-8">
          {player?.display_name}
        </p>

        <div className="text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">
            Players ({players.length})
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {players.map((p) => (
              <div
                key={p.id}
                className="px-3 py-1 rounded-full text-sm text-white font-medium"
                style={{ backgroundColor: p.avatar_color }}
              >
                {p.display_name}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <Spinner className="h-8 w-8" />
        </div>
      </div>
    );
  }

  // Question / Answered
  if (
    (phase === "question" || phase === "answered") &&
    currentQuestion &&
    questionState
  ) {
    return (
      <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-background">
        {/* Timer bar */}
        <div className="p-4 flex items-center justify-between">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Q{questionState.question_index + 1}
          </span>
          <span
            className={`text-2xl font-bold font-mono ${
              timeLeft <= 5
                ? "text-red-600"
                : "text-zinc-900 dark:text-zinc-100"
            }`}
          >
            {questionState.is_paused ? "PAUSED" : timeLeft}
          </span>
        </div>

        {/* Question text */}
        <div className="px-4 pb-4">
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 text-center">
            {currentQuestion.prompt}
          </p>
        </div>

        {/* Answer choices */}
        <div className="flex-1 flex flex-col justify-end p-4 space-y-3">
          {phase === "answered" && answerResult ? (
            <div className="text-center py-8">
              <div
                className={`text-6xl mb-4 ${
                  answerResult.correct ? "text-green-500" : "text-red-500"
                }`}
              >
                {answerResult.correct ? "Correct!" : "Wrong"}
              </div>
              {answerResult.points > 0 && (
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  +{answerResult.points} pts
                </p>
              )}
            </div>
          ) : (
            currentQuestion.game_question_choices.map((choice, idx) => {
              const colors = [
                "bg-red-500",
                "bg-blue-500",
                "bg-amber-500",
                "bg-green-500",
                "bg-violet-500",
              ];
              return (
                <button
                  key={choice.id}
                  onClick={() => handleAnswer(choice.id)}
                  disabled={
                    questionState.is_locked ||
                    questionState.is_paused ||
                    !!selectedChoiceId
                  }
                  className={`w-full py-4 px-6 rounded-xl text-white font-semibold text-lg transition-all disabled:opacity-60 ${colors[idx]} hover:opacity-90 active:scale-[0.98]`}
                >
                  {choice.choice_text}
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // Results (correct answer shown)
  if (phase === "results" && questionState && currentQuestion) {
    const correctChoice = currentQuestion.game_question_choices.find(
      (c) => c.is_correct
    );
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-zinc-50 dark:bg-background">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
          Results
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">
          Correct answer:
        </p>
        <p className="text-lg font-semibold text-green-600 dark:text-green-400 mb-6">
          {correctChoice?.choice_text}
        </p>
        {answerResult && (
          <div
            className={`text-2xl font-bold ${
              answerResult.correct
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {answerResult.correct
              ? `+${answerResult.points} pts`
              : "No points"}
          </div>
        )}
        <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-6">
          Waiting for host...
        </p>
      </div>
    );
  }

  // Leaderboard (between questions)
  if (phase === "leaderboard") {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-zinc-50 dark:bg-background">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">
          Leaderboard
        </h2>
        <div className="w-full max-w-sm space-y-2">
          {sorted.slice(0, 10).map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg ${
                p.id === player?.id
                  ? "bg-indigo-50 dark:bg-indigo-900/30"
                  : "bg-white dark:bg-slate-800"
              }`}
            >
              <span className="text-lg font-bold text-zinc-400 w-8">
                #{i + 1}
              </span>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                style={{ backgroundColor: p.avatar_color }}
              >
                {p.display_name.charAt(0).toUpperCase()}
              </div>
              <span className="flex-1 font-medium text-zinc-900 dark:text-zinc-100">
                {p.display_name}
              </span>
              <span className="font-mono font-bold text-zinc-600 dark:text-zinc-300">
                {p.score}
              </span>
            </div>
          ))}
        </div>
        <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-6">
          Waiting for next question...
        </p>
      </div>
    );
  }

  // Finished
  if (phase === "finished") {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const myRank = sorted.findIndex((p) => p.id === player?.id) + 1;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-zinc-50 dark:bg-background">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          Game Over!
        </h1>
        {player && (
          <div className="text-center mb-8">
            <p className="text-lg text-zinc-600 dark:text-zinc-400">
              You placed{" "}
              <span className="font-bold text-indigo-600 dark:text-indigo-400">
                #{myRank}
              </span>
            </p>
            <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              {player.score} pts
            </p>
          </div>
        )}

        <div className="w-full max-w-sm space-y-2">
          {sorted.slice(0, 10).map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg ${
                p.id === player?.id
                  ? "bg-indigo-50 dark:bg-indigo-900/30"
                  : "bg-white dark:bg-slate-800"
              }`}
            >
              <span className="text-lg font-bold text-zinc-400 w-8">
                #{i + 1}
              </span>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                style={{ backgroundColor: p.avatar_color }}
              >
                {p.display_name.charAt(0).toUpperCase()}
              </div>
              <span className="flex-1 font-medium text-zinc-900 dark:text-zinc-100">
                {p.display_name}
              </span>
              <span className="font-mono font-bold text-zinc-600 dark:text-zinc-300">
                {p.score}
              </span>
            </div>
          ))}
        </div>

        <Link href="/play" className="mt-8">
          <Button>Play Again</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-background">
      <Spinner />
    </div>
  );
}
