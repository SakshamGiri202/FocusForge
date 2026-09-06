"""End-to-end smoke tests through the FastAPI layer, using the in-memory
stub. These exercise the full request -> game_engine -> storage path
without needing the real VectorAI DB, per "smoke-test end-to-end every
~2 hours."
"""

from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def test_pve_battle_full_flow():
    battle = client.post(
        "/battles", json={"mode": "pve", "deadline_seconds": 1000, "player_a_id": "alice"}
    ).json()

    task = client.post(
        "/tasks",
        json={
            "title": "Write report",
            "description": "Q3 summary",
            "battle_id": battle["battle_id"],
            "player_id": "alice",
        },
    ).json()
    assert task["damage_rating"] > 0  # cold start -> default rating

    result = client.post(f"/tasks/{task['task_id']}/complete").json()
    assert result["battle"]["player_a"]["hp"] <= battle["deadline_seconds"]  # sane, non-crashing value

    hp = client.get("/players/alice/hp").json()
    assert hp["player_id"] == "alice"


def test_pvp_completing_a_task_damages_opponent():
    battle = client.post(
        "/battles",
        json={
            "mode": "pvp",
            "deadline_seconds": 1000,
            "player_a_id": "alice2",
            "player_b_id": "bob2",
        },
    ).json()

    task = client.post(
        "/tasks",
        json={
            "title": "Fix bug",
            "description": "auth flow",
            "battle_id": battle["battle_id"],
            "player_id": "alice2",
        },
    ).json()

    before = client.get(f"/battles/{battle['battle_id']}/status").json()
    client.post(f"/tasks/{task['task_id']}/complete")
    after = client.get(f"/battles/{battle['battle_id']}/status").json()

    assert after["player_b"]["hp"] < before["player_b"]["hp"]


def test_create_task_for_missing_battle_returns_404():
    response = client.post(
        "/tasks",
        json={"title": "x", "description": "y", "battle_id": "nope", "player_id": "alice"},
    )
    assert response.status_code == 404


def test_complete_missing_task_returns_404():
    response = client.post("/tasks/nope/complete")
    assert response.status_code == 404


def test_pvp_battle_missing_player_b_returns_422():
    response = client.post(
        "/battles", json={"mode": "pvp", "deadline_seconds": 1000, "player_a_id": "solo"}
    )
    assert response.status_code == 422
