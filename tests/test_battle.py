import pytest

from game_engine.battle import apply_damage, new_battle
from game_engine.models import Mode, PlayerState


def make_pve_battle():
    return new_battle(
        mode=Mode.PVE,
        deadline_seconds=100,
        started_at=0,
        player_a=PlayerState(player_id="p1", max_hp=100),
    )


def make_pvp_battle():
    return new_battle(
        mode=Mode.PVP,
        deadline_seconds=100,
        started_at=0,
        player_a=PlayerState(player_id="p1", max_hp=100),
        player_b=PlayerState(player_id="p2", max_hp=100),
    )


def test_pvp_requires_player_b():
    with pytest.raises(ValueError):
        new_battle(mode=Mode.PVP, deadline_seconds=100, started_at=0, player_a=PlayerState("p1", 100))


def test_pve_rejects_player_b():
    with pytest.raises(ValueError):
        new_battle(
            mode=Mode.PVE,
            deadline_seconds=100,
            started_at=0,
            player_a=PlayerState("p1", 100),
            player_b=PlayerState("p2", 100),
        )


def test_pve_damage_offsets_own_drain_only():
    battle = make_pve_battle()
    updated = apply_damage(battle, dealt_by="p1", damage_rating=15)
    assert updated.player_a.damage_dealt == 15
    assert updated.player_b is None


def test_pvp_damage_offsets_dealer_and_hits_opponent():
    battle = make_pvp_battle()
    updated = apply_damage(battle, dealt_by="p1", damage_rating=15)
    assert updated.player_a.damage_dealt == 15
    assert updated.player_a.damage_received == 0
    assert updated.player_b.damage_received == 15
    assert updated.player_b.damage_dealt == 0


def test_apply_damage_from_non_participant_raises():
    battle = make_pve_battle()
    with pytest.raises(ValueError):
        apply_damage(battle, dealt_by="not-a-player", damage_rating=10)


def test_original_state_is_not_mutated():
    battle = make_pvp_battle()
    apply_damage(battle, dealt_by="p1", damage_rating=15)
    assert battle.player_a.damage_dealt == 0
    assert battle.player_b.damage_received == 0
