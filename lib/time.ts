// time.ts — the shared hourglass choices + a deterministic seconds mapping.
// The backend should mirror timeChoiceToSeconds so mock (local engine) and REST
// duels always agree on the shared time budget (CONTRACT v3).

export const TIME_CHOICES = [
  "15 minutes",
  "30 minutes",
  "45 minutes",
  "1 hour",
  "2 hours",
  "3 hours",
  "An evening",
  "A full day",
  "no bound set",
] as const;

export function timeChoiceToSeconds(label: string | undefined): number {
  switch ((label ?? "").trim()) {
    case "15 minutes":
      return 15 * 60;
    case "30 minutes":
      return 30 * 60;
    case "45 minutes":
      return 45 * 60;
    case "1 hour":
      return 60 * 60;
    case "2 hours":
      return 2 * 60 * 60;
    case "3 hours":
      return 3 * 60 * 60;
    case "An evening":
      return 2 * 60 * 60;
    case "A full day":
      return 24 * 60 * 60;
    default:
      return 60 * 60; // "no bound set" or anything unknown → 1 hour
  }
}