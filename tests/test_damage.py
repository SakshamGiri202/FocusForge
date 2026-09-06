from game_engine.damage import DEFAULT_DAMAGE_RATING, infer_damage_rating


def test_cold_start_returns_default():
    assert infer_damage_rating([]) == DEFAULT_DAMAGE_RATING


def test_all_zero_similarity_returns_default():
    tasks = [{"damage_rating": 9, "similarity": 0.0}]
    assert infer_damage_rating(tasks) == DEFAULT_DAMAGE_RATING


def test_single_match_uses_its_rating():
    tasks = [{"damage_rating": 7, "similarity": 0.8}]
    assert infer_damage_rating(tasks) == 7


def test_weighted_average_favors_higher_similarity():
    tasks = [
        {"damage_rating": 10, "similarity": 0.9},
        {"damage_rating": 2, "similarity": 0.1},
    ]
    rating = infer_damage_rating(tasks)
    assert rating == (10 * 0.9 + 2 * 0.1) / (0.9 + 0.1)
    assert rating > 8  # closer to the more-similar task


def test_custom_default_is_respected():
    assert infer_damage_rating([], default=3.5) == 3.5
