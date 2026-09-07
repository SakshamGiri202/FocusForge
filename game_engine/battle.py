"""Battle state transitions. Pure functions: state in, new state out.

apply_damage() is the one call site that hides all the branching between
PvE and PvP -- callers in api/ never need to know which mode they're in.
"""

from __future__ import annotations

import uuid

from game_engine.models import BattleState, Mode, PlayerState


def new_battle(
    mode: Mode,
    deadline_seconds: float,
    started_at: float,
    player_a: PlayerState,
    player_b: PlayerState | None = None,
    battle_id: str | None = None,
) -> BattleState:
    if mode is Mode.PVP and player_b is None:
        raise ValueError("PvP battles require player_b")
    if mode is Mode.PVE and player_b is not None:
        raise ValueError("PvE battles have no player_b (the deadline is the boss)")

    return BattleState(
        battle_id=battle_id or str(uuid.uuid4()),
        mode=mode,
        deadline_seconds=deadline_seconds,
        started_at=started_at,
        player_a=player_a,
        player_b=player_b,
    )


def apply_damage(state: BattleState, dealt_by: str, damage_rating: float) -> BattleState:
    """Record that `dealt_by` (a player_id in this battle) completed a
    task worth `damage_rating`. Completing a task always offsets the
    dealer's own drain; in PvP it's also inflicted on the opponent.
    """
    if dealt_by == state.player_a.player_id:
        new_player_a = PlayerState(
            player_id=state.player_a.player_id,
            max_hp=state.player_a.max_hp,
            damage_dealt=state.player_a.damage_dealt + damage_rating,
            damage_received=state.player_a.damage_received,
        )
        new_player_b = state.player_b
        if state.mode is Mode.PVP and state.player_b is not None:
            new_player_b = PlayerState(
                player_id=state.player_b.player_id,
                max_hp=state.player_b.max_hp,
                damage_dealt=state.player_b.damage_dealt,
                damage_received=state.player_b.damage_received + damage_rating,
            )
    elif state.player_b is not None and dealt_by == state.player_b.player_id:
        new_player_b = PlayerState(
            player_id=state.player_b.player_id,
            max_hp=state.player_b.max_hp,
            damage_dealt=state.player_b.damage_dealt + damage_rating,
            damage_received=state.player_b.damage_received,
        )
        new_player_a = PlayerState(
            player_id=state.player_a.player_id,
            max_hp=state.player_a.max_hp,
            damage_dealt=state.player_a.damage_dealt,
            damage_received=state.player_a.damage_received + damage_rating,
        )
    else:
        raise ValueError(f"{dealt_by!r} is not a participant in battle {state.battle_id!r}")

    return BattleState(
        battle_id=state.battle_id,
        mode=state.mode,
        deadline_seconds=state.deadline_seconds,
        started_at=state.started_at,
        player_a=new_player_a,
        player_b=new_player_b,
    )
