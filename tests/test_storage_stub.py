import pytest

from storage_interface import TaskStorage
from storage_stub import InMemoryTaskStorage


def make_storage() -> InMemoryTaskStorage:
    return InMemoryTaskStorage()


def test_satisfies_protocol():
    assert isinstance(make_storage(), TaskStorage)


def test_save_and_get_round_trip():
    storage = make_storage()
    task_id = storage.save_task({"title": "Write report", "description": "Q3 summary"})
    assert storage.get_task(task_id)["title"] == "Write report"


def test_get_missing_task_raises_keyerror():
    with pytest.raises(KeyError):
        make_storage().get_task("does-not-exist")


def test_find_similar_tasks_empty_on_cold_start():
    storage = make_storage()
    storage.save_task({"title": "Write report", "description": "Q3 summary"})
    assert storage.find_similar_tasks("Write report", "Q3 summary", limit=5) == []


def test_find_similar_tasks_only_considers_archived():
    storage = make_storage()
    task_id = storage.save_task({"title": "Write report", "description": "Q3 summary", "damage_rating": 4})
    storage.archive_completed(task_id)
    results = storage.find_similar_tasks("Write report", "Q3 summary", limit=5)
    assert len(results) == 1
    assert results[0]["task_id"] == task_id
    assert results[0]["damage_rating"] == 4
    assert results[0]["similarity"] > 0.9


def test_find_similar_tasks_respects_limit_and_ordering():
    storage = make_storage()
    for i in range(5):
        task_id = storage.save_task({"title": f"Task {i}", "description": "", "damage_rating": i})
        storage.archive_completed(task_id)
    results = storage.find_similar_tasks("Task 2", "", limit=2)
    assert len(results) == 2
    assert results[0]["similarity"] >= results[1]["similarity"]


def test_archive_completed_is_idempotent():
    storage = make_storage()
    task_id = storage.save_task({"title": "x", "description": "y"})
    storage.archive_completed(task_id)
    storage.archive_completed(task_id)  # should not raise
    assert storage.count_vectors() == 1


def test_archive_completed_missing_task_raises_keyerror():
    with pytest.raises(KeyError):
        make_storage().archive_completed("does-not-exist")


def test_count_vectors_reflects_only_archived():
    storage = make_storage()
    task_id = storage.save_task({"title": "x", "description": "y"})
    assert storage.count_vectors() == 0
    storage.archive_completed(task_id)
    assert storage.count_vectors() == 1
