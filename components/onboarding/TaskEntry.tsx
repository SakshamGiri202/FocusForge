// TaskEntry.tsx — onboarding. State your task; the hourglass is turned.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useGame } from "@/lib/store";
import { useHero } from "@/lib/hero";

const TIME_CHOICES = [
  "15 minutes",
  "30 minutes",
  "45 minutes",
  "1 hour",
  "2 hours",
  "3 hours",
  "An evening",
  "A full day",
  "no bound set",
];

export function TaskEntry() {
  const router = useRouter();
  const hero = useHero();
  const createChapter = useGame((s) => s.createChapter);
  const busy = useGame((s) => s.busy);
  const error = useGame((s) => s.error);

  const [protagonist, setProtagonist] = useState(hero.name && hero.name !== "The Wanderer" ? hero.name : "");
  const [task, setTask] = useState("");
  const [time, setTime] = useState("");

  const canSubmit = task.trim().length > 0 && protagonist.trim().length > 0 && busy === "idle";

  const submit = async () => {
    if (!canSubmit) return;
    const token = hero.token ? await hero.token() : undefined;
    await createChapter(
      { protagonist: protagonist.trim(), task: task.trim(), timeAvailable: time },
      token ?? undefined,
    );
    router.push("/story");
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-center">
        <p className="scene-edge hand text-xs uppercase tracking-[0.35em] text-gold-500">the threshold</p>
        <h1 className="font-display glowing-gold mt-3 text-4xl text-parchment">State your quest</h1>
        <p className="hand mt-4 text-sm italic leading-relaxed text-parchment-dim">
          A task names its rival. Tell the chronicler what stands before you, and how long the
          hourglass has been turned — and a chapter will be written from it.
        </p>
      </div>

      <motion.form
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-10 space-y-6 rounded-2xl border border-gold-600/25 bg-ink-900/70 p-7"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="block">
          <span className="hand text-sm text-gold-300">The hero&apos;s name</span>
          <input
            value={protagonist}
            onChange={(e) => setProtagonist(e.target.value)}
            placeholder="How shall the story call you?"
            className="mt-2 w-full rounded-lg border border-ink-600 bg-ink-950/60 px-4 py-3 text-parchment outline-none transition-colors placeholder:text-parchment-dim/50 focus:border-gold-500/60"
          />
        </label>

        <label className="block">
          <span className="hand text-sm text-gold-300">The task</span>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={3}
            placeholder="e.g. Finish the machine learning assignment"
            className="mt-2 w-full resize-none rounded-lg border border-ink-600 bg-ink-950/60 px-4 py-3 text-parchment outline-none transition-colors placeholder:text-parchment-dim/50 focus:border-gold-500/60"
          />
        </label>

        <div>
          <span className="hand text-sm text-gold-300">The hourglass</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {TIME_CHOICES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTime((cur) => (cur === t ? "" : t))}
                className={`hand rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  time === t
                    ? "border-gold-400/80 bg-gold-500/20 text-gold-200"
                    : "border-ink-600 text-parchment-dim hover:border-parchment-dim"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="hand text-sm text-blood-300">The chapter refused to be written: {error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-lg border border-gold-500/70 bg-gold-500/15 px-5 py-3.5 font-display text-lg text-gold-200 transition-all hover:bg-gold-500/30 hover:shadow-[0_0_30px_rgba(201,162,39,0.35)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === "seeding" ? "The quill is stirring…" : "✒ Conjure the chapter"}
        </button>
      </motion.form>
    </div>
  );
}