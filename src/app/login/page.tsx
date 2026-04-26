"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const SHOWCASE = [
  {
    src: "/straight-off-the-dome-thumbnail.png",
    title: "Straight Off The Dome",
    tagline: "Rapid-fire trivia. 2–12 players.",
  },
  {
    src: "/that-costs-how-much-thumbnail.png",
    title: (
      <>
        That Costs <span className="italic">How</span> Much!?
      </>
    ),
    tagline: "Guess the price. Earn the bragging rights.",
  },
  {
    src: "/stalk-market-thumbnail.png",
    title: "The Stalk Market",
    tagline: "A price-is-right spin on the grocery aisle.",
  },
];

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="rebrand min-h-screen" />}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refCode = searchParams.get("ref");

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [showcaseIdx, setShowcaseIdx] = useState(0);

  useEffect(() => {
    if (refCode) setIsSignUp(true);
  }, [refCode]);

  useEffect(() => {
    const id = setInterval(() => {
      setShowcaseIdx((i) => (i + 1) % SHOWCASE.length);
    }, 4200);
    return () => clearInterval(id);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName || email.split("@")[0],
            referral_code: refCode || undefined,
          },
        },
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      if (data.user && !data.session) {
        setError("Check your email for a confirmation link, then sign in.");
        setLoading(false);
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
    }

    router.push("/dashboard");
    router.refresh();
  }

  const active = SHOWCASE[showcaseIdx];

  return (
    <div className="rebrand min-h-screen">
      <div className="min-h-screen grid lg:grid-cols-2">
        {/* Left — form */}
        <div className="flex flex-col px-6 sm:px-12 lg:px-20 py-10">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2 mb-16">
            <Image src="/logo-icon.png" alt="HeyHost" width={32} height={32} priority />
            <span className="font-display font-bold text-[22px] tracking-[-0.03em] text-ink leading-none">
              HeyHost
            </span>
          </Link>

          <div className="flex-1 flex flex-col justify-center max-w-[460px]">
            <h1 className="font-display font-bold text-ink tracking-[-0.03em] leading-[0.98] text-[clamp(40px,5vw,60px)] mb-4">
              Host trivia worth showing up for.
            </h1>
            <p className="text-[17px] text-smoke leading-relaxed mb-10">
              {isSignUp
                ? "Make the kind of party game night your friends text about the next morning."
                : "Welcome back. Let's get the party started."}
            </p>

            {isSignUp && refCode && (
              <div
                className="mb-5 px-4 py-3 rounded-2xl text-[14px]"
                style={{
                  background: "color-mix(in srgb, var(--coral) 12%, var(--paper))",
                  color: "var(--coral)",
                  border: "1px solid color-mix(in srgb, var(--coral) 25%, transparent)",
                }}
              >
                Referred by a friend — you&apos;ll both score a free month after signing up.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <LabeledInput
                  label="Display name"
                  value={displayName}
                  onChange={setDisplayName}
                  placeholder="Your name"
                />
              )}
              <LabeledInput
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                required
              />
              <LabeledInput
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="At least 6 characters"
                required
                minLength={6}
              />

              {error && (
                <p className="text-sm text-coral">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-cta w-full px-5 py-4 text-[15px] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "One sec…" : isSignUp ? "Create account" : "Sign in"}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-dune" />
              <span className="text-[12px] uppercase tracking-[0.14em] text-smoke">or</span>
              <div className="flex-1 h-px bg-dune" />
            </div>

            {/* Secondary providers (UI-only placeholders) */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className="btn-cta-ghost flex items-center justify-center gap-2 px-4 py-3 text-[14px]"
                disabled
                title="Coming soon"
              >
                <GoogleMark />
                Google
              </button>
              <button
                type="button"
                className="btn-cta-ghost flex items-center justify-center gap-2 px-4 py-3 text-[14px]"
                disabled
                title="Coming soon"
              >
                <AppleMark />
                Apple
              </button>
            </div>

            <div className="mt-8 text-[14px] text-smoke">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError("");
                }}
                className="text-ink font-semibold hover:underline"
              >
                {isSignUp ? "Sign in" : "Sign up"}
              </button>
            </div>
          </div>
        </div>

        {/* Right — showcase */}
        <div className="hidden lg:flex relative items-center justify-center p-12 overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-8 rounded-[40px]"
            style={{
              background:
                "radial-gradient(120% 120% at 100% 0%, color-mix(in srgb, var(--coral) 18%, transparent) 0%, transparent 60%), radial-gradient(100% 100% at 0% 100%, color-mix(in srgb, var(--violet) 16%, transparent) 0%, transparent 55%), var(--paper)",
              border: "1px solid var(--dune)",
            }}
          />

          <div className="relative w-full max-w-md">
            <div className="card-rebrand overflow-hidden">
              <div className="relative aspect-[4/5] bg-dune">
                {SHOWCASE.map((item, i) => (
                  <div
                    key={item.src}
                    className="absolute inset-0 transition-opacity duration-700"
                    style={{ opacity: i === showcaseIdx ? 1 : 0 }}
                  >
                    <Image
                      src={item.src}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 400px, 100vw"
                      className="object-cover"
                      priority={i === 0}
                    />
                  </div>
                ))}
              </div>
              <div className="p-6">
                <p className="text-[12px] uppercase tracking-[0.14em] text-smoke mb-2">
                  Featured
                </p>
                <h3 className="font-display font-semibold text-ink text-[28px] tracking-[-0.02em] leading-[1.05] mb-2">
                  {active.title}
                </h3>
                <p className="text-[14px] text-smoke">{active.tagline}</p>
              </div>
            </div>

            {/* Dots */}
            <div className="flex items-center justify-center gap-2 mt-5">
              {SHOWCASE.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Show card ${i + 1}`}
                  onClick={() => setShowcaseIdx(i)}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: i === showcaseIdx ? 24 : 8,
                    background: i === showcaseIdx ? "var(--ink)" : "var(--dune)",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="w-full">
      <label htmlFor={id} className="block text-[13px] font-medium text-ink mb-2">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-rebrand w-full text-[15px]"
        {...rest}
      />
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09A6.997 6.997 0 015.5 12c0-.73.12-1.43.34-2.09V7.07H2.18A11 11 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.365 12.57c-.03-3.06 2.5-4.53 2.62-4.6-1.43-2.09-3.66-2.38-4.45-2.41-1.9-.19-3.7 1.12-4.66 1.12-.97 0-2.45-1.09-4.03-1.06-2.07.03-3.99 1.2-5.05 3.05-2.16 3.74-.55 9.27 1.55 12.3 1.04 1.48 2.27 3.15 3.88 3.09 1.56-.06 2.15-1 4.04-1 1.88 0 2.41 1 4.05.96 1.67-.03 2.74-1.51 3.77-3 1.19-1.72 1.68-3.4 1.7-3.49-.04-.02-3.27-1.25-3.3-4.96zM13.43 3.72c.86-1.04 1.44-2.5 1.28-3.95-1.24.05-2.74.83-3.63 1.87-.8.92-1.5 2.4-1.31 3.82 1.38.11 2.79-.7 3.66-1.74z" />
    </svg>
  );
}
