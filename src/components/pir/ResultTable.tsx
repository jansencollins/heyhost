"use client";

import { PlayerCardIcon } from "./PlayerCardIcon";
import { getTierLabel, getAccuracyColor } from "@/lib/pir-scoring";
import type { PIRScoreEntry } from "@/lib/types";

interface ResultTableProps {
  entries: PIRScoreEntry[];
  showRoundScore?: boolean;
}

export function ResultTable({ entries, showRoundScore = true }: ResultTableProps) {
  const sorted = [...entries].sort((a, b) => b.totalScore - a.totalScore);
  const useTwo = sorted.length > 6;

  return (
    <div
      className={`w-full ${
        useTwo ? "grid grid-cols-2 gap-4" : "flex flex-col gap-2"
      }`}
    >
      {sorted.map((entry, i) => (
        <div
          key={entry.player.id}
          className={`flex items-center gap-3 px-4 py-2 rounded-xl bg-white/10 ${
            entry.paidThePrice ? "ring-2 ring-red-500 animate-pulse" : ""
          }`}
        >
          <span className="text-lg font-bold text-white/50 w-8">
            {i + 1}
          </span>
          <PlayerCardIcon color={entry.player.avatar_color} size={40} />
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium truncate">
              {entry.player.display_name}
            </p>
            {showRoundScore && (
              <div className="flex items-center gap-2 text-xs">
                {entry.paidThePrice ? (
                  <span className="text-red-400">Paid the Price</span>
                ) : (
                  <>
                    <span className="text-white/60">
                      +{entry.score} pts
                    </span>
                    {entry.guessAccuracy !== null && (
                      <span className={getAccuracyColor(entry.guessAccuracy)}>
                        {entry.guessAccuracy}%
                      </span>
                    )}
                    <span className="text-white/40">
                      {getTierLabel(entry.tier)}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
          <span className="font-mono text-lg font-bold text-white">
            {entry.totalScore}
          </span>
        </div>
      ))}
    </div>
  );
}
