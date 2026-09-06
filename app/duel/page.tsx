// /duel — the battle page. Requires an active duel in the store; when arriving
// here via /duel/join the store already holds the match. On a fresh reload the
// ?id= param re-hooks the live stream (mock snapshots the cached doc instantly,
// REST starts an SSE stream).
"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TomeNav } from "@/components/nav/TomeNav";
import { RealmGate } from "@/components/auth/RealmGate";
import { DuelBattle } from "@/components/duel/DuelBattle";
import { useGame } from "@/lib/store";
import { useHero } from "@/lib/hero";

function DuelPageInner() {
  const params = useSearchParams();
  const requestedId = params.get("id");

  const match = useGame((s) => s.match);
  const session = useGame((s) => s.session);
  const role = useGame((s) => s.duelRole);
  const busy = useGame((s) => s.busy);
  const subscribeDuel = useGame((s) => s.subscribeDuel);
  const completeQuest = useGame((s) => s.completeQuest);

  const hero = useHero();
  const getToken = async (): Promise<string | undefined> => (hero.token ? (await hero.token()) ?? undefined : undefined);

  useEffect(() => {
    const id = requestedId ?? match?.matchId;
    if (!id) return;
    const unsub = subscribeDuel(id);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedId, match?.matchId]);

  if (!session || !match || !role) {
    return (
      <>
        <TomeNav />
        <main className="mx-auto max-w-xl px-4 py-24 text-center">
          <p className="hand text-sm italic text-parchment-dim">
            {session ? "crossing the threshold…" : "No duel is open. The gate waits."}
          </p>
          {!session && (
            <Link
              href="/onboarding"
              className="mt-6 inline-block rounded-lg border border-gold-500/70 bg-gold-500/15 px-6 py-2.5 text-parchment hover:bg-gold-500/30"
            >
              ✒ Summon a rival
            </Link>
          )}
        </main>
      </>
    );
  }

  return (
    <>
      <TomeNav />
      <main className="mx-auto px-4 py-12">
        <RealmGate>
          <DuelBattle
            match={match}
            session={session}
            role={role}
            busy={busy === "acting"}
            onStrike={(q) => getToken().then((t) => completeQuest(q, t))}
          />
        </RealmGate>
      </main>
    </>
  );
}

export default function DuelPage() {
  return (
    <Suspense>
      <DuelPageInner />
    </Suspense>
  );
}