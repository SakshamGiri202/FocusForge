// QuestList.tsx — the tiny quests, rendered as strikes in the battle codex.
"use client";

import { motion } from "motion/react";
import type { Quest, SessionState } from "@/lib/contract";

const DIFF_LABEL: Record<Quest["difficulty"], string> = {
  trivial: "a small gesture",
  easy: "an easy stroke",
  medium: "a steadied blow",
  hard: "a heavy swing",
  epic: "the final arm",
};

export function QuestList({
  session,
  busy,
  onStrike,
  onShrink,
}: {
  session: SessionState;
  busy: boolean;
  onStrike: (questId: string) => void;
  onShrink?: (questId: string) => void;
}) {
  const fighting = session.status === "battle";
  return (
    <div className="space-y-3">
      <p className="hand text-sm italic text-parchment-dim">The tiny battles of the chapter:</p>
      {session.quests.map((q, index) => {
        const isDone = q.done;
        const interactive = fighting && !busy && !isDone;
        return (
          <motion.div
            key={q.id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.06 }}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? `Strike the quest: ${q.action}` : undefined}
            onClick={interactive ? () => onStrike(q.id) : undefined}
            onKeyDown={
              interactive
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onStrike(q.id);
                    }
                  }
                : undefined
            }
            className={`group flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
              isDone
                ? "border-ink-700/60 bg-ink-900/40"
                : interactive
                  ? "cursor-pointer border-gold-600/30 bg-ink-900/70 hover:border-gold-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60"
                  : "border-ink-700/60 bg-ink-900/50"
            } ${busy && !isDone ? "opacity-50" : ""}`}
          >
            <span className={`text-xl ${isDone ? "opacity-40" : ""}`} aria-hidden>
              {isDone ? "✓" : q.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`leading-snug ${isDone ? "line-through opacity-40 text-parchment-dim" : "text-parchment"}`}>
                {q.action}
              </p>
              <p className="hand text-xs text-parchment-dim italic">
                {DIFF_LABEL[q.difficulty]}, worth {q.damage} stones of the mountain
              </p>
            </div>
            {isDone ? (
              <span className="hand text-xs italic text-moss-300">{q.completedAt ? "struck ✓" : "struck"}</span>
            ) : (
              <div className="flex shrink-0 items-center gap-2">
                {onShrink && fighting && !busy && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onShrink(q.id);
                    }}
                    title="The mountain cannot be climbed in one step — divide this blow."
                    className="hand rounded-md border border-ink-600 px-2 py-1 text-xs text-parchment-dim transition-colors hover:border-frost-400 hover:text-frost-400"
                  >
                    too much? ⋈
                  </button>
                )}
                <span className="pointer-events-none rounded-md border border-gold-500/60 bg-gold-500/10 px-3 py-1 text-sm text-gold-200">
                  ⚔ strike
                </span>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}