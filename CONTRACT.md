# FocusForge — Integration Contract (v2)

> **THE one contract file.** Written first, updated last.
> If you change a field name, a route, or a data shape: announce it in the
> group chat BEFORE you commit. No silent drift.

Owners:
- **UI (frontend)** — Next.js app, consumes the REST API below. Never touches the DB.
- **Backend** — owns Gemini Flash (quest design + narrative flavor) and ALL writes to Actian NoSQL.
- **DB** — owns the Actian NoSQL schema/collections, exactly mapping the shapes below.

**Central product principle — "the story is the reward."**
There are no XP counters, coins, streaks, or +N numbers anywhere in the UI. Progress IS the
narrative: every completed action immediately changes the story prose. The backend must never
emit reward strings that contain scores, points, or currency. All rewards are diegetic.

---

## 1. Transport & auth

- **Base URL:** configurable on the frontend via `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).
- **CORS:** backend must allow the frontend origin(s) (list in your CORS allow-list / `BACKEND_CORS_ORIGIN`).
- **Auth:** every request below carries a Clerk session token:
  `Authorization: Bearer <clerk-session-token>` (Clerk-signed JWT).
- **User identity:** backend NEVER trusts `userId` from the body. It derives
  `userId` = `sub` claim from the verified token (Clerk backend SDK / JWKS, `CLERK_SECRET_KEY`).
  The frontend never sends `userId`.
- **Request/response media type:** `application/json`.

### Standard error envelope
```jsonc
{
  "error": { "code": "NOT_FOUND", "message": "No such chapter" }
}
```
HTTP status is always set (`400`, `401`, `404`, `409`, `429`, `500`).

---

## 2. Shared data shapes

These are the ONLY shapes that cross the boundary.

### 2.1 Quest

```jsonc
{
  "id": "q1",                 // unique within a session; splits mint q1-b, q1-c
  "emoji": "⚔️",
  "action": "Open the project",            // shortest possible action
  "narrative": "A sentence of novel context for this micro-battle.",
  "difficulty": "easy",        // enum: trivial | easy | medium | hard | epic
  "damage": 11,                // int 5..60 — DETERMINISTIC (see 2.1.1). NOT gemini-decided.
  "done": false,
  "completedAt": null          // ISO 8601 when done, else null
}
```

#### 2.1.1 Damage is deterministic and fair (backend-owned)

Gemini NEVER decides damage values. Gemini only returns `difficulty` per quest plus structure/flavor.

1. Backend maps difficulty → base weight: `trivial 6 · easy 10 · medium 16 · hard 24 · epic 40`.
2. Backend normalizes weights so `Σ damage ≈ 120` (with `clamp(damage, 5..60)`) — comfortably ≥ the boss's 100.
3. Damage for the whole chapter is **LOCKED at creation** and never changes mid-battle (the only
   mutation is the **shrink split**, see 2.6, which preserves the total).

This makes the game feel fair: a `trivial` quest always chips the same honest amount, a user can
compare quests, and nothing arbitrary happens between creation and completion.

### 2.2 StorySeed — output of Gemini, embedded in SessionState

```jsonc
{
  "chapter": {
    "number": 7,                  // 1-based, increments per completed chapter
    "title": "The Mountain of Deadlines",
    "epigraph": "A short epic line in italics."
  },
  "setting": {
    "place": "The writing desk at midnight",
    "timeOfDay": "Monday · 10:30 AM",   // stylized, from the user's clock/input
    "mood": "grim"                       // free-form flavor word
  },
  "openingProse": "1–2 paragraphs of novel prose that names the protagonist. The task
                  is described as a place (mountain, citadel, forest) the hero stands before.",
  "boss": {
    "name": "The Research Paper",
    "epithet": "Warden of the Submission Portal",
    "fightIntro": "A taunt or description when battle begins.",
    "hp": 100                  // ALWAYS 100
  },
  "quests": [ /* Quest[] with done=false — see 2.1 */ ],
  "protagonist": {
    "name": "Piyush",
    "hearts": 3,               // fixed 3 per chapter; reserved, NEVER decremented by goblin/choice
    "titles": ["Slayer of Deadlines"]   // earned epithets, may be [] at start
  },
  "rewardLines": {
    "gate": "✧ The Gate Was Opened ✧",                  // first strike of the chapter
    "onQuest": [
      "The monster appears slightly less terrifying."
    ],                                                    // max 6, diegetic ONLY
    "onReturn": "✧ The Wanderer Returned ✧",              // returning after a detour
    "onShrink": "✧ Wisdom of the Small Blade ✧",          // shrunk a quest
    "onBossDown": "With a final blow, the mountain crumbles to dust."
  }
}
```

### 2.3 SessionState — the live chapter (all chapter endpoints return this)

```jsonc
{
  "sessionId": "uuid-v4",
  "version": 42,               // int, bumped +1 on EVERY server mutation
  "status": "battle",          // enum: "battle" | "goblin" | "detour" | "chapterEnd"
  "createdAt": "2026-09-06T10:30:00Z",
  "updatedAt": "2026-09-06T10:45:00Z",
  "task": "Finish the research paper",     // original user task, echoed verbatim
  "timeAvailable": "90 minutes",           // original user time, echoed verbatim
  "bossHp": 82,                // 100 - Σ damage(done quests) ; 0 → chapterEnd
  "hearts": 3,                 // 3..1, resets to 3 each chapter; never punished
  "strikes": 2,                // # of quests done in this chapter
  "goblinSeen": false,         // true once the goblin has interrupted this session
  "detour": null,              // SideQuest | null — active detached side quest
  "storyLog": [
    { "id": "bev_001", "kind": "strike", "at": "…ISO…",
      "text": "⚔️ Open the project — stone crashes down from the mountain." }
  ],
  // ... then every field of StorySeed inline (chapter, setting, openingProse,
  // boss, quests[], protagonist, rewardLines)
}
```
`storyLog[].kind` enum:
`"prose" | "start" | "strike" | "return" | "shrink" | "reward" | "goblin" | "detour" | "chapterEnd" | "reconjure"`.

| kind | meaning | canonical example |
|---|---|---|
| `start` | first strike of a chapter | `✧ The Gate Was Opened — and so, impossibly, the work had begun.` |
| `strike` | any completed quest | `⚔️ {action} — {prose impact}.` |
| `reward` | diegetic reward line | `The monster appears slightly less terrifying.` |
| `shrink` | quest was split smaller | `✧ Wisdom of the Small Blade — the hero realizes the mountain cannot be climbed in one step.` |
| `goblin` | the interlude appears | `The Goblin whispers: "{distraction}"` |
| `return` | back to the main quest | `✧ The Wanderer Returned`. |
| `detour` | a legitimate side quest begun/ended | `"And so you chose where to walk next."` |
| `chapterEnd` | boss defeated | `The mountain crumbles to dust.` |

### 2.4 Goblin interlude (SideQuestPrompt) — appears ONCE per session, never random chance

The Goblin IS the externalized distraction. Backend injects it deterministically: after the
**2nd completed strike of the chapter** (configurable server-side), the PATCH response for that
strike includes a `goblin` payload and flips `status:"goblin"`.

```jsonc
{
  "id": "sq_001",
  "distraction": "Hero! Urgent news! We absolutely must reorganize the bookshelf at once!",
  "options": [
    { "value": "sideQuest", "label": "A · A legitimate side quest" },
    { "value": "goblin",    "label": "B · A trick of the Goblin" }
  ]
}
```

**Punishment-free (MUST hold):** neither choice ever reduces hearts, HP, or progress.
- `A · sideQuest` → a `SideQuest` detour is added (status `detour`), with a short time boundary,
  and the story adapts around it. On completion → `return` beat, battle resumes.
- `B · goblin` → the hero recognizes the deception, returns to the main quest immediately
  (`return` beat, status `battle`). Also recorded as `goblinsFallen`.

The prompt does NOT reveal which is true.

### 2.5 SideQuest — the structured, bounded detour

```jsonc
{
  "id": "sq_001",
  "title": "The Forgotten Missive",
  "prose": "A short passage: the detour is real, bounded, and worth taking.",
  "action": "Send the email to the professor",
  "timeBoundary": "15 minutes",          // narratively framed, e.g. "the hourglass has been turned"
  "completedAt": null,
  "heroWise": false                       // revealed as legit after the fact, for flavor only
}
```

### 2.6 Shrink split — "Wisdom of the Small Blade"

The user can shrink any uncompleted quest via `POST …/quests/:questId/shrink`. The quest is
**split into two smaller quests whose damage sums to the original** (fairness preserved, total
locked). Example: `q3 "Write the conclusion" damage 40` →
`q3-b "Write the first sentence" damage 12` + `q3-c "Finish the conclusion" damage 28`.
`storyLog` gains a `shrink` beat. No XP, no penalty — progress is preserved.

### 2.7 JournalEntry — a finished chapter, per user

```jsonc
{
  "journalId": "uuid-v4",
  "sessionId": "uuid-v4",
  "chapter": { "number": 1, "title": "The Mountain of Deadlines" },
  "task": "Finish the research paper",
  "timeAvailable": "90 minutes",
  "bossName": "The Research Paper",
  "strikesUsed": 5,            // quests done before bossHp hit 0
  "goblinsFallen": 1,          // how many times the goblin was exposed
  "detoursTaken": 1,
  "closingProse": "The mountain crumbled; the hero marches on.",
  "createdAt": "2026-09-06T11:30:00Z",
  "completedAt": "2026-09-06T11:30:00Z"
}
```

---

## 3. REST endpoints (backend owns ALL of these)

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/api/chapters` | `{ "protagonist": string, "task": string, "timeAvailable": string }` | `SessionState` (201) — new story via Gemini; damage normalized & locked per 2.1.1 |
| `GET` | `/api/chapters/:id` | — | `SessionState` (200); 404 if not owned by user |
| `PATCH` | `/api/chapters/:id/quests/:questId` | `{ "done": true }` | `{ "state": SessionState, "goblin": SideQuestPrompt \| null }` — marks strike, recomputes `bossHp`. 2nd completed strike of the session → sets `goblin` + `status:"goblin"` (once) |
| `POST` | `/api/chapters/:id/side-quest` | `{ "choice": "sideQuest" \| "goblin", "interludeId": "sq_001" }` | `SessionState` — A: adds `detour`, `status:"detour"`; B: `return` beat, `status:"battle"`, `goblinsFallen++` |
| `POST` | `/api/chapters/:id/side-quest/:detourId/complete` | `{}` | `SessionState` — detour finished; `return` beat (Wanderer Returned); back to `status:"battle"` |
| `POST` | `/api/chapters/:id/quests/:questId/shrink` | `{}` | `SessionState` — split per 2.6; storyLog `shrink` beat |
| `POST` | `/api/chapters/:id/reconjure` | `{}` | `SessionState` — same task, brand new seed (temperature ~1.0) |
| `GET` | `/api/journal` | — | `JournalEntry[]` (newest first) — user's archive |

### Body echo rule
`protagonist`, `task`, `timeAvailable` are set by the frontend on CREATE and echoed verbatim.

### Versioning & resync (frontend cache behavior)
- Backend bumps `version` +1 on every mutation.
- Frontend keeps a localStorage cache, but it's a CACHE, never the source of truth.
- On boot/focus: `GET /api/chapters/:id`; if `server.version > cache.version`, server wins.
- Journal entries are idempotent (`journalId`).

---

## 4. Actian NoSQL schema guidance (DB teammate)

**Collection/table `chapters`** — key `sessionId`, indexed `userId`:
one document = one `SessionState` (embed quests + storyLog + detour). Bump `version`/`updatedAt`
on every write.

**Collection/table `journal`** — key `journalId`, indexed `userId` + `createdAt`:
one document = one `JournalEntry`.

Field names identical to the shapes above. Don't rename `id`→`_id`, `sessionId`→`_key`, etc.
Silent renames are the #1 integration killer.

---

## 5. Gemini prompt contract (backend owns the call)

- Model: Flash family (`GEMINI_MODEL`, default `gemini-2.5-flash`). JSON-schema structured output.
- `temperature: 1.0` + random nonce, so every story is different.
- Gemini provides: chapter/setting/openingProse, boss name/epithet/fightIntro, quest **structure**
  (action + narrative + difficulty) only, rewardLines (alla diegetic), detour+distraction flavor.
- Gemini provides **difficulty** (not damage) per quest. Backend applies 2.1.1 to lock damage.
- Hard rules in the system prompt:
  - Rewards are prose. Never mention XP, coins, streaks, or any numeric score.
  - The boss ALWAYS has 100 HP. Never ask the model for HP.
  - Distraction/side-quest framing is never fear-mongering and never blames the user.

---

## 6. Repo hygiene (the ten commandments, condensed)

1. Commit this file BEFORE implementation code anywhere. (Done, v1. v2 is a coordinated edit.)
2. Nothing merges to `main` unless `npm run build` (frontend) / backend smoke passes.
3. No one edits anyone else's files. To change THIS file → group announcement first.
4. End-to-end smoke every 2 hours: create → strike → HP number → goblin → detour/return → journal.

## 7. Golden demo path (what the MVP is measured against)

> 1 user enters task → 2 chapter generated → 3 story types itself → 4 4–6 micro-quests →
> 5 complete a quest → 6 boss HP visibly drops & prose changes → 7 goblin interrupts ONCE →
> 8 choice (detour xor return) → 9 final quest → 10 Journal entry. Everything else is secondary.