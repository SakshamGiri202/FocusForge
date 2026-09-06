# Focus Forge

Gamified task-completion app — team NEEMA, ADHD Hacks x Actian VectorAI DB
Challenge (Bengaluru, Sept 6 2026). Prize track: Best Use of Actian VectorAI DB.

Every user has an HP bar that drains relative to their task deadline.
Completing a task deals "damage" back that offsets the drain. PvE: the
deadline itself is the boss. PvP: two players/teams drain each other via
task completion. New tasks get an auto-inferred damage rating from
vector similarity search against completed tasks — **this is the
load-bearing use of Actian VectorAI DB**: it's doing real classification,
not just storage.

## Architecture

Three layers, narrow interfaces, per Ousterhout's deep-module principle:

- **`game_engine/`** — pure game logic (HP math, damage inference,
  battle state transitions). No FastAPI, no storage, no I/O. Fully
  unit-testable.
- **`storage_interface.py`** — the shared contract (`typing.Protocol`)
  between game logic and the database. `storage_stub.py` is an
  in-memory placeholder implementation; the real Actian VectorAI DB
  implementation lives in a separate module and satisfies the same
  Protocol. Swapping one for the other is a one-line change in
  `api/dependencies.py`.
- **`api/`** — FastAPI routes only. Parse request → call
  `game_engine`/`storage` → return response. No business logic here.

**Rule:** if a DB schema change ever forces an edit inside `game_engine/`,
the interface isn't narrow enough — fix `storage_interface.py`, not the
caller.

## The contract

```python
storage.save_task(task: dict) -> str
storage.get_task(task_id: str) -> dict
storage.find_similar_tasks(title: str, description: str, limit: int) -> list[dict]
storage.archive_completed(task_id: str) -> None
storage.count_vectors() -> int
```

`find_similar_tasks` results are `{"task_id", "damage_rating", "similarity"}`
dicts, sorted by similarity descending. `game_engine.infer_damage_rating`
turns that into a single rating via similarity-weighted average, falling
back to a default on cold start (no completed tasks yet).

## Team split

- **System design, game engine, API** (this codebase's owner) — HP/damage
  logic, FastAPI routes, in-memory storage stub.
- **Database layer** — real Actian VectorAI DB implementation of
  `TaskStorage`, embeddings via `sentence-transformers/all-MiniLM-L6-v2`
  (384-dim).
- **Team lead** — frontend / RPG-skinned task board UI.

## Running locally

```bash
python -m venv .venv
.venv/Scripts/activate   # Windows; use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
pytest
uvicorn api.main:app --reload
```

## API surface

- `POST /battles` — create a PvE or PvP battle
- `GET /battles/{id}/status` — live HP for both sides
- `GET /players/{id}/hp` — live HP for one player
- `POST /tasks` — create a task; damage rating auto-inferred via
  `find_similar_tasks`
- `POST /tasks/{id}/complete` — deal damage, archive the task into the
  vector-searchable completed set

## Team integration rules

- Don't touch teammates' files/folders — stay scoped to your module.
- Commit small and often, not one giant commit at the end.
- Announce immediately if you need to change the shared interface contract.
- Smoke-test end-to-end together every ~2 hours, not just at the end.
- Stop adding features in the final hour — fix integration issues only.
