"""In-memory registry of live battles for this API process only.

This is NOT the storage_interface contract -- that contract is
specifically for the completed_tasks vector search. Battle/player state
here is process-local and resets on restart; fine for a one-day
hackathon demo, unrelated to teammate 1's DB swap.

Simplifying assumption for the hackathon: a player is active in at most
one battle at a time (needed to support GET /players/{id}/hp without a
battle_id in the URL). Flag if that's wrong.

Also tracks which journal_ids belong to which user, since
storage_interface.py only supports get_journal(journal_id) (a keyed
lookup, not a "list all for this user" query) -- GET /api/journal needs
the latter. Known limitation: this index is process-local and resets on
restart even though the journal documents themselves persist in Actian;
acceptable for a one-day demo, worth a real query method later.
"""

from __future__ import annotations

from game_engine.models import BattleState


class AppState:
    def __init__(self) -> None:
        self.battles: dict[str, BattleState] = {}
        self.active_battle_for_player: dict[str, str] = {}
        self.journal_ids_by_user: dict[str, list[str]] = {}

    def add_battle(self, battle: BattleState) -> None:
        self.battles[battle.battle_id] = battle
        self.active_battle_for_player[battle.player_a.player_id] = battle.battle_id
        if battle.player_b is not None:
            self.active_battle_for_player[battle.player_b.player_id] = battle.battle_id

    def get_battle(self, battle_id: str) -> BattleState:
        return self.battles[battle_id]

    def update_battle(self, battle: BattleState) -> None:
        self.battles[battle.battle_id] = battle

    def battle_for_player(self, player_id: str) -> BattleState:
        battle_id = self.active_battle_for_player[player_id]
        return self.battles[battle_id]

    def add_journal_entry(self, user_id: str, journal_id: str) -> None:
        self.journal_ids_by_user.setdefault(user_id, []).append(journal_id)

    def journal_ids_for_user(self, user_id: str) -> list[str]:
        return self.journal_ids_by_user.get(user_id, [])
