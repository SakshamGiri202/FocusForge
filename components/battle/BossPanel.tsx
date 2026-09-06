// BossPanel.tsx — the boss, diegetically. Its stone-flesh is measured, not labeled HP.
"use client";

import type { SessionState } from "@/lib/contract";
import { motion } from "motion/react";

const SEGMENTS = 20;

export function BossPanel({ session }: { session: SessionState }) {
  const pct = Math.max(0, Math.min(1, session.bossHp / 100));
  const filled = Math.round(pct * SEGMENTS);
  const done = session.bossHp <= 0;

  return (
    <div className="relative rounded-xl border border-gold-600/40 bg-ink-900/70 p-5 hp-glow">
      <div className="flex items-start gap-4">
        <div className="text-4xl leading-none" aria-hidden>
          🐉
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg text-gold-200">{session.boss.name}</h3>
          <p className="hand text-xs text-parchment-dim italic">{session.boss.epithet}</p>
          <p className="hand mt-2 text-sm text-parchment-soft/80">“{session.boss.fightIntro}”</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="hand flex items-baseline justify-between text-xs text-parchment-dim">
          <span>the {session.boss.name} endures</span>
          <motion.span
            key={session.bossHp}
            initial={{ scale: 1.4, color: "#e2bd6b" }}
            animate={{ scale: 1, color: done ? "#8e3734" : "#e8e0c8" }}
            className="text-lg font-bold"
          >
            {done ? "— 0" : session.bossHp}
            <span className="text-xs font-normal text-parchment-dim"> / 100</span>
          </motion.span>
        </div>
        <div
          className="mt-1 grid gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${SEGMENTS}, minmax(0,1fr))` }}
        >
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <div
              key={i}
              className={`h-2.5 rounded-sm transition-colors duration-300 ${
                i < filled ? "bg-gold-400/90" : done ? "bg-blood-500/50" : "bg-ink-700"
              }`}
            />
          ))}
        </div>
        <p className="hand mt-2 text-xs italic text-parchment-dim">
          {done
            ? "shattered. only dust remembers it."
            : pct > 0.66
              ? "its stone-flesh barely stirred."
              : pct > 0.33
                ? "arcs of light run through the cracks."
                : pct > 0
                  ? "it is afraid now. anyone can see it."
                  : ""}
        </p>
      </div>
    </div>
  );
}