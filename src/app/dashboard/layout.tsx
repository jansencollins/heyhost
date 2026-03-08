"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  {
    label: "My Games",
    href: "/dashboard",
    iconSrc: "/my-games.svg",
  },
  {
    label: "Game Library",
    href: "/dashboard/library",
    iconSrc: "/game-library.svg",
  },
  {
    label: "Host Network",
    href: "/dashboard/network",
    iconSrc: "/host-network.svg",
  },
  {
    label: "Help Center",
    href: "/dashboard/help",
    iconSrc: "/help-center.svg",
  },
  {
    label: "My Account",
    href: "/dashboard/account",
    iconSrc: "/my-account.svg",
    iconSize: 32,
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const sidebarWidth = collapsed ? "w-[72px]" : "w-64";
  const mainMargin = collapsed ? "ml-[72px]" : "ml-64";

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside
        className={`glass-sidebar ${sidebarWidth} fixed top-0 left-0 h-screen z-50 flex flex-col transition-all duration-300 ease-in-out ${collapsed ? "overflow-visible" : ""}`}
      >
        {/* Brand + Collapse toggle */}
        <div className={`px-4 pt-5 pb-4 ${collapsed ? "flex flex-col items-center gap-3" : "flex items-center justify-between"}`}>
          <Link href="/dashboard" className={`flex items-center min-w-0 ${collapsed ? "justify-center" : ""}`}>
            {collapsed ? (
              <Image
                src="/logo-icon.png"
                alt="HeyHost"
                width={40}
                height={40}
                className="shrink-0"
              />
            ) : (
              <Image
                src="/logo.png"
                alt="HeyHost"
                width={180}
                height={42}
                className="shrink-0"
                priority
              />
            )}
          </Link>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-white/[0.05] transition-all shrink-0"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg
              className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Create Game Button */}
        <div className="px-3 mb-4">
          {collapsed ? (
            <Link
              href="/dashboard/games/new"
              className="btn-gradient-primary flex items-center justify-center w-full aspect-square rounded-xl group relative"
              title="Create Game"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="sidebar-tooltip">Create Game</span>
            </Link>
          ) : (
            <Link
              href="/dashboard/games/new"
              className="btn-gradient-primary flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-full text-sm font-semibold"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Game
            </Link>
          )}
        </div>

        {/* Nav */}
        <nav className={`flex-1 px-3 space-y-0.5 ${collapsed ? "overflow-visible" : "overflow-y-auto"}`}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`group relative flex items-center gap-3 rounded-xl text-base font-medium transition-all duration-200 ${
                  collapsed ? "justify-center px-0 py-3" : "px-3 py-2.5"
                } ${
                  isActive
                    ? "bg-sidebar-active text-white font-bold"
                    : "text-white/80 hover:text-white hover:bg-white/[0.06]"
                }`}
              >
                <Image
                  src={item.iconSrc}
                  alt={item.label}
                  width={item.iconSize || 36}
                  height={item.iconSize || 36}
                  className={`shrink-0 transition-all duration-200 ${
                    isActive
                      ? "sidebar-icon-active"
                      : "sidebar-icon"
                  }`}
                />
                {collapsed ? (
                  <span className="sidebar-tooltip">{item.label}</span>
                ) : (
                  <span className="whitespace-nowrap">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Gift Card — only when expanded */}
        {!collapsed && (
          <div className="px-4 pb-6 relative">
            <Image
              src="/present.png"
              alt="Gift"
              width={80}
              height={80}
              className="absolute -top-10 left-1/2 -translate-x-1/2 z-10 drop-shadow-lg"
            />
            <div className="rounded-3xl p-4 pt-12 text-center" style={{ background: "#6b6bba" }}>
              <div className="text-base font-bold uppercase tracking-wider text-white mb-1">
                Give the Gift
              </div>
              <p className="text-sm text-white/90 leading-relaxed mb-3">
                Invite a friend to join the fun and you&apos;ll both score a free month!
              </p>
              <button className="w-full text-sm font-semibold py-2 rounded-full text-white transition-all hover:opacity-90" style={{ background: "linear-gradient(310deg, #7928ca, #ff0080)" }}>
                Refer
              </button>
            </div>
          </div>
        )}

        {/* Sign Out */}
        <div className={collapsed ? "px-3 pb-5" : "px-4 pb-5"}>
          <button
            onClick={handleSignOut}
            title={collapsed ? "Logout" : undefined}
            className={`group relative flex items-center justify-center gap-2 w-full rounded-full text-sm text-white font-semibold transition-all btn-gradient-logout ${
              collapsed ? "py-3 px-0" : "px-3 py-2"
            }`}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {collapsed ? (
              <span className="sidebar-tooltip">Logout</span>
            ) : (
              <span>Logout</span>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`${mainMargin} flex-1 min-h-screen transition-all duration-300 ease-in-out`}>
        <div className="w-full px-16 py-14">
          {children}
        </div>
      </main>
    </div>
  );
}
