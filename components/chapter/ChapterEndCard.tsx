// ChapterEndCard.tsx — the chapter closes. The story is the reward; no numbers, no trophies.
"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { SessionState } from "@/lib/contract";

export function ChapterEndCard({
  session,
  busy,
  onNext,
}: {
  session: SessionState;
  busy: boolean;
  onNext: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 110, damping: 16 }}
      className="rounded-2xl border border-gold-500/40 bg-ink-900/80 p-8 text-center hp-glow"
    >
      <p className="scene-edge hand text-xs uppercase tracking-[0.3em] text-gold-500">
        ⟡ the pen is lifted ⟡
      </p>
      <h2 className="font-display glowing-gold mt-3 text-3xl text-parchment">
        {session.chapter.title} — done.
      </h2>
      <p className="hand mt-4 text-sm italic leading-relaxed text-parchment-dim">
        {session.rewardLines.onBossDown}
      </p>
      <p className="hand mt-3 text-xs text-parchment-dim">
        {session.strikes} blow{session.strikes === 1 ? "" : "s"} wrote this chapter. The tale of the {session.boss.name} is told.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onNext}
          disabled={busy}
          className="rounded-lg border border-gold-500/60 bg-gold-500/10 px-5 py-2.5 text-sm text-gold-200 transition-all hover:bg-gold-500/25 hover:shadow-[0_0_20px_rgba(201,162,39,0.3)] disabled:opacity-40"
        >
          ⟳ Conjure the same mountain anew
        </button>
        <Link
          href="/onboarding"
          className="rounded-lg border border-ink-600 px-5 py-2.5 text-sm text-parchment-dim transition-colors hover:border-parchment-dim hover:text-parchment"
        >
          ✒ Set out on a different quest
        </Link>
        <Link
          href="/journal"
          className="hand rounded-lg border border-ink-600 px-5 py-2.5 text-sm text-parchment-dim transition-colors hover:border-parchment-dim hover:text-parchment"
        >
          📖 Retire to the journal
        </Link>
      </div>
    </motion.div>
  );
}