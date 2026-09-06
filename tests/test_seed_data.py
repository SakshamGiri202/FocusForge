from storage_stub import InMemoryTaskStorage

from seed_data import COMPLETED_TASKS, seed


def test_all_entries_have_required_shape():
    for task in COMPLETED_TASKS:
        assert isinstance(task["title"], str) and task["title"]
        assert isinstance(task["description"], str) and task["description"]
        assert isinstance(task["damage_rating"], (int, float))
        assert 1 <= task["damage_rating"] <= 10


def test_covers_a_spread_of_damage_tiers():
    ratings = {t["damage_rating"] for t in COMPLETED_TASKS}
    assert min(ratings) <= 2
    assert max(ratings) >= 9


def test_seed_populates_storage():
    storage = InMemoryTaskStorage()
    count = seed(storage)
    assert count == len(COMPLETED_TASKS)
    assert storage.count_vectors() == len(COMPLETED_TASKS)


def test_seed_is_a_noop_when_storage_already_has_vectors():
    storage = InMemoryTaskStorage()
    seed(storage)
    second_count = seed(storage)
    assert second_count == 0
    assert storage.count_vectors() == len(COMPLETED_TASKS)


def test_seed_force_reseeds_when_only_if_empty_false():
    storage = InMemoryTaskStorage()
    seed(storage)
    count = seed(storage, only_if_empty=False)
    assert count == len(COMPLETED_TASKS)
    assert storage.count_vectors() == 2 * len(COMPLETED_TASKS)


def test_a_new_bug_task_matches_coding_cluster_not_default():
    from game_engine.damage import DEFAULT_DAMAGE_RATING, infer_damage_rating

    storage = InMemoryTaskStorage()
    seed(storage)
    similar = storage.find_similar_tasks("Fix login bug", "Debug the login page rendering issue", limit=5)
    rating = infer_damage_rating(similar)
    assert similar  # cold start no longer applies once seeded
    assert rating != DEFAULT_DAMAGE_RATING
