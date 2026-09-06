// localEngine.ts — deterministic offline story engine.
// Implements CONTRACT.md §2.1.1 (locked damage), §2.2 (diegetic rewards),
// §2.4 (goblin ONCE per session after the 2nd strike), §2.6 (shrink split).
// Powers the mock adapter until the real backend exists. Never touches the DB.

import {
  BOSS_HP,
  DUEL_DRAIN_TICK_MS,
  type CreateChapterInput,
  type Difficulty,
  type GoblinChoice,
  type JournalEntry,
  type MatchBeat,
  type MatchState,
  type Quest,
  type SessionState,
  type SideQuest,
  type SideQuestPrompt,
  type StoryBeat,
  type StoryBeatKind,
  type StorySeed,
} from "./contract";
import { timeChoiceToSeconds } from "./time";

const WEIGHTS: Record<Difficulty, number> = {
  trivial: 6,
  easy: 10,
  medium: 16,
  hard: 24,
  epic: 40,
};

const DIFF_EMOJI: Record<Difficulty, string> = {
  trivial: "🕯️",
  easy: "⚔️",
  medium: "🗡️",
  hard: "🔥",
  epic: "🏹",
};

function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uid(prefix = "x"): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

const nowISO = () => new Date().toISOString();

function timeOfDayLabel(): string {
  const d = new Date();
  const day = d.toLocaleDateString("en-US", { weekday: "long" });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} · ${time.replace(" ", "")}`;
}

interface Terrain {
  place: string;
  land: string;
  bossVerb: string;
  crumble: string;
}

const TERRAINS: Terrain[] = [
  { place: "The Mountain of Deadlines", land: "mountain", bossVerb: "looms before you", crumble: "the mountain crumbles into dust" },
  { place: "The Drowned Lowlands of Procrastination", land: "lowlands", bossVerb: "rise from the mist", crumble: "the lowlands dry beneath a sudden sun" },
  { place: "The Citadel of Unfinished Work", land: "citadel", bossVerb: "stand watch over its walls", crumble: "the citadel's gates swing open at last" },
  { place: "The Labyrinth of Loose Ends", land: "labyrinth", bossVerb: "shift the walls behind you", crumble: "the labyrinth finally points the way home" },
  { place: "The Bog of Half-Started Things", land: "bog", bossVerb: "bubble and stir", crumble: "the bog gives up its path at last" },
];

const QUEST_TEMPLATES: Record<Exclude<Difficulty, "trivial">, string[]> = {
  easy: [
    "Open {task}",
    "Read the first page of {task}",
    "List three things you will need for {task}",
    "Skim the outline of {task}",
  ],
  medium: [
    "Write one rough paragraph for {task}",
    "Fix one obvious problem in {task}",
    "Organize the notes for {task}",
    "Re-read your own outline and tighten it",
  ],
  hard: [
    "Complete the hardest part of {task}",
    "Write a full draft section for {task}",
    "Test every piece of {task} end to end",
  ],
  epic: [
    "Finish {task} for good",
    "Review the whole of {task} and close it",
    "Deliver {task} — no caveats",
  ],
};

const TRIVIAL_ACTIONS = [
  "Open {task}",
  "Read the first line of {task}",
  "Give {task} a name on your desk",
  "Press the first key toward {task}",
];

const GOBBLED_ACTIONS = [
  "we absolutely must reorganize the bookshelf at once",
  "the important email you forgot to send is calling to you",
  "the game you bought six months ago has a free weekend event",
  "the notes app demands to be decluttered this very hour",
  "a message glows with unread urgency at the edge of your sight",
];

const SIDE_QUESTS: Omit<SideQuest, "id" | "completedAt" | "heroWise">[] = [
  { title: "The Forgotten Missive", prose: "The road bends, but it is a real road — paved, short, and worth walking.", action: "Send the email that suddenly surfaced in your mind", timeBoundary: "15 minutes — the hourglass has been turned" },
  { title: "The Bowl of Sustenance", prose: "A brief stop sustains the hero; the mountain will still be there.", action: "Make a proper cup of tea and take ten slow breaths", timeBoundary: "10 minutes — the hourglass has been turned" },
  { title: "The Pending Errand", prose: "The errand is genuine and small; refusing it would feed the fog.", action: "Cross off the small errand that refuses to be ignored", timeBoundary: "15 minutes — the hourglass has been turned" },
  { title: "The Word's Whisper", prose: "An idea knocks; written down, it can wait for its hour.", action: "Note down the sudden idea before it flees", timeBoundary: "5 minutes — the hourglass has been turned" },
];

const ON_QUEST_REWARDS = [
  "The monster appears slightly less terrifying.",
  "A door that was sealed now stands ajar.",
  "The mountain shudders; a stone falls away.",
  "The path ahead grows a little more bright.",
  "Somewhere beyond the mist, the summit steps closer.",
  "The blade finds its rhythm.",
  "A line of ink dries on the map of the impossible.",
];

const GATE_LINE = "✧ The Gate Was Opened — and so, impossibly, the work had begun.";
const RETURN_LINE = "✧ The Wanderer Returned — the road home was shorter than it seemed.";
const SHRINK_LINE = "✧ Wisdom of the Small Blade — the hero remembers the mountain is climbed one stone at a time.";

const INTERLUDE_ID = "sq_001" as const;

function makeQuest(id: string, action: string, difficulty: Difficulty, rng: () => number): Quest {
  const w = WEIGHTS[difficulty];
  const jitter = Math.round((rng() - 0.5) * 8);
  const damage = Math.min(60, Math.max(5, w + jitter));
  return {
    id,
    emoji: DIFF_EMOJI[difficulty],
    action,
    narrative: "",
    difficulty,
    damage,
    done: false,
    completedAt: null,
  };
}

function lockDamage(quests: Quest[]): Quest[] {
  const target = 120;
  const sum = quests.reduce((n, q) => n + WEIGHTS[q.difficulty], 0);
  return quests.map((q) => {
    const raw = (WEIGHTS[q.difficulty] / sum) * target;
    return { ...q, damage: Math.min(60, Math.max(5, Math.round(raw))) };
  });
}

function pickTaskFragment(task: string): string {
  const t = task.trim().replace(/\s+/g, " ");
  if (!t) return "the work";
  return t.length > 42 ? `${t.slice(0, 42)}…` : t;
}

function buildSeed(input: CreateChapterInput, seed: number): StorySeed {
  const rng = seededRandom(seed);
  const terrain = TERRAINS[Math.floor(rng() * TERRAINS.length)];
  const taskFrag = pickTaskFragment(input.task);
  const boss = input.task.trim() || "The Shadow of Unfinished Work";

  const questPlan: [Difficulty, () => string][] = [
    ["trivial", () => TRIVIAL_ACTIONS[Math.floor(rng() * TRIVIAL_ACTIONS.length)].replace("{task}", taskFrag)],
    ["easy", () => QUEST_TEMPLATES.easy[Math.floor(rng() * QUEST_TEMPLATES.easy.length)].replace("{task}", taskFrag)],
    ["medium", () => QUEST_TEMPLATES.medium[Math.floor(rng() * QUEST_TEMPLATES.medium.length)].replace("{task}", taskFrag)],
    ["medium", () => QUEST_TEMPLATES.medium[Math.floor(rng() * QUEST_TEMPLATES.medium.length)].replace("{task}", taskFrag)],
    ["hard", () => QUEST_TEMPLATES.hard[Math.floor(rng() * QUEST_TEMPLATES.hard.length)].replace("{task}", taskFrag)],
    ["epic", () => QUEST_TEMPLATES.epic[Math.floor(rng() * QUEST_TEMPLATES.epic.length)].replace("{task}", taskFrag)],
  ];
  // lightly shuffle quest order via rng
  for (let i = questPlan.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [questPlan[i], questPlan[j]] = [questPlan[j], questPlan[i]];
  }

  const quests = lockDamage(
    questPlan.map(([difficulty, actionFn], i) =>
      makeQuest(`q${i + 1}`, actionFn(), difficulty, rng),
    ),
  );
  for (const q of quests) {
    q.narrative = pickNarrative(q, taskFrag, rng);
  }

  const epithets = ["Warden of the Submission Portal", "Keeper of the Unfinished", "The Gargoyle of Reviewers", "Lord of the Creeping Due Date"];
  const bossEpithet = epithets[Math.floor(rng() * epithets.length)];

  const openingProse =
    `The ${terrain.land} rose against the sky as ${input.protagonist} arrived — vast and patient, ` +
    `swallowing the light. At its heart stood ${boss}, ${bossEpithet}. Somewhere beyond it lay ` +
    `the work you had promised yourself you would begin: ${taskFrag}. ` +
    `The clock had spoken. The ${terrain.land} would not move on its own.`;

  const onQuest = [...ON_QUEST_REWARDS].sort(() => rng() - 0.5).slice(0, 6);

  return {
    chapter: { number: 1, title: terrain.place, epigraph: `"Even mountains are moved one stone at a time."` },
    setting: { place: terrain.place, timeOfDay: timeOfDayLabel(), mood: "grim" },
    openingProse,
    boss: { name: boss, epithet: bossEpithet, fightIntro: `${boss}, ${bossEpithet}, ${terrain.bossVerb}.`, hp: BOSS_HP },
    quests,
    protagonist: { name: input.protagonist, hearts: 3, titles: [] },
    rewardLines: {
      gate: GATE_LINE,
      onQuest,
      onReturn: RETURN_LINE,
      onShrink: SHRINK_LINE,
      onBossDown: `${boss} shatters like dry shale. ${terrain.crumble}; the sky clears. The chapter closes.`,
    },
  };
}

const NARRATIVES = [
  "This step asks nothing of you but presence — the first and hardest spell of all.",
  "The hero fears this gesture less than the many that follow it, yet it carves the path.",
  "Small as it is, the act draws the first blood of the battle.",
  "A strike aimed not at the heart of the beast, but at the seam that holds it together.",
  "The {boss} feels this one. It will not admit it, but the {boss} feels this one.",
  "Time bends around deliberate work; this step buys the next one a little light.",
];

function pickNarrative(q: Quest, boss: string, rng: () => number): string {
  return NARRATIVES[Math.floor(rng() * NARRATIVES.length)].replace("{boss}", boss);
}

function beat(kind: StoryBeatKind, text: string): StoryBeat {
  return { id: uid("bev"), kind, at: nowISO(), text };
}

export function startSession(input: CreateChapterInput, opts?: { chapterNumber?: number; seed?: number }): SessionState {
  const seed = opts?.seed ?? Math.floor(Math.random() * 1_000_000);
  const story = buildSeed(input, seed);
  return {
    ...story,
    sessionId: uid("ses"),
    version: 1,
    status: "battle",
    createdAt: nowISO(),
    updatedAt: nowISO(),
    task: input.task,
    timeAvailable: input.timeAvailable || "no bound set",
    bossHp: BOSS_HP,
    hearts: story.protagonist.hearts,
    strikes: 0,
    goblinSeen: false,
    detour: null,
    storyLog: [beat("prose", story.openingProse)],
  };
}

function bossHpOf(state: SessionState): number {
  const dealt = state.quests.filter((q) => q.done).reduce((n, q) => n + q.damage, 0);
  return Math.max(0, BOSS_HP - dealt);
}

function clone(s: SessionState): SessionState {
  // shallow-ish clone is fine; quests/log are replaced on mutation
  return JSON.parse(JSON.stringify(s)) as SessionState;
}

function touch(s: SessionState): SessionState {
  s.version += 1;
  s.updatedAt = nowISO();
  return s;
}

export interface StrikeOutcome {
  state: SessionState;
  goblin: SideQuestPrompt | null;
}

export function applyStrike(s: SessionState, questId: string): StrikeOutcome {
  const state = clone(s);
  const q = state.quests.find((x) => x.id === questId);
  if (!q || q.done || state.status !== "battle") return { state: s, goblin: null };

  q.done = true;
  q.completedAt = nowISO();
  state.strikes += 1;
  state.storyLog.push(beat("strike", `${q.emoji} ${q.action} — ${q.narrative}`));
  state.storyLog.push(beat("reward", pickReward(state, state.strikes === 1)));
  state.bossHp = bossHpOf(state);
  touch(state);

  if (state.bossHp <= 0) {
    state.status = "chapterEnd";
    state.storyLog.push(beat("chapterEnd", state.rewardLines.onBossDown));
    return { state, goblin: null };
  }

  if (state.strikes === 2 && !state.goblinSeen) {
    state.goblinSeen = true;
    state.status = "goblin";
    const distraction = GOBBLED_ACTIONS[Math.floor(seededRandom(state.version)() * GOBBLED_ACTIONS.length)];
    state.storyLog.push(beat("goblin", `The Goblin whispers: "${distraction}."`));
    const prompt: SideQuestPrompt = {
      id: INTERLUDE_ID,
      distraction,
      options: [
        { value: "sideQuest", label: "A · A legitimate side quest" },
        { value: "goblin", label: "B · A trick of the Goblin" },
      ],
    };
    return { state, goblin: prompt };
  }

  return { state, goblin: null };
}

function pickReward(state: SessionState, isFirst: boolean): string {
  if (isFirst) return state.rewardLines.gate;
  const pool = state.rewardLines.onQuest;
  const rng = seededRandom(state.version * 7919);
  return pool[Math.floor(rng() * pool.length)];
}

export function resolveInterlude(s: SessionState, interludeId: string, choice: GoblinChoice): SessionState {
  const state = clone(s);
  if (state.status !== "goblin" || state.goblinSeen !== true) return s;

  if (choice === "goblin") {
    state.status = "battle";
    state.storyLog.push(beat("return", `${state.rewardLines.onReturn} The Goblin vanishes, exposed. The mountain resumes its patient watch.`));
    touch(state);
    return state;
  }

  const sq = SIDE_QUESTS[Math.floor(seededRandom(state.version)() * SIDE_QUESTS.length)];
  const detour: SideQuest = { ...sq, id: uid("det"), completedAt: null, heroWise: true };
  state.detour = detour;
  state.status = "detour";
  state.storyLog.push(beat("detour", `${sq.title}. "${sq.prose}" — ${sq.timeBoundary}.`));
  touch(state);
  return state;
}

export function completeDetour(s: SessionState, detourId: string): SessionState {
  const state = clone(s);
  const det = state.detour;
  if (!det || det.id !== detourId || state.status !== "detour") return s;
  det.completedAt = nowISO();
  state.detour = null;
  state.status = "battle";
  state.storyLog.push(beat("return", `${state.rewardLines.onReturn} The detour was real, and it was finished. ${det.title} lies behind you now.`));
  touch(state);
  return state;
}

export function shrinkQuest(s: SessionState, questId: string): SessionState {
  const state = clone(s);
  const q = state.quests.find((x) => x.id === questId);
  if (!q || q.done || state.status !== "battle") return s;

  const half = Math.max(5, Math.round(q.damage / 2));
  const second = Math.max(5, q.damage - half);

  const smaller: Quest = {
    ...q,
    id: `${q.id}-b`,
    action: q.action,
    difficulty: q.difficulty === "trivial" ? "trivial" : "easy",
    damage: half,
    narrative: "A smaller blade, but it still cuts true.",
  };
  const rest: Quest = {
    ...q,
    id: `${q.id}-c`,
    action: q.action,
    difficulty: q.difficulty,
    damage: second,
    narrative: "The remainder yet remains — smaller now, and far less terrible.",
  };

  state.quests = state.quests.flatMap((x) => (x.id === questId ? [smaller, rest] : [x]));
  state.storyLog.push(beat("shrink", `${state.rewardLines.onShrink} "${q.action}" splits into two smaller steps.`));
  touch(state);
  return state;
}

export function reconjure(s: SessionState): SessionState {
  const fresh = startSession(
    { protagonist: s.protagonist.name, task: s.task, timeAvailable: s.timeAvailable },
    { chapterNumber: s.chapter.number },
  );
  fresh.chapter.number = s.chapter.number;
  fresh.sessionId = s.sessionId; // reconjure mutates, doesn't rekey
  fresh.createdAt = s.createdAt;
  fresh.storyLog.push(beat("reconjure", "The words on the page shimmer and rewrite themselves. The same mountain, a different path."));
  return touch(fresh);
}

export function synthesizeJournal(state: SessionState): JournalEntry {
  return {
    journalId: uid("jr"),
    sessionId: state.sessionId,
    chapter: { number: state.chapter.number, title: state.chapter.title },
    task: state.task,
    timeAvailable: state.timeAvailable,
    bossName: state.boss.name,
    strikesUsed: state.strikes,
    goblinsFallen: state.storyLog.filter((b) => b.kind === "return").length,
    detoursTaken: state.storyLog.filter((b) => b.kind === "detour").length,
    closingProse: state.rewardLines.onBossDown,
    createdAt: state.createdAt,
    completedAt: nowISO(),
    mode: "solo",
  };
}

// ---------------------------------------------------------------------------
// Duel mode (CONTRACT v3). Cross-tab demo without a backend: matches live in
// localStorage ("focusforge-matches") so two tabs of the same browser can duel.
// HP is DERIVED from startedAt/endsAt + damageDealtX — never stored per second.
// ---------------------------------------------------------------------------

const MATCH_DOC_KEY = "focusforge-matches";

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/** 6-char join code from an unambiguous alphabet. */
function genJoinCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function loadMatchDoc(): Record<string, MatchState> {
  try {
    if (!isBrowser()) return {};
    const raw = window.localStorage.getItem(MATCH_DOC_KEY);
    return raw ? (JSON.parse(raw) as Record<string, MatchState>) : {};
  } catch {
    return {};
  }
}

function saveMatchDoc(doc: Record<string, MatchState>) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(MATCH_DOC_KEY, JSON.stringify(doc));
  } catch {
    /* storage full / private mode — duel sync degrades to this tab only */
  }
}

export function duelElapsedMs(nowMs: number, startedAt: string | null, endsAt: string | null): number {
  if (!startedAt) return 0;
  const s = new Date(startedAt).getTime();
  const e = endsAt ? new Date(endsAt).getTime() : Infinity;
  return Math.max(0, Math.min(nowMs, e) - s);
}

export function duelDrain(nowMs: number, startedAt: string | null, endsAt: string | null): number {
  return Math.floor(duelElapsedMs(nowMs, startedAt, endsAt) / DUEL_DRAIN_TICK_MS);
}

/** Evaluate the match at `nowMs`, deriving hpA/hpB and any end conditions. */
export function evalMatch(m: MatchState, nowMs: number): MatchState {
  const drain = duelDrain(nowMs, m.startedAt, m.endsAt);
  const hpA = Math.max(0, 100 - drain - m.damageDealtB);
  const hpB = Math.max(0, 100 - drain - m.damageDealtA);

  let status = m.status;
  let winner = m.winner;
  let endReason = m.endReason;

  if (status === "active") {
    if (hpA <= 0 || hpB <= 0) {
      status = "over";
      endReason = "kill";
      winner = hpA === hpB ? "draw" : hpA > hpB ? "A" : "B";
    } else if (m.endsAt && nowMs >= new Date(m.endsAt).getTime()) {
      status = "over";
      endReason = "time";
      winner = hpA === hpB ? "draw" : hpA > hpB ? "A" : "B";
    }
  }

  return { ...m, status, winner, endReason, hpA, hpB };
}

function matchBeat(m: MatchState, kind: MatchBeat["kind"], side: "A" | "B", text: string): MatchBeat {
  return { id: uid("mb"), kind, side, text, at: nowISO() };
}

function freshMatch(input: CreateChapterInput, sideA: MatchState["sideA"]): MatchState {
  const durationSeconds = timeChoiceToSeconds(input.timeAvailable);
  return {
    matchId: uid("mch"),
    joinCode: genJoinCode(),
    status: "awaiting",
    winner: null,
    endReason: null,
    durationSeconds,
    startedAt: null,
    endsAt: null,
    sideA,
    sideB: null,
    hpA: 100,
    hpB: 100,
    damageDealtA: 0,
    damageDealtB: 0,
    log: [],
  };
}

export interface DuelOutcome {
  match: MatchState;
  session: SessionState;
}

/** Player A summons the duel: creates the match (awaiting) and their own chapter. */
export function startDuel(input: CreateChapterInput, opts?: { chapterNumber?: number; seed?: number }): DuelOutcome {
  const session = startSession(input, opts);
  const sideA = {
    sessionId: session.sessionId,
    heroName: input.protagonist,
    task: input.task,
    timeAvailable: input.timeAvailable || "no bound set",
    strikes: 0,
  };
  const match = freshMatch(input, sideA);
  match.log.push(
    matchBeat(match, "start", "A", `${sideA.heroName} stands before their work, demanding a rival be summoned.`),
  );

  const doc = loadMatchDoc();
  doc[match.matchId] = match;
  saveMatchDoc(doc);
  return { match, session };
}

/** Player B joins by code; the shared clock starts the moment the duel is sealed. */
export function joinDuel(joinCode: string, input: CreateChapterInput): DuelOutcome {
  const doc = loadMatchDoc();
  const match = Object.values(doc).find((m) => m.joinCode === joinCode);
  if (!match) throw new Error(`No summon bears the code “${joinCode}”.`);

  if (match.status !== "awaiting") {
    const taken = match.status === "active" ? "already begun" : "already decided";
    throw new Error(`That duel has ${taken}.`);
  }
  if (match.sideB) throw new Error("That duel already has its rival.");

  const session = startSession(input);
  match.sideB = {
    sessionId: session.sessionId,
    heroName: input.protagonist,
    task: input.task,
    timeAvailable: input.timeAvailable || "no bound set",
    strikes: 0,
  };
  match.status = "active";
  match.startedAt = nowISO();
  match.endsAt = new Date(new Date(match.startedAt).getTime() + match.durationSeconds * 1000).toISOString();
  match.log.push(
    matchBeat(match, "join", "B", `${input.protagonist} answers the summons. The hourglass turns — the duel is sealed.`),
  );

  const evaled = evalMatch(match, Date.now());
  doc[evaled.matchId] = evaled;
  saveMatchDoc(doc);
  return { match: evaled, session };
}

export function getDuel(matchId: string, now?: number): MatchState {
  const m = loadMatchDoc()[matchId];
  if (!m) throw new Error("No such duel.");
  const evaled = evalMatch(m, now ?? Date.now());
  if (evaled.status !== m.status) {
    const doc = loadMatchDoc();
    doc[evaled.matchId] = evaled;
    saveMatchDoc(doc);
  }
  return evaled;
}

export function findMatchBySession(sessionId: string): MatchState | null {
  const doc = loadMatchDoc();
  for (const m of Object.values(doc)) {
    if (m.sideA?.sessionId === sessionId || m.sideB?.sessionId === sessionId) return m;
  }
  return null;
}

export function duelSideOf(match: MatchState, sessionId: string): "A" | "B" | null {
  if (match.sideA?.sessionId === sessionId) return "A";
  if (match.sideB?.sessionId === sessionId) return "B";
  return null;
}

/** Complete a quest inside a duel: marks own quest done, deals its damage to the rival. */
export function applyDuelStrike(
  current: SessionState,
  questId: string,
): { state: SessionState; match: MatchState | null; damage: number } {
  const match = findMatchBySession(current.sessionId);
  if (!match) return { state: current, match: null, damage: 0 };
  const side = duelSideOf(match, current.sessionId);
  if (!side) return { state: current, match: null, damage: 0 };
  const owned = evalMatch(match, Date.now());
  if (owned.status !== "active") return { state: current, match: owned, damage: 0 };

  const state = clone(current);
  const q = state.quests.find((x) => x.id === questId);
  if (!q || q.done || state.status !== "battle") return { state: current, match: owned, damage: 0 };

  q.done = true;
  q.completedAt = nowISO();
  state.strikes += 1;
  state.bossHp = bossHpOf(state);
  state.storyLog.push(beat("strike", `${q.emoji} ${q.action} — ${q.narrative}`));
  state.storyLog.push(beat("reward", pickReward(state, state.strikes === 1)));

  const nowMs = Date.now();
  const updated = evalMatch(match, nowMs);
  if (side === "A") updated.damageDealtA += q.damage;
  else updated.damageDealtB += q.damage;
  const sideRef = side === "A" ? updated.sideA : updated.sideB;
  if (sideRef) sideRef.strikes += 1;
  const rival = side === "A" ? updated.sideB : updated.sideA;

  updated.log.push(
    matchBeat(
      updated,
      "strike",
      side,
      `${updated[side === "A" ? "sideA" : "sideB"]?.heroName} struck — "${q.action}" — ${q.damage} stones crashed against ${
        rival ? rival.heroName : "the rival"
      }.`,
    ),
  );

  const evaled = evalMatch(updated, nowMs);
  if (evaled.status === "over" && evaled.endReason === "kill") {
    const winnerName =
      evaled.winner === "draw" ? "None" : evaled.sideA && evaled.winner === "A" ? evaled.sideA.heroName : evaled.sideB?.heroName ?? "?";
    evaled.log.push(matchBeat(evaled, "kill", side, `${winnerName} stands; the other lies among the stones.`));
  }

  const doc = loadMatchDoc();
  doc[evaled.matchId] = evaled;
  saveMatchDoc(doc);

  return { state, match: evaled, damage: q.damage };
}

export function synthesizeDuelJournal(match: MatchState, side: "A" | "B"): JournalEntry {
  const mine = side === "A" ? match.sideA : match.sideB;
  const rival = side === "A" ? match.sideB : match.sideA;
  const result = match.winner === "draw" ? "draw" : match.winner === side ? "win" : "loss";
  const closing = result === "win" ? "The rival lies still; the work stands done." : result === "loss" ? "The rival struck truer this bell." : "The hourglass ran level — neither could outlast the other.";
  return {
    journalId: uid("jr"),
    sessionId: mine?.sessionId ?? `duel-${match.matchId}`,
    chapter: { number: 1, title: "A Duel of Honest Work" },
    task: mine?.task ?? "The shared duel",
    timeAvailable: mine?.timeAvailable ?? `${match.durationSeconds}s`,
    bossName: rival?.heroName ?? "A rival",
    strikesUsed: mine?.strikes ?? 0,
    goblinsFallen: 0,
    detoursTaken: 0,
    closingProse: closing,
    createdAt: match.startedAt ?? nowISO(),
    completedAt: match.endsAt ?? nowISO(),
    mode: "duel",
    rival: rival?.heroName,
    result,
  };
}