"""HP calculation.

hp = max_hp - (elapsed/deadline * max_hp) + damage_dealt_by_you - damage_dealt_by_opponent

Deliberately two separate damage terms rather than one combined
"damage_taken_from_opponent" figure: PvE has no opponent (that term is
always 0), and in PvP damage from the opponent must subtract, not add.
Clamped to [0, max_hp] -- you can't overheal past full or drop below 0.
"""

from __future__ import annotations


def compute_hp(
    max_hp: float,
    elapsed_seconds: float,
    deadline_seconds: float,
    damage_dealt_by_you: float = 0.0,
    damage_dealt_by_opponent: float = 0.0,
) -> float:
    if deadline_seconds <= 0:
        raise ValueError("deadline_seconds must be positive")
    if max_hp <= 0:
        raise ValueError("max_hp must be positive")

    drain_fraction = min(max(elapsed_seconds / deadline_seconds, 0.0), 1.0)
    drain = drain_fraction * max_hp
    hp = max_hp - drain + damage_dealt_by_you - damage_dealt_by_opponent
    return min(max(hp, 0.0), max_hp)
