# FocusForge — A Chronicle of Tiny Victories

Life is an RPG — but it reads like a novel.

Most to-do apps reward you after you finish something.
**FocusForge makes progress itself worth experiencing.** Your real task is conjured into a
fantasy chapter; completing tiny quests rewrites the story live. No XP, no coins, no streaks —
the narrative is the reward.

## Run it (frontend — UI teammate)

```bash
npm install
npm run dev        # → http://localhost:3000
```

- **No backend?** The app runs in *scroll-of-fate* mode (mock adapter + offline story engine) so
  the golden demo path works end-to-end with zero services.
- **Backend live?** Set `NEXT_PUBLIC_API_URL` (and Clerk keys) below and it talks to the realm.
- Contract: everything the UI expects is in [`CONTRACT.md`](./CONTRACT.md) → next stop, the backend team.

## Environment

Copy `.env.local.example` to `.env.local`:

| Var | Purpose | Default |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Backend REST base URL | *(unset → mock mode)* |
| `NEXT_PUBLIC_USE_MOCK` | `"1"` forces mock even with an API URL | `"0"` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk frontend key | *(unset → demo hero, no login)* |
| `CLERK_SECRET_KEY` | Clerk backend key (used by backend teammate) | — |

### Backend / DB teammates (shared keys, not the UI's)
`GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-2.5-flash`), Actian NoSQL connection +
`CLERK_SECRET_KEY` — all owned by the backend/DB team per `CONTRACT.md`.

## The golden demo path (what we demo)

> enter task → chapter conjured → story types itself → 4–6 tiny quests → strike → boss HP drops &
> prose changes → the Goblin interrupts ONCE → A) legit detour xor B) exposed & return →
> final quest → chapter closes → Journal entry.

## Branch discipline (cmd #4)

- UI works on the `feat/novel-ui` branch.
- `main` only receives changes that merge green (`npm run build` passes).
- Nobody edits another teammate's files. Contract changes → announce in the group first.