# FocusForge — Integration Contract

> **THE one contract file.** Written first, updated last.
> If you change a field name, a route, or a data shape: announce it in the
> group chat BEFORE you commit. No silent drift.

Owners:
- **UI (frontend)** — Next.js app, consumes the REST API below. Never touches the DB.
- **Backend** — owns Gemini Flash (task splitting + HP scoring) and ALL writes to Actian NoSQL.
- **DB** — owns the Actian NoSQL schema/collections, exactly mapping the shapes below.

All three of us build against this document. The frontend also mirrors these types in
`lib/contract.ts` (TypeScript). The backend must mirror them as its request/response DTOs.
The DB must store them 1:1 as documents.

---

## 1. Transport & auth

- **Base URL:** configurable on the frontend via `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).
- **CORS:** backend must allow the frontend origin(s) (list in your CORS allow-list / `BACKEND_CORS_ORIGIN`).
- **Auth:** every request below carries a Clerk session token:
  `Authorization: Bearer <clerk-session-token>` (a Clerk-signed JWT).
- **User identity:** backend must NEVER trust `userId` from the body. It derives
  `userId` = `sub` claim from the verified token (verify via the Clerk backend SDK /
  JWKS with your `CLERK_SECRET_KEY`). The frontend never sends `userId`.
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

These are the ONLY shapes that cross the boundary. Nothing else is invented ad hoc.

### 2.1 Boss & Quest are always inline inside a SessionState

```jsonc
{
  "id": "q1",              // "q1".."q6", unique within a session
  "emoji": "⚔️",
  "action": "Open the project",
  "description": "A sentence of novel context for this micro-battle.",
  "damage": 18,            // int 1..60; Gemini-scored. sum(quests.damage) >= 100
  "done": false,
  "completedAt": null      // ISO 8601 string when done, else null
}
```
- `boss.hp` is **FIXED at 100**, always. Never generated, never negotiated.
- The battle is "won" when `hp` owned by the boss drops to `0`: `bossHp = 100 - Σ damage(done quests)`.
- A session has **4–6 quests**.

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
  "openingProse": "1–2 paragraphs of novel prose that names the protagonist.",
  "boss": {
    "name": "The Research Paper",
    "epithet": "Warden of the Submission Portal",
    "fightIntro": "A taunt or description when battle begins.",
    "hp": 100                  // ALWAYS 100
  },
  "quests": [ /* Quest[] with done=false, completedAt=null — see 2.1 */ ],
  "protagonist": {
    "name": "Piyush",
    "hearts": 3,               // fixed 3 at chapter start
    "titles": ["Slayer of Deadlines"]   // earned epithets, may be [] at start
  },
  "rewardLines": {
    "onQuest": [
      "The first door has been opened.",
      "The monster appears slightly less terrifying."
    ],                                    // max 6, diegetic ONLY — never "XP +25"
    "onBossDown": "With a final blow, the mountain crumbles to dust."
  }
}
```

### 2.3 SessionState — the live chapter (returned by all chapter endpoints)

```jsonc
{
  "sessionId": "uuid-v4",
  "version": 42,               // int, bumped +1 on EVERY server mutation
  "status": "battle",          // enum: "battle" | "sideQuest" | "chapterEnd" | "rest"
  "createdAt": "2026-09-06T10:30:00Z",
  "updatedAt": "2026-09-06T10:45:00Z",
  "task": "Finish the research paper",     // original user task, echoed back
  "timeAvailable": "90 minutes",           // original user time, echoed back
  "bossHp": 82,                // 100 - Σ damage(done quests)  [vanished = 0 → chapterEnd]
  "hearts": 3,                 // 3..0, never below 0
  "storyLog": [
    { "id": "bev_001", "kind": "strike", "at": "…ISO…",
      "text": "⚔️ Open the project — 18 points of the mountain crumble." }
  ],
  // ... then all fields of StorySeed inline (chapter, setting, openingProse,
  // boss, quests[], protagonist, rewardLines)
}
```
`storyLog[].kind` enum: `"prose" | "strike" | "reward" | "goblin" | "rest" | "reconjure"`.

### 2.4 SideQuestPrompt — the ADHD-goblin interlude (attached to a PATCH response)

```jsonc
{
  "id": "sq_001",
  "distraction": "You suddenly remember that important email you forgot to send.",
  "options": [
    { "value": "sideQuest", "label": "A · A legitimate side quest" },
    { "value": "goblin",    "label": "B · The ADHD goblin's deception" }
  ]
}
```
The prompt does NOT reveal which is true. The backend privately knows the classification;
the POST resolves the narrative either way.

### 2.5 JournalEntry — a finished chapter, per user

```jsonc
{
  "journalId": "uuid-v4",
  "sessionId": "uuid-v4",
  "chapter": { "number": 1, "title": "The Mountain of Deadlines" },
  "task": "Finish the research paper",
  "timeAvailable": "90 minutes",
  "bossName": "The Research Paper",
  "strikesUsed": 5,            // number of quests done before bossHp hit 0
  "goblinsFallen": 1,          // how many times the goblin was revealed
  "closingProse": "The mountain crumbled; the hero marches on.",
  "createdAt": "2026-09-06T11:30:00Z",
  "completedAt": "2026-09-06T11:30:00Z"
}
```

---

## 3. REST endpoints (backend owns ALL of these)

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/api/chapters` | `{ "protagonist": string, "task": string, "timeAvailable": string }` | `SessionState` (201) — new story, via Gemini |
| `GET` | `/api/chapters/:id` | — | `SessionState` (200) — resume; 404 if not owned by user |
| `PATCH` | `/api/chapters/:id/quests/:questId` | `{ "done": true }` | `{ "state": SessionState, "goblin": SideQuestPrompt \| null }` — mark strike; recompute `bossHp`; ~15% per strike the goblin interrupts (`goblin` set, `status:"sideQuest"`) |
| `POST` | `/api/chapters/:id/side-quest` | `{ "choice": "sideQuest" \| "goblin" }` | `SessionState` — story adapts, returns to `status:"battle"` |
| `POST` | `/api/chapters/:id/reconjure` | `{}` | `SessionState` — same task, brand new seed (temperature ~1.0) |
| `GET` | `/api/journal` | — | `JournalEntry[]` (newest first) — user's archive |

### Body echo rule
`protagonist`, `task`, `timeAvailable` are set by the frontend on CREATE and echoed back
verbatim in `SessionState`/`JournalEntry`. The backend must not reformat them.

### Versioning & resync (frontend cache behavior)
- Backend bumps `version` by 1 on every mutating endpoint.
- Frontend keeps a localStorage cache, but it is a CACHE, not the source of truth.
- On boot / on app focus: `GET /api/chapters/:id`; if `server.version > cache.version`, the server wins and replaces the cache.
- Journal entries are idempotent (`journalId`); the UI may merge safely.

---

## 4. Actian NoSQL schema guidance (DB teammate)

Document-store style is assumed. Store per-user, keep documents keyed so the API is a single lookup.

**Collection/table `chapters`** — key `sessionId`, indexed `userId`:
one document = one `SessionState` (embed quests + latest `storyLog`). `version`, `updatedAt` update
on every write.

**Collection/table `journal`** — key `journalId`, indexed `userId` + `createdAt`:
one document = one `JournalEntry`.

Keep field names identical to the shapes above. Do NOT rename `id`→`_id`, `sessionId`→`_key`,
etc. — or the "silent integration killer" rule is violated and the frontend contract breaks.

---

## 5. Gemini prompt contract (backend owns the call)

- Model: Flash family (config `GEMINI_MODEL`, default `gemini-2.5-flash`).
- Use JSON-schema structured output (the `StorySeed` fragment sans live fields) so shapes are guaranteed.
- `temperature: 1.0` + a random nonce phrase per call so **every story is different**.
- Boss HP is NEVER asked to the model — the backend writes `hp: 100`.
- Scoring: ask the model for int `damage` per quest, `1..60`, such that sum ≥ 100.
- Diegetic rule in the system prompt: rewards are prose and never mention XP, coins, streaks, or numbers-as-currency.

---

## 6. Repo hygiene (the ten commandments, condensed)

1. Commit this file BEFORE implementation code anywhere. (Done.)
2. Nothing merges to `main` unless `npm run build` (frontend) / backend smoke passes.
3. No one edits anyone else's files. To change THIS file → group announcement first.
4. End-to-end smoke every 2 hours: create → strike → HP number → goblin → journal.