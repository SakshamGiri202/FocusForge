# FocusForge — Backend Connection Spec (hand this to the Backend + DB teammates)

> Pair with `CONTRACT.md` (THE contract, **v3**). This file is the UI team's hand-off:
> what the backend must implement, what env it needs, and how the UI will call it.

---

## 0. TL;DR

The UI fires **12** REST calls (8 solo + 3 duel + 1 SSE stream, below), always with
`Authorization: Bearer <clerk-token>`.
The backend owns **all** writes to Actian NoSQL, calls **Gemini Flash** for fiction, and must
follow the **deterministic damage rule** (damage is decided by the backend, NOT Gemini).
The UI is already built: mock mode. Setting `NEXT_PUBLIC_API_URL` flips the app to talk to you.
You'll know it works when the **golden path** (§0.1) passes end-to-end.

### 0.1 Acceptance test (the golden path)
1. `POST /api/chapters` → new war story, 4–6 quests, boss HP = 100.
2. PATCH 2 quests done → `bossHp` drops after each; the **2nd** completed strike returns a `goblin` payload and `status:"goblin"`.
3. `POST …/side-quest` with `choice:"sideQuest"` → `status:"detour"` + a bounded SideQuest.
4. `POST …/side-quest/:detourId/complete` → `status:"battle"`, a `return` beat in `storyLog`.
5. Keep striking until `bossHp <= 0` → `status:"chapterEnd"` + closing prose.
6. `GET /api/journal` lists the finished chapter (newest first).

### 0.2 Duel acceptance test (v3 — optional but demo-worthwhile)
1. `POST /api/duels` (summoner) → `{ match(status:"awaiting"), session }` with a 6-char `joinCode`.
2. Rival: `POST /api/duels/:joinCode/join` → `{ match(status:"active", startedAt/endsAt set), session }`. Summoner's SSE stream now reports `active`.
3. Each side strikes their own quest with the NORMAL `PATCH …/quests/:questId` → response includes `"match"`; the OPPONENT's HP drops by that quest's damage. **No goblin payload.**
4. First side to HP 0 → the other wins (kill). Opening the SSE stream after end shows `status:"over"`, `winner`, `endReason:"kill"`.
5. `GET /api/duels/:matchId` returns fresh derived HP (drain does not drift from spec §2.9.2).

---

## 1. What the backend needs (checklist)

### 1.1 Environment
- `PORT` (default `8000`)
- `CLERK_SECRET_KEY` — verify Clerk JWTs, extract `userId` from the `sub` claim. **Never trust a `userId` from the request body.**
- `CLERK_JWKS_URL` or let the Clerk SDK fetch it (for offline/dev you may support a demo bypass.)
- `GEMINI_API_KEY` + `GEMINI_MODEL` (default `gemini-2.5-flash`) — all fiction generation.
- `CORS` allow-list including the UI origin (`http://localhost:3000` and the deployed UI URL). Preflight `OPTIONS` must succeed.
- Actian NoSQL connection details (host/port/keyspace). See §5.
- **CORS must allow the `Authorization` header.** Requests carry `Content-Type: application/json`.

### 1.2 Framework-agnostic rules the UI relies on
- Every response that returns a session is a full `SessionState` document (embedded quests,
  storyLog, detour, boss, protagonist — literally everything). No partial updates; the UI is stateless.
- **`version` bumps +1 on EVERY mutation** (PATCH quest, side-quest, detour complete, shrink, reconjure, create). The UI uses this to resync its cache: `server.version > cache.version → server wins`.
- **Body echo rule:** `protagonist`, `task`, `timeAvailable` are sent once at create and must come back verbatim, unchanged.
- **Error envelope** — non-2xx must be JSON:
  `{ "error": { "code": "NOT_FOUND", "message": "No such chapter" } }`
  with a real HTTP status. The UI parses `message` and shows it as prose ("The realm answered…").
- **Diegetic-only rewards:** never output XP, coins, streaks, or `+N` numbers anywhere. Story prose is the reward.
- **Boss HP is always 100** (`BOSS_HP = 100`). Don't ask Gemini for HP.
- **Goblin interrupts ONCE per session, deterministically** — on the 2nd completed strike. Neither choice is ever punished (no heart/HP loss).
- **Clerk expiry:** the UI can pass `token` = `undefined` in demo mode; in production it's a live Clerk session JWT. Backend may keep a dev bypass that fabricates a `userId` from a header like `x-demo-user`, but it MUST be off by default.

---

## 2. The 8 endpoints (exact shapes)

Base URL from the UI: `NEXT_PUBLIC_API_URL` (e.g. `http://localhost:8000`).
All bodies `application/json`. All non-GET carry `{ "Content-Type": "application/json", "Authorization": "Bearer <clerk-session>" }`.

### 2.1 POST `/api/chapters` — create the chapter (201)
Body (exactly 3 fields; the UI never sends `userId`):
```json
{ "protagonist": "Piyush", "task": "Finish the machine learning assignment", "timeAvailable": "90 minutes" }
```
Returns: `SessionState` (see CONTRACT.md §2.3; `status:"battle"`).

Backend must:
- Call Gemini (prompt contract §4) → build `StorySeed`, then apply the damage algorithm (§3).
- Set `boss.hp = 100`, `hearts = 3`, `strikes = 0`, `goblinSeen = false`, `detour = null`, `version = 1`.
- Persist to `chapters` collection.

### 2.2 GET `/api/chapters/:id` — resume/resync (200)
Returns the current `SessionState`. 404 if the id isn't owned by the caller's `userId`.
The UI calls this on boot/focus to reconcile its localStorage cache.

### 2.3 PATCH `/api/chapters/:id/quests/:questId` — strike (200)
Body: `{ "done": true }`
Returns:
```json
{ "state": "SessionState…", "goblin": "SideQuestPrompt | null" }
```
Backend must:
- Mark the quest done, set `completedAt`, append a `strike` storyLog beat and a diegetic `reward` beat.
- Recompute `bossHp = 100 − Σ damage(done quests)`.
- **If this is the 2nd completed strike and `goblinSeen === false`** → build a `SideQuestPrompt` (CONTRACT.md §2.4), set `goblinSeen = true`, `status = "goblin"`, append a `goblin` beat, and return it in `goblin`. This is a one-shot; never again this session.
- `status:"chapterEnd"` + `chapterEnd` beat + closing prose when `bossHp <= 0`.

### 2.4 POST `/api/chapters/:id/side-quest` — goblin choice (200)
Body:
```json
{ "choice": "sideQuest" | "goblin", "interludeId": "sq_001" }
```
- `choice:"sideQuest"` → attach a `SideQuest` (CONTRACT.md §2.5) to `session.detour`, `status="detour"`, append `detour` beat.
- `choice:"goblin"` → append `return` beat ("The Wanderer Returned"), `status="battle"`, `goblinsFallen += 1` (stored on the hero record/flavor). **No penalty.**
- Returns: `SessionState`.

### 2.5 POST `/api/chapters/:id/side-quest/:detourId/complete` — finish detour (200)
Body: `{}`
Appends the `return` beat ("✧ The Wanderer Returned ✧"), clears `detour`, sets `status="battle"`.
Returns `SessionState`.

### 2.6 POST `/api/chapters/:id/quests/:questId/shrink` — Wisdom of the Small Blade (200)
Body: `{}`
Only for an uncompleted quest. **Split it into two quests whose damage sums exactly to the original** (e.g. damage 40 → `q3-b` damage 12 + `q3-c` damage 28; new ids `<qid>-b` / `<qid>-c`; `done:false`). The original quest id is deactivated. Append a `shrink` storyLog beat. Recompute `bossHp` (total preserved). Returns `SessionState`.
> Rule: total chapter damage stays ~120 throughout; every split preserves the sum.

### 2.7 POST `/api/chapters/:id/reconjure` — same task, new story (200)
Body: `{}`
New `StorySeed` for the SAME `sessionId` + task, `version+1`, `storyLog` gains a `reconjure` beat. This is the UI's "roll a fresh story" — story must be a different place/mood every time (Gemini `temperature: 1.0` + a nonce). Returns `SessionState`.

### 2.8 GET `/api/journal` — archive (200)
Returns `JournalEntry[]` (CONTRACT.md §2.7), newest first, only the caller's entries.
Journal entries are idempotent (`journalId`).

### 2.9 Duel endpoints (v3 — CONTRACT.md §3.1)

#### 2.9.1 POST `/api/duels` — summon a rival (201)
Body: the summoner's `CreateChapterInput` (`protagonist`/`task`/`timeAvailable`).
Returns: `{ "match": MatchState, "session": SessionState }`.
Backend must:
- Create the summoner's Chapter session exactly like §2.1 (it becomes their side of the duel; the Goblin is disabled while the session is duel-bound).
- Create the match: `status:"awaiting"`, `startedAt:null`/`endsAt:null`, `durationSeconds = timeChoiceToSeconds(timeAvailable)` (§2.9.2), `sideA` from the session, `sideB:null`, damage counters `0`, empty `log` + a `start` beat.
- Set `joinCode` = 6 chars from a safe alphabet (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`, no I/l/0/O), indexed unique.
- Return the match even from the summoner's own `GET /api/duels/:matchId`.

#### 2.9.2 Shared time budget mapping (mirror `lib/time.ts` exactly)
`"15 minutes"→900s · "30 minutes"→1800s · "45 minutes"→2700s · "1 hour"→3600s ·
"2 hours"→7200s · "3 hours"→10800s · "An evening"→7200s · "A full day"→86400s ·
"no bound set"→3600s (default)`. Matches solo's `timeAvailable` echo (verbatim).

#### 2.9.3 POST `/api/duels/:joinCode/join` — answer the summons (200)
Body: the rival's `CreateChapterInput`.
Returns: `{ "match": MatchState, "session": SessionState }` with the rival's new session.
Backend must:
- 409 if the match is `active`/`over` (`"That duel has already begun."` / `"already decided."`) or already has a `sideB`.
- Create the rival's Chapter session (§2.1), attach as `sideB`, flip `status:"active"`, set `startedAt = now`, `endsAt = startedAt + durationSeconds`, append a `join` beat, persist, emit to SSE.

#### 2.9.4 GET `/api/duels/:matchId` — snapshot (200)
Returns the match with **fresh derived** `hpA`/`hpB` (see formula below). 404 if the caller is not one of the two sides.

**Drain formula (backend + clients MUST agree):**
```
hpA = max(0, 100 − drain(now) − damageDealtB)
hpB = max(0, 100 − drain(now) − damageDealtA)
drain(now) = floor(min(now, endsAt) − startedAt) / 40000ms
```
End conditions (checked on every read/event while `active`):
`hp ≤ 0` → `status:"over"`, `endReason:"kill"` (tie → `winner:"draw"`); `now ≥ endsAt` → `endReason:"time"`, higher HP wins, tie = draw, and a `time`-kind beat is appended once. Persist the terminal state; never revive it.

#### 2.9.5 GET `/api/duels/:matchId/events` — SSE live stream
`Content-Type: text/event-stream`. Each frame: `data: {"match": MatchState}\n\n`. Push on every mutation AND on ~1s intervals while `active` (so the drain reads live). Send the terminal state once the match is `over`, then close. The UI re-opens on reconnect; mock mode emulates this with `storage` events + a 1s poll, so the client logic is identical.

#### 2.9.6 Striking inside a duel (the same old PATCH)
Each side completes their own quests with §2.3's `PATCH /api/chapters/:id/quests/:questId`.
When that session belongs to a match:
- Apply the quest's `damage` to the OPPONENT: `damageDealtA += damage` (hurts `hpB`) / `damageDealtB += damage` (hurts `hpA`); bump that side's `strikes`; append a `strike` beat; re-evaluate end conditions (§2.9.4); persist + emit.
- Return `{ "state": SessionState, "goblin": null, "match": MatchState }`.
- **Goblin carve-out:** never fire the §2.3 goblin while the session is duel-bound — a duel keeps `status:"battle"` until it's over.

## 3. Deterministic damage — implement EXACTLY this
- Gemini returns per-quest `difficulty` only, from `trivial | easy | medium | hard | epic`.
- Base weights: `trivial 6 · easy 10 · medium 16 · hard 24 · epic 40`.
- **Normalize so Σ damage ≈ 120** (scale so the chapter's total ≈ 120, then `clamp(damage, 5, 60)`). 120 comfortably beats `BOSS_HP = 100`.
- Damage is **locked at creation**; the only mutation is the shrink split (which preserves the total).
- The UI renders damage as flavor only — but the number IS shown (e.g. "-16"), so it must feel fair and stable.

---

## 4. Gemini prompt contract (backend owns the call)
- Model: Flash family. JSON-schema structured output, `response_mime_type: "application/json"`.
- `temperature: 1.0` **plus a random nonce injected into the prompt** so every story differs (even reconjure).
- Ask Gemini ONLY for: `chapter` (number/title/epigraph), `setting` (place/timeOfDay/mood), `openingProse`, `boss` (name/epithet/fightIntro — HP forced to 100 by the backend), quest **structure** (action/narrative/difficulty), `rewardLines` (gate/onQuest/onReturn/onShrink/onBossDown), and for the interlude: `distraction` + 2 options + SideQuest flavor.
- NEVER ask for: damage, HP, scores, coins, XP.
- System-prompt hard rules:
  1. Rewards are prose. Never mention XP, coins, streaks, points, or currency.
  2. Every quest's `action` = shortest concrete step (e.g. "Open the project", "Write the first sentence"). 4–6 quests.
  3. `timeOfDay` is stylized from the user's local clock.
  4. The distract/side-quest copy is never fear-mongering and never self-blame; the goblin is playful.
  5. The protagonist's name in `openingProse` comes from the user's input.
- Backend then assembles `StorySeed` exactly as CONTRACT.md §2.2. Field names must match the contract — frontend type-checks against these shapes.

---

## 5. Actian NoSQL schema (DB teammate — matches CONTRACT.md §4)
- **Collection `chapters`** — key `sessionId`; secondary index on `userId`; embedded `quests`, `storyLog`, `detour`. One document = one `SessionState`. Bump `version`/`updatedAt` on every write.
- **Collection `journal`** — key `journalId`; index on (`userId`, `createdAt`). One document = one `JournalEntry`. Upsert by `journalId` for idempotency.
- **Collection `duels`** — key `matchId`; UNIQUE index on `joinCode`; index on `status`. One document = one `MatchState` (CONTRACT.md §2.8). Every side already has a row in `chapters`; `sideA.sessionId` / `sideB.sessionId` join to it. Persist on create / join / each strike / terminal transition. **Never store per-second HP** — derive it (CONTRACT.md §2.8). Journal on a duel end: each side gets their own `JournalEntry` (same verdict, their viewpoint).
- **Field-name discipline:** keep names identical to the shapes in CONTRACT.md. Don't rename `id→_id`, `sessionId→_key`, etc. Silent renames are the #1 integration killer.

---

## 6. How the UI calls you (so you can align logs)
- Adapter: `lib/api.ts` → `restApi`. Mode flips when `NEXT_PUBLIC_API_URL` is set and `NEXT_PUBLIC_USE_MOCK !== "1"`.
- Every call: `fetch(BASE + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, cache: "no-store" })`.
- One nuance the backend should expect: PATCH `…/quests/:questId` is the only call that returns `{ state, goblin }`; everything else returns a bare `SessionState`.
- Client-side sync: on boot/focus the UI does `GET /api/chapters/:id` and keeps the server version when it's newer.

---

## 7. Dev iteration steps for the backend
1. Stand up the server on `:8000` with the 8 routes returning contract-shaped JSON.
2. Set `security: off` dev bypass first (header `x-demo-user: demo-hero`) so the UI works **without Clerk**, then add real Clerk JWT verification.
3. Ask the UI team to set `.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:8000`.
4. The UI banner will read "linked" instead of "local" when it reaches your server.
5. Walk the golden path (§0.1). Fix field-name drift first, then logic.
6. Enable CORS for the UI origin; confirm `OPTIONS` preflight passes.
7. Add the real Gemini call last, behind a flag (`GEMINI_DISABLED=1` → canned seed) so integration testing isn't blocked on Gemini availability.

## 8. Contract discipline
- Any change to shapes/routes → announce in the group chat BEFORE committing; refresh CONTRACT.md as v3.
- Field names, enum values (`status`, `difficulty`, `storyLog[].kind`, `MatchState.status`), and the **12** route paths are frozen unless announced.