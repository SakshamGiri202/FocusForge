// /duel/join — the rival's threshold. Player B names themselves + their work, and joins.
"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { TomeNav } from "@/components/nav/TomeNav";
import { RealmGate } from "@/components/auth/RealmGate";
import { TIME_CHOICES } from "@/lib/time";
import { useGame } from "@/lib/store";
import { useHero } from "@/lib/hero";

function DuelJoinInner() {
  const params = useSearchParams();
  const router = useRouter();
  const code = (params.get("code") ?? "").toUpperCase();
  const hero = useHero();
  const joinDuel = useGame((s) => s.joinDuel);
  const busy = useGame((s) => s.busy);
  const error = useGame((s) => s.error);

  const [protagonist, setProtagonist] = useState(hero.name && hero.name !== "The Wanderer" ? hero.name : "");
  const [task, setTask] = useState("");
  const [time, setTime] = useState("30 minutes");

  const canSubmit = task.trim().length > 0 && protagonist.trim().length > 0 && busy === "idle" && code.length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    const token = hero.token ? await hero.token() : undefined;
    await joinDuel(code, { protagonist: protagonist.trim(), task: task.trim(), timeAvailable: time }, token ?? undefined);
    router.push("/duel");
  };

  return (
    <div className="mx-auto max-w-2xl">
      <p className="scene-edge hand text-xs uppercase tracking-[0.35em] text-gold-500">the summons · {code}</p>
      <h1 className="font-display glowing-gold mt-3 text-3xl text-parchment">A rival answers</h1>
      <p className="hand mt-3 text-sm italic leading-relaxed text-parchment-dim">
        A voice has called you to a duel of honest work. Name yourself and your task. The hourglass is
        shared — every quest you finish strikes the one who summoned you.
      </p>

      <motion.form
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-8 space-y-6 rounded-2xl border border-gold-600/25 bg-ink-900/70 p-7"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="block">
          <span className="hand text-sm text-gold-300">Your hero&apos;s name</span>
          <input
            value={protagonist}
            onChange={(e) => setProtagonist(e.target.value)}
            placeholder="How shall the story call you?"
            className="mt-2 w-full rounded-lg border border-ink-600 bg-ink-950/60 px-4 py-3 text-parchment outline-none transition-colors placeholder:text-parchment-dim/50 focus:border-gold-500/60"
          />
        </label>

        <label className="block">
          <span className="hand text-sm text-gold-300">Your task</span>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={3}
            placeholder="e.g. Write the next chapter of the thesis"
            className="mt-2 w-full resize-none rounded-lg border border-ink-600 bg-ink-950/60 px-4 py-3 text-parchment outline-none transition-colors placeholder:text-parchment-dim/50 focus:border-gold-500/60"
          />
        </label>

        <div>
          <span className="hand text-sm text-gold-300">The shared hourglass</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {TIME_CHOICES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTime(t)}
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
          <p className="hand mt-2 text-xs italic text-parchment-dim">The summoner already set the turn; this marks your own discipline.</p>
        </div>

        {error && <p className="hand text-sm text-blood-300">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-lg border border-gold-500/70 bg-gold-500/15 px-5 py-3.5 font-display text-lg text-gold-200 transition-all hover:bg-gold-500/30 hover:shadow-[0_0_30px_rgba(201,162,39,0.35)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === "seeding" ? "The gate is opening…" : "⌁ Answer the summons"}
        </button>
      </motion.form>
    </div>
  );
}

export default function DuelJoinPage() {
  return (
    <>
      <TomeNav />
      <main className="mx-auto px-4 py-16">
        <RealmGate>
          <Suspense>
            <DuelJoinInner />
          </Suspense>
        </RealmGate>
      </main>
    </>
  );
}