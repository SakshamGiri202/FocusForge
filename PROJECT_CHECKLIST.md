# FocusForge — Project Checklist

> UI: Next.js 16 · React 19 · Tailwind v4 · zustand · motion · Clerk. Branch: `feat/novel-ui`.
> The one contract file is `CONTRACT.md` (v2). Backend hand-off: `BACKEND_INTEGRATION.md`.

## Done

### Contract & repo hygiene
- [x] Empty repo scaffolded (`next@16.3.4`, `react@19.2.8`, `tailwindcss@^4`)
- [x] `CONTRACT.md` committed *before* implementation — v1 `76f531a`, v2 `0081169`
- [x] Deps: `zustand@^5`, `motion@^13.2.0`, `@clerk/nextjs@^7.9.1`
- [x] Workspace branch `feat/novel-ui` (off `main`), feature commits `4719934` (scaffold) + `64f302d` (golden path)
- [x] Committer identity set (`RandomDragonWizard <piyushtripathi750@gmail.com>`)

### Core code
- [x] `lib/contract.ts` — TS mirror of the contract: `SessionState`, `Quest`, `StorySeed`, `SideQuestPrompt`, `JournalEntry`, `GoblinChoice`, `BOSS_HP = 100`
- [x] `lib/localEngine.ts` — deterministic offline engine: damage lock (weights 6/10/16/24/40, Σ≈120, clamp 5..60), goblin ONCE after 2nd strike, shrink split (total preserved), gate/return beats, reconjure, `synthesizeJournal`
- [x] `lib/api.ts` — REST adapter (if `NEXT_PUBLIC_API_URL` + `NEXT_PUBLIC_USE_MOCK !== "1"`) else MOCK adapter. 8 call sites matching CONTRACT.md §3; Bearer token header; error envelope parsing
- [x] `lib/store.ts` — zustand + persist (`focusforge-cache` as CACHE); `createChapter` / `refresh` (server wins on `version >`) / `completeQuest` / `resolveGoblin` / `finishDetour` / `shrink` / `reconjure` / `beginNextChapter`
- [x] `lib/hero.tsx` — Clerk ↔ demo seam (`HeroProvider`, `useHero`); no Clerk key → demo hero "The Wanderer"

### UI (golden demo path, mock mode)
- [x] Pages: `/` (cover), `/onboarding`, `/story` (battle), `/journal` (archive) — all static-prerendered
- [x] Onboarding: task entry, hero name, hourglass time choices, "Conjure the chapter"
- [x] Story: typewriter opening, chapter header, boss HP panel (damage etched), quest list with strikes, goblin interlude (choice screen), detour card, shrink, reconjure, chapter-end card
- [x] Journal: archive list
- [x] Dark-tome theme: Cormorant Garamond / Playfair Display / Kalam, parchment/ink/gold, vignette + grain + drop caps, `app/globals.css` tokens
- [x] TomeNav shows live mode badge (`local` vs `linked`)
- [x] `README.md` + `.env.local.example`

### Verification
- [x] `npm run lint` clean
- [x] `npm run build` green (all 4 routes static; 200s verified)
- [x] Headless-Chrome smoke: mock `createChapter` from the browser **works** — session persisted, `/story` reachable
- [x] `BACKEND_INTEGRATION.md` written (hand-off prompt for backend/DB team)

## Left to do

### UI polish / bugs
- [ ] Restart dev server cleanly & confirm "Conjure the chapter" click works in a real browser (store path verified; stale-server + headless-quirk suspects cleared — last remaining doubt is the disabled-state render). Current file has local edit `busy === "idle"` — review + keep/revert
- [ ] Remove the temporary debug hook in `lib/store.ts` (`window.__useGame`) and delete `smoke.mjs`
- [ ] Decide fate of `puppeteer-core` devDependency (keep as an E2E basement, or uninstall)
- [ ] Final `npm run build` + `npm run lint`, then commit the working-tree changes on `feat/novel-ui`

### Repo / hand-off
- [ ] User pushes `feat/novel-ui` from their machine (no git creds on this box)
- [ ] Confirm with backend team the "5 vs 8 endpoints" discrepancy before integration
- [ ] Manual golden-path pass in real browser: create → strike 4–6 quests → HP drops each strike → goblin at 2nd strike → detour XOR return → boss down → journal entry

### Auth
- [ ] Provide `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (and `CLERK_SECRET_KEY` for backend) → enable real login instead of demo hero
- [ ] Verify Bearer-token flow against a real backend (token from `useHero().token()`)

### Backend (teammate) — see `BACKEND_INTEGRATION.md`
- [ ] Implement 8 endpoints per CONTRACT.md §3 (create/get/PATCH quest/side-quest/detour-complete/shrink/reconjure/journal)
- [ ] Env: `PORT`, CORS allowlist incl. UI origin, Clerk JWT verify (userId from `sub`, never body)
- [ ] Deterministic damage (weights + Σ≈120 + clamp + lock; shrink preserves total)
- [ ] Goblin once-per-session on 2nd strike; punishment-free choice
- [ ] `version +1` on every mutation; full `SessionState` responses; body echo; error envelope
- [ ] Optionally build behind `x-demo-user` dev bypass, real Gemini last
- [ ] Backend smoke: golden path passes end-to-end; banner on UI flips to "linked"

### DB (teammate) — see CONTRACT.md §4
- [ ] Actian NoSQL: `chapters` (key `sessionId`, index `userId`) + `journal` (key `journalId`, index `userId`+`createdAt`)
- [ ] Field names identical to contract shapes (no `id`→`_id` renames)

### Integration coordination
- [ ] Shared `.env.local` with `NEXT_PUBLIC_API_URL` pointed at the real backend
- [ ] End-to-end smoke every 2 hours during integration (per CONTRACT.md §6)
- [ ] Any contract drift announced in group chat → bumped to v3