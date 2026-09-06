"""Single place constructing the storage backend.

Which backend is live is controlled by the STORAGE_BACKEND env var:
- "stub" (default) -- in-memory, zero dependencies, safe for dev/tests.
- "vectorai" -- real Actian VectorAI DB. Requires torch/sentence-transformers/
  vectorai installed AND a running instance (see docker-compose.yml) --
  import is deferred so the stub path never pays that cost or needs
  those packages present.

Everything else in api/ depends on storage_interface.TaskStorage, never
on either concrete class. That's the one-line swap.
"""

from __future__ import annotations

import os

from api.state import AppState
from storage_interface import TaskStorage


def _build_storage() -> TaskStorage:
    backend = os.environ.get("STORAGE_BACKEND", "stub")
    if backend == "vectorai":
        from storage_vectorai import VectorAITaskStorage

        return VectorAITaskStorage()
    if backend == "stub":
        from storage_stub import InMemoryTaskStorage

        return InMemoryTaskStorage()
    raise ValueError(f"Unknown STORAGE_BACKEND: {backend!r} (expected 'stub' or 'vectorai')")


_storage: TaskStorage = _build_storage()
_state = AppState()


def get_storage() -> TaskStorage:
    return _storage


def get_state() -> AppState:
    return _state
