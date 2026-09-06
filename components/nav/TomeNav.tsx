// TomeNav.tsx — sparse, in-world navigation. No HUD clutter.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHero } from "@/lib/hero";
import { useGame } from "@/lib/store";
import { api } from "@/lib/api";
import { motion } from "motion/react";

export function TomeNav() {
  const path = usePathname();
  const hero = useHero();
  const sync = useGame((s) => s.sync);

  const link = (href: string, label: string) => {
    const active = path.startsWith(href);
    return (
      <Link
        href={href}
        className={`rounded px-3 py-1 text-sm transition-colors ${
          active
            ? "border border-gold-600/50 bg-gold-500/10 text-gold-300"
            : "text-parchment-dim hover:text-parchment"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-gold-600/20 bg-ink-950/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-display glowing-gold text-lg text-parchment">
          FocusForge
        </Link>
        <nav className="flex items-center gap-1">
          {link("/story", "The Chronicle")}
          {link("/journal", "The Journal")}
        </nav>
        <div className="flex items-center gap-2">
          {hero.enabled && (
            <span className="hand text-xs italic text-parchment-dim">{hero.signedIn ? hero.name : "a wayfarer"}</span>
          )}
          {api.mode === "mock" && (
            <motion.span layout className="hand text-xs rounded-full border border-ink-600 px-2 py-0.5 text-parchment-dim">
              ✦ scroll of fate{sync === "offline" ? " · reached by memory" : " (local)"}
            </motion.span>
          )}
          {api.mode === "rest" && (
            <span
              className={`hand text-xs rounded-full border px-2 py-0.5 ${
                sync === "offline"
                  ? "border-blood-500/60 text-blood-300"
                  : "border-moss-500/50 text-moss-300"
              }`}
            >
              {sync === "offline" ? "◇ reached by memory" : "◆ the realm answers"}
            </span>
          )}
          {hero.signedIn && hero.signOut ? (
            <button
              type="button"
              onClick={() => hero.signOut?.()}
              className="hand text-xs text-parchment-dim transition-colors hover:text-parchment"
            >
              depart
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}