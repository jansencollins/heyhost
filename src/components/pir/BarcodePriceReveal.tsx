"use client";

import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/pir-scoring";

// Pre-generate barcode bar dimensions (module-level, not during render)
const BARCODE_BARS = Array.from({ length: 30 }, (_, i) => ({
  width: (i * 7 + 3) % 2 === 0 ? 3 : 2,
  height: 60 + ((i * 13 + 7) % 30),
}));

interface BarcodePriceRevealProps {
  price: number; // in cents
  showPercent?: boolean;
  onComplete?: () => void;
}

export function BarcodePriceReveal({
  price,
  showPercent = false,
  onComplete,
}: BarcodePriceRevealProps) {
  const [phase, setPhase] = useState<"scanning" | "printing" | "done">("scanning");
  const scannerRef = useRef<HTMLAudioElement | null>(null);
  const printingRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Play scanner sound
    scannerRef.current = new Audio("/sounds/scanner.mp3");
    scannerRef.current.play().catch(() => {});

    // After scan animation (1s), start printing
    const scanTimer = setTimeout(() => {
      setPhase("printing");
      printingRef.current = new Audio("/sounds/printing.mp3");
      printingRef.current.play().catch(() => {});
    }, 1000);

    // After print animation (1.5s more), done
    const printTimer = setTimeout(() => {
      setPhase("done");
      onComplete?.();
    }, 2500);

    return () => {
      clearTimeout(scanTimer);
      clearTimeout(printTimer);
      scannerRef.current?.pause();
      printingRef.current?.pause();
    };
  }, [onComplete]);

  return (
    <div className="relative flex flex-col items-center">
      {/* Barcode area */}
      <div className="relative w-64 h-40 bg-white rounded-lg overflow-hidden flex items-center justify-center">
        {/* Barcode lines */}
        <div className="flex gap-[2px] items-end h-24">
          {BARCODE_BARS.map((bar, i) => (
            <div
              key={i}
              className="bg-black"
              style={{
                width: `${bar.width}px`,
                height: `${bar.height}%`,
              }}
            />
          ))}
        </div>

        {/* Scan line */}
        {phase === "scanning" && (
          <div
            className="absolute left-0 right-0 h-1 bg-red-500 opacity-80"
            style={{
              animation: "scanLine 1s ease-in-out",
            }}
          />
        )}
      </div>

      {/* Receipt */}
      <div
        className={`w-64 bg-white text-black rounded-b-lg overflow-hidden transition-all duration-[1500ms] ease-out ${
          phase === "scanning"
            ? "max-h-0 opacity-0"
            : "max-h-96 opacity-100"
        }`}
        style={{
          clipPath: phase !== "scanning"
            ? "polygon(0 0, 5% 3%, 10% 0, 15% 3%, 20% 0, 25% 3%, 30% 0, 35% 3%, 40% 0, 45% 3%, 50% 0, 55% 3%, 60% 0, 65% 3%, 70% 0, 75% 3%, 80% 0, 85% 3%, 90% 0, 95% 3%, 100% 0, 100% 100%, 95% 97%, 90% 100%, 85% 97%, 80% 100%, 75% 97%, 70% 100%, 65% 97%, 60% 100%, 55% 97%, 50% 100%, 45% 97%, 40% 100%, 35% 97%, 30% 100%, 25% 97%, 20% 100%, 15% 97%, 10% 100%, 5% 97%, 0 100%)"
            : undefined,
        }}
      >
        <div className="p-6 pt-8 text-center">
          <p className="text-xs text-gray-500 mb-1 font-mono">TOTAL</p>
          <p className="text-5xl font-bold font-mono">
            {formatPrice(price, showPercent)}
          </p>
          <p className="text-xs text-gray-400 mt-2 font-mono">
            THANK YOU FOR SHOPPING
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes scanLine {
          0% { top: 0; }
          50% { top: 100%; }
          100% { top: 0; }
        }
      `}</style>
    </div>
  );
}
