"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { label: "My Games", href: "/dashboard", iconSrc: "/my-games.svg", color: "var(--coral)", iconSize: 36 },
  { label: "Game Library", href: "/dashboard/library", iconSrc: "/game-library.svg", color: "var(--violet)", iconSize: 28 },
  { label: "Host Network", href: "/dashboard/network", iconSrc: "/host-network.svg", color: "var(--magenta)", iconSize: 28 },
  { label: "My Account", href: "/dashboard/account", iconSrc: "/my-account.svg", color: "var(--sunflower)", iconSize: 28 },
];

// TODO: show refer-a-friend as a dismissible banner after a user
// completes their first hosted game. Until that lands, no sidebar slot.

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex rebrand">
      {/* Sidebar */}
      <aside className="sidebar-rebrand w-[104px] fixed top-0 left-0 h-screen z-50 flex flex-col">
        {/* Brand mark */}
        <Link
          href="/dashboard"
          className="flex flex-col items-center justify-center gap-1.5 pt-6 pb-5 shrink-0 border-b border-dune"
        >
          <Image
            src="/logo-icon.png"
            alt="HeyHost"
            width={56}
            height={56}
            className="[filter:brightness(0)]"
            priority
          />
          <span className="font-display font-bold text-[20px] tracking-[-0.03em] text-ink leading-none">
            HeyHost
          </span>
        </Link>

        {/* Primary CTA */}
        <div>
          <Link
            href="/dashboard/library"
            title="Host a Game"
            className="w-full flex flex-col items-center gap-1.5 group py-3 px-3 transition-colors duration-150 hover:bg-dune/40"
          >
            <span
              className="w-12 h-12 rounded-full flex items-center justify-center border-2 border-ink transition-transform duration-200 group-hover:scale-110"
              style={{ background: "var(--lime)" }}
            >
              <Image
                src="/host-game.svg"
                alt="Host a Game"
                width={28}
                height={28}
                className="nav-icon-light"
              />
            </span>
            <span className="text-[11px] font-display font-semibold text-ink leading-[1.1] text-center">
              Host a Game
            </span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`w-full flex flex-col items-center gap-1.5 group py-3 px-3 transition-colors duration-150 ${
                  isActive ? "bg-dune" : "hover:bg-dune/40"
                }`}
              >
                <span
                  className="w-12 h-12 rounded-full flex items-center justify-center border-2 border-ink transition-transform duration-200 group-hover:scale-110"
                  style={{
                    background: item.color,
                    boxShadow: isActive
                      ? `0 0 0 2px var(--paper), 0 0 0 4px ${item.color}`
                      : undefined,
                  }}
                >
                  <Image
                    src={item.iconSrc}
                    alt={item.label}
                    width={item.iconSize}
                    height={item.iconSize}
                    className="nav-icon-light"
                  />
                </span>
                <span
                  className={`text-[11px] font-display leading-[1.1] text-center text-ink ${
                    isActive ? "font-bold" : "font-semibold"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Logout — plain text link */}
        <div className="px-3 pt-3 pb-5 border-t border-dune">
          <button
            onClick={handleSignOut}
            className="logout-link w-full flex flex-col items-center justify-center gap-1 py-2 text-[11px] leading-[1.1]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-[104px] flex-1 min-h-screen">
        <div className="w-full px-12 pt-8 pb-16">
          {children}
        </div>
      </main>
    </div>
  );
}
