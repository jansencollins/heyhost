"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { getGameTypeConfig } from "@/lib/game-registry";

type Accent = "coral" | "violet" | "teal" | "magenta" | "sunflower" | "lime";

interface GameTemplate {
  id: string;
  title: React.ReactNode;
  description: string;
  playerRange: string;
  thumb: string;
  /** "bottom" — thumb art sits flush with bottom of its container; otherwise vertically centered. */
  thumbAnchor?: "bottom" | "center";
  /** Extra scale applied to the thumb image (1 = no change). */
  thumbScale?: number;
  gameType: "trivia" | "price_is_right";
  accent: Accent;
}

const ACCENT_VAR: Record<Accent, string> = {
  coral: "var(--coral)",
  violet: "var(--violet)",
  teal: "var(--teal)",
  magenta: "var(--magenta)",
  sunflower: "var(--sunflower)",
  lime: "var(--lime)",
};

function brandGradient(accent: Accent): string {
  const c = ACCENT_VAR[accent];
  return `linear-gradient(135deg, ${c} 0%, color-mix(in srgb, ${c} 70%, var(--ink)) 100%)`;
}

const GAME_TEMPLATES: GameTemplate[] = [
  {
    id: "pir-that-costs-how-much",
    title: (
      <>
        That Costs <span className="italic">How</span> Much!?
      </>
    ),
    description:
      "Watch a product appear on screen. Use your phone to guess the price. The closer you get, the more points you earn — but guess too wildly and you'll pay for it.",
    playerRange: "2–12 players",
    thumb: "/that-costs-how-much-thumb.png",
    thumbAnchor: "bottom",
    gameType: "price_is_right",
    accent: "lime",
  },
  {
    id: "trivia-straight-off-the-dome",
    title: "Straight Off The Dome",
    description:
      "Rapid-fire trivia. Pick the correct answer before time runs out. The faster you answer, the more points you earn.",
    playerRange: "2–12 players",
    thumb: "/straight-off-dome-thumb.png",
    thumbScale: 0.85,
    gameType: "trivia",
    accent: "violet",
  },
  {
    id: "pir-the-stalk-market",
    title: "The Stalk Market",
    description:
      "A grocery-aisle spin on guess-the-price. Watch the item, punch in your guess, and earn points for how close you land.",
    playerRange: "2–12 players",
    thumb: "/stalk-market-thumb.png",
    thumbAnchor: "bottom",
    thumbScale: 1.2,
    gameType: "price_is_right",
    accent: "coral",
  },
];

export default function GameLibraryPage() {
  const router = useRouter();

  function handleNewGame(gameType: "trivia" | "price_is_right") {
    const config = getGameTypeConfig(gameType);
    router.push(config.createRoute);
  }

  return (
    <div>
      <header
        className="card-rebrand card-anchor relative z-10 p-6 lg:p-7"
        style={{
          background: "var(--paper)",
          borderColor: "rgba(0,0,0,0.18)",
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          borderBottomWidth: 0,
          overflow: "visible",
        }}
      >
        <div className="flex items-center gap-4 mb-3">
          <span
            className="w-12 h-12 rounded-full flex items-center justify-center border-2 border-ink shrink-0"
            style={{ background: "var(--violet)" }}
          >
            <Image
              src="/game-library.svg"
              alt=""
              width={28}
              height={28}
              className="nav-icon-light"
            />
          </span>
          <h1 className="font-display font-bold text-[32px] tracking-[-0.025em] leading-[1.05] text-ink">
            Game Library
          </h1>
        </div>
        <p className="text-[15px] text-smoke leading-relaxed max-w-3xl">
          Pick a format to start a new game. Each one is built for house parties — easy to host,
          impossible to play badly.
        </p>
      </header>

      {/* Panel — matches the game editor tab-panel treatment */}
      <div
        className="card-rebrand card-anchor tab-panel p-5 lg:p-6 pt-7 lg:pt-8 border-t-0"
        style={{
          background: "#ECE3D0",
          borderColor: "rgba(0,0,0,0.18)",
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          boxShadow: "inset 0 6px 12px -6px rgba(0,0,0,0.18)",
        }}
      >
      <div className="space-y-5">
        {GAME_TEMPLATES.map((game) => (
          <article
            key={game.id}
            className="card-rebrand flex flex-col sm:flex-row items-stretch overflow-hidden group sm:h-44"
          >
            {/* Thumbnail block — gradient bg, brand name on the left, thumb art on the right */}
            <div
              className="relative sm:w-80 flex items-stretch flex-shrink-0"
              style={{ background: brandGradient(game.accent) }}
            >
              <div className="flex-1 min-w-0 flex flex-col justify-center px-5 py-5">
                <h3
                  className="font-display font-bold text-[32px] tracking-[-0.03em] leading-[1.0]"
                  style={{
                    color: "#FFFFFF",
                    WebkitTextStroke: "1.5px var(--ink)",
                    paintOrder: "stroke fill",
                    textShadow: "0 2px 10px rgba(26,20,18,0.3)",
                  }}
                >
                  {game.title}
                </h3>
              </div>
              <div
                className={`shrink-0 w-[44%] flex justify-center overflow-hidden transition-transform duration-500 group-hover:scale-[1.04] ${
                  game.thumbAnchor === "bottom"
                    ? "items-end pt-3 pb-0 pl-2 pr-5"
                    : "items-center p-2"
                }`}
                style={{
                  transformOrigin: game.thumbAnchor === "bottom" ? "bottom center" : "center",
                }}
              >
                <Image
                  src={game.thumb}
                  alt=""
                  width={260}
                  height={200}
                  className="w-auto h-auto max-w-full max-h-full object-contain"
                  style={{
                    transform: `scale(${game.thumbScale ?? 1})`,
                    transformOrigin:
                      game.thumbAnchor === "bottom" ? "bottom center" : "center",
                  }}
                />
              </div>
            </div>

            <div className="flex-1 p-6 flex flex-col sm:flex-row gap-6 items-start sm:items-center">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`chip-rebrand chip-accent-${game.accent}`}>
                    {game.playerRange}
                  </span>
                </div>
                <p className="text-[14px] text-smoke leading-relaxed line-clamp-3 max-w-xl">
                  {game.description}
                </p>
              </div>

              <button
                onClick={() => handleNewGame(game.gameType)}
                className="btn-cta shrink-0 px-6 py-3 text-sm"
              >
                New Game
              </button>
            </div>
          </article>
        ))}
      </div>
      </div>
    </div>
  );
}
