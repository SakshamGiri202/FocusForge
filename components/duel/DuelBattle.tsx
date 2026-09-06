// DuelBattle.tsx — the live duel: two hero bars, a shared hourglass, your quest list.
"use client";

import { motion } from "motion/react";
import type { MatchState, SessionState } from "@/lib/contract";
import { QuestList } from "@/components/battle/QuestList";
import { DuelHpBar } from "./DuelHpBar";
import { DuelResultCard } from "./DuelResultCard";
import { fmtClock, useDuelTicker } from "./useDuelTicker";

export function DuelBattle({
  match,
  session,
  role,
  busy,
  onStrike,
}: {
  match: MatchState;
  session: SessionState;
  role: "A" | "B";
  busy: boolean;
  onStrike: (questId: string) => void;
}) {
  const tick = useDuelTicker(match);
  const rivalSide = role === "A" ? match.sideB : match.sideA;
  const rivalName = rivalSide?.heroName ?? "A rival";
  const myName = session.protagonist.name;

  const myHp = role === "A" ? tick.hpA : tick.hpB;
  const rivalHp = role === "A" ? tick.hpB : tick.hpA;

  const over = match.status === "over";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-center">
        <p className="scene-edge hand text-xs uppercase tracking-[0.35em] text-gold-500">a duel of honest work</p>
        <h1 className="font-display glowing-gold mt-3 text-3xl text-parchment">
          {myName} &nbsp;vs&nbsp; {rivalName}
        </h1>
        <p className={`hand mt-2 text-2xl tabular-nums ${over ? "text-blood-300" : "text-gold-300"}`}>
          {over ? "— the hourglass gave out —" : fmtClock(tick.remainingMs)}
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <DuelHpBar name={myName} roleLabel="your stand" hp={myHp} />
        <DuelHpBar name={rivalName} roleLabel="the rival" hp={rivalHp} align="right" />
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg border border-ink-600/50 bg-ink-900/40 px-4 py-2.5">
        <p className="hand text-xs italic text-parchment-dim">
          {over ? "no further blows will land" : "every quest you finish strikes the rival:"}
        </p>
        <p className="hand text-xs text-parchment-dim">
          {match.log.filter((b) => b.kind === "strike").length} blows exchanged
        </p>
      </div>

      <div className="mt-6">
        <QuestList session={session} busy={busy} onStrike={onStrike} />
      </div>

      {match.log.length > 0 && (
        <div className="mt-8 space-y-2">
          <p className="hand text-sm italic text-parchment-dim">the blows of the duel:</p>
          {[...match.log]
            .reverse()
            .filter((b) => b.kind === "strike" || b.kind === "kill" || b.kind === "join")
            .map((b) => {
              const mine = b.side === role;
              return (
                <motion.p
                  key={b.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`hand text-sm leading-relaxed ${mine ? "text-parchment" : "text-blood-300 italic"}`}
                >
                  {b.kind === "join" ? "⏳ " : mine ? "✦ " : "● "}
                  {mine ? "You" : "The rival"} — {b.text}
                </motion.p>
              );
            })}
        </div>
      )}

      {over && (
        <div className="mt-8">
          <DuelResultCard match={match} role={role} />
        </div>
      )}
    </div>
  );
}