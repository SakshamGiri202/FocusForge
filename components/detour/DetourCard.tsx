// DetourCard.tsx — a legitimate side quest: bounded, adaptive, never punished.
"use client";

import { motion } from "motion/react";
import type { SessionState } from "@/lib/contract";

export function DetourCard({ session, busy, onComplete }: { session: SessionState; busy: boolean; onComplete: () => void }) {
  const det = session.detour;
  if (!det) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, rotate: -1 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ type: "spring", stiffness: 110, damping: 15 }}
      className="mx-auto max-w-xl rounded-2xl border-2 border-moss-400/35 bg-ink-900 p-7"
    >
      <p className="font-display text-xl text-moss-300">🛤 {det.title}</p>
      <p className="hand mt-3 text-sm italic leading-relaxed text-parchment-soft">“{det.prose}”</p>
      <p className="mt-4 text-sm text-parchment">{det.action}</p>
      <p className="hand mt-1 text-xs text-parchment-dim">⏳ {det.timeBoundary}</p>
      <button
        type="button"
        onClick={onComplete}
        disabled={busy}
        className="mt-5 rounded-lg border border-moss-400/60 bg-moss-500/15 px-4 py-2 text-sm text-moss-300 transition-colors hover:bg-moss-500/30 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Complete the detour {det.completedAt ? "✓" : ""}
      </button>
    </motion.div>
  );
}