// Terminus of the tale wall — gates the realm while Clerk loads or the hero is away.
"use client";

import type { ReactNode } from "react";
import { useHero } from "@/lib/hero";

export function RealmGate({ children }: { children: ReactNode }) {
  const hero = useHero();
  if (hero.enabled && hero.loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="hand text-sm italic text-parchment-dim">The realm is being prepared…</p>
      </div>
    );
  }
  if (hero.enabled && !hero.signedIn) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
        <p className="font-display glowing-gold text-3xl text-parchment">A stranger stands at the door.</p>
        <p className="hand text-sm italic text-parchment-dim">
          The chronicle is kept per wayfarer. Sign in to take up your pen.
        </p>
        <button
          type="button"
          onClick={() => hero.signIn?.()}
          className="rounded-lg border border-gold-500/70 bg-gold-500/15 px-6 py-2.5 text-parchment transition-all hover:bg-gold-500/30"
        >
          Enter the realm
        </button>
      </div>
    );
  }
  return <>{children}</>;
}