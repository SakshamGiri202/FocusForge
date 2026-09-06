# FocusForge — A Chronicle of Tiny Victories

Life is an RPG — but it reads like a novel.

Gamified task-completion app — team NEEMA, ADHD Hacks x Actian VectorAI DB Challenge (Bengaluru, Sept 6 2026). Prize track: Best Use of Actian VectorAI DB.

Most to-do apps reward you after you finish something.
**FocusForge makes progress itself worth experiencing.** Your real task is conjured into a fantasy chapter; completing tiny quests rewrites the story live. No XP, no coins, no streaks — the narrative is the reward.

Every user has an HP bar that drains relative to their task deadline. Completing a task deals "damage" back that offsets the drain. PvE: the deadline itself is the boss. PvP: two players/teams drain each other via task completion. New tasks get an auto-inferred damage rating from vector similarity search against completed tasks — **this is the load-bearing use of Actian VectorAI DB**: it's doing real classification, not just storage.

## Frontend (Next.js 15 UI)

```bash
npm install
npm run dev        # → http://localhost:3000
```

- **No backend?** The app runs in *scroll-of-fate* mode (mock adapter + offline story engine) so the golden demo path works end-to-end with zero services.
- **Backend live?** Set `NEXT_PUBLIC_API_URL` (and Clerk keys) below and it talks to the realm.
- Contract: everything the UI expects is in [`CONTRACT.md`](./CONTRACT.md).

### Environment

Copy `.env.local.example` to `.env.local`:

| Var | Purpose | Default |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Backend REST base URL | *(unset → mock mode)* |
| `NEXT_PUBLIC_USE_MOCK` | `"1"` forces mock even with an API URL | `"0"` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk frontend key | *(unset → demo hero, no login)* |
| `CLERK_SECRET_KEY` | Clerk backend key (used by backend teammate) | — |

## Backend & Game Engine (Python / FastAPI / Actian VectorAI DB)

### Architecture

Three layers, narrow interfaces, per Ousterhout's deep-module principle:

- **`game_engine/`** — pure game logic (HP math, damage inference, battle state transitions). No FastAPI, no storage, no I/O. Fully unit-testable.
- **`storage_interface.py`** — the shared contract (`typing.Protocol`) between game logic and the database. `storage_stub.py` is an in-memory placeholder implementation; the real Actian VectorAI DB implementation lives in a separate module and satisfies the same Protocol. Swapping one for the other is a one-line change in `api/dependencies.py`.
- **`api/`** — FastAPI routes only. Parse request → call `game_engine`/`storage` → return response. No business logic here.

**Rule:** if a DB schema change ever forces an edit inside `game_engine/`, the interface isn't narrow enough — fix `storage_interface.py`, not the caller.

### Backend Contract

```python
storage.save_task(task: dict) -> str
storage.get_task(task_id: str) -> dict
storage.find_similar_tasks(title: str, description: str, limit: int) -> list[dict]
storage.archive_completed(task_id: str) -> None
storage.count_vectors() -> int
```

`find_similar_tasks` results are `{"task_id", "damage_rating", "similarity"}` dicts, sorted by similarity descending. `game_engine.infer_damage_rating` turns that into a single rating via similarity-weighted average, falling back to a default on cold start (no completed tasks yet).

### Running Backend Locally

```bash
python -m venv .venv
.venv/Scripts/activate   # Windows; use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
pytest
uvicorn api.main:app --reload
```

### API Surface

- `POST /battles` — create a PvE or PvP battle
- `GET /battles/{id}/status` — live HP for both sides
- `GET /players/{id}/hp` — live HP for one player
- `POST /tasks` — create a task; damage rating auto-inferred via `find_similar_tasks`
- `POST /tasks/{id}/complete` — deal damage, archive the task into the vector-searchable completed set

## Team Integration & Branch Discipline

- UI works on the `feat/novel-ui` branch.
- Backend/Game Engine works on `feature/game-engine`.
- `main` only receives changes that merge green (`npm run build` passes).
- Nobody edits another teammate's files. Contract changes → announce in the group first.
- Smoke-test end-to-end together every ~2 hours, not just at the end.

