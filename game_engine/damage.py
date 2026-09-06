"""Damage-rating inference from similarity search results.

Takes the output of storage.find_similar_tasks() (already sorted by
similarity, descending) and produces a single damage rating as a
similarity-weighted average -- this is the load-bearing use of vector
search: the rating is inferred, not hardcoded.
"""

from __future__ import annotations

DEFAULT_DAMAGE_RATING = 5.0  # cold start: no completed tasks to compare against yet


def infer_damage_rating(
    similar_tasks: list[dict],
    default: float = DEFAULT_DAMAGE_RATING,
) -> float:
    total_weight = sum(t["similarity"] for t in similar_tasks)
    if not similar_tasks or total_weight <= 0:
        return default

    weighted_sum = sum(t["damage_rating"] * t["similarity"] for t in similar_tasks)
    return weighted_sum / total_weight
