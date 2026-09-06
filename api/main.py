"""FastAPI routes only: parse request -> call game_engine/storage -> return
response. No business logic here -- HP math lives in game_engine, damage
rating inference lives in game_engine, persistence lives behind
storage_interface.
"""

from __future__ import annotations

import time

from fastapi import Depends, FastAPI, HTTPException

from api.dependencies import get_state, get_storage
from api.schemas import (
    BattleCreate,
    BattleOut,
    BattleStatusOut,
    PlayerHpOut,
    TaskCompleteOut,
    TaskCreate,
    TaskOut,
)
from api.state import AppState
from game_engine import Mode, PlayerState, apply_damage, infer_damage_rating, new_battle
from game_engine.models import BattleState
from storage_interface import TaskStorage

app = FastAPI(title="Focus Forge")


def _battle_status(battle: BattleState, now: float) -> BattleStatusOut:
    elapsed = now - battle.started_at
    player_a_hp = battle.player_a.current_hp(elapsed, battle.deadline_seconds)
    player_b_out = None
    if battle.player_b is not None:
        player_b_hp = battle.player_b.current_hp(elapsed, battle.deadline_seconds)
        player_b_out = PlayerHpOut(
            player_id=battle.player_b.player_id, hp=player_b_hp, max_hp=battle.player_b.max_hp
        )
    return BattleStatusOut(
        battle_id=battle.battle_id,
        mode=battle.mode,
        elapsed_seconds=elapsed,
        deadline_seconds=battle.deadline_seconds,
        player_a=PlayerHpOut(player_id=battle.player_a.player_id, hp=player_a_hp, max_hp=battle.player_a.max_hp),
        player_b=player_b_out,
    )


@app.post("/battles", response_model=BattleOut)
def create_battle(body: BattleCreate, state: AppState = Depends(get_state)) -> BattleOut:
    player_a = PlayerState(player_id=body.player_a_id, max_hp=body.player_a_max_hp)
    player_b = None
    if body.mode is Mode.PVP:
        if body.player_b_id is None:
            raise HTTPException(422, "player_b_id is required for PvP battles")
        player_b = PlayerState(player_id=body.player_b_id, max_hp=body.player_b_max_hp)

    battle = new_battle(
        mode=body.mode,
        deadline_seconds=body.deadline_seconds,
        started_at=time.time(),
        player_a=player_a,
        player_b=player_b,
    )
    state.add_battle(battle)
    return BattleOut(
        battle_id=battle.battle_id,
        mode=battle.mode,
        deadline_seconds=battle.deadline_seconds,
        started_at=battle.started_at,
    )


@app.get("/battles/{battle_id}/status", response_model=BattleStatusOut)
def battle_status(battle_id: str, state: AppState = Depends(get_state)) -> BattleStatusOut:
    try:
        battle = state.get_battle(battle_id)
    except KeyError:
        raise HTTPException(404, f"battle {battle_id!r} not found")
    return _battle_status(battle, time.time())


@app.get("/players/{player_id}/hp", response_model=PlayerHpOut)
def player_hp(player_id: str, state: AppState = Depends(get_state)) -> PlayerHpOut:
    try:
        battle = state.battle_for_player(player_id)
    except KeyError:
        raise HTTPException(404, f"no active battle for player {player_id!r}")
    status = _battle_status(battle, time.time())
    return status.player_a if status.player_a.player_id == player_id else status.player_b


@app.post("/tasks", response_model=TaskOut)
def create_task(
    body: TaskCreate,
    storage: TaskStorage = Depends(get_storage),
    state: AppState = Depends(get_state),
) -> TaskOut:
    try:
        state.get_battle(body.battle_id)
    except KeyError:
        raise HTTPException(404, f"battle {body.battle_id!r} not found")

    similar = storage.find_similar_tasks(body.title, body.description, limit=5)
    damage_rating = infer_damage_rating(similar)

    task_id = storage.save_task(
        {
            "title": body.title,
            "description": body.description,
            "damage_rating": damage_rating,
            "battle_id": body.battle_id,
            "player_id": body.player_id,
        }
    )
    return TaskOut(
        task_id=task_id,
        title=body.title,
        description=body.description,
        damage_rating=damage_rating,
        battle_id=body.battle_id,
        player_id=body.player_id,
    )


@app.post("/tasks/{task_id}/complete", response_model=TaskCompleteOut)
def complete_task(
    task_id: str,
    storage: TaskStorage = Depends(get_storage),
    state: AppState = Depends(get_state),
) -> TaskCompleteOut:
    try:
        task = storage.get_task(task_id)
    except KeyError:
        raise HTTPException(404, f"task {task_id!r} not found")

    storage.archive_completed(task_id)

    try:
        battle = state.get_battle(task["battle_id"])
    except KeyError:
        raise HTTPException(404, f"battle {task['battle_id']!r} not found")

    updated_battle = apply_damage(battle, dealt_by=task["player_id"], damage_rating=task["damage_rating"])
    state.update_battle(updated_battle)

    return TaskCompleteOut(
        task_id=task_id,
        damage_rating=task["damage_rating"],
        battle=_battle_status(updated_battle, time.time()),
    )
