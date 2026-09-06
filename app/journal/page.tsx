"use client";

import { useEffect } from "react";
import { TomeNav } from "@/components/nav/TomeNav";
import { RealmGate } from "@/components/auth/RealmGate";
import { ArchiveList } from "@/components/journal/ArchiveList";
import { useGame } from "@/lib/store";
import { useHero } from "@/lib/hero";
import { api } from "@/lib/api";

export default function JournalPage() {
  const journal = useGame((s) => s.journal);
  const pushJournal = useGame((s) => s.pushJournal);
  const hero = useHero();

  useEffect(() => {
    if (api.mode !== "rest") return;
    (async () => {
      const token = hero.token ? await hero.token() : undefined;
      try {
        const entries = await api.getJournal(token ?? undefined);
        for (const e of entries) pushJournal(e);
      } catch {
        /* offline — the cache will speak */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <TomeNav />
      <main className="mx-auto max-w-5xl px-4 py-14">
        <RealmGate>
          <div className="mb-10 text-center">
            <p className="scene-edge hand text-xs uppercase tracking-[0.35em] text-gold-500">the journal</p>
            <h1 className="font-display glowing-gold mt-3 text-4xl text-parchment">The Done Chapters</h1>
          </div>
          <ArchiveList entries={journal} />
        </RealmGate>
      </main>
    </>
  );
}