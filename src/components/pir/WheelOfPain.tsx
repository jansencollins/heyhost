"use client";

import { useEffect, useRef, useState, useCallback } from "react";

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

// Parse hex to RGB
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.startsWith("#") ? hex : "#888888";
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

// Darken a hex color by a factor (0–1)
function darkenColor(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.round(r * (1 - factor))},${Math.round(g * (1 - factor))},${Math.round(b * (1 - factor))})`;
}

// Lighten a hex color by a factor (0–1)
function lightenColor(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.min(255, Math.round(r + (255 - r) * factor))},${Math.min(255, Math.round(g + (255 - g) * factor))},${Math.min(255, Math.round(b + (255 - b) * factor))})`;
}

export function WheelOfPain({ contestants, onResult, onClose, inline }: WheelOfPainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationRef = useRef(0);
  const velocityRef = useRef(0);
  const spinningRef = useRef(false);
  const animFrameRef = useRef<number>(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const booingRef = useRef<HTMLAudioElement | null>(null);

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

    // Outer ring / border glow
    ctx.beginPath();
    ctx.arc(center, center, radius + 8, 0, 2 * Math.PI);
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 4;
    ctx.shadowColor = "rgba(239,68,68,0.6)";
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Inner dark ring
    ctx.beginPath();
    ctx.arc(center, center, radius + 3, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw slices with bevel
    slices.forEach((slice, i) => {
      const startAngle = rotationRef.current + i * sliceAngle;
      const endAngle = startAngle + sliceAngle;
      const midAngle = startAngle + sliceAngle / 2;
      const hex = slice.color.startsWith("#") ? slice.color : "#888888";

      // Base slice fill
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = slice.color;
      ctx.fill();

      // Bevel highlight — lighter strip along the leading edge
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.clip();

      // Top-light bevel: gradient from light edge to dark edge across the slice
      const bevelGrad = ctx.createLinearGradient(
        center + Math.cos(startAngle) * radius,
        center + Math.sin(startAngle) * radius,
        center + Math.cos(endAngle) * radius,
        center + Math.sin(endAngle) * radius
      );
      bevelGrad.addColorStop(0, lightenColor(hex, 0.35));
      bevelGrad.addColorStop(0.15, lightenColor(hex, 0.15));
      bevelGrad.addColorStop(0.5, slice.color);
      bevelGrad.addColorStop(0.85, darkenColor(hex, 0.15));
      bevelGrad.addColorStop(1, darkenColor(hex, 0.35));

      ctx.fillStyle = bevelGrad;
      ctx.fill();

      // Radial depth — darker toward the rim
      const depthGrad = ctx.createRadialGradient(center, center, radius * 0.3, center, center, radius);
      depthGrad.addColorStop(0, "rgba(255,255,255,0.08)");
      depthGrad.addColorStop(0.6, "rgba(0,0,0,0)");
      depthGrad.addColorStop(1, "rgba(0,0,0,0.25)");
      ctx.fillStyle = depthGrad;
      ctx.fill();

      ctx.restore();

      // Leading edge highlight
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(
        center + Math.cos(startAngle) * radius,
        center + Math.sin(startAngle) * radius
      );
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Trailing edge shadow
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(
        center + Math.cos(endAngle) * radius,
        center + Math.sin(endAngle) * radius
      );
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(midAngle);
      ctx.textAlign = "right";
      const isSafe = !slice.playerId;
      // Text shadow for depth
      ctx.shadowColor = isSafe ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = isSafe ? "#1a1a2e" : "white";
      ctx.font = `bold ${Math.min(20, 280 / slices.length)}px sans-serif`;
      ctx.fillText(slice.label, radius - 18, 5);
      ctx.restore();
    });

    // Global top-light overlay for cohesive 3D
    const rimGrad = ctx.createLinearGradient(center, center - radius, center, center + radius);
    rimGrad.addColorStop(0, "rgba(255,255,255,0.12)");
    rimGrad.addColorStop(0.4, "rgba(255,255,255,0)");
    rimGrad.addColorStop(0.6, "rgba(0,0,0,0)");
    rimGrad.addColorStop(1, "rgba(0,0,0,0.18)");
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, 2 * Math.PI);
    ctx.fillStyle = rimGrad;
    ctx.fill();

    // Center hub — 3D dome
    const hubRadius = 24;
    const hubGrad = ctx.createRadialGradient(
      center - 4, center - 4, 2,
      center, center, hubRadius
    );
    hubGrad.addColorStop(0, "#3b3666");
    hubGrad.addColorStop(0.6, "#1e1b4b");
    hubGrad.addColorStop(1, "#0f0d2e");
    ctx.beginPath();
    ctx.arc(center, center, hubRadius, 0, 2 * Math.PI);
    ctx.fillStyle = hubGrad;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Skull icon in center
    ctx.fillStyle = "rgba(239,68,68,0.8)";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("\u2620", center, center);

    // Pointer (top) — more prominent
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(center - 14, 2);
    ctx.lineTo(center + 14, 2);
    ctx.lineTo(center, 28);
    ctx.closePath();
    const pointerGrad = ctx.createLinearGradient(center, 2, center, 28);
    pointerGrad.addColorStop(0, "#ff2222");
    pointerGrad.addColorStop(1, "#aa0000");
    ctx.fillStyle = pointerGrad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [slices, sliceAngle]);

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
      setSpinning(false);

      const winner = getWinningSlice();
      if (winner) {
        setResult(winner.label);
        if (winner.playerId) {
          // Player lost - play booing sound
          booingRef.current = new Audio("/sounds/booing.mp3");
          booingRef.current.play().catch(() => {});
          setTimeout(() => onResult(winner.playerId!), 2000);
        } else {
          // SAFE - auto close after delay
          setTimeout(() => onClose(), 2000);
        }
      }
      return;
    }

    animFrameRef.current = requestAnimationFrame(animate);
  }, [drawWheel, getWinningSlice, onResult, onClose]);

  const spin = useCallback(() => {
    if (spinningRef.current) return;
    setResult(null);
    velocityRef.current = 0.2 + Math.random() * 0.3;
    spinningRef.current = true;
    setSpinning(true);
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

  // Auto-spin after mount
  useEffect(() => {
    const timer = setTimeout(spin, 500);
    return () => clearTimeout(timer);
  }, [spin]);

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

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center">
      <h2 className="text-3xl font-bold text-white mb-6">
        Pay The Price!
      </h2>

      <canvas
        ref={canvasRef}
        width={400}
        height={400}
        className="max-w-[90vw] max-h-[90vw]"
      />

      {result && (
        <div className="mt-6 text-center">
          <p className={`text-3xl font-bold ${
            result === "SAFE" ? "text-green-400" : "text-red-400"
          }`}>
            {result === "SAFE" ? "SAFE!" : `${result} pays the price!`}
          </p>
        </div>
      )}

      {!spinning && !result && (
        <button
          onClick={spin}
          className="mt-6 px-8 py-3 bg-red-500 text-white rounded-full text-lg font-bold hover:bg-red-600 transition"
        >
          SPIN
        </button>
      )}
    </div>
  );
}
