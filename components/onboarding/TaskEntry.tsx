// TaskEntry.tsx — onboarding. State your quest; the hourglass is turned.
// Two thresholds: a quiet solo chapter, or a duel — summon a rival.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useGame } from "@/lib/store";
import { useHero } from "@/lib/hero";
import { TIME_CHOICES } from "@/lib/time";
import { SummonCard } from "@/components/duel/SummonCard";

type Mode = "solo" | "duel";

export function TaskEntry() {
  const router = useRouter();
  const hero = useHero();
  const createChapter = useGame((s) => s.createChapter);
  const createDuel = useGame((s) => s.createDuel);
  const busy = useGame((s) => s.busy);
  const error = useGame((s) => s.error);
  const match = useGame((s) => s.match);

  const [mode, setMode] = useState<Mode>("solo");
  const [protagonist, setProtagonist] = useState(hero.name && hero.name !== "The Wanderer" ? hero.name : "");
  const [task, setTask] = useState("");
  const [time, setTime] = useState("");
  const [summoned, setSummoned] = useState(false);

  const canSubmit = task.trim().length > 0 && protagonist.trim().length > 0 && busy === "idle";

  // Once the rival answers, sail to the duel. This lives here (stable parent) rather
  // than inside SummonCard so it cannot be torn down the moment the status flips.
  useEffect(() => {
    if (match?.status === "active") router.push("/duel");
  }, [match?.status, router]);

  const submit = async () => {
    if (!canSubmit) return;
    const token = hero.token ? await hero.token() : undefined;
    const input = { protagonist: protagonist.trim(), task: task.trim(), timeAvailable: time };
    if (mode === "duel") {
      await createDuel(input, token ?? undefined);
      setSummoned(true);
    } else {
      await createChapter(input, token ?? undefined);
      router.push("/story");
    }
  };

  if (match?.status === "active") {
    return (
      <div className="py-24 text-center">
        <p className="hand animate-pulse text-sm italic text-parchment-dim">crossing the threshold…</p>
      </div>
    );
  }

  if (summoned) {
    return <SummonCard />;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-center">
        <p className="scene-edge hand text-xs uppercase tracking-[0.35em] text-gold-500">
          {mode === "duel" ? "the summons" : "the threshold"}
        </p>
        <h1 className="font-display glowing-gold mt-3 text-4xl text-parchment">
          {mode === "duel" ? "State your quest, and name a rival" : "State your quest"}
        </h1>
        <p className="hand mt-4 text-sm italic leading-relaxed text-parchment-dim">
          {mode === "duel"
            ? "Every task you finish becomes a blow against someone else's mountain. The hourglass is shared — until time runs out, or one of you falls."
            : "A task names its rival. Tell the chronicler what stands before you, and how long the hourglass has been turned — and a chapter will be written from it."}
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
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-ink-600/60 bg-ink-950/40 p-1">
          {(["solo", "duel"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`hand rounded-lg px-3 py-2 text-sm transition-colors ${
                mode === m
                  ? "bg-gold-500/20 text-gold-200"
                  : "text-parchment-dim hover:text-parchment"
              }`}
            >
              {m === "solo" ? "✒ a quiet chapter" : "⌁ summon a rival"}
            </button>
          ))}
        </div>

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

        {error && <p className="hand text-sm text-blood-300">The rite failed: {error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-lg border border-gold-500/70 bg-gold-500/15 px-5 py-3.5 font-display text-lg text-gold-200 transition-all hover:bg-gold-500/30 hover:shadow-[0_0_30px_rgba(201,162,39,0.35)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === "seeding"
            ? "The quill is stirring…"
            : mode === "duel"
              ? "⌁ Summon the rival"
              : "✒ Conjure the chapter"}
        </button>
      </motion.form>
    </div>
  );
}