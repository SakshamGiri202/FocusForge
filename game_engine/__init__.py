"""Pure game logic: HP math, damage inference, battle state transitions.

Plain data in, plain data out. No FastAPI, no storage imports here --
this package must be unit-testable with zero I/O. If a DB schema change
ever forces an edit in this package, the storage_interface contract
isn't narrow enough; fix the contract instead.
"""

from game_engine.battle import apply_damage, new_battle
from game_engine.damage import infer_damage_rating
from game_engine.hp import compute_hp
from game_engine.models import BattleState, Mode, PlayerState

__all__ = [
    "apply_damage",
    "new_battle",
    "infer_damage_rating",
    "compute_hp",
    "BattleState",
    "Mode",
    "PlayerState",
]
