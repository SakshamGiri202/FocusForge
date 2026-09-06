from __future__ import annotations

from pydantic import BaseModel

from game_engine.models import Mode


class TaskCreate(BaseModel):
    title: str
    description: str
    battle_id: str
    player_id: str


class TaskOut(BaseModel):
    task_id: str
    title: str
    description: str
    damage_rating: float
    battle_id: str
    player_id: str


class PlayerHpOut(BaseModel):
    player_id: str
    hp: float
    max_hp: float


class BattleCreate(BaseModel):
    mode: Mode
    deadline_seconds: float
    player_a_id: str
    player_a_max_hp: float = 100.0
    player_b_id: str | None = None
    player_b_max_hp: float = 100.0


class BattleOut(BaseModel):
    battle_id: str
    mode: Mode
    deadline_seconds: float
    started_at: float


class BattleStatusOut(BaseModel):
    battle_id: str
    mode: Mode
    elapsed_seconds: float
    deadline_seconds: float
    player_a: PlayerHpOut
    player_b: PlayerHpOut | None = None


class TaskCompleteOut(BaseModel):
    task_id: str
    damage_rating: float
    battle: BattleStatusOut
