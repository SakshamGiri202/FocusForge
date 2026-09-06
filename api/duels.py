"""FastAPI router for /api/duels endpoints (CONTRACT.md v3).
Supports duel creation, joining by code, match status query, and live SSE event streams.
"""

from __future__ import annotations

import asyncio
import random
import string
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from api.auth import get_current_user_id
from api.dependencies import get_storage, get_story_generator
from game_engine.story import (
    estimate_quest_weight,
    new_session,
)
from storage_interface import TaskStorage
from story_generator import StoryGenerator

router = APIRouter(prefix="/api/duels")

# In-memory storage for active duels (persisted in-process for speed/real-time SSE)
_DUELS: dict[str, dict[str, Any]] = {}
_JOIN_CODES: dict[str, str] = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gen_join_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


def _estimate_quest_weights(storage: TaskStorage, quests: list[dict]) -> list[float]:
    weights = []
    for q in quests:
        similar = storage.find_similar_tasks(q["action"], q.get("narrative", ""), limit=5)
        weights.append(estimate_quest_weight(q.get("difficulty", "medium"), similar))
    return weights


def _calc_hp(match: dict[str, Any]) -> tuple[number, number]:
    if match["status"] == "awaiting":
        return 100, 100

    now_ts = datetime.now(timezone.utc).timestamp()
    if not match.get("startedAt"):
        return 100, 100

    start_ts = datetime.fromisoformat(match["startedAt"].replace("Z", "+00:00")).timestamp()
    duration = match.get("durationSeconds", 1500)
    elapsed = max(0.0, now_ts - start_ts)
    drain = min(100.0, (elapsed / duration) * 100.0)

    hpA = max(0, int(round(100 - drain - match.get("damageDealtB", 0))))
    hpB = max(0, int(round(100 - drain - match.get("damageDealtA", 0))))

    # Check match evaluation
    if match["status"] == "active":
        if hpA <= 0 or hpB <= 0 or elapsed >= duration:
            match["status"] = "resolved"
            if hpA > hpB:
                match["winner"] = "A"
                match["endReason"] = "kill" if hpB <= 0 else "time"
            elif hpB > hpA:
                match["winner"] = "B"
                match["endReason"] = "kill" if hpA <= 0 else "time"
            else:
                match["winner"] = "draw"
                match["endReason"] = "draw"

    return hpA, hpB


def _eval_match(match: dict[str, Any]) -> dict[str, Any]:
    hpA, hpB = _calc_hp(match)
    match["hpA"] = hpA
    match["hpB"] = hpB
    return match


@router.post("", status_code=201)
def create_duel(
    payload: dict = Body(...),
    user_id: str = Depends(get_current_user_id),
    storage: TaskStorage = Depends(get_storage),
    generator: StoryGenerator = Depends(get_story_generator),
):
    title = payload.get("title") or payload.get("task") or "Untitled Task"
    description = payload.get("description") or ""
    difficulty = payload.get("difficulty") or "medium"
    deadline_min = payload.get("sharedBudgetMinutes") or payload.get("deadlineMinutes") or 25
    protagonist = payload.get("protagonist") or "Hero"

    generated = generator.generate_chapter(title=title, description=description, difficulty=difficulty)
    weights = _estimate_quest_weights(storage, generated["quests"])
    session = new_session(
        user_id=user_id,
        input_data={
            "title": title,
            "description": description,
            "difficulty": difficulty,
            "deadlineMinutes": deadline_min,
            "protagonist": protagonist,
            "mode": "duel",
        },
        generated=generated,
        quest_weights=weights,
    )
    storage.save_chapter(session["sessionId"], session)

    match_id = f"match_{uuid.uuid4().hex[:10]}"
    join_code = _gen_join_code()

    match_state = {
        "matchId": match_id,
        "joinCode": join_code,
        "status": "awaiting",
        "winner": None,
        "endReason": None,
        "durationSeconds": deadline_min * 60,
        "startedAt": None,
        "endsAt": None,
        "sideA": {
            "sessionId": session["sessionId"],
            "heroName": protagonist,
            "task": title,
            "timeAvailable": f"{deadline_min} min",
            "strikes": 0,
        },
        "sideB": None,
        "hpA": 100,
        "hpB": 100,
        "damageDealtA": 0,
        "damageDealtB": 0,
        "log": [
            {
                "id": f"beat_{uuid.uuid4().hex[:6]}",
                "kind": "start",
                "side": "A",
                "text": f"{protagonist} stands before their work, demanding a rival be summoned.",
                "at": _now(),
            }
        ],
    }

    _DUELS[match_id] = match_state
    _JOIN_CODES[join_code] = match_id

    return {"match": match_state, "session": session}


@router.post("/{join_code}/join")
def join_duel(
    join_code: str,
    payload: dict = Body(...),
    user_id: str = Depends(get_current_user_id),
    storage: TaskStorage = Depends(get_storage),
    generator: StoryGenerator = Depends(get_story_generator),
):
    match_id = _JOIN_CODES.get(join_code.upper()) or _JOIN_CODES.get(join_code)
    if not match_id or match_id not in _DUELS:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": f"No summon bears the code '{join_code}'."}})

    match = _DUELS[match_id]
    if match["status"] != "awaiting":
        raise HTTPException(status_code=409, detail={"error": {"code": "CONFLICT", "message": "That duel has already begun or finished."}})

    title = payload.get("title") or payload.get("task") or "Untitled Task"
    description = payload.get("description") or ""
    difficulty = payload.get("difficulty") or "medium"
    deadline_min = int(match["durationSeconds"] / 60)
    protagonist = payload.get("protagonist") or "Rival"

    generated = generator.generate_chapter(title=title, description=description, difficulty=difficulty)
    weights = _estimate_quest_weights(storage, generated["quests"])
    session = new_session(
        user_id=user_id,
        input_data={
            "title": title,
            "description": description,
            "difficulty": difficulty,
            "deadlineMinutes": deadline_min,
            "protagonist": protagonist,
            "mode": "duel",
        },
        generated=generated,
        quest_weights=weights,
    )
    storage.save_chapter(session["sessionId"], session)

    start_iso = _now()
    ends_iso = datetime.fromtimestamp(
        datetime.fromisoformat(start_iso.replace("Z", "+00:00")).timestamp() + match["durationSeconds"],
        timezone.utc,
    ).isoformat()

    match["sideB"] = {
        "sessionId": session["sessionId"],
        "heroName": protagonist,
        "task": title,
        "timeAvailable": f"{deadline_min} min",
        "strikes": 0,
    }
    match["status"] = "active"
    match["startedAt"] = start_iso
    match["endsAt"] = ends_iso
    match["log"].append({
        "id": f"beat_{uuid.uuid4().hex[:6]}",
        "kind": "join",
        "side": "B",
        "text": f"{protagonist} answers the summons. The hourglass turns — the duel is sealed.",
        "at": start_iso,
    })

    evaled = _eval_match(match)
    return {"match": evaled, "session": session}


@router.get("/{match_id}")
def get_duel(match_id: str):
    match = _DUELS.get(match_id)
    if not match:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "No such duel."}})
    return _eval_match(match)


@router.get("/{match_id}/events")
async def subscribe_duel(match_id: str, request: Request):
    match = _DUELS.get(match_id)
    if not match:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "No such duel."}})

    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            evaled = _eval_match(match)
            import json
            yield f"data: {json.dumps({'match': evaled})}\n\n"
            if evaled["status"] == "resolved":
                break
            await asyncio.sleep(1.0)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
