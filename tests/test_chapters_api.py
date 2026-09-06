"""End-to-end smoke tests for CONTRACT.md v2's chapter/quest/journal
flow, through the FastAPI layer with the stub storage + stub story
generator (no network, no real DB). Deep game-logic edge cases are
already covered in tests/test_story.py -- these just verify the routes
wire storage + game_engine + story_generator together correctly, per
CONTRACT.md's golden demo path.
"""

from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def create_chapter(task="Write the report", protagonist="Hero", time_available="90 minutes"):
    resp = client.post("/api/chapters", json={"protagonist": protagonist, "task": task, "timeAvailable": time_available})
    assert resp.status_code == 201
    return resp.json()


def test_create_chapter_returns_full_battle_ready_state():
    chapter = create_chapter()
    assert chapter["bossHp"] == 100
    assert chapter["status"] == "battle"
    assert chapter["strikes"] == 0
    assert len(chapter["quests"]) >= 1
    assert all(q["done"] is False and 5 <= q["damage"] <= 60 for q in chapter["quests"])


def test_get_chapter_round_trip():
    chapter = create_chapter()
    resp = client.get(f"/api/chapters/{chapter['sessionId']}")
    assert resp.status_code == 200
    assert resp.json()["sessionId"] == chapter["sessionId"]


def test_get_missing_chapter_returns_contract_error_envelope():
    resp = client.get("/api/chapters/does-not-exist")
    assert resp.status_code == 404
    assert resp.json() == {"error": {"code": "NOT_FOUND", "message": "No such chapter"}}


def test_golden_demo_path_completes_chapter_and_writes_journal():
    chapter = create_chapter(task="Golden path task")
    session_id = chapter["sessionId"]

    goblin_seen = False
    final_state = None
    for quest in chapter["quests"]:
        resp = client.patch(f"/api/chapters/{session_id}/quests/{quest['id']}")
        assert resp.status_code == 200
        body = resp.json()
        if body["goblin"] is not None:
            goblin_seen = True
        final_state = body["state"]
        if final_state["status"] == "chapterEnd":
            break

    assert final_state["status"] == "chapterEnd"
    assert goblin_seen or final_state["strikes"] <= 2  # boss could die before strike 2 in rare cases

    journal = client.get("/api/journal").json()
    assert any(entry["sessionId"] == session_id for entry in journal)


def test_completing_missing_quest_returns_404():
    chapter = create_chapter()
    resp = client.patch(f"/api/chapters/{chapter['sessionId']}/quests/does-not-exist")
    assert resp.status_code == 404


def test_side_quest_choice_sets_detour_then_completes_back_to_battle():
    chapter = create_chapter(task="Side quest flow task")
    session_id = chapter["sessionId"]

    # strike until the goblin interrupts (strike #2), or stop early if the
    # chapter ends first (edge case covered by the golden-path test).
    state = chapter
    for quest in chapter["quests"]:
        resp = client.patch(f"/api/chapters/{session_id}/quests/{quest['id']}")
        body = resp.json()
        state = body["state"]
        if body["goblin"] is not None or state["status"] == "chapterEnd":
            break

    if state["status"] != "goblin":
        return  # chapter ended before the goblin could fire -- nothing left to test here

    resp = client.post(f"/api/chapters/{session_id}/side-quest", json={"choice": "sideQuest", "interludeId": "sq_1"})
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["status"] == "detour"
    assert updated["detour"] is not None

    detour_id = updated["detour"]["id"]
    resp = client.post(f"/api/chapters/{session_id}/side-quest/{detour_id}/complete")
    assert resp.status_code == 200
    assert resp.json()["status"] == "battle"
    assert resp.json()["detour"] is None


def test_side_quest_goblin_choice_returns_to_battle_immediately():
    chapter = create_chapter(task="Goblin choice flow task")
    session_id = chapter["sessionId"]

    state = chapter
    for quest in chapter["quests"]:
        resp = client.patch(f"/api/chapters/{session_id}/quests/{quest['id']}")
        body = resp.json()
        state = body["state"]
        if body["goblin"] is not None or state["status"] == "chapterEnd":
            break

    if state["status"] != "goblin":
        return

    resp = client.post(f"/api/chapters/{session_id}/side-quest", json={"choice": "goblin", "interludeId": "sq_1"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "battle"
    assert resp.json()["goblinsFallen"] == 1


def test_shrink_preserves_total_damage():
    chapter = create_chapter(task="Shrink flow task")
    biggest = max(chapter["quests"], key=lambda q: q["damage"])
    resp = client.post(f"/api/chapters/{chapter['sessionId']}/quests/{biggest['id']}/shrink")
    if biggest["damage"] < 10:
        assert resp.status_code == 409
        return
    assert resp.status_code == 200
    new_quests = resp.json()["quests"]
    assert sum(q["damage"] for q in new_quests) == sum(q["damage"] for q in chapter["quests"])


def test_reconjure_keeps_session_id_and_resets_battle():
    chapter = create_chapter(task="Reconjure flow task")
    resp = client.post(f"/api/chapters/{chapter['sessionId']}/reconjure")
    assert resp.status_code == 200
    reconjured = resp.json()
    assert reconjured["sessionId"] == chapter["sessionId"]
    assert reconjured["bossHp"] == 100
    assert reconjured["status"] == "battle"
    assert reconjured["strikes"] == 0
