"""Routes for CONTRACT.md v2 (the "living novel" UI): chapters, quests,
side-quests, shrink, reconjure, journal. Thin glue only -- state
transitions live in game_engine/story.py, LLM calls in
story_generator.py, persistence behind storage_interface.py.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException

from api.auth import get_current_user_id
from api.dependencies import get_state, get_storage, get_story_generator
from api.state import AppState
from game_engine.story import (
    apply_strike,
    build_journal_entry,
    build_quests,
    complete_detour,
    estimate_quest_weight,
    new_session,
    resolve_interlude,
    shrink_quest,
)
from game_engine.story import reconjure as reconjure_session
from storage_interface import TaskStorage
from story_generator import StoryGenerator

router = APIRouter(prefix="/api")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _error(code: str, message: str, status: int) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": {"code": code, "message": message}})


def _estimate_quest_weights(storage: TaskStorage, quests: list[dict]) -> list[float]:
    weights = []
    for q in quests:
        similar = storage.find_similar_tasks(q["action"], q.get("narrative", ""), limit=5)
        weights.append(estimate_quest_weight(q.get("difficulty", "medium"), similar))
    return weights


def _archive_quest_for_similarity(storage: TaskStorage, quest: dict) -> None:
    # Feeds this quest into the same pool future damage estimates search
    # against -- this is what makes the vector DB load-bearing rather
    # than decorative storage.
    task_id = storage.save_task(
        {"title": quest["action"], "description": quest.get("narrative", ""), "damage_rating": quest["damage"]}
    )
    storage.archive_completed(task_id)


def _get_owned_session(storage: TaskStorage, session_id: str, user_id: str) -> dict:
    try:
        session = storage.get_chapter(session_id)
    except KeyError:
        raise _error("NOT_FOUND", "No such chapter", 404)
    if session.get("userId") != user_id:
        raise _error("NOT_FOUND", "No such chapter", 404)
    return session


@router.post("/chapters", status_code=201)
def create_chapter(
    body: dict = Body(...),
    user_id: str = Depends(get_current_user_id),
    storage: TaskStorage = Depends(get_storage),
    generator: StoryGenerator = Depends(get_story_generator),
) -> dict:
    protagonist = body["protagonist"]
    task = body["task"]
    time_available = body["timeAvailable"]

    seed = generator.generate_story_seed(protagonist, task, time_available)
    weights = _estimate_quest_weights(storage, seed["quests"])
    quests = build_quests(seed["quests"], weights)

    session = new_session(seed, quests, task, time_available, _now(), user_id)
    storage.save_chapter(session["sessionId"], session)
    return session


@router.get("/chapters/{session_id}")
def get_chapter_route(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    storage: TaskStorage = Depends(get_storage),
) -> dict:
    return _get_owned_session(storage, session_id, user_id)


@router.patch("/chapters/{session_id}/quests/{quest_id}")
def complete_quest_route(
    session_id: str,
    quest_id: str,
    user_id: str = Depends(get_current_user_id),
    storage: TaskStorage = Depends(get_storage),
    state: AppState = Depends(get_state),
) -> dict:
    session = _get_owned_session(storage, session_id, user_id)
    quest = next((q for q in session["quests"] if q["id"] == quest_id), None)
    if quest is None:
        raise _error("NOT_FOUND", "No such quest", 404)
    was_done = quest["done"]

    try:
        updated, goblin = apply_strike(session, quest_id, _now())
    except ValueError as e:
        raise _error("CONFLICT", str(e), 409)

    if not was_done:
        _archive_quest_for_similarity(storage, {**quest, "done": True, "damage": quest["damage"]})
    storage.save_chapter(session_id, updated)

    if updated["status"] == "chapterEnd" and session["status"] != "chapterEnd":
        entry = build_journal_entry(updated, _now())
        storage.save_journal(entry["journalId"], entry)
        state.add_journal_entry(user_id, entry["journalId"])

    return {"state": updated, "goblin": goblin}


@router.post("/chapters/{session_id}/side-quest")
def resolve_interlude_route(
    session_id: str,
    body: dict = Body(...),
    user_id: str = Depends(get_current_user_id),
    storage: TaskStorage = Depends(get_storage),
    generator: StoryGenerator = Depends(get_story_generator),
) -> dict:
    session = _get_owned_session(storage, session_id, user_id)
    choice = body["choice"]
    detour = generator.generate_detour(session) if choice == "sideQuest" else None
    try:
        updated = resolve_interlude(session, choice, _now(), detour=detour)
    except ValueError as e:
        raise _error("CONFLICT", str(e), 409)
    storage.save_chapter(session_id, updated)
    return updated


@router.post("/chapters/{session_id}/side-quest/{detour_id}/complete")
def complete_detour_route(
    session_id: str,
    detour_id: str,
    user_id: str = Depends(get_current_user_id),
    storage: TaskStorage = Depends(get_storage),
) -> dict:
    session = _get_owned_session(storage, session_id, user_id)
    if session["detour"] is None or session["detour"]["id"] != detour_id:
        raise _error("CONFLICT", "No such active detour", 409)
    updated = complete_detour(session, _now())
    storage.save_chapter(session_id, updated)
    return updated


@router.post("/chapters/{session_id}/quests/{quest_id}/shrink")
def shrink_quest_route(
    session_id: str,
    quest_id: str,
    user_id: str = Depends(get_current_user_id),
    storage: TaskStorage = Depends(get_storage),
) -> dict:
    session = _get_owned_session(storage, session_id, user_id)
    try:
        updated = shrink_quest(session, quest_id, _now())
    except ValueError as e:
        raise _error("CONFLICT", str(e), 409)
    storage.save_chapter(session_id, updated)
    return updated


@router.post("/chapters/{session_id}/reconjure")
def reconjure_route(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    storage: TaskStorage = Depends(get_storage),
    generator: StoryGenerator = Depends(get_story_generator),
) -> dict:
    session = _get_owned_session(storage, session_id, user_id)
    seed = generator.generate_story_seed(session["protagonist"]["name"], session["task"], session["timeAvailable"])
    weights = _estimate_quest_weights(storage, seed["quests"])
    quests = build_quests(seed["quests"], weights)
    updated = reconjure_session(session, seed, quests, _now())
    storage.save_chapter(session_id, updated)
    return updated


@router.get("/journal")
def list_journal_route(
    user_id: str = Depends(get_current_user_id),
    storage: TaskStorage = Depends(get_storage),
    state: AppState = Depends(get_state),
) -> list[dict]:
    entries = [storage.get_journal(jid) for jid in state.journal_ids_for_user(user_id)]
    entries.sort(key=lambda e: e["completedAt"], reverse=True)
    return entries
