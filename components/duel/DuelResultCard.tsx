// DuelResultCard.tsx — the bell or the kill: the duel, narrated.
"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { MatchState } from "@/lib/contract";

export function DuelResultCard({ match, role }: { match: MatchState; role: "A" | "B" }) {
  const mine = role === "A" ? match.sideA : match.sideB;
  const rival = role === "A" ? match.sideB : match.sideA;
  const result = match.winner === "draw" ? "draw" : match.winner === role ? "win" : "loss";

  const headline =
    result === "win"
      ? "The rival lies still."
      : result === "loss"
        ? "The rival carried the field."
        : "The hourglass ran level.";

  const prose =
    result === "win"
      ? `${mine?.heroName ?? "You"} struck truer — ${rival?.heroName ?? "the rival"} fell, and your work stands finished. The chapter records the victory.`
      : result === "loss"
        ? `${rival?.heroName ?? "The rival"} outlasted you this time. The work is no less yours to finish. The chapter records the defeat.`
        : `Neither could outlast the other; the bell found you both standing. The hourglass released you both.`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl border border-gold-600/40 bg-ink-900/80 p-8 text-center"
    >
      <p className="scene-edge hand text-xs uppercase tracking-[0.35em] text-gold-500">the duel is decided</p>
      <h2
        className={`font-display glowing-gold mt-3 text-3xl ${
          result === "win" ? "text-moss-300" : result === "loss" ? "text-blood-300" : "text-parchment"
        }`}
      >
        {headline}
      </h2>
      <p className="hand mt-4 text-sm italic leading-relaxed text-parchment-dim">{prose}</p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/journal"
          className="rounded-lg border border-gold-500/70 bg-gold-500/15 px-5 py-2.5 text-parchment transition-colors hover:bg-gold-500/30"
        >
          It is written in the tome
        </Link>
        <Link
          href="/onboarding"
          className="rounded-lg border border-ink-600 px-5 py-2.5 text-parchment-dim transition-colors hover:border-parchment-dim hover:text-parchment"
        >
          Summon another rival
        </Link>
      </div>
    </motion.div>
  );
}