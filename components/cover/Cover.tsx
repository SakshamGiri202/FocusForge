// Cover.tsx — the book cover. The experience begins before the architecture.
"use client";

import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useHero } from "@/lib/hero";
import { useGame } from "@/lib/store";
import { SceneDivider } from "@/components/novel/SceneDivider";

export function Cover() {
  const router = useRouter();
  const hero = useHero();
  const hasSession = useGame((s) => !!s.session);

  const begin = async () => {
    if (hero.enabled && !hero.signedIn) {
      await hero.signIn?.();
      return;
    }
    router.push("/onboarding");
  };

  return (
    <div className="relative flex min-h-[calc(100vh-57px)] flex-col items-center justify-center px-6 py-16 text-center">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9 }}
        className="max-w-3xl"
      >
        <p className="scene-edge hand text-xs uppercase tracking-[0.45em] text-gold-500">
          a chronicle of tiny victories
        </p>
        <h1 className="font-display glowing-gold mt-6 text-6xl md:text-7xl text-parchment animate-flicker">
          FocusForge
        </h1>

        <div className="mt-8">
          <SceneDivider />
        </div>

        <p className="hand mx-auto mt-8 max-w-xl text-base italic leading-relaxed text-parchment-soft">
          Most to-do apps reward you after you finish something.
          <br />
          Here, the doing itself becomes the story.
          <br />
          <span className="text-parchment-dim">
            Every task is a mountain. Every tiny action moves it. The chapter writes itself as you strike.
          </span>
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={begin}
            className="rounded-lg border border-gold-500/70 bg-gold-500/15 px-8 py-3.5 font-display text-lg text-gold-200 transition-all hover:bg-gold-500/30 hover:shadow-[0_0_36px_rgba(201,162,39,0.4)]"
          >
            {hero.enabled && !hero.signedIn ? "Enter the realm" : "Open the chronicle"}
          </button>
          {hasSession && (
            <button
              type="button"
              onClick={() => router.push("/story")}
              className="hand rounded-lg border border-ink-600 px-6 py-3 text-parchment-dim transition-colors hover:border-parchment-dim hover:text-parchment"
            >
              ↩ resume the open chapter
            </button>
          )}
        </div>

        <p className="hand mt-12 text-xs text-parchment-dim">
          “Life is an RPG — but it reads like a novel.”
        </p>
      </motion.div>
    </div>
  );
}