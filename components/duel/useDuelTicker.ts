// useDuelTicker.ts — a 1s heartbeat that derives the duel's live HP + countdown
// from the MatchState (same formula as localEngine: HP = 100 − drain − damage taken).
"use client";

import { useEffect, useState } from "react";
import { DUEL_DRAIN_TICK_MS, type MatchState } from "@/lib/contract";
import { duelElapsedMs } from "@/lib/localEngine";

export interface DuelTick {
  hpA: number; // A's live HP
  hpB: number; // B's live HP
  remainingMs: number | null;
  now: number;
}

export function useDuelTicker(match: MatchState | null): DuelTick {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  if (!match || !match.startedAt) return { hpA: 100, hpB: 100, remainingMs: null, now };

  const drain = Math.floor(duelElapsedMs(now, match.startedAt, match.endsAt) / DUEL_DRAIN_TICK_MS);
  const hpA = Math.max(0, 100 - drain - match.damageDealtB);
  const hpB = Math.max(0, 100 - drain - match.damageDealtA);
  const remainingMs = match.endsAt ? Math.max(0, new Date(match.endsAt).getTime() - now) : null;

  return { hpA, hpB, remainingMs, now };
}

export function fmtClock(ms: number | null): string {
  if (ms === null) return "——:——";
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}