"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TomeNav } from "@/components/nav/TomeNav";
import { RealmGate } from "@/components/auth/RealmGate";
import { ChapterHeader } from "@/components/novel/ChapterHeader";
import { Mainuscript } from "@/components/novel/Mainuscript";
import { BossPanel } from "@/components/battle/BossPanel";
import { QuestList } from "@/components/battle/QuestList";
import { GoblinInterlude } from "@/components/goblin/GoblinInterlude";
import { DetourCard } from "@/components/detour/DetourCard";
import { ChapterEndCard } from "@/components/chapter/ChapterEndCard";
import { useGame } from "@/lib/store";
import { useHero } from "@/lib/hero";

export default function StoryPage() {
  const session = useGame((s) => s.session);
  const goblin = useGame((s) => s.goblin);
  const busy = useGame((s) => s.busy);
  const error = useGame((s) => s.error);
  const clearError = useGame((s) => s.clearError);
  const refresh = useGame((s) => s.refresh);
  const completeQuest = useGame((s) => s.completeQuest);
  const resolveGoblin = useGame((s) => s.resolveGoblin);
  const finishDetour = useGame((s) => s.finishDetour);
  const shrink = useGame((s) => s.shrink);
  const beginNextChapter = useGame((s) => s.beginNextChapter);

  const hero = useHero();

  // Every backend call should carry the Clerk token; in demo mode it's a no-op.
  const getToken = async (): Promise<string | undefined> => (hero.token ? (await hero.token()) ?? undefined : undefined);

  useEffect(() => {
    (async () => {
      await refresh(await getToken());
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!session) {
    return (
      <>
        <TomeNav />
        <main className="mx-auto max-w-xl px-4 py-24 text-center">
          <p className="hand text-sm italic text-parchment-dim">No chapter is open. The pen rests.</p>
          <Link
            href="/onboarding"
            className="mt-6 inline-block rounded-lg border border-gold-500/70 bg-gold-500/15 px-6 py-2.5 text-parchment hover:bg-gold-500/30"
          >
            ✒ Conjure a chapter
          </Link>
        </main>
      </>
    );
  }

  const isGoblin = session.status === "goblin" && !!goblin;
  const isDetour = session.status === "detour" && !!session.detour;
  const isEnd = session.status === "chapterEnd";

  return (
    <>
      <TomeNav />
      <main className="mx-auto max-w-6xl px-4 py-12">
        <RealmGate>
          {error && (
            <div className="hand mx-auto mb-6 flex max-w-xl items-center justify-between gap-4 rounded-lg border border-blood-400/40 bg-blood-500/10 px-4 py-3 text-sm text-blood-300">
              <span>A page tore: {error}</span>
              <button type="button" onClick={clearError} className="text-parchment-dim hover:text-parchment">
                ✕
              </button>
            </div>
          )}

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
            {/* The manuscript — the story, always the story. */}
            <section className="order-2 lg:order-1">
              <ChapterHeader session={session} />
              <div className="mt-10 border-t border-gold-600/20 pt-8">
                <Mainuscript session={session} speed={16} />
              </div>
            </section>

            {/* The battle codex. */}
            <aside className="order-1 lg:order-2 space-y-6 lg:sticky lg:top-20 lg:self-start">
              <BossPanel session={session} />

              {!isGoblin && !isDetour && !isEnd && (
                <QuestList
                  session={session}
                  busy={busy === "acting"}
                  onStrike={(q) => getToken().then((t) => completeQuest(q, t))}
                  onShrink={(q) => getToken().then((t) => shrink(q, t))}
                />
              )}

              {isGoblin && goblin && (
                <GoblinInterlude
                  interlude={goblin}
                  busy={busy === "acting"}
                  onChoose={(choice) => getToken().then((t) => resolveGoblin(goblin.id, choice, t))}
                />
              )}

              {isDetour && session.detour && (
                <DetourCard
                  session={session}
                  busy={busy === "acting"}
                  onComplete={() => getToken().then((t) => finishDetour(session.detour!.id, t))}
                />
              )}

              {isEnd && (
                <ChapterEndCard session={session} busy={busy === "acting"} onNext={() => getToken().then((t) => beginNextChapter(t))} />
              )}
            </aside>
          </div>
        </RealmGate>
      </main>
    </>
  );
}