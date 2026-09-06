"""Standalone seeding entry point -- for teammate 1 to run directly
against the real Actian VectorAI DB (or anyone re-seeding the stub in a
fresh process) independent of the API server's own startup-time seed.

Usage (from repo root, with the venv active):
    python -m scripts.seed_completed_tasks
    python -m scripts.seed_completed_tasks --force   # reseed even if non-empty
"""

from __future__ import annotations

import argparse

from api.dependencies import get_storage
from seed_data import seed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help="seed even if the backend already has vectors (default: skip if non-empty)",
    )
    args = parser.parse_args()

    storage = get_storage()
    count = seed(storage, only_if_empty=not args.force)
    print(f"seeded {count} tasks; total vectors now: {storage.count_vectors()}")


if __name__ == "__main__":
    main()
