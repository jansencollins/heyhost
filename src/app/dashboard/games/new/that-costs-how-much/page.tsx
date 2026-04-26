"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemePicker } from "@/components/games/ThemePicker";
import { DEFAULT_THEME } from "@/lib/theme-presets";
import type { GameTheme } from "@/lib/types";

interface ItemDraft {
  name: string;
  price: string; // dollars as string for input
  description: string;
  image: string;
}

export default function NewPIRGamePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [showPercent, setShowPercent] = useState(false);
  const [penaltyCheap, setPenaltyCheap] = useState("");
  const [penaltyExpensive, setPenaltyExpensive] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [penaltyMargin, setPenaltyMargin] = useState(70);
  const [items, setItems] = useState<ItemDraft[]>([
    { name: "", price: "", description: "", image: "" },
  ]);
  const [theme, setTheme] = useState<GameTheme>(DEFAULT_THEME.price_is_right);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  function addItem() {
    setItems([...items, { name: "", price: "", description: "", image: "" }]);
  }

  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof ItemDraft, value: string) {
    setItems(items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  async function handleCreate() {
    if (!title.trim()) {
      setError("Please enter a game title");
      return;
    }

    const validItems = items.filter((item) => item.name.trim() && item.price.trim());
    if (validItems.length === 0) {
      setError("Please add at least one item with a name and price");
      return;
    }

    setError("");
    setCreating(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create the game
      const { data: game, error: gameError } = await supabase
        .from("games")
        .insert({
          host_id: user.id,
          title: title.trim(),
          topic: "That Costs How Much!?",
          game_type: "price_is_right",
          age_range: "mix",
          difficulty: "medium",
          timer_seconds: 30,
          speed_bonus: false,
          show_percent: showPercent,
          penalty_cheap: penaltyCheap.trim() || null,
          penalty_expensive: penaltyExpensive.trim() || null,
          is_shared: isShared,
          penalty_margin: penaltyMargin,
          theme,
        })
        .select()
        .single();

      if (gameError) throw gameError;

      // Insert items
      const itemInserts = validItems.map((item, i) => ({
        game_id: game.id,
        item_order: i,
        name: item.name.trim(),
        price: Math.round(parseFloat(item.price) * 100), // dollars to cents
        description: item.description.trim() || null,
        image: item.image.trim() || null,
        difficulty: "medium",
      }));

      const { error: itemsError } = await supabase
        .from("price_is_right_items")
        .insert(itemInserts);

      if (itemsError) throw itemsError;

      router.push(`/dashboard/games/${game.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create game");
      setCreating(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-4xl font-bold text-ink mb-2">
        New That Costs <span className="italic">How</span> Much!? Game
      </h1>
      <p className="text-smoke mb-8">
        Add items with prices for players to guess.
      </p>

      <div className="space-y-6">
        {/* Game Settings */}
        <div className="bg-paper rounded-2xl p-6 space-y-4">
          <h2 className="text-xl font-semibold text-ink">Game Settings</h2>

          <Input variant="paper"
            label="Game Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Grocery Store Showdown"
          />

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showPercent}
                onChange={(e) => setShowPercent(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span className="text-ink text-sm">
                Show prices as percentages instead of dollars
              </span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input variant="paper"
              label="Penalty (Too Cheap)"
              value={penaltyCheap}
              onChange={(e) => setPenaltyCheap(e.target.value)}
              placeholder="e.g., Do 10 pushups"
            />
            <Input variant="paper"
              label="Penalty (Too Expensive)"
              value={penaltyExpensive}
              onChange={(e) => setPenaltyExpensive(e.target.value)}
              placeholder="e.g., Sing a song"
            />
          </div>

          {/* Penalty Margin */}
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              Penalty Wheel Margin
            </label>
            <p className="text-xs text-smoke mb-3">
              Players guessing below this accuracy will spin the penalty wheel. Recommended: 70%.
            </p>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={100}
                value={penaltyMargin}
                onChange={(e) => setPenaltyMargin(Number(e.target.value))}
                className="flex-1 accent-coral"
              />
              <span className="text-ink font-bold text-lg w-14 text-right">{penaltyMargin}%</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isShared}
                onChange={(e) => setIsShared(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span className="text-ink text-sm">
                Share this game on the Host Network
              </span>
            </label>
          </div>
          <p className="text-xs text-smoke/70 -mt-2 ml-6">
            Other hosts can discover and play your game from the Host Network.
          </p>
        </div>

        {/* Items */}
        <div className="bg-paper rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-ink">
              Items ({items.length})
            </h2>
            <Button variant="cta" onClick={addItem} size="sm">
              + Add Item
            </Button>
          </div>

          {items.map((item, idx) => (
            <div
              key={idx}
              className="bg-paper rounded-xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-smoke">
                  Item {idx + 1}
                </span>
                {items.length > 1 && (
                  <button
                    onClick={() => removeItem(idx)}
                    className="text-coral hover:text-coral text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input variant="paper"
                  label="Item Name"
                  value={item.name}
                  onChange={(e) => updateItem(idx, "name", e.target.value)}
                  placeholder="e.g., Organic Milk"
                />
                <Input variant="paper"
                  label={showPercent ? "Value (%)" : "Price ($)"}
                  value={item.price}
                  onChange={(e) => updateItem(idx, "price", e.target.value)}
                  placeholder={showPercent ? "e.g., 45" : "e.g., 4.99"}
                  type="number"
                />
              </div>

              <Input variant="paper"
                label="Description (optional)"
                value={item.description}
                onChange={(e) => updateItem(idx, "description", e.target.value)}
                placeholder="Brief description of the item"
              />

              <Input variant="paper"
                label="Image URL (optional)"
                value={item.image}
                onChange={(e) => updateItem(idx, "image", e.target.value)}
                placeholder="https://..."
              />
            </div>
          ))}
        </div>

        {/* Theme */}
        <div className="bg-paper rounded-2xl p-6">
          <ThemePicker value={theme} onChange={setTheme} />
        </div>

        {error && (
          <p className="text-coral text-sm">{error}</p>
        )}

        <div className="flex gap-3">
          <Button
            variant="cta-ghost"
            onClick={() => router.push("/dashboard")}
          >
            Cancel
          </Button>
          <Button variant="cta"
            onClick={handleCreate}
            loading={creating}
            className="flex-1"
            size="lg"
          >
            Create Game ({items.filter((i) => i.name && i.price).length} items)
          </Button>
        </div>
      </div>
    </div>
  );
}
