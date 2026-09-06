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
