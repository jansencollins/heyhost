"use client";

import { formatPrice } from "@/lib/pir-scoring";

interface QuestionCardProps {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  price?: number; // in cents
  showPrice?: boolean;
  showPercent?: boolean;
  vertical?: boolean;
}

export function QuestionCard({
  name,
  description,
  imageUrl,
  price,
  showPrice = false,
  showPercent = false,
  vertical = false,
}: QuestionCardProps) {
  return (
    <div
      className={`relative bg-white/10 backdrop-blur rounded-2xl overflow-hidden ${
        vertical ? "flex flex-col" : "flex flex-row"
      }`}
    >
      {/* Image */}
      <div
        className={`relative ${
          vertical ? "w-full aspect-square" : "w-1/2 aspect-square"
        }`}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-white/5 flex items-center justify-center">
            <span className="text-4xl opacity-30">?</span>
          </div>
        )}

        {/* Dark overlay when showing price */}
        {showPrice && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <span className="text-5xl font-bold text-white">
              {price !== undefined ? formatPrice(price, showPercent) : "???"}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div
        className={`p-4 flex flex-col justify-center ${
          vertical ? "" : "w-1/2"
        }`}
      >
        <h3 className="text-xl font-bold text-white mb-1">{name}</h3>
        {description && (
          <p className="text-sm text-white/60">{description}</p>
        )}
      </div>
    </div>
  );
}
