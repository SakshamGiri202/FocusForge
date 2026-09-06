"""Pure state machine for CONTRACT.md v2 (the "living novel" chapter/
quest/goblin/journal flow). Same rules as the rest of game_engine: plain
dict/data in, new dict out, no I/O, no FastAPI, no storage.

Damage is never decided by Gemini (CONTRACT.md 2.1.1). Gemini supplies a
`difficulty` tag per quest; estimate_quest_weight() turns that into a
number via similarity search against past completed quests (falling
back to the static DIFFICULTY_WEIGHTS table on cold start), and
normalize_damages() locks the whole chapter's damage to sum ~120,
clamped [5, 60]. That similarity-search step is what keeps Actian
VectorAI DB load-bearing instead of decorative storage.
"""

from __future__ import annotations

import copy
import uuid

from game_engine.damage import infer_damage_rating

DIFFICULTY_WEIGHTS = {"trivial": 6, "easy": 10, "medium": 16, "hard": 24, "epic": 40}
CHAPTER_DAMAGE_TARGET = 120
MIN_QUEST_DAMAGE = 5
MAX_QUEST_DAMAGE = 60
GOBLIN_AFTER_STRIKE = 2


def _beat_id() -> str:
    return f"bev_{uuid.uuid4().hex[:8]}"


def estimate_quest_weight(difficulty: str, similar_completed: list[dict]) -> float:
    default = DIFFICULTY_WEIGHTS.get(difficulty, DIFFICULTY_WEIGHTS["medium"])
    return infer_damage_rating(similar_completed, default=default)


def normalize_damages(
    weights: list[float],
    target_sum: float = CHAPTER_DAMAGE_TARGET,
    min_damage: int = MIN_QUEST_DAMAGE,
    max_damage: int = MAX_QUEST_DAMAGE,
) -> list[int]:
    if not weights:
        return []
    total = sum(weights)
    if total <= 0:
        even = target_sum / len(weights)
        return [int(min(max(round(even), min_damage), max_damage)) for _ in weights]
    scale = target_sum / total
    return [int(min(max(round(w * scale), min_damage), max_damage)) for w in weights]


def build_quests(raw_quests: list[dict], weights: list[float]) -> list[dict]:
    """raw_quests: Gemini's output (id/emoji/action/narrative/difficulty,
    no damage). Returns full Quest dicts per CONTRACT.md 2.1."""
    damages = normalize_damages(weights)
    quests = []
    for i, (raw, dmg) in enumerate(zip(raw_quests, damages)):
        quests.append(
            {
                "id": raw.get("id") or f"q{i + 1}",
                "emoji": raw.get("emoji", "⚔️"),
                "action": raw["action"],
                "narrative": raw.get("narrative", ""),
                "difficulty": raw["difficulty"],
                "damage": dmg,
                "done": False,
                "completedAt": None,
            }
        )
    return quests


def new_session(story_seed: dict, quests: list[dict], task: str, time_available: str, now_iso: str, user_id: str) -> dict:
    opening = story_seed.get("openingProse", "")
    return {
        "sessionId": str(uuid.uuid4()),
        "userId": user_id,  # backend bookkeeping; harmless extra field for the frontend's SessionState type
        "version": 1,
        "status": "battle",
        "createdAt": now_iso,
        "updatedAt": now_iso,
        "task": task,
        "timeAvailable": time_available,
        "bossHp": story_seed["boss"]["hp"],
        "hearts": story_seed["protagonist"].get("hearts", 3),
        "strikes": 0,
        "goblinSeen": False,
        "detour": None,
        "storyLog": [{"id": _beat_id(), "kind": "prose", "at": now_iso, "text": opening}],
        "goblinsFallen": 0,
        "detoursTaken": 0,
        "chapter": story_seed["chapter"],
        "setting": story_seed["setting"],
        "openingProse": opening,
        "boss": story_seed["boss"],
        "quests": quests,
        "protagonist": story_seed["protagonist"],
        "rewardLines": story_seed["rewardLines"],
    }


def apply_strike(session: dict, quest_id: str, now_iso: str) -> tuple[dict, dict | None]:
    """Returns (new_session, goblin_prompt_or_None). Idempotent: striking
    an already-done quest returns the session unchanged."""
    session = copy.deepcopy(session)
    quest = next((q for q in session["quests"] if q["id"] == quest_id), None)
    if quest is None:
        raise ValueError(f"no such quest {quest_id!r} in session {session['sessionId']!r}")
    if quest["done"]:
        return session, None

    quest["done"] = True
    quest["completedAt"] = now_iso
    session["strikes"] += 1
    session["bossHp"] = max(0, session["bossHp"] - quest["damage"])
    session["version"] += 1
    session["updatedAt"] = now_iso

    reward_lines = session["rewardLines"]
    if session["strikes"] == 1:
        kind, text = "start", reward_lines["gate"]
    else:
        on_quest = reward_lines.get("onQuest") or ["The monster appears slightly less terrifying."]
        reward = on_quest[(session["strikes"] - 1) % len(on_quest)]
        kind, text = "strike", f"⚔️ {quest['action']} — {reward}"
    session["storyLog"].append({"id": _beat_id(), "kind": kind, "at": now_iso, "text": text})

    goblin_prompt = None
    if session["bossHp"] <= 0:
        session["status"] = "chapterEnd"
        session["storyLog"].append(
            {"id": _beat_id(), "kind": "chapterEnd", "at": now_iso, "text": reward_lines["onBossDown"]}
        )
    elif session["strikes"] == GOBLIN_AFTER_STRIKE and not session["goblinSeen"]:
        session["status"] = "goblin"
        session["goblinSeen"] = True
        goblin_prompt = {
            "id": f"sq_{uuid.uuid4().hex[:8]}",
            "distraction": "Hero! Urgent news! We absolutely must reorganize the bookshelf at once!",
            "options": [
                {"value": "sideQuest", "label": "A · A legitimate side quest"},
                {"value": "goblin", "label": "B · A trick of the Goblin"},
            ],
        }

    return session, goblin_prompt


def resolve_interlude(session: dict, choice: str, now_iso: str, detour: dict | None = None) -> dict:
    session = copy.deepcopy(session)
    session["version"] += 1
    session["updatedAt"] = now_iso

    if choice == "sideQuest":
        if detour is None:
            raise ValueError("detour payload required when choice == 'sideQuest'")
        session["detour"] = detour
        session["status"] = "detour"
        session["storyLog"].append({"id": _beat_id(), "kind": "detour", "at": now_iso, "text": detour.get("prose", "")})
    elif choice == "goblin":
        session["status"] = "battle"
        session["goblinsFallen"] += 1
        session["storyLog"].append(
            {"id": _beat_id(), "kind": "return", "at": now_iso, "text": session["rewardLines"]["onReturn"]}
        )
    else:
        raise ValueError(f"invalid choice {choice!r}")

    return session


def complete_detour(session: dict, now_iso: str) -> dict:
    session = copy.deepcopy(session)
    if session["detour"] is None:
        raise ValueError("no active detour to complete")
    session["detour"]["completedAt"] = now_iso
    session["detour"] = None
    session["detoursTaken"] += 1
    session["status"] = "battle"
    session["version"] += 1
    session["updatedAt"] = now_iso
    session["storyLog"].append(
        {"id": _beat_id(), "kind": "return", "at": now_iso, "text": session["rewardLines"]["onReturn"]}
    )
    return session


def shrink_quest(session: dict, quest_id: str, now_iso: str) -> dict:
    session = copy.deepcopy(session)
    idx = next((i for i, q in enumerate(session["quests"]) if q["id"] == quest_id), None)
    if idx is None:
        raise ValueError(f"no such quest {quest_id!r}")
    quest = session["quests"][idx]
    if quest["done"]:
        raise ValueError("cannot shrink a completed quest")
    if quest["damage"] < 2 * MIN_QUEST_DAMAGE:
        raise ValueError("quest too small to shrink")

    d1 = max(MIN_QUEST_DAMAGE, round(quest["damage"] * 0.4))
    d2 = quest["damage"] - d1
    if d2 < MIN_QUEST_DAMAGE:
        d1, d2 = quest["damage"] - MIN_QUEST_DAMAGE, MIN_QUEST_DAMAGE

    split = [
        {**quest, "id": f"{quest_id}-b", "action": f"{quest['action']} (part 1)", "damage": d1},
        {**quest, "id": f"{quest_id}-c", "action": f"{quest['action']} (part 2)", "damage": d2},
    ]
    session["quests"][idx : idx + 1] = split
    session["version"] += 1
    session["updatedAt"] = now_iso
    session["storyLog"].append(
        {"id": _beat_id(), "kind": "shrink", "at": now_iso, "text": session["rewardLines"]["onShrink"]}
    )
    return session


def reconjure(session: dict, story_seed: dict, quests: list[dict], now_iso: str) -> dict:
    session = copy.deepcopy(session)
    opening = story_seed.get("openingProse", "")
    session.update(
        {
            "chapter": story_seed["chapter"],
            "setting": story_seed["setting"],
            "openingProse": opening,
            "boss": story_seed["boss"],
            "quests": quests,
            "protagonist": story_seed["protagonist"],
            "rewardLines": story_seed["rewardLines"],
            "bossHp": story_seed["boss"]["hp"],
            "hearts": story_seed["protagonist"].get("hearts", 3),
            "strikes": 0,
            "goblinSeen": False,
            "detour": None,
            "status": "battle",
            "goblinsFallen": 0,
            "detoursTaken": 0,
            "updatedAt": now_iso,
        }
    )
    session["version"] += 1
    session["storyLog"].append({"id": _beat_id(), "kind": "reconjure", "at": now_iso, "text": opening})
    return session


def build_journal_entry(session: dict, now_iso: str) -> dict:
    if session["status"] != "chapterEnd":
        raise ValueError("session has not reached chapterEnd")
    return {
        "journalId": str(uuid.uuid4()),
        "sessionId": session["sessionId"],
        "chapter": session["chapter"],
        "task": session["task"],
        "timeAvailable": session["timeAvailable"],
        "bossName": session["boss"]["name"],
        "strikesUsed": session["strikes"],
        "goblinsFallen": session["goblinsFallen"],
        "detoursTaken": session["detoursTaken"],
        "closingProse": session["rewardLines"]["onBossDown"],
        "createdAt": session["createdAt"],
        "completedAt": now_iso,
    }
