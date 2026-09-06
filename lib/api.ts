// api.ts — the UI's only door to the world.
// Mode:
//   REST — talks to the backend (CONTRACT.md §3), Bearer token = Clerk session token.
//   MOCK — pure transforms over lib/localEngine (no network), for building/demoing solo.
// Defaults to MOCK until NEXT_PUBLIC_API_URL is set.

import type {
  BackendMode,
  CompleteQuestResult,
  CreateChapterInput,
  GoblinChoice,
  JournalEntry,
  MatchState,
  SessionState,
} from "./contract";
import * as engine from "./localEngine";

const MOCK_USER = "demo-hero";

export interface DuelOutcome {
  match: MatchState;
  session: SessionState;
}

function resolveMode(): BackendMode {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (url && process.env.NEXT_PUBLIC_USE_MOCK !== "1") return "rest";
  return "mock";
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, opts: RequestInit, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new ApiError("NETWORK", "The roads are closed — the chronicler cannot reach the older realms.");
  }
  if (!res.ok) {
    let code = "UNKNOWN";
    let message = `The realm answered with ${res.status}.`;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(code, message, res.status);
  }
  return res.json() as Promise<T>;
}

export interface API {
  mode: BackendMode;
  createChapter(input: CreateChapterInput, token?: string): Promise<SessionState>;
  getChapter(sessionId: string, token?: string): Promise<SessionState>;
  completeQuest(sessionId: string, questId: string, current: SessionState, token?: string): Promise<CompleteQuestResult>;
  resolveInterlude(sessionId: string, interludeId: string, current: SessionState, choice: GoblinChoice, token?: string): Promise<SessionState>;
  completeDetour(sessionId: string, detourId: string, current: SessionState, token?: string): Promise<SessionState>;
  shrinkQuest(sessionId: string, questId: string, current: SessionState, token?: string): Promise<SessionState>;
  reconjure(sessionId: string, current: SessionState, token?: string): Promise<SessionState>;
  getJournal(token?: string): Promise<JournalEntry[]>;

  createDuel(input: CreateChapterInput, token?: string): Promise<DuelOutcome>;
  joinDuel(joinCode: string, input: CreateChapterInput, token?: string): Promise<DuelOutcome>;
  getDuel(matchId: string, token?: string): Promise<MatchState>;
  subscribeDuel(matchId: string, onMatch: (m: MatchState) => void): () => void;
}

const restApi: API = {
  mode: "rest",
  createChapter: (input, token) =>
    request<SessionState>(`/api/chapters`, { method: "POST", body: JSON.stringify(input) }, token),
  getChapter: (sessionId, token) => request<SessionState>(`/api/chapters/${sessionId}`, {}, token),
  completeQuest: async (sessionId, questId, _current, token) =>
    request<CompleteQuestResult>(`/api/chapters/${sessionId}/quests/${questId}`, { method: "PATCH", body: JSON.stringify({ done: true }) }, token),
  resolveInterlude: (sessionId, interludeId, _current, choice, token) =>
    request<SessionState>(`/api/chapters/${sessionId}/side-quest`, { method: "POST", body: JSON.stringify({ choice, interludeId }) }, token),
  completeDetour: (sessionId, detourId, _current, token) =>
    request<SessionState>(`/api/chapters/${sessionId}/side-quest/${detourId}/complete`, { method: "POST", body: "{}" }, token),
  shrinkQuest: (sessionId, questId, _current, token) =>
    request<SessionState>(`/api/chapters/${sessionId}/quests/${questId}/shrink`, { method: "POST", body: "{}" }, token),
  reconjure: (sessionId, _current, token) =>
    request<SessionState>(`/api/chapters/${sessionId}/reconjure`, { method: "POST", body: "{}" }, token),
  getJournal: (token) => request<JournalEntry[]>(`/api/journal`, {}, token),

  createDuel: (input, token) =>
    request<DuelOutcome>(`/api/duels`, { method: "POST", body: JSON.stringify(input) }, token),
  joinDuel: (joinCode, input, token) =>
    request<DuelOutcome>(`/api/duels/${joinCode}/join`, { method: "POST", body: JSON.stringify(input) }, token),
  getDuel: (matchId, token) => request<MatchState>(`/api/duels/${matchId}`, {}, token),
  subscribeDuel: (matchId, onMatch) => {
    const es = new EventSource(`${BASE}/api/duels/${matchId}/events`);
    const handler = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data) as { match?: MatchState };
        if (msg.match) onMatch(msg.match);
      } catch {
        /* ignore malformed frames */
      }
    };
    es.addEventListener("message", handler);
    return () => es.close();
  },
};

const mockApi: API = {
  mode: "mock",
  createChapter: async (input) => engine.startSession(input),
  getChapter: async (sessionId) => {
    const cached = globalThis.__mockChapters?.get(sessionId);
    if (cached) return cached;
    throw new ApiError("NOT_FOUND", "No such chapter", 404);
  },
  completeQuest: async (sessionId, questId, current) => {
    const duel = engine.findMatchBySession(sessionId);
    if (duel) {
      const out = engine.applyDuelStrike(current, questId);
      if (out.state !== current) {
        remember(sessionId, out.state);
        return { state: out.state, goblin: null, match: out.match ?? undefined };
      }
    }
    const result = engine.applyStrike(current, questId);
    remember(sessionId, result.state);
    return result;
  },
  resolveInterlude: async (sessionId, interludeId, current, choice) => {
    const state = engine.resolveInterlude(current, interludeId, choice);
    remember(sessionId, state);
    return state;
  },
  completeDetour: async (sessionId, detourId, current) => {
    const state = engine.completeDetour(current, detourId);
    remember(sessionId, state);
    return state;
  },
  shrinkQuest: async (sessionId, questId, current) => {
    const state = engine.shrinkQuest(current, questId);
    remember(sessionId, state);
    return state;
  },
  reconjure: async (sessionId, current) => {
    const state = engine.reconjure(current);
    remember(sessionId, state);
    return state;
  },
  getJournal: async () => [],

  createDuel: async (input) => engine.startDuel(input),
  joinDuel: async (joinCode, input) => engine.joinDuel(joinCode, input),
  getDuel: async (matchId) => engine.getDuel(matchId),
  subscribeDuel: (matchId, onMatch) => {
    let alive = true;
    const push = () => {
      if (!alive) return;
      try {
        onMatch(engine.getDuel(matchId));
      } catch {
        /* match gone — the subscription is done */
      }
    };
    push();
    const interval = window.setInterval(push, 1000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "focusforge-matches") push();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener("storage", onStorage);
    };
  },
};

declare global {
  var __mockChapters: Map<string, SessionState> | undefined;
}

function remember(sessionId: string, state: SessionState) {
  if (!globalThis.__mockChapters) globalThis.__mockChapters = new Map();
  globalThis.__mockChapters.set(sessionId, state);
}

export const api: API = resolveMode() === "rest" ? restApi : mockApi;

export const demoUserId = MOCK_USER;