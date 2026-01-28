"use client";

import { useEffect, useState, use } from "react";
import { createClient } from "@/lib/supabase/client";
import { subscribeToSession, unsubscribe } from "@/lib/realtime";
import { Spinner } from "@/components/ui/spinner";
import type {
  Session,
  SessionPlayer,
  SessionQuestionState,
  GameQuestionWithChoices,
  GameQuestionChoice,
  SessionAnswer,
} from "@/lib/types";

const CHOICE_COLORS = [
  "bg-red-500",
  "bg-blue-500",
  "bg-amber-500",
  "bg-green-500",
  "bg-violet-500",
];

const CHOICE_SHAPES = ["triangle", "diamond", "circle", "square", "star"];

export default function GameScreenPage({
  params,
}: {
  params: Promise<{ sessionCode: string }>;
}) {
  const { sessionCode } = use(params);
  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [questionState, setQuestionState] =
    useState<SessionQuestionState | null>(null);
  const [currentQuestion, setCurrentQuestion] =
    useState<GameQuestionWithChoices | null>(null);
  const [answers, setAnswers] = useState<SessionAnswer[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Load session
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: sessionData } = await supabase
        .from("sessions")
        .select("*")
        .eq("code", sessionCode.toUpperCase())
        .neq("status", "finished")
        .maybeSingle();

      if (!sessionData) {
        // Try finished session too
        const { data: finishedData } = await supabase
          .from("sessions")
          .select("*")
          .eq("code", sessionCode.toUpperCase())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (finishedData) setSession(finishedData);
        return;
      }

      setSession(sessionData);

      // Get total questions
      const { count } = await supabase
        .from("game_questions")
        .select("id", { count: "exact" })
        .eq("game_id", sessionData.game_id);
      setTotalQuestions(count || 0);

      // Load players
      const { data: playersData } = await supabase
        .from("session_players")
        .select("*")
        .eq("session_id", sessionData.id)
        .eq("is_removed", false);
      setPlayers(playersData || []);

      // Load current question state
      if (sessionData.current_question_index >= 0) {
        const { data: qsData } = await supabase
          .from("session_question_state")
          .select("*")
          .eq("session_id", sessionData.id)
          .eq("question_index", sessionData.current_question_index)
          .maybeSingle();

        if (qsData) {
          setQuestionState(qsData);

          // Load question
          const { data: qData } = await supabase
            .from("game_questions")
            .select("*, game_question_choices(*)")
            .eq("id", qsData.question_id)
            .single();
          if (qData) {
            setCurrentQuestion({
              ...qData,
              game_question_choices: qData.game_question_choices.sort(
                (a: { choice_order: number }, b: { choice_order: number }) =>
                  a.choice_order - b.choice_order
              ),
            });
          }

          // Load existing answers
          const { data: answersData } = await supabase
            .from("session_answers")
            .select("*")
            .eq("session_id", sessionData.id)
            .eq("question_id", qsData.question_id);
          setAnswers(answersData || []);
        }
      }
    }

    load();
  }, [sessionCode]);

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
        const qs = payload.new as SessionQuestionState;
        setQuestionState(qs);
        // Leaderboard is now host-controlled via show_leaderboard DB flag
        setShowLeaderboard(qs.show_leaderboard);
        if (payload.eventType === "INSERT") {
          setAnswers([]);
        }
      },
      onAnswerChange: (payload) => {
        if (payload.eventType === "INSERT") {
          setAnswers((prev) => [...prev, payload.new as SessionAnswer]);
        }
      },
    });

    return () => unsubscribe(channel);
  }, [session?.id]);

  // Load question when state changes
  useEffect(() => {
    if (!questionState) return;
    async function loadQ() {
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
    loadQ();
  }, [questionState?.question_id]);

  // Timer
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
    }, 100);

    return () => clearInterval(interval);
  }, [questionState?.ends_at, questionState?.is_paused, questionState?.is_locked]);

  // ============ RENDER ============

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-indigo-950 text-white">
        <Spinner className="h-10 w-10 text-white" />
      </div>
    );
  }

  // LOBBY
  if (session.status === "lobby") {
    return (
      <div className="min-h-screen bg-indigo-950 text-white flex flex-col items-center justify-center p-8">
        <h1 className="text-6xl font-bold mb-4 tracking-tight">HeyHost</h1>
        <p className="text-xl text-indigo-300 mb-8">
          Join at{" "}
          <span className="font-semibold text-white">
            {typeof window !== "undefined" ? window.location.origin : ""}/play
          </span>
        </p>

        <div className="bg-white/10 backdrop-blur rounded-2xl px-12 py-8 mb-10">
          <p className="text-sm text-indigo-300 text-center mb-2">Game Code</p>
          <p className="text-7xl font-bold font-mono tracking-[0.3em] text-center">
            {session.code}
          </p>
        </div>

        <p className="text-lg text-indigo-300 mb-4">
          {players.length} player{players.length !== 1 ? "s" : ""} joined
        </p>

        <div className="flex flex-wrap justify-center gap-3 max-w-2xl">
          {players.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-white font-medium text-lg animate-in fade-in"
              style={{ backgroundColor: p.avatar_color }}
            >
              {p.display_name}
            </div>
          ))}
        </div>

        {players.length === 0 && (
          <div className="mt-8">
            <Spinner className="h-8 w-8 text-indigo-400" />
          </div>
        )}
      </div>
    );
  }

  // FINISHED
  if (session.status === "finished") {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const podium = sorted.slice(0, 3);
    const rest = sorted.slice(3);

    return (
      <div className="min-h-screen bg-indigo-950 text-white flex flex-col items-center justify-center p-8">
        <h1 className="text-5xl font-bold mb-10">Final Results</h1>

        {/* Podium */}
        <div className="flex items-end gap-4 mb-12">
          {podium[1] && (
            <div className="text-center">
              <div
                className="w-20 h-20 rounded-full mx-auto mb-2 flex items-center justify-center text-white text-2xl font-bold"
                style={{ backgroundColor: podium[1].avatar_color }}
              >
                {podium[1].display_name.charAt(0).toUpperCase()}
              </div>
              <p className="font-semibold text-lg">{podium[1].display_name}</p>
              <p className="text-indigo-300">{podium[1].score} pts</p>
              <div className="bg-gray-400 rounded-t-lg w-24 h-24 mt-2 flex items-center justify-center text-4xl font-bold">
                2
              </div>
            </div>
          )}
          {podium[0] && (
            <div className="text-center">
              <div className="text-yellow-400 text-4xl mb-1">&#x1F451;</div>
              <div
                className="w-24 h-24 rounded-full mx-auto mb-2 flex items-center justify-center text-white text-3xl font-bold"
                style={{ backgroundColor: podium[0].avatar_color }}
              >
                {podium[0].display_name.charAt(0).toUpperCase()}
              </div>
              <p className="font-bold text-xl">{podium[0].display_name}</p>
              <p className="text-yellow-300 text-lg">{podium[0].score} pts</p>
              <div className="bg-yellow-500 rounded-t-lg w-28 h-32 mt-2 flex items-center justify-center text-5xl font-bold">
                1
              </div>
            </div>
          )}
          {podium[2] && (
            <div className="text-center">
              <div
                className="w-20 h-20 rounded-full mx-auto mb-2 flex items-center justify-center text-white text-2xl font-bold"
                style={{ backgroundColor: podium[2].avatar_color }}
              >
                {podium[2].display_name.charAt(0).toUpperCase()}
              </div>
              <p className="font-semibold text-lg">{podium[2].display_name}</p>
              <p className="text-indigo-300">{podium[2].score} pts</p>
              <div className="bg-amber-700 rounded-t-lg w-24 h-16 mt-2 flex items-center justify-center text-4xl font-bold">
                3
              </div>
            </div>
          )}
        </div>

        {rest.length > 0 && (
          <div className="w-full max-w-md space-y-2">
            {rest.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-3 px-4 py-2 rounded-lg bg-white/10"
              >
                <span className="font-bold text-indigo-300 w-8">
                  #{i + 4}
                </span>
                <div
                  className="w-8 h-8 rounded-full"
                  style={{ backgroundColor: p.avatar_color }}
                />
                <span className="flex-1 font-medium">{p.display_name}</span>
                <span className="font-mono">{p.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // PLAYING
  if (!currentQuestion || !questionState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-indigo-950">
        <Spinner className="h-10 w-10 text-white" />
      </div>
    );
  }

  // Show results view
  if (questionState.show_results) {
    const correctChoice = currentQuestion.game_question_choices.find(
      (c) => c.is_correct
    );

    // Distribution
    const distribution = currentQuestion.game_question_choices.map(
      (choice) => ({
        choice,
        count: answers.filter((a) => a.choice_id === choice.id).length,
      })
    );
    const maxCount = Math.max(...distribution.map((d) => d.count), 1);

    if (showLeaderboard) {
      const sorted = [...players].sort((a, b) => b.score - a.score);
      return (
        <div className="min-h-screen bg-indigo-950 text-white flex flex-col items-center justify-center p-8">
          <h2 className="text-4xl font-bold mb-8">Leaderboard</h2>
          <div className="w-full max-w-lg space-y-3">
            {sorted.slice(0, 8).map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-4 px-6 py-3 rounded-xl bg-white/10 text-lg"
              >
                <span className="font-bold text-2xl text-indigo-300 w-10">
                  {i + 1}
                </span>
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: p.avatar_color }}
                >
                  {p.display_name.charAt(0).toUpperCase()}
                </div>
                <span className="flex-1 font-semibold">{p.display_name}</span>
                <span className="font-mono text-xl">{p.score}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-indigo-950 text-white flex flex-col p-8">
        <div className="text-center mb-8">
          <p className="text-sm text-indigo-400 mb-2">
            Question {questionState.question_index + 1} of {totalQuestions}
          </p>
          <h2 className="text-3xl font-bold mb-4">
            {currentQuestion.prompt}
          </h2>
          <p className="text-xl text-green-400">
            Correct: {correctChoice?.choice_text}
          </p>
        </div>

        {/* Distribution bars */}
        <div className="flex-1 flex items-end gap-4 justify-center max-w-4xl mx-auto w-full pb-8">
          {distribution.map((d, i) => (
            <div key={d.choice.id} className="flex-1 flex flex-col items-center">
              <p className="text-lg font-bold mb-2">{d.count}</p>
              <div
                className={`w-full rounded-t-lg transition-all duration-500 ${CHOICE_COLORS[i]} ${
                  d.choice.is_correct ? "ring-4 ring-green-400" : ""
                }`}
                style={{
                  height: `${Math.max(
                    20,
                    (d.count / maxCount) * 300
                  )}px`,
                }}
              />
              <p className="text-sm mt-2 text-center truncate w-full px-1">
                {d.choice.choice_text}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Active question view
  return (
    <div className="min-h-screen bg-indigo-950 text-white flex flex-col">
      {/* Timer + question number */}
      <div className="flex items-center justify-between p-6">
        <span className="text-lg text-indigo-400">
          Question {questionState.question_index + 1} of {totalQuestions}
        </span>
        <div className="flex items-center gap-2 text-sm text-indigo-400">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {answers.length}/{players.length}
        </div>
      </div>

      {/* Timer circle */}
      <div className="flex justify-center mb-6">
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold border-4 ${
            questionState.is_paused
              ? "border-amber-500 text-amber-500"
              : timeLeft <= 5
              ? "border-red-500 text-red-500"
              : "border-white"
          }`}
        >
          {questionState.is_paused ? "||" : timeLeft}
        </div>
      </div>

      {/* Question */}
      <div className="text-center px-8 mb-8">
        <h2 className="text-4xl font-bold leading-tight">
          {currentQuestion.prompt}
        </h2>
      </div>

      {/* Choice grid */}
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-6 content-end">
        {currentQuestion.game_question_choices.map((choice, idx) => (
          <div
            key={choice.id}
            className={`${CHOICE_COLORS[idx]} rounded-xl p-6 flex items-center gap-4`}
          >
            <span className="text-3xl opacity-70">{getShape(idx)}</span>
            <span className="text-xl font-semibold">{choice.choice_text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getShape(index: number): string {
  const shapes = ["▲", "◆", "●", "■", "★"];
  return shapes[index] || "●";
}
