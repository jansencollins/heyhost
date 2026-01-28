"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function PlayJoinPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = code.trim().toUpperCase();
    if (!cleaned || cleaned.length < 5) {
      setError("Enter a valid game code");
      return;
    }
    router.push(`/play/${cleaned}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-zinc-50 dark:bg-zinc-950">
      <Link
        href="/"
        className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mb-10"
      >
        HeyHost
      </Link>

      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-zinc-900 dark:text-zinc-100 mb-6">
          Join a Game
        </h1>

        <form onSubmit={handleJoin} className="space-y-4">
          <Input
            label="Game Code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError("");
            }}
            placeholder="Enter code"
            className="text-center text-2xl tracking-widest font-mono"
            maxLength={6}
            error={error}
            autoFocus
          />
          <Button type="submit" className="w-full" size="lg">
            Join
          </Button>
        </form>
      </div>
    </div>
  );
}
