"""Baseline completed_tasks used to demo damage-rating inference.

Without this, every task created during the demo hits the cold-start
default rating (see game_engine.damage.DEFAULT_DAMAGE_RATING) because
find_similar_tasks has nothing to compare against -- which makes the
vector search look decorative instead of load-bearing. Seeding a spread
of tasks across domains and complexity tiers means a live-created task
("Fix the login bug") actually lands near its real cluster (other
coding tasks) instead of the generic default.

Damage rating scale: 1 (trivial) - 10 (major undertaking).

seed() depends only on storage_interface.TaskStorage, so it works
identically against the in-memory stub during development and against
the real Actian VectorAI DB once it's wired in -- run it once after
switching backends in api/dependencies.py.
"""

from __future__ import annotations

from storage_interface import TaskStorage

COMPLETED_TASKS: list[dict] = [
    # trivial (1-2)
    {"title": "Reply to a quick email", "description": "One-line response to a colleague's question", "damage_rating": 1},
    {"title": "Send a Slack status update", "description": "Quick status update to the team channel", "damage_rating": 1},
    {"title": "Fix a typo in the README", "description": "Correct a spelling mistake in documentation", "damage_rating": 1},
    {"title": "Water the office plants", "description": "Quick watering round for desk plants", "damage_rating": 1},
    {"title": "Answer a billing question", "description": "Respond to a simple customer support ticket", "damage_rating": 2},
    {"title": "Wash the dishes", "description": "Wash dishes left over from lunch", "damage_rating": 2},
    # light (3-4)
    {"title": "Do a load of laundry", "description": "Wash and fold one load of laundry", "damage_rating": 3},
    {"title": "Go for a 30 minute run", "description": "Light cardio session before work", "damage_rating": 3},
    {"title": "Buy groceries for the week", "description": "Weekly grocery shopping trip", "damage_rating": 3},
    {"title": "Write a short blog post", "description": "Draft a 500 word blog post about a recent project", "damage_rating": 4},
    {"title": "Review a small pull request", "description": "Review a 20 line code change from a teammate", "damage_rating": 4},
    {"title": "Deep clean the kitchen", "description": "Clean counters, stove, and sink thoroughly", "damage_rating": 4},
    # moderate (5-6)
    {"title": "Prepare a team meeting deck", "description": "Build a 10 slide deck for the weekly sync", "damage_rating": 5},
    {"title": "Write unit tests for a module", "description": "Add test coverage for a newly built feature", "damage_rating": 5},
    {"title": "Plan meals for the week", "description": "Plan and prep meals for the next seven days", "damage_rating": 5},
    {"title": "Fix a UI rendering bug", "description": "Debug and fix a layout issue on the dashboard", "damage_rating": 6},
    {"title": "Draft a project proposal", "description": "Write a one-page proposal for a new initiative", "damage_rating": 6},
    {"title": "Organize the garage", "description": "Sort and reorganize garage storage bins", "damage_rating": 6},
    # heavy (7-8)
    {"title": "Study for a midterm exam", "description": "Review three chapters and practice problems", "damage_rating": 7},
    {"title": "Redesign the onboarding flow", "description": "Redesign and implement a new user onboarding flow", "damage_rating": 7},
    {"title": "Plan a two day team offsite", "description": "Organize logistics and agenda for a team offsite", "damage_rating": 7},
    {"title": "Prepare a conference talk", "description": "Build slides and rehearse a 20 minute talk", "damage_rating": 8},
    {"title": "Refactor a legacy auth module", "description": "Refactor a tangled, poorly-documented authentication module", "damage_rating": 8},
    {"title": "Draft a full research paper", "description": "Write the first complete draft of an academic paper", "damage_rating": 8},
    # major (9-10)
    {"title": "Debug a production outage", "description": "Diagnose and fix a critical incident affecting live users", "damage_rating": 9},
    {"title": "Migrate the database schema", "description": "Plan and execute a major production database migration", "damage_rating": 9},
    {"title": "Ship a new feature end to end", "description": "Design, build, and launch a new product feature from scratch", "damage_rating": 9},
    {"title": "Prepare a thesis defense", "description": "Prepare slides and rehearse for a PhD thesis defense", "damage_rating": 10},
]


def seed(storage: TaskStorage, tasks: list[dict] | None = None, only_if_empty: bool = True) -> int:
    """Save and archive each task in `tasks` (default COMPLETED_TASKS) so
    it's searchable via find_similar_tasks. Returns the number seeded.

    only_if_empty=True (default) skips seeding when storage already has
    vectors -- safe to call on every app startup without re-seeding or
    duplicating a teammate's already-populated real DB.
    """
    if only_if_empty and storage.count_vectors() > 0:
        return 0

    tasks = tasks if tasks is not None else COMPLETED_TASKS
    for task in tasks:
        task_id = storage.save_task(task)
        storage.archive_completed(task_id)
    return len(tasks)
