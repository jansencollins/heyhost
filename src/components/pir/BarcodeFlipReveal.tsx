"use client";

import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/pir-scoring";

export function BarcodeFlipReveal({
  price,
  showPercent = false,
  trigger = 0,
  accent = "#FFD33A",
  corners = "rounded",
}: {
  price: number;
  showPercent?: boolean;
  trigger?: number;
  accent?: string;
  corners?: "rounded" | "square";
}) {
  const isSquare = corners === "square";
  const [stage, setStage] = useState<"scanning" | "flipping" | "revealed">("scanning");
  const scannerRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setStage("scanning");
    try {
      scannerRef.current = new Audio("/sounds/scanner.mp3");
      scannerRef.current.play().catch(() => {});
    } catch {
      /* no-op */
    }
    const t1 = setTimeout(() => setStage("flipping"), 1400);
    const t2 = setTimeout(() => setStage("revealed"), 2100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      scannerRef.current?.pause();
    };
  }, [trigger]);

  const isFlipped = stage === "flipping" || stage === "revealed";

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
      <div
        className="relative"
        style={{
          width: "70%",
          aspectRatio: "16 / 10",
          perspective: "1200px",
        }}
      >
        <div
          className="relative w-full h-full transition-transform duration-700 ease-in-out"
          style={{
            transformStyle: "preserve-3d",
            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* FRONT — barcode + scan line */}
          <div
            className="absolute inset-0 bg-white flex items-center justify-center overflow-hidden"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              boxShadow: "0 24px 60px -12px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.05)",
              borderRadius: isSquare ? 0 : 16,
            }}
          >
            <img
              src="/barcode.svg"
              alt=""
              className="w-[98%] h-[92%] object-contain"
              draggable={false}
            />
            {stage === "scanning" && (
              <div
                className="absolute left-0 right-0 pointer-events-none"
                style={{
                  height: "6px",
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(255,30,40,0.95) 50%, transparent 100%)",
                  boxShadow:
                    "0 0 28px 8px rgba(255,30,40,0.7), 0 0 60px 16px rgba(255,30,40,0.35)",
                  animation: "barcodeScanDown 1.4s ease-in-out forwards",
                }}
              />
            )}
          </div>

          {/* BACK — price tag (SVG so the stroke follows the polygon shape) */}
          <div
            className="absolute inset-0"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              filter: "drop-shadow(0 18px 40px rgba(0,0,0,0.45))",
              color: "#1a1412",
            }}
          >
            <svg
              viewBox="0 0 160 100"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full"
            >
              <path
                d="M 22 2 L 158 2 L 158 98 L 22 98 L 2 50 Z"
                fill="#ffffff"
                stroke="#1a1412"
                strokeWidth="3"
                strokeLinejoin={isSquare ? "miter" : "round"}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx="14"
                cy="50"
                r="4.5"
                fill="#1a1412"
                fillOpacity="0.35"
              />
            </svg>
            <div
              className="absolute inset-0 flex flex-col items-center justify-center"
              style={{ paddingLeft: "12%" }}
            >
              <p className="text-2xl uppercase tracking-[0.2em] font-bold opacity-65">
                Actual Price
              </p>
              <p className="text-7xl font-extrabold tabular-nums tracking-tight mt-2">
                {formatPrice(price, showPercent)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes barcodeScanDown {
          0%   { top: 0%;   opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
