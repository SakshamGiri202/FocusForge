"""In-memory stand-in for the real Actian VectorAI DB implementation.

Satisfies storage_interface.TaskStorage so api/ and game_engine/ can be
built and tested end-to-end before teammate 1's real backend lands.
Similarity here is a crude text-overlap heuristic (difflib), NOT a real
embedding search -- it exists only to unblock development, and is not
the thing being judged for the prize track.

Swapping this for the real implementation should be a one-line change
wherever a TaskStorage is constructed (see api/dependencies.py).
"""

from __future__ import annotations

import logging
import uuid
from difflib import SequenceMatcher

logger = logging.getLogger("storage_stub")


class InMemoryTaskStorage:
    def __init__(self) -> None:
        self._tasks: dict[str, dict] = {}
        self._completed_ids: set[str] = set()

    def save_task(self, task: dict) -> str:
        task_id = task.get("task_id") or str(uuid.uuid4())
        self._tasks[task_id] = {**task, "task_id": task_id}
        logger.info("storage_stub: saved task_id=%s", task_id)
        return task_id

    def get_task(self, task_id: str) -> dict:
        try:
            return self._tasks[task_id]
        except KeyError:
            logger.warning("storage_stub: get_task miss task_id=%s", task_id)
            raise

    def find_similar_tasks(self, title: str, description: str, limit: int) -> list[dict]:
        query = f"{title} {description}".strip().lower()
        candidates = []
        for task_id in self._completed_ids:
            task = self._tasks[task_id]
            text = f"{task.get('title', '')} {task.get('description', '')}".strip().lower()
            similarity = SequenceMatcher(None, query, text).ratio()
            candidates.append(
                {
                    "task_id": task_id,
                    "damage_rating": task.get("damage_rating"),
                    "similarity": similarity,
                }
            )
        candidates.sort(key=lambda c: c["similarity"], reverse=True)
        logger.info(
            "storage_stub: find_similar_tasks matched=%d/%d",
            min(limit, len(candidates)),
            len(candidates),
        )
        return candidates[:limit]

    def archive_completed(self, task_id: str) -> None:
        if task_id in self._completed_ids:
            logger.info("storage_stub: archive_completed no-op (already archived) task_id=%s", task_id)
            return
        if task_id not in self._tasks:
            logger.warning("storage_stub: archive_completed miss task_id=%s", task_id)
            raise KeyError(task_id)
        self._completed_ids.add(task_id)
        logger.info("storage_stub: archived task_id=%s", task_id)

    def count_vectors(self) -> int:
        return len(self._completed_ids)
