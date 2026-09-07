"""FastAPI router for /api/duels (CONTRACT.md v3): create, join by code,
snapshot, and a live SSE event stream. Mirrors lib/localEngine.ts's
evalMatch()/duelDrain() exactly so mock mode and the real backend never
disagree on HP.

Accepts both body shapes seen across the hand-off docs: the documented
CreateChapterInput shape ({protagonist, task, timeAvailable}, matching
solo /api/chapters) and the older {title, description, difficulty,
sharedBudgetMinutes} shape from the first duel draft/test -- normalized
to the same internal fields so neither breaks.

In-memory only (module-level dicts), same as api/state.py's battle
registry -- fine for a one-day demo, resets on restart.
"""

from __future__ import annotations

import asyncio
import json
import random
import string
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from api.auth import get_current_user_id
from api.dependencies import get_storage, get_story_generator
from game_engine.story import build_quests, estimate_quest_weight, new_session
from storage_interface import TaskStorage
from story_generator import StoryGenerator

router = APIRouter(prefix="/api/duels")

DUEL_DRAIN_TICK_MS = 40_000  # matches lib/contract.ts's DUEL_DRAIN_TICK_MS exactly

_JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # matches lib/localEngine.ts's genJoinCode

_TIME_CHOICE_SECONDS = {  # mirrors lib/time.ts's timeChoiceToSeconds exactly
    "15 minutes": 15 * 60,
    "30 minutes": 30 * 60,
    "45 minutes": 45 * 60,
    "1 hour": 60 * 60,
    "2 hours": 2 * 60 * 60,
    "3 hours": 3 * 60 * 60,
    "An evening": 2 * 60 * 60,
    "A full day": 24 * 60 * 60,
}

_MATCHES: dict[str, dict[str, Any]] = {}
_JOIN_CODES: dict[str, str] = {}
_SESSION_TO_MATCH: dict[str, str] = {}  # session_id -> match_id, for chapters.py's strike hook


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(s: str) -> float:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()


def _gen_join_code() -> str:
    return "".join(random.choices(_JOIN_CODE_ALPHABET, k=6))


def _duration_seconds(payload: dict) -> int:
    if payload.get("timeAvailable") in _TIME_CHOICE_SECONDS:
        return _TIME_CHOICE_SECONDS[payload["timeAvailable"]]
    minutes = payload.get("sharedBudgetMinutes") or payload.get("deadlineMinutes")
    if minutes:
        return int(minutes) * 60
    return _TIME_CHOICE_SECONDS["1 hour"]


def _task_text(payload: dict) -> str:
    task = payload.get("task") or payload.get("title") or "Untitled Task"
    description = payload.get("description")
    return f"{task}: {description}" if description else task


def _build_duel_session(
    storage: TaskStorage, generator: StoryGenerator, payload: dict, user_id: str, time_available: str
) -> dict:
    protagonist = payload.get("protagonist") or "Hero"
    task = _task_text(payload)
    seed = generator.generate_story_seed(protagonist, task, time_available)
    weights = [
        estimate_quest_weight(q.get("difficulty", "medium"), storage.find_similar_tasks(q["action"], q.get("narrative", ""), limit=5))
        for q in seed["quests"]
    ]
    quests = build_quests(seed["quests"], weights)
    return new_session(seed, quests, task, time_available, _now_iso(), user_id)


def _duel_side(session: dict, hero_name: str) -> dict:
    return {
        "sessionId": session["sessionId"],
        "heroName": hero_name,
        "task": session["task"],
        "timeAvailable": session["timeAvailable"],
        "strikes": 0,
    }


def _eval_match(match: dict[str, Any]) -> dict[str, Any]:
    """Mirrors lib/localEngine.ts's evalMatch() exactly: derive HP from
    elapsed time, then resolve kill/time end conditions (kill checked
    before time, matching the frontend's branch order)."""
    now_ms = datetime.now(timezone.utc).timestamp() * 1000

    if not match["startedAt"]:
        match["hpA"], match["hpB"] = 100, 100
        return match

    start_ms = _parse_iso(match["startedAt"]) * 1000
    ends_ms = _parse_iso(match["endsAt"]) * 1000 if match["endsAt"] else float("inf")
    elapsed_ms = max(0.0, min(now_ms, ends_ms) - start_ms)
    drain = int(elapsed_ms // DUEL_DRAIN_TICK_MS)

    hpA = max(0, 100 - drain - match["damageDealtB"])
    hpB = max(0, 100 - drain - match["damageDealtA"])
    match["hpA"], match["hpB"] = hpA, hpB

    if match["status"] == "active":
        if hpA <= 0 or hpB <= 0:
            match["status"] = "over"
            match["endReason"] = "kill"
            match["winner"] = "draw" if hpA == hpB else ("A" if hpA > hpB else "B")
        elif match["endsAt"] and now_ms >= ends_ms:
            match["status"] = "over"
            match["endReason"] = "time"
            match["winner"] = "draw" if hpA == hpB else ("A" if hpA > hpB else "B")

    return match


def get_match_for_session(session_id: str) -> dict | None:
    """Used by api/chapters.py's strike route to detect a duel-bound
    session -- the goblin never fires and damage hits the opponent
    instead of the local boss."""
    match_id = _SESSION_TO_MATCH.get(session_id)
    return _eval_match(_MATCHES[match_id]) if match_id else None


def record_duel_strike(session_id: str, damage: int) -> dict | None:
    match = get_match_for_session(session_id)
    if match is None or match["status"] != "active":
        return match

    if match["sideA"]["sessionId"] == session_id:
        side, dealt_key, hero = "A", "damageDealtA", match["sideA"]["heroName"]
        match["sideA"]["strikes"] += 1
    else:
        side, dealt_key, hero = "B", "damageDealtB", match["sideB"]["heroName"]
        match["sideB"]["strikes"] += 1

    match[dealt_key] += damage
    match["log"].append(
        {"id": f"beat_{uuid.uuid4().hex[:6]}", "kind": "strike", "side": side, "text": f"{hero} lands a blow for {damage}.", "at": _now_iso()}
    )
    return _eval_match(match)


@router.post("", status_code=201)
def create_duel(
    payload: dict = Body(...),
    user_id: str = Depends(get_current_user_id),
    storage: TaskStorage = Depends(get_storage),
    generator: StoryGenerator = Depends(get_story_generator),
) -> dict:
    duration = _duration_seconds(payload)
    time_available = payload.get("timeAvailable") or f"{duration // 60} minutes"
    session = _build_duel_session(storage, generator, payload, user_id, time_available)
    storage.save_chapter(session["sessionId"], session)

    match_id = f"match_{uuid.uuid4().hex[:10]}"
    join_code = _gen_join_code()
    protagonist = payload.get("protagonist") or "Hero"

    match = {
        "matchId": match_id,
        "joinCode": join_code,
        "status": "awaiting",
        "winner": None,
        "endReason": None,
        "durationSeconds": duration,
        "startedAt": None,
        "endsAt": None,
        "sideA": _duel_side(session, protagonist),
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
                "at": _now_iso(),
            }
        ],
    }
    _MATCHES[match_id] = match
    _JOIN_CODES[join_code] = match_id
    _SESSION_TO_MATCH[session["sessionId"]] = match_id

    return {"match": match, "session": session}


@router.post("/{join_code}/join")
def join_duel(
    join_code: str,
    payload: dict = Body(...),
    user_id: str = Depends(get_current_user_id),
    storage: TaskStorage = Depends(get_storage),
    generator: StoryGenerator = Depends(get_story_generator),
) -> dict:
    match_id = _JOIN_CODES.get(join_code.upper())
    if not match_id:
        raise HTTPException(404, detail={"error": {"code": "NOT_FOUND", "message": f"No summon bears the code '{join_code}'."}})

    match = _MATCHES[match_id]
    if match["status"] == "active":
        raise HTTPException(409, detail={"error": {"code": "CONFLICT", "message": "That duel has already begun."}})
    if match["status"] == "over":
        raise HTTPException(409, detail={"error": {"code": "CONFLICT", "message": "That duel has already decided."}})

    time_available = match["sideA"]["timeAvailable"]
    session = _build_duel_session(storage, generator, payload, user_id, time_available)
    storage.save_chapter(session["sessionId"], session)

    protagonist = payload.get("protagonist") or "Rival"
    start_iso = _now_iso()
    ends_iso = datetime.fromtimestamp(_parse_iso(start_iso) + match["durationSeconds"], timezone.utc).isoformat()

    match["sideB"] = _duel_side(session, protagonist)
    match["status"] = "active"
    match["startedAt"] = start_iso
    match["endsAt"] = ends_iso
    match["log"].append(
        {
            "id": f"beat_{uuid.uuid4().hex[:6]}",
            "kind": "join",
            "side": "B",
            "text": f"{protagonist} answers the summons. The hourglass turns — the duel is sealed.",
            "at": start_iso,
        }
    )
    _SESSION_TO_MATCH[session["sessionId"]] = match_id

    return {"match": _eval_match(match), "session": session}


@router.get("/{match_id}")
def get_duel(match_id: str) -> dict:
    match = _MATCHES.get(match_id)
    if not match:
        raise HTTPException(404, detail={"error": {"code": "NOT_FOUND", "message": "No such duel."}})
    return _eval_match(match)


@router.get("/{match_id}/events")
async def subscribe_duel(match_id: str, request: Request) -> StreamingResponse:
    if match_id not in _MATCHES:
        raise HTTPException(404, detail={"error": {"code": "NOT_FOUND", "message": "No such duel."}})

    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            evaled = _eval_match(_MATCHES[match_id])
            yield f"data: {json.dumps({'match': evaled})}\n\n"
            if evaled["status"] == "over":
                break
            await asyncio.sleep(1.0)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
