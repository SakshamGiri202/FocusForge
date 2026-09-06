// Contract types for FocusForge.
// Mirrors CONTRACT.md (v2) exactly. Do not rename fields here without a group announcement.

export const BOSS_HP = 100;

// Duel tuning (backend-tunable constant; mirror in localEngine + DuelPanel tween).
// Every hero's 100-scale HP loses 1 point per tick while a duel is active.
// ~1 HP / 40s → an idle hero reaches ~45 by a 30-minute bell; quests decide the fight.
export const DUEL_DRAIN_TICK_MS = 40_000;

export type Difficulty = "trivial" | "easy" | "medium" | "hard" | "epic";

export interface Quest {
  id: string;
  emoji: string;
  action: string;
  narrative: string;
  difficulty: Difficulty;
  damage: number; // deterministic, locked at creation (see CONTRACT.md §2.1.1)
  done: boolean;
  completedAt: string | null;
}

export interface StorySeed {
  chapter: { number: number; title: string; epigraph: string };
  setting: { place: string; timeOfDay: string; mood: string };
  openingProse: string;
  boss: { name: string; epithet: string; fightIntro: string; hp: number };
  quests: Quest[];
  protagonist: { name: string; hearts: number; titles: string[] };
  rewardLines: {
    gate: string;
    onQuest: string[];
    onReturn: string;
    onShrink: string;
    onBossDown: string;
  };
}

export type StoryStatus = "battle" | "goblin" | "detour" | "chapterEnd";

export type StoryBeatKind =
  | "prose"
  | "start"
  | "strike"
  | "return"
  | "shrink"
  | "reward"
  | "goblin"
  | "detour"
  | "chapterEnd"
  | "reconjure";

export interface StoryBeat {
  id: string;
  kind: StoryBeatKind;
  at: string;
  text: string;
}

export interface SideQuest {
  id: string;
  title: string;
  prose: string;
  action: string;
  timeBoundary: string;
  completedAt: string | null;
  heroWise: boolean;
}

export interface SessionState extends StorySeed {
  sessionId: string;
  version: number;
  status: StoryStatus;
  createdAt: string;
  updatedAt: string;
  task: string;
  timeAvailable: string;
  bossHp: number;
  hearts: number;
  strikes: number;
  goblinSeen: boolean;
  detour: SideQuest | null;
  storyLog: StoryBeat[];
}

export interface SideQuestPrompt {
  id: string;
  distraction: string;
  options: { value: "sideQuest" | "goblin"; label: string }[];
}

export interface JournalEntry {
  journalId: string;
  sessionId: string;
  chapter: { number: number; title: string };
  task: string;
  timeAvailable: string;
  bossName: string;
  strikesUsed: number;
  goblinsFallen: number;
  detoursTaken: number;
  closingProse: string;
  createdAt: string;
  completedAt: string;
  mode?: "solo" | "duel";
  rival?: string; // duel-only: the opponent's hero name
  result?: "win" | "loss" | "draw"; // duel-only
}

export interface CreateChapterInput {
  protagonist: string;
  task: string;
  timeAvailable: string;
}

export interface CompleteQuestResult {
  state: SessionState;
  goblin: SideQuestPrompt | null;
  match?: MatchState; // present when this strike happened inside a duel
}

export type GoblinChoice = "sideQuest" | "goblin";

export type SyncState = "idle" | "syncing" | "online" | "offline" | "error";

export type BackendMode = "rest" | "mock";

// ---- Duel mode (CONTRACT.md §3.1 addendum, v3) ----

export type DuelStatus = "awaiting" | "active" | "over";
export type DuelWinner = "A" | "B" | "draw" | null;
export type DuelEndReason = "kill" | "time" | null;

export interface DuelSide {
  sessionId: string;
  heroName: string;
  task: string;
  timeAvailable: string;
  strikes: number;
}

export type MatchBeatKind = "start" | "strike" | "kill" | "time" | "join";

export interface MatchBeat {
  id: string;
  kind: MatchBeatKind;
  side: "A" | "B";
  text: string;
  at: string;
}

/** The live duel. HP is DERIVED (never stored per second):
 *  hpA = 100 − drain(now) − damageDealtB, hpB = 100 − drain(now) − damageDealtA.
 *  Backend returns hpA/hpB fresh on every read/event; clients tween from
 *  startedAt/endsAt + damageDealtX. */
export interface MatchState {
  matchId: string;
  joinCode: string; // short code the rival types / a shareable link carries
  status: DuelStatus;
  winner: DuelWinner;
  endReason: DuelEndReason;
  durationSeconds: number; // shared time budget, set by the summoner
  startedAt: string | null; // null until the rival joins — the clock only starts then
  endsAt: string | null;
  sideA: DuelSide | null;
  sideB: DuelSide | null;
  hpA: number; // fresh value at this snapshot (0..100)
  hpB: number;
  damageDealtA: number; // Σ damage of A's completed quests (hurts B)
  damageDealtB: number; // Σ damage of B's completed quests (hurts A)
  log: MatchBeat[];
}