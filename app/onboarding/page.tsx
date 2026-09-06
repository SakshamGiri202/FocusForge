import { TomeNav } from "@/components/nav/TomeNav";
import { RealmGate } from "@/components/auth/RealmGate";
import { TaskEntry } from "@/components/onboarding/TaskEntry";

export default function OnboardingPage() {
  return (
    <>
      <TomeNav />
      <main className="mx-auto max-w-5xl px-4 py-14">
        <RealmGate>
          <TaskEntry />
        </RealmGate>
      </main>
    </>
  );
}