"""Demo-mode auth. Clerk isn't configured yet (no keys in this repo, no
.env.local on the frontend) -- every request maps to a fixed demo user.

CONTRACT.md requires deriving userId from a verified Clerk token and
never trusting the frontend's body. The frontend already sends no
Authorization header in this mode (lib/hero.tsx falls back to
DEMO_HERO), so going live with real Clerk verification later needs zero
frontend changes -- just replace this function's body to verify the
header instead of ignoring it.
"""

from __future__ import annotations

from fastapi import Header

DEMO_USER_ID = "demo-hero"


def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    return DEMO_USER_ID
