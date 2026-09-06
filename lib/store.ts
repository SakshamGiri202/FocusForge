// store.ts — zustand + persist. Client-side CACHE, never the source of truth.
// Sync policy (CONTRACT.md §3): on refresh/focus, if api.mode === 'rest' we GET the
// active chapter and server wins when server.version > cache.version.

"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { api } from "./api";
import type {
  CreateChapterInput,
  CompleteQuestResult,
  GoblinChoice,
  JournalEntry,
  SessionState,
  SideQuestPrompt,
  SyncState,
} from "./contract";
import { synthesizeJournal } from "./localEngine";

interface GameState {
  session: SessionState | null;
  goblin: SideQuestPrompt | null;
  journal: JournalEntry[];
  sync: SyncState;
  busy: "idle" | "seeding" | "acting";
  error: string | null;

  setSession: (s: SessionState | null) => void;
  setGoblin: (g: SideQuestPrompt | null) => void;
  pushJournal: (e: JournalEntry) => void;
  clearError: () => void;
  setSync: (s: SyncState) => void;

  createChapter: (input: CreateChapterInput, token?: string) => Promise<void>;
  refresh: (token?: string) => Promise<void>;
  completeQuest: (questId: string, token?: string) => Promise<void>;
  resolveGoblin: (interludeId: string, choice: GoblinChoice, token?: string) => Promise<void>;
  finishDetour: (detourId: string, token?: string) => Promise<void>;
  shrink: (questId: string, token?: string) => Promise<void>;
  reconjure: (token?: string) => Promise<void>;
  beginNextChapter: (token?: string) => Promise<void>;
}

function ingest(state: GameState, result: SessionState | CompleteQuestResult, goblin?: SideQuestPrompt | null): Partial<GameState> {
  const s = "state" in result ? result.state : result;
  const g = goblin !== undefined ? goblin : "goblin" in result ? result.goblin : state.goblin;
  let journal = state.journal;
  if (api.mode === "mock" && s.status === "chapterEnd" && s.bossHp <= 0) {
    const entry = synthesizeJournal(s);
    if (!journal.some((j) => j.sessionId === s.sessionId)) journal = [entry, ...journal];
  }
  return { session: s, goblin: g, journal, error: null, busy: "idle", sync: api.mode === "mock" ? "online" : (state.sync === "error" ? "online" : state.sync) };
}

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      session: null,
      goblin: null,
      journal: [],
      sync: "idle",
      busy: "idle",
      error: null,

      setSession: (s) => set({ session: s, error: null }),
      setGoblin: (g) => set({ goblin: g }),
      pushJournal: (e) =>
        set((st) => ({ journal: [e, ...st.journal.filter((j) => j.journalId !== e.journalId)] })),
      clearError: () => set({ error: null }),
      setSync: (s) => set({ sync: s }),

      createChapter: async (input, token) => {
        set({ busy: "seeding", error: null });
        try {
          const s = await api.createChapter(input, token);
          set(ingest(get(), s));
        } catch (e) {
          set({ busy: "idle", error: (e as Error).message });
        }
      },

      refresh: async (token) => {
        const current = get().session;
        if (!current || api.mode !== "rest") return;
        set({ sync: "syncing" });
        try {
          const server = await api.getChapter(current.sessionId, token);
          if (server.version > current.version) set({ session: server, sync: "online" });
          else set({ sync: "online" });
        } catch {
          set({ sync: "offline", error: null });
        }
      },

      completeQuest: async (questId, token) => {
        const s = get().session;
        if (!s) return;
        set({ busy: "acting", error: null });
        try {
          const result = await api.completeQuest(s.sessionId, questId, s, token);
          set(ingest(get(), result));
        } catch (e) {
          set({ busy: "idle", error: (e as Error).message });
        }
      },

      resolveGoblin: async (interludeId, choice, token) => {
        const s = get().session;
        if (!s) return;
        set({ busy: "acting", error: null });
        try {
          const next = await api.resolveInterlude(s.sessionId, interludeId, s, choice, token);
          set(ingest(get(), next));
        } catch (e) {
          set({ busy: "idle", error: (e as Error).message });
        }
      },

      finishDetour: async (detourId, token) => {
        const s = get().session;
        if (!s || !s.detour) return;
        set({ busy: "acting", error: null });
        try {
          const next = await api.completeDetour(s.sessionId, detourId, s, token);
          set(ingest(get(), next));
        } catch (e) {
          set({ busy: "idle", error: (e as Error).message });
        }
      },

      shrink: async (questId, token) => {
        const s = get().session;
        if (!s) return;
        set({ busy: "acting", error: null });
        try {
          const next = await api.shrinkQuest(s.sessionId, questId, s, token);
          set(ingest(get(), next));
        } catch (e) {
          set({ busy: "idle", error: (e as Error).message });
        }
      },

      reconjure: async (token) => {
        const s = get().session;
        if (!s) return;
        set({ busy: "acting", error: null });
        try {
          const next = await api.reconjure(s.sessionId, s, token);
          set(ingest(get(), next));
        } catch (e) {
          set({ busy: "idle", error: (e as Error).message });
        }
      },

      beginNextChapter: async (token) => {
        const s = get().session;
        if (!s) return;
        const number = s.chapter.number + 1;
        set({ busy: "seeding", error: null });
        try {
          const next = await api.createChapter(
            { protagonist: s.protagonist.name, task: s.task, timeAvailable: s.timeAvailable },
            token,
          );
          next.chapter.number = number;
          set(ingest(get(), next));
        } catch (e) {
          set({ busy: "idle", error: (e as Error).message });
        }
      },
    }),
    {
      name: "focusforge-cache",
      storage: createJSONStorage(() => localStorage),
      partialize: (st) => ({
        session: st.session,
        goblin: st.goblin,
        journal: st.journal,
      }),
    },
  ),
);