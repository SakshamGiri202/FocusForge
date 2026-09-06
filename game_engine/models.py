"""Plain data types for battle state. No behavior beyond simple derived
values -- transitions live in battle.py so state stays easy to
serialize for the API layer.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from game_engine.hp import compute_hp


class Mode(str, Enum):
    PVE = "pve"
    PVP = "pvp"


@dataclass(frozen=True)
class PlayerState:
    player_id: str
    max_hp: float
    damage_dealt: float = 0.0  # cumulative damage this player has dealt via completed tasks
    damage_received: float = 0.0  # cumulative damage received from an opponent (PvP only)

    def current_hp(self, elapsed_seconds: float, deadline_seconds: float) -> float:
        return compute_hp(
            max_hp=self.max_hp,
            elapsed_seconds=elapsed_seconds,
            deadline_seconds=deadline_seconds,
            damage_dealt_by_you=self.damage_dealt,
            damage_dealt_by_opponent=self.damage_received,
        )


@dataclass(frozen=True)
class BattleState:
    battle_id: str
    mode: Mode
    deadline_seconds: float
    started_at: float  # unix timestamp
    player_a: PlayerState
    player_b: PlayerState | None = None  # None in PvE; the deadline itself is the "boss"
