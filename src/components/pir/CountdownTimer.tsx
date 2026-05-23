"use client";

import { useEffect, useState } from "react";

interface CountdownTimerProps {
  endsAt: string | null;
  totalSeconds?: number;
  size?: "sm" | "md";
}

export function CountdownTimer({ endsAt, totalSeconds = 30, size = "md" }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(totalSeconds);
  const totalBars = 20;

  useEffect(() => {
    if (!endsAt) return;
    const end = new Date(endsAt).getTime();

    const tick = () => {
      const now = Date.now();
      const left = Math.max(0, Math.ceil((end - now) / 1000));
      setRemaining(left);
    };

    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [endsAt]);

  const activeBars = Math.round((remaining / totalSeconds) * totalBars);
  const expired = remaining <= 0;

  // All sizes are cqmin-based so the timer scales with the .themed-screen
  // shell, the same way the surrounding text and Tailwind utilities do.
  // 1cqmin ≈ 10.8px on a 1080-tall shell, so 6.7cqmin ≈ 72px and
  // 10.4cqmin ≈ 112px (matching the original px design values).
  const dim = size === "sm" ? "6.7cqmin" : "10.4cqmin";
  const radius = size === "sm" ? "3.35cqmin" : "5.2cqmin";
  const barW = size === "sm" ? "w-1.5" : "w-2";
  const barH = size === "sm" ? "h-3.5" : "h-5";
  const textSize = size === "sm" ? "text-lg" : "text-2xl";

  return (
    <div className="relative" style={{ width: dim, height: dim }}>
      {Array.from({ length: totalBars }).map((_, i) => {
        const angle = (360 / totalBars) * i;
        const isActive = i < activeBars;
        return (
          <div
            key={i}
            className="absolute left-1/2 top-0 -translate-x-1/2"
            style={{ transform: `rotate(${angle}deg)`, transformOrigin: `center ${radius}` }}
          >
            <div
              className={`${barW} ${barH} rounded-sm transition-colors duration-300 ${
                expired
                  ? "bg-red-500 animate-pulse"
                  : isActive
                  ? "bg-[#F6BA01]"
                  : "bg-white/20"
              }`}
            />
          </div>
        );
      })}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`${textSize} font-bold ${expired ? "text-red-500" : "text-white"}`}>
          {remaining}
        </span>
      </div>
    </div>
  );
}
