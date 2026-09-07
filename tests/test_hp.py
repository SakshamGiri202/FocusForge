import pytest

from game_engine.hp import compute_hp


def test_full_hp_at_start():
    assert compute_hp(max_hp=100, elapsed_seconds=0, deadline_seconds=100) == 100


def test_zero_hp_at_deadline_with_no_damage_dealt():
    assert compute_hp(max_hp=100, elapsed_seconds=100, deadline_seconds=100) == 0


def test_half_drained_halfway_to_deadline():
    assert compute_hp(max_hp=100, elapsed_seconds=50, deadline_seconds=100) == 50


def test_damage_dealt_by_you_offsets_drain():
    hp = compute_hp(max_hp=100, elapsed_seconds=50, deadline_seconds=100, damage_dealt_by_you=20)
    assert hp == 70


def test_damage_from_opponent_reduces_hp():
    hp = compute_hp(max_hp=100, elapsed_seconds=0, deadline_seconds=100, damage_dealt_by_opponent=30)
    assert hp == 70


def test_clamped_to_zero_when_overdrained():
    hp = compute_hp(max_hp=100, elapsed_seconds=100, deadline_seconds=100, damage_dealt_by_opponent=50)
    assert hp == 0


def test_clamped_to_max_hp_when_overhealed():
    hp = compute_hp(max_hp=100, elapsed_seconds=0, deadline_seconds=100, damage_dealt_by_you=999)
    assert hp == 100


def test_elapsed_past_deadline_does_not_go_negative_before_damage():
    hp = compute_hp(max_hp=100, elapsed_seconds=200, deadline_seconds=100, damage_dealt_by_you=10)
    assert hp == 10  # drain caps at max_hp, not > max_hp


@pytest.mark.parametrize("deadline_seconds", [0, -10])
def test_non_positive_deadline_raises(deadline_seconds):
    with pytest.raises(ValueError):
        compute_hp(max_hp=100, elapsed_seconds=0, deadline_seconds=deadline_seconds)


@pytest.mark.parametrize("max_hp", [0, -5])
def test_non_positive_max_hp_raises(max_hp):
    with pytest.raises(ValueError):
        compute_hp(max_hp=max_hp, elapsed_seconds=0, deadline_seconds=100)
