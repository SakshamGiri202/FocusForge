import pytest

from game_engine.story import (
    apply_strike,
    build_journal_entry,
    build_quests,
    complete_detour,
    estimate_quest_weight,
    new_session,
    normalize_damages,
    reconjure,
    resolve_interlude,
    shrink_quest,
)

NOW = "2026-09-06T10:00:00Z"


def make_seed(num_quests=3):
    return {
        "chapter": {"number": 1, "title": "The Mountain", "epigraph": "epic line"},
        "setting": {"place": "desk", "timeOfDay": "10:30 AM", "mood": "grim"},
        "openingProse": "The hero stands before the mountain.",
        "boss": {"name": "The Task", "epithet": "Warden", "fightIntro": "taunt", "hp": 100},
        "quests": [
            {"id": f"q{i+1}", "emoji": "⚔️", "action": f"Do part {i+1}", "narrative": "narrative", "difficulty": "medium"}
            for i in range(num_quests)
        ],
        "protagonist": {"name": "Hero", "hearts": 3, "titles": []},
        "rewardLines": {
            "gate": "✧ The Gate Was Opened ✧",
            "onQuest": ["reward one", "reward two"],
            "onReturn": "✧ The Wanderer Returned ✧",
            "onShrink": "✧ Wisdom of the Small Blade ✧",
            "onBossDown": "The mountain crumbles.",
        },
    }


def make_session(num_quests=3, weights=None):
    seed = make_seed(num_quests)
    weights = weights or [16] * num_quests
    quests = build_quests(seed["quests"], weights)
    return new_session(seed, quests, "Finish the report", "90 minutes", NOW, "demo-hero")


# --- estimate_quest_weight / normalize_damages ---


def test_estimate_quest_weight_cold_start_uses_difficulty_default():
    assert estimate_quest_weight("epic", []) == 40


def test_estimate_quest_weight_uses_similarity_when_available():
    similar = [{"damage_rating": 50, "similarity": 1.0}]
    assert estimate_quest_weight("trivial", similar) == 50


def test_normalize_damages_sums_close_to_target():
    damages = normalize_damages([10, 20, 30])
    assert sum(damages) == pytest.approx(120, abs=5)


def test_normalize_damages_clamped_to_range():
    damages = normalize_damages([1, 1, 1000])
    assert all(5 <= d <= 60 for d in damages)


def test_normalize_damages_even_split_when_all_zero():
    damages = normalize_damages([0, 0, 0])
    assert damages == [40, 40, 40]


# --- new_session ---


def test_new_session_starts_at_full_hp_and_battle_status():
    session = make_session()
    assert session["bossHp"] == 100
    assert session["status"] == "battle"
    assert session["strikes"] == 0
    assert session["goblinSeen"] is False
    assert session["version"] == 1
    assert len(session["quests"]) == 3


# --- apply_strike ---


def test_first_strike_deals_damage_and_logs_gate_beat():
    session = make_session(weights=[16, 16, 16])
    updated, goblin = apply_strike(session, "q1", NOW)
    assert updated["strikes"] == 1
    assert updated["bossHp"] == 100 - updated["quests"][0]["damage"]
    assert updated["storyLog"][-1]["kind"] == "start"
    assert goblin is None


def test_second_strike_triggers_goblin_exactly_once():
    session = make_session()
    session, _ = apply_strike(session, "q1", NOW)
    session, goblin = apply_strike(session, "q2", NOW)
    assert goblin is not None
    assert session["status"] == "goblin"
    assert session["goblinSeen"] is True


def test_third_strike_does_not_retrigger_goblin():
    session = make_session()
    session, _ = apply_strike(session, "q1", NOW)
    session, _ = apply_strike(session, "q2", NOW)
    session, goblin = apply_strike(session, "q3", NOW)
    assert goblin is None


def test_striking_already_done_quest_is_a_noop():
    session = make_session()
    session, _ = apply_strike(session, "q1", NOW)
    strikes_before = session["strikes"]
    session_again, goblin = apply_strike(session, "q1", NOW)
    assert session_again["strikes"] == strikes_before
    assert goblin is None


def test_strike_on_missing_quest_raises():
    session = make_session()
    with pytest.raises(ValueError):
        apply_strike(session, "does-not-exist", NOW)


def test_boss_defeated_sets_chapter_end():
    session = make_session(num_quests=1, weights=[9999])  # normalized down, but damage clamps to 60 max per quest
    # boss has 100 hp and one quest capped at 60 -- won't finish in one hit at max clamp,
    # so drive it down with repeated large single-quest chapters instead.
    seed = make_seed(1)
    quests = build_quests(seed["quests"], [9999])
    session = new_session(seed, quests, "task", "1 hour", NOW, "demo-hero")
    session["bossHp"] = quests[0]["damage"]  # force a lethal hit regardless of clamp
    updated, _ = apply_strike(session, "q1", NOW)
    assert updated["status"] == "chapterEnd"
    assert updated["storyLog"][-1]["kind"] == "chapterEnd"


def test_original_session_not_mutated():
    session = make_session()
    apply_strike(session, "q1", NOW)
    assert session["strikes"] == 0
    assert session["quests"][0]["done"] is False


# --- resolve_interlude / complete_detour ---


def test_resolve_interlude_sidequest_sets_detour_status():
    session = make_session()
    detour = {"id": "sq_1", "title": "t", "prose": "p", "action": "a", "timeBoundary": "10m", "completedAt": None, "heroWise": False}
    updated = resolve_interlude(session, "sideQuest", NOW, detour=detour)
    assert updated["status"] == "detour"
    assert updated["detour"] == detour


def test_resolve_interlude_goblin_choice_returns_to_battle():
    session = make_session()
    updated = resolve_interlude(session, "goblin", NOW)
    assert updated["status"] == "battle"
    assert updated["goblinsFallen"] == 1


def test_resolve_interlude_sidequest_without_detour_raises():
    session = make_session()
    with pytest.raises(ValueError):
        resolve_interlude(session, "sideQuest", NOW, detour=None)


def test_complete_detour_clears_detour_and_returns_to_battle():
    session = make_session()
    detour = {"id": "sq_1", "title": "t", "prose": "p", "action": "a", "timeBoundary": "10m", "completedAt": None, "heroWise": False}
    session = resolve_interlude(session, "sideQuest", NOW, detour=detour)
    updated = complete_detour(session, NOW)
    assert updated["detour"] is None
    assert updated["status"] == "battle"
    assert updated["detoursTaken"] == 1


def test_complete_detour_without_active_detour_raises():
    session = make_session()
    with pytest.raises(ValueError):
        complete_detour(session, NOW)


# --- shrink_quest ---


def test_shrink_quest_preserves_total_damage():
    seed = make_seed(1)
    quests = build_quests(seed["quests"], [40])
    session = new_session(seed, quests, "task", "1h", NOW, "demo-hero")
    original_damage = session["quests"][0]["damage"]
    updated = shrink_quest(session, "q1", NOW)
    assert len(updated["quests"]) == 2
    assert sum(q["damage"] for q in updated["quests"]) == original_damage
    assert all(q["damage"] >= 5 for q in updated["quests"])


def test_shrink_too_small_quest_raises():
    seed = make_seed(1)
    quests = build_quests(seed["quests"], [1])  # normalizes/clamps to a small single-quest chapter
    session = new_session(seed, quests, "task", "1h", NOW, "demo-hero")
    session["quests"][0]["damage"] = 8  # below the 2x min-damage shrink threshold
    with pytest.raises(ValueError):
        shrink_quest(session, "q1", NOW)


def test_shrink_completed_quest_raises():
    session = make_session(num_quests=1, weights=[40])
    session, _ = apply_strike(session, "q1", NOW)
    with pytest.raises(ValueError):
        shrink_quest(session, "q1", NOW)


# --- reconjure ---


def test_reconjure_resets_battle_fields_but_keeps_session_id():
    session = make_session()
    session, _ = apply_strike(session, "q1", NOW)
    new_seed = make_seed(2)
    new_quests = build_quests(new_seed["quests"], [16, 16])
    updated = reconjure(session, new_seed, new_quests, NOW)
    assert updated["sessionId"] == session["sessionId"]
    assert updated["bossHp"] == 100
    assert updated["strikes"] == 0
    assert updated["status"] == "battle"
    assert len(updated["quests"]) == 2


# --- build_journal_entry ---


def test_build_journal_entry_requires_chapter_end():
    session = make_session()
    with pytest.raises(ValueError):
        build_journal_entry(session, NOW)


def test_build_journal_entry_from_completed_chapter():
    seed = make_seed(1)
    quests = build_quests(seed["quests"], [9999])
    session = new_session(seed, quests, "task", "1h", NOW, "demo-hero")
    session["bossHp"] = quests[0]["damage"]
    updated, _ = apply_strike(session, "q1", NOW)
    entry = build_journal_entry(updated, NOW)
    assert entry["sessionId"] == session["sessionId"]
    assert entry["strikesUsed"] == 1
    assert entry["bossName"] == session["boss"]["name"]
