// ChapterHeader.tsx — the chapter's opening page: title, epigraph, marginalia.
"use client";

import type { SessionState } from "@/lib/contract";

export function ChapterHeader({ session }: { session: SessionState }) {
  const hearts = Array.from({ length: 3 }, (_, i) => (
    <span key={i} className={`text-sm ${i < session.hearts ? "text-gold-300 animate-ember" : "text-ink-600"}`}>
      {i < session.hearts ? "🕯" : "🕯"}
    </span>
  ));

  return (
    <header className="text-center">
      <p className="scene-edge hand text-sm tracking-[0.35em] uppercase text-gold-500">
        {session.chapter.number === 1 ? "Here begins" : "Chapter"} {session.chapter.number}
        {session.chapter.number !== 1 && " · the tale continues"}
      </p>
      <h1 className="font-display glowing-gold mt-3 text-4xl md:text-5xl text-parchment">
        {session.chapter.title}
      </h1>
      <p className="epigraph mt-4 text-base">{session.chapter.epigraph}</p>

      <div className="hand mt-6 flex items-center justify-center gap-6 text-sm text-parchment-dim">
        <span>{session.setting.timeOfDay}</span>
        <span className="scene-edge">·</span>
        <span>{session.setting.place}</span>
      </div>

      <div className="mt-5 flex items-center justify-center gap-5 text-xs text-parchment-dim">
        <span className="hand flex items-center gap-1.5" title="The hero's embers">
          {hearts} <span className="italic">— the embers still burn</span>
        </span>
        <span className="scene-edge">·</span>
        <span className="hand" title="Blows landed">
          ⚔ {session.strikes} blow{session.strikes === 1 ? "" : "s"} landed
        </span>
      </div>
    </header>
  );
}