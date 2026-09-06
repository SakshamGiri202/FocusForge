// Mainuscript.tsx — renders the growing story as a living manuscript.
// The newest line types itself; carried lines settle into the page.
// Rewards appear as handwritten margin-gloss when a beat lands with high magic.

"use client";

import { useEffect, useMemo, useRef } from "react";
import type { SessionState, StoryBeatKind } from "@/lib/contract";
import { Typewriter } from "./Typewriter";
import { SceneDivider } from "./SceneDivider";

const KIND_TONE: Record<StoryBeatKind, string> = {
  prose: "",
  start: "text-gold-300",
  strike: "text-parchment",
  reward: "italic text-gold-300/85",
  goblin: "italic text-blood-400",
  return: "text-gold-300",
  shrink: "text-gold-300",
  detour: "text-moss-300",
  chapterEnd: "font-display text-xl text-gold-200 leading-relaxed",
  reconjure: "text-frost-400 italic",
};

const NEEDS_BREAK: StoryBeatKind[] = [
  "reward",
  "chapterEnd",
  "goblin",
  "return",
  "shrink",
  "detour",
  "reconjure",
  "start",
];

interface Para {
  id: string;
  kind: StoryBeatKind;
  text: string;
  dropCap: boolean;
}

export function Mainuscript({
  session,
  speed,
  onTick,
}: {
  session: SessionState;
  speed?: number;
  onTick?: (n: number) => void;
}) {
  const paras = useMemo<Para[]>(
    () =>
      session.storyLog.map((b, i) => ({
        id: b.id,
        kind: b.kind,
        text: b.text,
        dropCap: i === 0,
      })),
    [session.storyLog],
  );

  const endRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = activeRef.current ?? endRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 96) {
      window.scrollTo({ top: Math.max(0, window.scrollY + (r.bottom - window.innerHeight + 96)), behavior: "smooth" });
    }
  }, [paras.length]);

  const onActiveTick = (n: number) => {
    onTick?.(n);
    const el = activeRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 120) {
      window.scrollTo({ top: Math.max(0, window.scrollY + (r.bottom - window.innerHeight + 120)), behavior: "smooth" });
    }
  };

  const reveal = paras;
  const active = reveal[reveal.length - 1];
  const settled = reveal.slice(0, -1);

  return (
    <div ref={endRef} className="space-y-6">
      {settled.map((p) => <ParaView key={p.id} para={p} />)}
      {active && (
        <div ref={activeRef}>
          {active.dropCap && active.text.length > 0 ? (
            <p className={`mainuscript ${KIND_TONE[active.kind]}`}>
              <span className="drop-cap-letter">{active.text[0]}</span>
              <Typewriter text={active.text.slice(1)} speed={speed} onTick={onActiveTick} />
            </p>
          ) : (
            <p className={`mainuscript ${KIND_TONE[active.kind]}`}>
              <Typewriter text={active.text} speed={speed} onTick={onActiveTick} />
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ParaView({ para }: { para: Para }) {
  return (
    <>
      {NEEDS_BREAK.includes(para.kind) && <SceneDivider />}
      <p className={`mainuscript ${KIND_TONE[para.kind]}`}>
        {para.dropCap && para.text.length > 0 ? (
          <>
            <span className="drop-cap-letter">{para.text[0]}</span>
            {para.text.slice(1)}
          </>
        ) : (
          para.text
        )}
      </p>
    </>
  );
}