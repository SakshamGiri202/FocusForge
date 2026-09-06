// ArchiveList.tsx — the journal: finished chapters, written in full.
"use client";

import type { JournalEntry } from "@/lib/contract";
import { SceneDivider } from "@/components/novel/SceneDivider";

export function ArchiveList({ entries }: { entries: JournalEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="mx-auto max-w-xl py-20 text-center">
        <p className="scene-edge hand text-xs uppercase tracking-[0.35em] text-gold-500">the journal</p>
        <p className="font-display glowing-gold mt-4 text-3xl text-parchment">Blank, and waiting</p>
        <p className="hand mt-4 text-sm italic text-parchment-dim">
          No chapter has been written yet. Conjure one, and the first page will fill itself.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      {entries.map((e, i) => (
        <article key={e.journalId} className="group">
          <SceneDivider />
          <div className="mt-2">
            <p className="hand text-xs uppercase tracking-[0.3em] text-gold-500">
              Chapter {e.chapter.number} · {new Date(e.completedAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
            </p>
            <h2 className="font-display mt-2 text-2xl text-parchment">{e.chapter.title}</h2>
            <p className="hand mt-1 text-sm text-parchment-dim italic">
              “{e.closingProse}”
            </p>
            <p className="mt-4 text-sm leading-relaxed text-parchment-soft">
              In which <span className="text-gold-200">{e.task}</span>
              {e.timeAvailable && e.timeAvailable !== "no bound set" ? ` was done within ${e.timeAvailable}` : " was done"}.
              The {e.bossName} fell after {e.strikesUsed} blow{e.strikesUsed === 1 ? "" : "s"}
              {e.goblinsFallen > 0 ? `; the Goblin was exposed ${e.goblinsFallen} time${e.goblinsFallen === 1 ? "" : "s"}` : ""}
              {e.detoursTaken > 0 ? `; ${e.detoursTaken} detour${e.detoursTaken === 1 ? "" : "s"} walked and finished` : ""}.
            </p>
            {i === 0 && (
              <p className="hand mt-3 inline-block rounded-full border border-gold-600/40 px-3 py-1 text-xs text-gold-300">
                ⟡ most recent chapter
              </p>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}