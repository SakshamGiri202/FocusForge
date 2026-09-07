from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

def test_create_and_join_duel():
    # 1. Create duel
    res = client.post("/api/duels", json={
        "title": "Build PvP Engine",
        "description": "Duel backend route implementation",
        "difficulty": "medium",
        "sharedBudgetMinutes": 20,
        "protagonist": "Valiant Hero",
    })
    assert res.status_code == 201
    data = res.json()
    assert "match" in data
    assert "session" in data
    match = data["match"]
    join_code = match["joinCode"]
    match_id = match["matchId"]
    assert match["status"] == "awaiting"

    # 2. Get duel
    res_get = client.get(f"/api/duels/{match_id}")
    assert res_get.status_code == 200
    assert res_get.json()["matchId"] == match_id

    # 3. Join duel
    res_join = client.post(f"/api/duels/{join_code}/join", json={
        "title": "Counter Attack",
        "description": "Answering summons",
        "protagonist": "Fierce Rival",
    })
    assert res_join.status_code == 200
    joined = res_join.json()["match"]
    assert joined["status"] == "active"
    assert joined["sideB"]["heroName"] == "Fierce Rival"


def test_striking_inside_a_duel_damages_the_opponent_not_self():
    from api.main import app
    client_ = TestClient(app)

    created = client_.post(
        "/api/duels",
        json={"protagonist": "Summoner", "task": "Duel strike test task", "timeAvailable": "30 minutes"},
    ).json()
    match_id = created["match"]["matchId"]
    join_code = created["match"]["joinCode"]
    session_a = created["session"]

    joined = client_.post(
        f"/api/duels/{join_code}/join",
        json={"protagonist": "Rival", "task": "Rival's task", "timeAvailable": "30 minutes"},
    ).json()
    session_b = joined["session"]

    quest = session_a["quests"][0]
    resp = client_.patch(f"/api/chapters/{session_a['sessionId']}/quests/{quest['id']}").json()

    assert resp["goblin"] is None
    assert resp["state"]["status"] == "battle"  # never chapterEnd/goblin from local boss math
    assert "match" in resp
    assert resp["match"]["damageDealtA"] == quest["damage"]  # A's strike hurts B
    assert resp["match"]["damageDealtB"] == 0
    assert resp["match"]["hpB"] < 100
    assert resp["match"]["hpA"] == 100

    match_snapshot = client_.get(f"/api/duels/{match_id}").json()
    assert match_snapshot["damageDealtA"] == quest["damage"]
