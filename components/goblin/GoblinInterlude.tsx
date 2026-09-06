// GoblinInterlude.tsx — the ADHD goblin appears. Neither choice is punished.
"use client";

import { motion } from "motion/react";
import type { SideQuestPrompt } from "@/lib/contract";

export function GoblinInterlude({
  interlude,
  busy,
  onChoose,
}: {
  interlude: SideQuestPrompt;
  busy: boolean;
  onChoose: (choice: "sideQuest" | "goblin") => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, rotateX: 6 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ type: "spring", stiffness: 120, damping: 16 }}
      className="relative z-10 mx-auto max-w-xl rounded-2xl border-2 border-blood-400/40 bg-ink-900 p-7 shadow-[0_0_40px_rgba(192,80,74,0.18)]"
    >
      <div className="flex items-start gap-4">
        <span className="text-4xl" aria-hidden>
          👹
        </span>
        <div>
          <p className="font-display text-xl text-blood-300">The Goblin tugs at your sleeve.</p>
          <p className="hand mt-2 text-sm italic leading-relaxed text-parchment-soft">
            “Hero! {interlude.distraction}!”
          </p>
          <p className="hand mt-3 text-xs text-parchment-dim">
            Is this a true errand, or the Goblin&apos;s oldest trick?
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {interlude.options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChoose(opt.value)}
            disabled={busy}
            className="rounded-lg border px-4 py-3 text-left text-sm transition-all disabled:cursor-not-allowed disabled:opacity-40"
            style={
              opt.value === "sideQuest"
                ? { borderColor: "rgba(111,158,90,0.5)", background: "rgba(111,158,90,0.08)" }
                : { borderColor: "rgba(192,80,74,0.45)", background: "rgba(192,80,74,0.08)" }
            }
          >
            <span className="block font-semibold text-parchment">{opt.label}</span>
            <span className="hand text-xs italic text-parchment-dim">
              {opt.value === "sideQuest" ? "…and the story bends to follow you." : "…and the hero sees the trick, and returns."}
            </span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}