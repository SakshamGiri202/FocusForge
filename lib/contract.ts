// Contract types for FocusForge.
// Mirrors CONTRACT.md (v2) exactly. Do not rename fields here without a group announcement.

export const BOSS_HP = 100;

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
}

export interface CreateChapterInput {
  protagonist: string;
  task: string;
  timeAvailable: string;
}

export interface CompleteQuestResult {
  state: SessionState;
  goblin: SideQuestPrompt | null;
}

export type GoblinChoice = "sideQuest" | "goblin";

export type SyncState = "idle" | "syncing" | "online" | "offline" | "error";

export type BackendMode = "rest" | "mock";