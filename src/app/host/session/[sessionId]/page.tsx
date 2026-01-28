"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { subscribeToSession, unsubscribe } from "@/lib/realtime";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type {
  Session,
  SessionPlayer,
  SessionQuestionState,
  GameQuestion,
  SessionAnswer,
} from "@/lib/types";

export default function HostRemotePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [questions, setQuestions] = useState<GameQuestion[]>([]);
  const [questionState, setQuestionState] =
    useState<SessionQuestionState | null>(null);
  const [answers, setAnswers] = useState<SessionAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [timerSeconds, setTimerSeconds] = useState(30);

  // Load initial data
  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const { data: sessionData } = await supabase
        .from("sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (!sessionData) {
        router.push("/dashboard");
        return;
      }

      setSession(sessionData);

      // Load game timer setting
      const { data: gameData } = await supabase
        .from("games")
        .select("timer_seconds")
        .eq("id", sessionData.game_id)
        .single();

      if (gameData) setTimerSeconds(gameData.timer_seconds);

      // Load questions
      const { data: questionsData } = await supabase
        .from("game_questions")
        .select("*")
        .eq("game_id", sessionData.game_id)
        .order("question_order", { ascending: true });

      setQuestions(questionsData || []);

      // Load players
      const { data: playersData } = await supabase
        .from("session_players")
        .select("*")
        .eq("session_id", sessionId)
        .eq("is_removed", false);

      setPlayers(playersData || []);

      // Load current question state if playing
      if (sessionData.current_question_index >= 0) {
        const { data: qsData } = await supabase
          .from("session_question_state")
          .select("*")
          .eq("session_id", sessionId)
          .eq("question_index", sessionData.current_question_index)
          .maybeSingle();

        if (qsData) setQuestionState(qsData);
      }

      // Load answers for current question
      if (sessionData.current_question_index >= 0 && questionsData) {
        const currentQ = questionsData[sessionData.current_question_index];
        if (currentQ) {
          const { data: answersData } = await supabase
            .from("session_answers")
            .select("*")
            .eq("session_id", sessionId)
            .eq("question_id", currentQ.id);
          setAnswers(answersData || []);
        }
      }

      setLoading(false);
    }

    load();
  }, [sessionId, router]);

  // Subscribe to realtime
  useEffect(() => {
    if (!session) return;

    const channel = subscribeToSession(session.id, {
      onSessionChange: (payload) => {
        setSession(payload.new as Session);
      },
      onPlayerChange: (payload) => {
        const p = payload.new as SessionPlayer;
        if (payload.eventType === "INSERT") {
          setPlayers((prev) => [...prev.filter((x) => x.id !== p.id), p]);
        } else if (payload.eventType === "UPDATE") {
          if (p.is_removed) {
            setPlayers((prev) => prev.filter((x) => x.id !== p.id));
          } else {
            setPlayers((prev) => prev.map((x) => (x.id === p.id ? p : x)));
          }
        }
      },
      onQuestionStateChange: (payload) => {
        setQuestionState(payload.new as SessionQuestionState);
      },
      onAnswerChange: (payload) => {
        if (payload.eventType === "INSERT") {
          setAnswers((prev) => [...prev, payload.new as SessionAnswer]);
        }
      },
    });

    return () => unsubscribe(channel);
  }, [session?.id]);

  const startGame = useCallback(async () => {
    if (!session || questions.length === 0) return;
    const supabase = createClient();

    // Move session to playing, set question index 0
    await supabase
      .from("sessions")
      .update({ status: "playing", current_question_index: 0 })
      .eq("id", session.id);

    // Create question state for first question
    const now = new Date();
    const endsAt = new Date(now.getTime() + timerSeconds * 1000);

    await supabase.from("session_question_state").insert({
      session_id: session.id,
      question_index: 0,
      question_id: questions[0].id,
      started_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      is_paused: false,
      is_locked: false,
      show_results: false,
    });

    setAnswers([]);
  }, [session, questions, timerSeconds]);

  const pauseResume = useCallback(async () => {
    if (!questionState || !session) return;
    const supabase = createClient();

    if (questionState.is_paused) {
      // Resume: calculate new ends_at based on remaining time
      const remainingMs = questionState.paused_remaining_ms || 0;
      const newEndsAt = new Date(Date.now() + remainingMs);
      await supabase
        .from("session_question_state")
        .update({
          is_paused: false,
          paused_remaining_ms: null,
          started_at: new Date(
            Date.now() - (timerSeconds * 1000 - remainingMs)
          ).toISOString(),
          ends_at: newEndsAt.toISOString(),
        })
        .eq("id", questionState.id);
    } else {
      // Pause: save remaining time
      const remaining = Math.max(
        0,
        new Date(questionState.ends_at!).getTime() - Date.now()
      );
      await supabase
        .from("session_question_state")
        .update({
          is_paused: true,
          paused_remaining_ms: remaining,
        })
        .eq("id", questionState.id);
    }
  }, [questionState, session, timerSeconds]);

  const endQuestionEarly = useCallback(async () => {
    if (!questionState || !session) return;
    const supabase = createClient();
    await supabase
      .from("session_question_state")
      .update({ is_locked: true, show_results: true })
      .eq("id", questionState.id);
  }, [questionState, session]);

  const showLeaderboard = useCallback(async () => {
    if (!questionState || !session) return;
    const supabase = createClient();
    await supabase
      .from("session_question_state")
      .update({ show_leaderboard: true })
      .eq("id", questionState.id);
  }, [questionState, session]);

  const nextQuestion = useCallback(async () => {
    if (!session || !questions.length) return;
    const supabase = createClient();
    const nextIndex = session.current_question_index + 1;

    if (nextIndex >= questions.length) {
      // End game
      await supabase
        .from("sessions")
        .update({ status: "finished", ended_at: new Date().toISOString() })
        .eq("id", session.id);
      return;
    }

    // Update session index
    await supabase
      .from("sessions")
      .update({ current_question_index: nextIndex })
      .eq("id", session.id);

    // Create question state for next question
    const now = new Date();
    const endsAt = new Date(now.getTime() + timerSeconds * 1000);

    await supabase.from("session_question_state").insert({
      session_id: session.id,
      question_index: nextIndex,
      question_id: questions[nextIndex].id,
      started_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      is_paused: false,
      is_locked: false,
      show_results: false,
    });

    setAnswers([]);
  }, [session, questions, timerSeconds]);

  const kickPlayer = useCallback(
    async (playerId: string) => {
      if (!session) return;
      const supabase = createClient();
      await supabase
        .from("session_players")
        .update({ is_removed: true })
        .eq("id", playerId);
    },
    [session]
  );

  const endGame = useCallback(async () => {
    if (!session) return;
    const supabase = createClient();
    await supabase
      .from("sessions")
      .update({ status: "finished", ended_at: new Date().toISOString() })
      .eq("id", session.id);
  }, [session]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <Spinner />
      </div>
    );
  }

  if (!session) return null;

  const isLobby = session.status === "lobby";
  const isPlaying = session.status === "playing";
  const isFinished = session.status === "finished";
  const currentQ = isPlaying
    ? questions[session.current_question_index]
    : null;
  const isLastQuestion =
    session.current_question_index >= questions.length - 1;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
              Host Remote
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Code:{" "}
              <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                {session.code}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/screen/${session.code}`}
              target="_blank"
              className="text-xs text-indigo-600 dark:text-indigo-400 underline"
            >
              Open Screen
            </Link>
          </div>
        </div>
      </header>

      <div className="flex-1 p-4 space-y-4 max-w-lg mx-auto w-full">
        {/* Status */}
        <div className="text-center">
          <span
            className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
              isLobby
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                : isPlaying
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
            }`}
          >
            {isLobby ? "Lobby" : isPlaying ? "Playing" : "Finished"}
          </span>
        </div>

        {/* Lobby Controls */}
        {isLobby && (
          <>
            <div className="text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">
                Players ({players.length})
              </p>
              <div className="flex flex-wrap justify-center gap-2 mb-4">
                {players.map((p) => (
                  <div key={p.id} className="flex items-center gap-1">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: p.avatar_color }}
                    >
                      {p.display_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">
                      {p.display_name}
                    </span>
                    <button
                      onClick={() => kickPlayer(p.id)}
                      className="text-red-400 hover:text-red-600 ml-1"
                      title="Remove player"
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
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              {players.length === 0 && (
                <p className="text-zinc-400 dark:text-zinc-500 text-sm">
                  Waiting for players to join...
                </p>
              )}
            </div>

            <Button
              onClick={startGame}
              disabled={players.length === 0}
              className="w-full"
              size="lg"
            >
              Start Game ({questions.length} questions)
            </Button>
          </>
        )}

        {/* Playing Controls */}
        {isPlaying && currentQ && (
          <>
            <div className="text-center">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Question {session.current_question_index + 1} of{" "}
                {questions.length}
              </p>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mt-1">
                {currentQ.prompt}
              </p>
            </div>

            <div className="text-center text-sm text-zinc-500 dark:text-zinc-400">
              Answers: {answers.length} / {players.length}
            </div>

            {questionState && !questionState.show_results && !questionState.is_locked ? (
              /* Step 1: Question is live — host can pause or end early */
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Button onClick={pauseResume} variant="secondary">
                    {questionState.is_paused ? "Resume" : "Pause"}
                  </Button>
                  <Button onClick={endQuestionEarly} variant="secondary">
                    End Question
                  </Button>
                </div>
              </div>
            ) : questionState?.show_results && !questionState.show_leaderboard ? (
              /* Step 2: Results are showing — host can advance to leaderboard */
              <div className="space-y-3">
                <p className="text-center text-sm font-medium text-green-600 dark:text-green-400">
                  Showing results
                </p>
                <Button
                  onClick={showLeaderboard}
                  className="w-full"
                  size="lg"
                >
                  Show Leaderboard
                </Button>
              </div>
            ) : questionState?.show_leaderboard ? (
              /* Step 3: Leaderboard is showing — host can go to next question */
              <div className="space-y-3">
                <p className="text-center text-sm font-medium text-indigo-600 dark:text-indigo-400">
                  Showing leaderboard
                </p>
                <Button
                  onClick={nextQuestion}
                  className="w-full"
                  size="lg"
                >
                  {isLastQuestion ? "Finish Game" : "Next Question"}
                </Button>
              </div>
            ) : null}

            {/* Leaderboard preview */}
            <div className="mt-4">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Leaderboard
              </h3>
              <div className="space-y-1">
                {[...players]
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 5)
                  .map((p, i) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 text-sm px-3 py-1.5 rounded bg-white dark:bg-zinc-800"
                    >
                      <span className="font-bold text-zinc-400 w-6">
                        {i + 1}
                      </span>
                      <div
                        className="w-5 h-5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: p.avatar_color }}
                      />
                      <span className="flex-1 text-zinc-900 dark:text-zinc-100 truncate">
                        {p.display_name}
                      </span>
                      <span className="font-mono text-zinc-600 dark:text-zinc-400">
                        {p.score}
                      </span>
                      <button
                        onClick={() => kickPlayer(p.id)}
                        className="text-red-400 hover:text-red-600"
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
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}

        {/* Finished */}
        {isFinished && (
          <div className="text-center">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
              Game Over
            </h2>
            <div className="space-y-2 mb-6">
              {[...players]
                .sort((a, b) => b.score - a.score)
                .map((p, i) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 text-sm px-3 py-2 rounded bg-white dark:bg-zinc-800"
                  >
                    <span className="font-bold text-zinc-400 w-6">
                      #{i + 1}
                    </span>
                    <div
                      className="w-6 h-6 rounded-full"
                      style={{ backgroundColor: p.avatar_color }}
                    />
                    <span className="flex-1 text-zinc-900 dark:text-zinc-100">
                      {p.display_name}
                    </span>
                    <span className="font-mono font-bold text-zinc-600 dark:text-zinc-300">
                      {p.score}
                    </span>
                  </div>
                ))}
            </div>
            <Link href="/dashboard">
              <Button>Back to Dashboard</Button>
            </Link>
          </div>
        )}

        {/* End game button (always available during play) */}
        {isPlaying && (
          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <Button
              variant="danger"
              size="sm"
              onClick={endGame}
              className="w-full"
            >
              End Game Now
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
