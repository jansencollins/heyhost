"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { PlayerCardIcon } from "@/components/pir/PlayerCardIcon";
import { useGameTheme } from "@/lib/theme-context";

interface WheelSlice {
  label: string;
  color: string;
  playerId?: string;
}

interface WheelOfPainProps {
  contestants: { name: string; color: string; playerId: string }[];
  onResult: (playerId: string) => void;
  onClose: () => void;
  inline?: boolean;
  /** Theme accent for the title + pointer. Falls back to red. */
  themeAccent?: string;
  /** Heading font for the title. */
  headingFontFamily?: string;
  /** When false, the wheel mounts in a static paused state and won't spin
   *  until the parent triggers a remount (e.g. via a key bump). Default true. */
  autoSpin?: boolean;
}

function buildSlices(
  contestants: { name: string; color: string; playerId: string }[]
): WheelSlice[] {
  const slices: WheelSlice[] = contestants.map((c) => ({
    label: c.name,
    color: c.color,
    playerId: c.playerId,
  }));
  slices.push({ label: "SAFE", color: "#ffffff" });
  return slices;
}

export function WheelOfPain({
  contestants,
  onResult,
  onClose,
  inline,
  themeAccent,
  headingFontFamily,
  autoSpin = true,
}: WheelOfPainProps) {
  const theme = useGameTheme();
  const accent = themeAccent ?? "#ef4444";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationRef = useRef(0);
  const velocityRef = useRef(0);
  const spinningRef = useRef(false);
  const animFrameRef = useRef<number>(0);
  const [result, setResult] = useState<string | null>(null);
  const [winner, setWinner] = useState<{ name: string; color: string } | null>(null);
  const booingRef = useRef<HTMLAudioElement | null>(null);
  // Slices/getWinningSlice/animate/spin all rebuild on each render, which
  // would normally re-fire the auto-spin effect after the wheel resolves.
  // Gate it with a ref so the wheel only auto-spins once per mount.
  const hasAutoSpunRef = useRef(false);

  const slices = buildSlices(contestants);
  const sliceAngle = (2 * Math.PI) / slices.length;

  const drawWheel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const radius = center - 14;

    ctx.clearRect(0, 0, size, size);

    // Flat outer ring in the theme accent
    ctx.beginPath();
    ctx.arc(center, center, radius + 4, 0, 2 * Math.PI);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Flat slices — solid color fill + thin separator line, no gradients
    slices.forEach((slice, i) => {
      const startAngle = rotationRef.current + i * sliceAngle;
      const endAngle = startAngle + sliceAngle;
      const midAngle = startAngle + sliceAngle / 2;

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = slice.color;
      ctx.fill();

      // Thin separator between slices
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(
        center + Math.cos(startAngle) * radius,
        center + Math.sin(startAngle) * radius
      );
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(midAngle);
      ctx.textAlign = "right";
      const isSafe = !slice.playerId;
      ctx.fillStyle = isSafe ? "#1a1a2e" : "white";
      ctx.font = `bold ${Math.min(20, 280 / slices.length)}px sans-serif`;
      ctx.fillText(slice.label, radius - 18, 5);
      ctx.restore();
    });

    // Flat hub
    const hubRadius = 18;
    ctx.beginPath();
    ctx.arc(center, center, hubRadius, 0, 2 * Math.PI);
    ctx.fillStyle = "#1a1a2e";
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Pointer (top)
    ctx.beginPath();
    ctx.moveTo(center - 14, 2);
    ctx.lineTo(center + 14, 2);
    ctx.lineTo(center, 28);
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.fill();
  }, [slices, sliceAngle, accent]);

  const getWinningSlice = useCallback(() => {
    // The pointer is at the top (angle = -PI/2 = 3PI/2)
    const pointerAngle = (3 * Math.PI) / 2;
    const normalizedRotation = ((rotationRef.current % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const effectiveAngle = ((pointerAngle - normalizedRotation) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const sliceIndex = Math.floor(effectiveAngle / sliceAngle);
    return slices[sliceIndex];
  }, [slices, sliceAngle]);

  const animate = useCallback(() => {
    if (!spinningRef.current) return;

    rotationRef.current += velocityRef.current;
    velocityRef.current *= 0.99;

    drawWheel();

    if (velocityRef.current < 0.001) {
      spinningRef.current = false;

      const winningSlice = getWinningSlice();
      if (winningSlice) {
        setResult(winningSlice.label);
        if (winningSlice.playerId) {
          // Show the winner card and play the booing sound at the same
          // time. Notify the parent immediately so the production state
          // can advance, but keep the overlay visible until the host
          // moves on (phase change will unmount this component).
          setWinner({ name: winningSlice.label, color: winningSlice.color });
          booingRef.current = new Audio("/sounds/booing.mp3");
          booingRef.current.play().catch(() => {});
          onResult(winningSlice.playerId);
        }
        // SAFE — fall through and let the parent (host) advance. The popup
        // is rendered from `result === "SAFE"` below.
      }
      return;
    }

    animFrameRef.current = requestAnimationFrame(animate);
  }, [drawWheel, getWinningSlice, onResult, onClose]);

  const spin = useCallback(() => {
    if (spinningRef.current) return;
    setResult(null);
    setWinner(null);
    velocityRef.current = 0.2 + Math.random() * 0.3;
    spinningRef.current = true;
    animate();
  }, [animate]);

  // Initial draw
  useEffect(() => {
    drawWheel();
  }, [drawWheel]);

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      booingRef.current?.pause();
    };
  }, []);

  // Keep spin reachable from the auto-spin effect without making it a dep
  // (spin's identity changes every render because slices/animate rebuild).
  const spinRef = useRef(spin);
  spinRef.current = spin;

  // Auto-spin once after mount when allowed. The ref guard is set *inside*
  // the timer callback so that StrictMode's double-invoke (dev) doesn't
  // skip-then-cancel the only scheduled spin.
  useEffect(() => {
    if (!autoSpin) return;
    if (hasAutoSpunRef.current) return;
    const timer = setTimeout(() => {
      hasAutoSpunRef.current = true;
      spinRef.current();
    }, 500);
    return () => clearTimeout(timer);
  }, [autoSpin]);

  if (inline) {
    return (
      <div className="flex flex-col items-center">
        <canvas
          ref={canvasRef}
          width={400}
          height={400}
          className="w-full max-w-[260px]"
        />

        {result && (
          <div className="mt-4 text-center">
            <p
              className="text-xl font-bold"
              style={{ color: result === "SAFE" ? "#15803d" : "#B91C1C" }}
            >
              {result === "SAFE" ? "SAFE!" : `${result} pays the price!`}
            </p>
          </div>
        )}
      </div>
    );
  }

  // `absolute inset-0` (vs `fixed`) so the wheel stays inside the parent
  // shell — covers the full TV viewport in production, stays inside the
  // mockup frame in the dashboard preview.
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center px-8">
      <h2
        className="text-7xl font-bold mb-8 tracking-[-0.025em] text-center"
        style={{
          color: accent,
          fontFamily: headingFontFamily,
        }}
      >
        Pay the Price Penalty Wheel
      </h2>

      <div className="relative">
        <canvas
          ref={canvasRef}
          width={400}
          height={400}
          className="max-w-[60cqmin] max-h-[60cqmin]"
        />

        {/* Winner card — pops in the moment the wheel stops on a player and
            plays booing simultaneously. Stays visible until the host moves
            on to the next item (phase change unmounts the wheel). */}
        {winner && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{
              animation: "wheelWinnerIn 0.5s cubic-bezier(0.22, 1.2, 0.36, 1) both",
            }}
          >
            <div
              className="bg-white rounded-3xl px-16 py-10 text-center shadow-[0_24px_60px_-12px_rgba(0,0,0,0.55)] flex flex-col items-center gap-6"
              style={{ border: `4px solid ${accent}` }}
            >
              <p
                className="text-xl font-bold uppercase tracking-[0.3em]"
                style={{ color: accent }}
              >
                Pays the Price
              </p>
              <PlayerCardIcon color={winner.color} className="w-56 h-auto" />
              <p
                className="text-7xl font-bold tracking-[-0.025em] text-[#1a1a2e]"
                style={{ fontFamily: headingFontFamily }}
              >
                {winner.name}
              </p>
            </div>
          </div>
        )}

      </div>

      {/* SAFE card — themed celebration when the wheel lands on the SAFE
          wedge. Full-screen blurred overlay sits above the wheel until the
          host advances (phase change unmounts the wheel). */}
      {result === "SAFE" && !winner && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-md"
          style={{
            animation: "wheelWinnerIn 0.5s cubic-bezier(0.22, 1.2, 0.36, 1) both",
          }}
        >
          <div
            className="rounded-[2rem] px-28 py-20 text-center shadow-[0_32px_80px_-12px_rgba(0,0,0,0.6)] flex flex-col items-center gap-6"
            style={{
              background: theme.surface,
              border: `4px solid ${accent}`,
            }}
          >
            <p
              className="text-8xl font-bold tracking-[-0.025em]"
              style={{ color: theme.textPrimary, fontFamily: headingFontFamily }}
            >
              Congrats!
            </p>
            <p
              className="text-6xl font-bold tracking-[-0.02em]"
              style={{ color: accent, fontFamily: headingFontFamily }}
            >
              Everyone&apos;s Safe!
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes wheelWinnerIn {
          0%   { opacity: 0; transform: scale(0.4); }
          60%  { opacity: 1; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
