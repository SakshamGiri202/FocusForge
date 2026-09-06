// SummonCard.tsx — Player A's "awaiting" panel: the join code, a shareable link,
// and a watcher that sails to the duel the moment the rival answers the summons.
"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useGame } from "@/lib/store";

export function SummonCard() {
  const match = useGame((s) => s.match);
  const subscribeDuel = useGame((s) => s.subscribeDuel);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!match) return;
    const unsub = subscribeDuel(match.matchId);
    return unsub;
  }, [match?.matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!match) return null;

  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/duel/join?code=${match.joinCode}`
      : `/duel/join?code=${match.joinCode}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Carve the summoning link:", link);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto mt-10 max-w-2xl rounded-2xl border border-gold-600/30 bg-ink-900/70 p-7 text-center"
    >
      <p className="scene-edge hand text-xs uppercase tracking-[0.35em] text-gold-500">the summons</p>
      <h2 className="font-display glowing-gold mt-3 text-2xl text-parchment">The rival approaches</h2>
      <p className="hand mt-3 text-sm italic text-parchment-dim">
        Share this code or the link. The hourglass will not turn until a rival answers — and then
        every strike of yours will strike at them.
      </p>

      <button
        type="button"
        onClick={copy}
        title="Copy the summoning link"
        className="mt-6 inline-flex items-baseline gap-3 rounded-lg border border-gold-500/60 bg-gold-500/10 px-6 py-3 font-display text-xl tracking-[0.3em] text-gold-200 transition-all hover:bg-gold-500/25"
      >
        {match.joinCode}
        <span className="hand text-xs normal-case tracking-normal text-parchment-dim">{copied ? "carved ✓" : "copy link"}</span>
      </button>

      <p className="hand mt-6 animate-pulse text-sm text-gold-400">⌁ the gate stays open… waiting for the rival to name themselves</p>
    </motion.div>
  );
}