"""Baseline completed_tasks used to demo damage-rating inference.

Without this, every task created during the demo hits the cold-start
default rating (see game_engine.damage.DEFAULT_DAMAGE_RATING) because
find_similar_tasks has nothing to compare against -- which makes the
vector search look decorative instead of load-bearing. Seeding a spread
of tasks across domains and complexity tiers means a live-created task
("Fix the login bug") actually lands near its real cluster (other
coding tasks) instead of the generic default.

Damage rating scale: 6 (trivial) - 60 (major undertaking) -- matches
game_engine.story's per-quest damage range (MIN/MAX_QUEST_DAMAGE) and
the DIFFICULTY_WEIGHTS fallback table, since quests and these seed
tasks share the same "completed_tasks" similarity pool. (Originally
1-10; rescaled x6 so seeding this pool doesn't skew quest damage
inference toward a different, incompatible scale.)

seed() depends only on storage_interface.TaskStorage, so it works
identically against the in-memory stub during development and against
the real Actian VectorAI DB once it's wired in -- run it once after
switching backends in api/dependencies.py.
"""

from __future__ import annotations

from storage_interface import TaskStorage

COMPLETED_TASKS: list[dict] = [
    # trivial (6-12)
    {"title": "Reply to a quick email", "description": "One-line response to a colleague's question", "damage_rating": 6},
    {"title": "Send a Slack status update", "description": "Quick status update to the team channel", "damage_rating": 6},
    {"title": "Fix a typo in the README", "description": "Correct a spelling mistake in documentation", "damage_rating": 6},
    {"title": "Water the office plants", "description": "Quick watering round for desk plants", "damage_rating": 6},
    {"title": "Answer a billing question", "description": "Respond to a simple customer support ticket", "damage_rating": 12},
    {"title": "Wash the dishes", "description": "Wash dishes left over from lunch", "damage_rating": 12},
    # light (18-24)
    {"title": "Do a load of laundry", "description": "Wash and fold one load of laundry", "damage_rating": 18},
    {"title": "Go for a 30 minute run", "description": "Light cardio session before work", "damage_rating": 18},
    {"title": "Buy groceries for the week", "description": "Weekly grocery shopping trip", "damage_rating": 18},
    {"title": "Write a short blog post", "description": "Draft a 500 word blog post about a recent project", "damage_rating": 24},
    {"title": "Review a small pull request", "description": "Review a 20 line code change from a teammate", "damage_rating": 24},
    {"title": "Deep clean the kitchen", "description": "Clean counters, stove, and sink thoroughly", "damage_rating": 24},
    # moderate (30-36)
    {"title": "Prepare a team meeting deck", "description": "Build a 10 slide deck for the weekly sync", "damage_rating": 30},
    {"title": "Write unit tests for a module", "description": "Add test coverage for a newly built feature", "damage_rating": 30},
    {"title": "Plan meals for the week", "description": "Plan and prep meals for the next seven days", "damage_rating": 30},
    {"title": "Fix a UI rendering bug", "description": "Debug and fix a layout issue on the dashboard", "damage_rating": 36},
    {"title": "Draft a project proposal", "description": "Write a one-page proposal for a new initiative", "damage_rating": 36},
    {"title": "Organize the garage", "description": "Sort and reorganize garage storage bins", "damage_rating": 36},
    # heavy (42-48)
    {"title": "Study for a midterm exam", "description": "Review three chapters and practice problems", "damage_rating": 42},
    {"title": "Redesign the onboarding flow", "description": "Redesign and implement a new user onboarding flow", "damage_rating": 42},
    {"title": "Plan a two day team offsite", "description": "Organize logistics and agenda for a team offsite", "damage_rating": 42},
    {"title": "Prepare a conference talk", "description": "Build slides and rehearse a 20 minute talk", "damage_rating": 48},
    {"title": "Refactor a legacy auth module", "description": "Refactor a tangled, poorly-documented authentication module", "damage_rating": 48},
    {"title": "Draft a full research paper", "description": "Write the first complete draft of an academic paper", "damage_rating": 48},
    # major (54-60)
    {"title": "Debug a production outage", "description": "Diagnose and fix a critical incident affecting live users", "damage_rating": 54},
    {"title": "Migrate the database schema", "description": "Plan and execute a major production database migration", "damage_rating": 54},
    {"title": "Ship a new feature end to end", "description": "Design, build, and launch a new product feature from scratch", "damage_rating": 54},
    {"title": "Prepare a thesis defense", "description": "Prepare slides and rehearse for a PhD thesis defense", "damage_rating": 60},
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
