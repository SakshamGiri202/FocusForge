# FocusForge — Integration Contract (v3)

> **THE one contract file.** Written first, updated last.
> If you change a field name, a route, or a data shape: announce it in the
> group chat BEFORE you commit. No silent drift.

**v3 (duel mode).** Adds `MatchState` (§2.8), your 3 duel endpoints + the SSE events
channel (§3.1), the `duels` collection (§4), and a duel carve-out to the goblin rule
(§2.4: the Goblin does NOT interrupt a duel — see §3.1.3). The solo flow is unchanged.

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
  "completedAt": "2026-09-06T11:30:00Z",
  // v3 — duel-only fields:
  "mode": "duel",              // "solo" (default) | "duel"
  "rival": "Rhea",             // the opponent's hero name
  "result": "win"              // "win" | "loss" | "draw" (from THIS hero's viewpoint)
}
```

(For a duel, `chapter: { number: 1, title: "A Duel of Honest Work" }`, `bossName` = the
rival's name, and `closingProse` narrates victory/defeat/draw. Both sides write their own
journal entry from their own viewpoint — same `matchId`, different `sessionId`.)

### 2.8 Duel mode — MatchState (v3)

Two players, one shared hourglass. Each names their own quest; **the shared time budget is
the summoner's choice** and the clock starts only when the rival joins. Each completed quest
deals its `damage` **to the OPPONENT** (A's strikes subtract from `hpB`, B's from `hpA`). The
first to reach 0 HP falls; if the hourglass runs out first, the higher HP wins (tie = draw).

**HP is DERIVED, never stored per second:**
```
hpA = max(0, 100 − drain(now) − damageDealtB)
hpB = max(0, 100 − drain(now) − damageDealtA)
drain(now) = floor(elapsedMs(startedAt, now) / DUEL_DRAIN_TICK_MS)   // DUEL_DRAIN_TICK_MS = 40_000
```

```jsonc
{
  "matchId": "uuid-v4",
  "joinCode": "HXTX3M",        // 6 chars, A..Z (no I/O) + 2..9; also carried in the share link
  "status": "awaiting",        // "awaiting" | "active" | "over"
  "winner": null,              // "A" | "B" | "draw" | null
  "endReason": null,           // "kill" | "time" | null
  "durationSeconds": 1800,     // shared budget = timeChoiceToSeconds(summoner's choice)
  "startedAt": null,           // null until the rival joins; only THEN does the clock turn
  "endsAt": null,              // startedAt + durationSeconds once active
  "sideA": { "sessionId": "…", "heroName": "Piyush", "task": "…", "timeAvailable": "30 minutes", "strikes": 2 },
  "sideB": null,               // null until joined
  "hpA": 82,                   // fresh derived value at this snapshot (0..100)
  "hpB": 100,
  "damageDealtA": 18,          // Σ damage of A's completed quests (hurts B)
  "damageDealtB": 0,           // Σ damage of B's completed quests (hurts A)
  "log": [
    { "id": "mb_001", "kind": "start",  "side": "A", "at": "…ISO…", "text": "Piyush stands before their work, demanding a rival be summoned." },
    { "id": "mb_002", "kind": "join",   "side": "B", "at": "…ISO…", "text": "Rhea answers the summons. The hourglass turns — the duel is sealed." },
    { "id": "mb_003", "kind": "strike", "side": "A", "at": "…ISO…", "text": "Piyush struck — \"Open the file\" — 18 stones crashed against Rhea." },
    { "id": "mb_004", "kind": "kill",   "side": "A", "at": "…ISO…", "text": "Piyush stands; the other lies among the stones." }
  ]
}
```
`log[].kind` enum: `"start" | "join" | "strike" | "kill" | "time"`.

**Time budget mapping** (must be mirrored by the backend — see `lib/time.ts`):
`"15 minutes"→15m · "30 minutes"→30m · "45 minutes"→45m · "1 hour"→1h · "2 hours"→2h ·
"3 hours"→3h · "An evening"→2h · "A full day"→24h · "no bound set"→1h (default)`.

**Share flow:** A summons → match is `awaiting` (no clock) with a `joinCode`. B either types
the code or opens `/duel/join?code=<joinCode>`. On B's join the match flips to `active` and
`startedAt`/`endsAt` are set. Each side's quests come from their own Chapter session
(`SessionState`), which the backend already owns; the match references them via `sideX.sessionId`.

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

### 3.1 Duel endpoints (v3)

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/api/duels` | `CreateChapterInput` (summoner) | `{ "match": MatchState, "session": SessionState }` (201) — creates the match (`awaiting`) + the summoner's own Chapter session |
| `POST` | `/api/duels/:joinCode/join` | `CreateChapterInput` (rival) | `{ "match": MatchState, "session": SessionState }` — starts the clock; 409 if already active/booked |
| `GET` | `/api/duels/:matchId` | — | `MatchState` (200) — fresh derived hpA/hpB; 404 if not one of the two sides |
| `GET` | `/api/duels/:matchId/events` | — | **Server-Sent Events** stream: `data: {"match": MatchState}\n\n` pushed on every mutation, plus on an interval (~1s) while the duel is `active` (drain tick). Closes when the match ends or the client disconnects. |

- In a duel the strike endpoint is **the same** `PATCH /api/chapters/:id/quests/:questId`
  (each side strikes their own quest). When the current session belongs to a match, the PATCH
  response includes `"match": MatchState` alongside `state`, and the backend applies the damage
  to the opponent, appends a `strike` beat, re-evaluates end conditions, and persists + emits.
- **3.1.3 — goblin carve-out:** the Goblin interlude (2.4, fires after the 2nd strike) is
  **disabled while a strike touches a duel**. A completed quest in a duel must return
  `"goblin": null` and keep `status: "battle"`. Duels are a clean eyes-on-the-hill sprint;
  the distraction returns the moment the duel is over.

### Body echo rule
`protagonist`, `task`, `timeAvailable` are set by the frontend on CREATE and echoed verbatim.

### Versioning & resync (frontend cache behavior)
- Backend bumps `version` +1 on every mutation.
- Frontend keeps a localStorage cache, but it's a CACHE, never the source of truth.
- On boot/focus: `GET /api/chapters/:id`; if `server.version > cache.version`, server wins.
- Journal entries are idempotent (`journalId`).
- **Duels:** the frontend never caches `MatchState` as truth — the `/events` SSE stream is the
  live source while `active`, and `GET /api/duels/:matchId` is re-fetched on boot. `version` is
  not used for matches (the stream is authoritative).

---

## 4. Actian NoSQL schema guidance (DB teammate)

**Collection/table `chapters`** — key `sessionId`, indexed `userId`:
one document = one `SessionState` (embed quests + storyLog + detour). Bump `version`/`updatedAt`
on every write.

**Collection/table `journal`** — key `journalId`, indexed `userId` + `createdAt`:
one document = one `JournalEntry`.

**Collection/table `duels`** — key `matchId`, indexed `joinCode` (unique) + `status`:
one document = one `MatchState`. `sideA.sessionId` / `sideB.sessionId` join to the `chapters`
collection. Writes: on create, join, each strike, and each persisted status transition
(`awaiting → active → over`). Never store per-second HP; derive it from
`startedAt`/`endsAt`/`damageDealtA`/`damageDealtB` on read (2.8).

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

**Optional duel demo (v3):** A summons a rival → shares `/duel/join?code=…` → rival joins →
both see dual HP bars + shared countdown → each strike drops the OTHER's bar → first to 0 (or
time-up, higher HP wins, tie = draw) → result narrated + written to both journals.