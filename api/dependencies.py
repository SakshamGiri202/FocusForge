"""Single place constructing the storage backend.

Swap InMemoryTaskStorage for the real Actian VectorAI implementation
here only -- everything else in api/ depends on storage_interface.TaskStorage,
never on the concrete class. That's the one-line swap.
"""

from __future__ import annotations

from api.state import AppState
from storage_interface import TaskStorage
from storage_vectorai import VectorAITaskStorage

_storage: TaskStorage = VectorAITaskStorage()
_state = AppState()


def get_storage() -> TaskStorage:
    return _storage


def get_state() -> AppState:
    return _state
