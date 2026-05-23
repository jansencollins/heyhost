"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { subscribeToSession, unsubscribe } from "@/lib/realtime";
import { Spinner } from "@/components/ui/spinner";
import {
  RemoteFrame,
  RemoteScreen,
  RemoteSection,
  RemoteButton,
  RemotePlayerRow,
} from "@/components/games/host/RemoteUI";
import type {
  Session,
  SessionPlayer,
  SessionQuestionState,
  GameQuestion,
  SessionAnswer,
} from "@/lib/types";
import type { HostRemoteProps } from "@/lib/game-registry";

export interface TriviaHostDevMode {
  session?: Session | null;
  players?: SessionPlayer[];
  questions?: GameQuestion[];
  questionState?: SessionQuestionState | null;
  answers?: SessionAnswer[];
  timerSeconds?: number;
  onAction?: (action: string, payload?: Record<string, unknown>) => void;
}

export default function TriviaHostRemote({ sessionId, devMode }: HostRemoteProps & { devMode?: TriviaHostDevMode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(devMode?.session ?? null);
  const [players, setPlayers] = useState<SessionPlayer[]>(devMode?.players ?? []);
  const [questions, setQuestions] = useState<GameQuestion[]>(devMode?.questions ?? []);
  const [questionState, setQuestionState] =
    useState<SessionQuestionState | null>(devMode?.questionState ?? null);
  const [answers, setAnswers] = useState<SessionAnswer[]>(devMode?.answers ?? []);
  const [loading, setLoading] = useState(!devMode);
  const [timerSeconds, setTimerSeconds] = useState(devMode?.timerSeconds ?? 30);

  // Keep state in sync with devMode prop so dev page mutations propagate.
  useEffect(() => {
    if (!devMode) return;
    if (devMode.session !== undefined) setSession(devMode.session);
    if (devMode.players !== undefined) setPlayers(devMode.players);
    if (devMode.questions !== undefined) setQuestions(devMode.questions);
    if (devMode.questionState !== undefined) setQuestionState(devMode.questionState);
    if (devMode.answers !== undefined) setAnswers(devMode.answers);
  }, [devMode]);

  useEffect(() => {
    if (devMode) return;
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

      const { data: gameData } = await supabase
        .from("games")
        .select("timer_seconds")
        .eq("id", sessionData.game_id)
        .single();

      if (gameData) setTimerSeconds(gameData.timer_seconds);

      const { data: questionsData } = await supabase
        .from("game_questions")
        .select("*")
        .eq("game_id", sessionData.game_id)
        .order("question_order", { ascending: true });

      setQuestions(questionsData || []);

      const { data: playersData } = await supabase
        .from("session_players")
        .select("*")
        .eq("session_id", sessionId)
        .eq("is_removed", false);

      setPlayers(playersData || []);

      if (sessionData.current_question_index >= 0) {
        const { data: qsData } = await supabase
          .from("session_question_state")
          .select("*")
          .eq("session_id", sessionId)
          .eq("question_index", sessionData.current_question_index)
          .maybeSingle();

        if (qsData) setQuestionState(qsData);
      }

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

  useEffect(() => {
    if (devMode) return;
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
    if (devMode?.onAction) { devMode.onAction("start_game"); return; }
    const supabase = createClient();

    await supabase
      .from("sessions")
      .update({ status: "playing", current_question_index: 0 })
      .eq("id", session.id);

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
    if (devMode?.onAction) { devMode.onAction("pause_resume"); return; }
    const supabase = createClient();

    if (questionState.is_paused) {
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
      await supabase
        .from("sessions")
        .update({ is_paused: false })
        .eq("id", session.id);
    } else {
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
      await supabase
        .from("sessions")
        .update({ is_paused: true })
        .eq("id", session.id);
    }
  }, [questionState, session, timerSeconds, devMode]);

  const endQuestionEarly = useCallback(async () => {
    if (!questionState || !session) return;
    if (devMode?.onAction) { devMode.onAction("end_question_early"); return; }
    const supabase = createClient();
    await supabase
      .from("session_question_state")
      .update({ is_locked: true, show_results: true })
      .eq("id", questionState.id);
  }, [questionState, session, devMode]);

  const showLeaderboard = useCallback(async () => {
    if (!questionState || !session) return;
    if (devMode?.onAction) { devMode.onAction("show_leaderboard"); return; }
    const supabase = createClient();
    await supabase
      .from("session_question_state")
      .update({ show_leaderboard: true })
      .eq("id", questionState.id);
  }, [questionState, session, devMode]);

  const nextQuestion = useCallback(async () => {
    if (!session || !questions.length) return;
    if (devMode?.onAction) { devMode.onAction("next_question"); return; }
    const supabase = createClient();
    const nextIndex = session.current_question_index + 1;

    if (nextIndex >= questions.length) {
      await supabase
        .from("sessions")
        .update({ status: "finished", ended_at: new Date().toISOString() })
        .eq("id", session.id);
      return;
    }

    await supabase
      .from("sessions")
      .update({ current_question_index: nextIndex })
      .eq("id", session.id);

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
      if (devMode?.onAction) { devMode.onAction("kick_player", { playerId }); return; }
      const supabase = createClient();
      await supabase
        .from("session_players")
        .update({ is_removed: true })
        .eq("id", playerId);
    },
    [session, devMode]
  );

  const endGame = useCallback(async () => {
    if (!session) return;
    if (devMode?.onAction) { devMode.onAction("end_game"); return; }
    const supabase = createClient();
    await supabase
      .from("sessions")
      .update({ status: "finished", ended_at: new Date().toISOString() })
      .eq("id", session.id);
  }, [session, devMode]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
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

  const phaseLabel = isLobby ? "Lobby" : isPlaying ? "Playing" : "Finished";
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <RemoteFrame>
      <RemoteScreen
        title="Straight Off The Dome"
        code={session.code}
        phase={phaseLabel}
        meta={`${players.length} player${players.length === 1 ? "" : "s"} · ${questions.length} questions`}
        screenHref={`/screen/${session.code}`}
      />

      {isLobby && (
        <>
          <RemoteSection title={`Players · ${players.length}`}>
            {players.length === 0 ? (
              <p className="text-sm text-zinc-500 italic text-center py-3">
                Waiting for players to join…
              </p>
            ) : (
              <div className="space-y-2">
                {players.map((p) => (
                  <RemotePlayerRow
                    key={p.id}
                    name={p.display_name}
                    color={p.avatar_color}
                    onKick={() => kickPlayer(p.id)}
                  />
                ))}
              </div>
            )}
          </RemoteSection>

          <RemoteButton
            onClick={startGame}
            disabled={players.length === 0}
            size="lg"
            className="w-full"
          >
            Start Game · {questions.length} questions
          </RemoteButton>
        </>
      )}

      {isPlaying && currentQ && (
        <>
          <RemoteSection title={`Question ${session.current_question_index + 1} / ${questions.length}`}>
            <p className="text-sm text-zinc-200 leading-snug">{currentQ.prompt}</p>
            <p className="mt-2 text-[11px] text-zinc-500">
              Answers: {answers.length} / {players.length}
            </p>
          </RemoteSection>

          {questionState && !questionState.show_results && !questionState.is_locked ? (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <RemoteButton onClick={pauseResume} variant="secondary">
                {questionState.is_paused ? "Resume" : "Pause"}
              </RemoteButton>
              <RemoteButton onClick={endQuestionEarly} variant="secondary">
                End Question
              </RemoteButton>
            </div>
          ) : questionState?.show_results && !questionState.show_leaderboard ? (
            <RemoteButton onClick={showLeaderboard} size="lg" className="w-full mb-3">
              Show Leaderboard
            </RemoteButton>
          ) : questionState?.show_leaderboard ? (
            <RemoteButton onClick={nextQuestion} size="lg" className="w-full mb-3">
              {isLastQuestion ? "Finish Game" : "Next Question"}
            </RemoteButton>
          ) : null}

          <RemoteSection title="Leaderboard">
            <div className="space-y-2">
              {sortedPlayers.slice(0, 5).map((p, i) => (
                <RemotePlayerRow
                  key={p.id}
                  name={p.display_name}
                  color={p.avatar_color}
                  rightSlot={
                    <span className="font-mono text-xs text-zinc-400">
                      #{i + 1} · {p.score}
                    </span>
                  }
                  onKick={() => kickPlayer(p.id)}
                />
              ))}
            </div>
          </RemoteSection>

          <RemoteButton onClick={endGame} variant="danger" size="sm" className="w-full">
            End Game Now
          </RemoteButton>
        </>
      )}

      {isFinished && (
        <>
          <RemoteSection title="Final Scores">
            <div className="space-y-2">
              {sortedPlayers.map((p, i) => (
                <RemotePlayerRow
                  key={p.id}
                  name={p.display_name}
                  color={p.avatar_color}
                  rightSlot={
                    <span className="font-mono text-xs text-zinc-300 font-bold">
                      #{i + 1} · {p.score}
                    </span>
                  }
                />
              ))}
            </div>
          </RemoteSection>
          <Link href="/dashboard" className="block">
            <RemoteButton className="w-full">Back to Dashboard</RemoteButton>
          </Link>
        </>
      )}
    </RemoteFrame>
  );
}
