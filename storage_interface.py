"""Shared contract between game_engine/api (this side) and the storage backend.

Teammate 1 implements this Protocol against Actian VectorAI DB in a
separate module (e.g. storage_vectorai.py). Nothing in game_engine/ or
api/ should import that module directly -- only this Protocol.

If a DB schema change forces an edit to game_engine, this interface
isn't narrow enough: fix the contract here, not the caller.
"""

from typing import Protocol, runtime_checkable


@runtime_checkable
class TaskStorage(Protocol):
    def save_task(self, task: dict) -> str:
        """Persist a new task, return its assigned task_id."""
        ...

    def get_task(self, task_id: str) -> dict:
        """Fetch a task by id. Raises KeyError if not found."""
        ...

    def find_similar_tasks(self, title: str, description: str, limit: int) -> list[dict]:
        """Return up to `limit` completed tasks most similar to the given
        title/description, each dict including at least
        {"task_id", "damage_rating", "similarity"}, ordered by similarity
        descending. Empty list on cold start (no completed tasks yet).
        """
        ...

    def archive_completed(self, task_id: str) -> None:
        """Mark a task completed and move it into the searchable
        completed_tasks collection. Idempotent: archiving an
        already-archived task_id is a no-op, not an error.
        """
        ...

    def count_vectors(self) -> int:
        """Number of vectors currently indexed in completed_tasks.
        Used for health checks / cold-start detection.
        """
        ...
