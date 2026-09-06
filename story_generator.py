"""Boundary to the LLM (Gemini) that generates chapter/quest structure
and detour flavor. Same pattern as storage_interface.py: a narrow
Protocol, an in-process stub for tests/dev, and a real implementation
that's a one-line swap in api/dependencies.py.

Gemini NEVER decides damage (CONTRACT.md 2.1.1/5) -- it returns
structure and a `difficulty` tag per quest only. game_engine.story
turns that into a locked damage number via vector similarity search.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from typing import Protocol

logger = logging.getLogger("story_generator")


class StoryGenerator(Protocol):
    def generate_story_seed(self, protagonist: str, task: str, time_available: str) -> dict:
        """Return chapter/setting/openingProse/boss/quests(no damage)/
        protagonist/rewardLines per CONTRACT.md 2.2. Must never raise --
        implementations fall back to a minimal default seed."""
        ...

    def generate_detour(self, session: dict) -> dict:
        """Return a SideQuest dict (CONTRACT.md 2.5) for the goblin's
        'legitimate side quest' branch. Must never raise."""
        ...


def _fallback_story_seed(protagonist: str, task: str) -> dict:
    """Used on total Gemini failure (after one retry) so /api/chapters
    never 500s on a flaky LLM call -- a single default quest covering
    the whole task, matching "fall back to a single default subtask"."""
    return {
        "chapter": {"number": 1, "title": task[:60] or "An Untitled Chapter", "epigraph": "Every journey begins with a single step."},
        "setting": {"place": "The writing desk", "timeOfDay": "now", "mood": "determined"},
        "openingProse": f'The hero {protagonist} stands before a mountain named "{task}".',
        "boss": {"name": task[:40] or "The Task", "epithet": "Warden of Deadlines", "fightIntro": "It will not fall easily.", "hp": 100},
        "quests": [
            {"id": "q1", "emoji": "⚔️", "action": task[:60] or "Begin", "narrative": "The first step is the hardest.", "difficulty": "medium"},
        ],
        "protagonist": {"name": protagonist, "hearts": 3, "titles": []},
        "rewardLines": {
            "gate": "✧ The Gate Was Opened ✧",
            "onQuest": ["The monster appears slightly less terrifying."],
            "onReturn": "✧ The Wanderer Returned ✧",
            "onShrink": "✧ Wisdom of the Small Blade ✧",
            "onBossDown": "With a final blow, the mountain crumbles to dust.",
        },
    }


def _fallback_detour() -> dict:
    return {
        "id": f"sq_{uuid.uuid4().hex[:8]}",
        "title": "The Forgotten Missive",
        "prose": "A short, legitimate errand presents itself.",
        "action": "Handle the small errand",
        "timeBoundary": "10 minutes",
        "completedAt": None,
        "heroWise": False,
    }


class StubStoryGenerator:
    """No network calls -- deterministic quest breakdown for tests/dev
    without a GEMINI_API_KEY. Splits the task into a fixed 3-quest arc
    scaling by nothing but the task text length, purely so dev/demo
    runs have something to click through."""

    def generate_story_seed(self, protagonist: str, task: str, time_available: str) -> dict:
        seed = _fallback_story_seed(protagonist, task)
        seed["quests"] = [
            {"id": "q1", "emoji": "⚔️", "action": f"Start: {task[:50]}", "narrative": "The first step.", "difficulty": "easy"},
            {"id": "q2", "emoji": "🗡️", "action": f"Push through: {task[:50]}", "narrative": "The middle grind.", "difficulty": "medium"},
            {"id": "q3", "emoji": "🏆", "action": f"Finish: {task[:50]}", "narrative": "The final push.", "difficulty": "hard"},
        ]
        return seed

    def generate_detour(self, session: dict) -> dict:
        return _fallback_detour()


class GeminiStoryGenerator:
    """Real implementation. The google-generativeai import is deferred
    to __init__ so importing this module never requires that package --
    only constructing this class does."""

    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        import google.generativeai as genai  # deferred import

        api_key = api_key or os.environ["GEMINI_API_KEY"]
        genai.configure(api_key=api_key)
        self._model_name = model or os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        self._model = genai.GenerativeModel(self._model_name)

    def _generate_json(self, prompt: str) -> dict:
        last_error: Exception | None = None
        for attempt in range(2):  # try once, retry once
            try:
                response = self._model.generate_content(
                    prompt,
                    generation_config={"response_mime_type": "application/json", "temperature": 1.0},
                )
                return json.loads(response.text)
            except Exception as e:  # noqa: BLE001 -- any SDK/parse failure triggers retry then fallback
                logger.warning("Gemini call failed (attempt %d): %s", attempt + 1, e)
                last_error = e
        raise RuntimeError(f"Gemini generation failed after retry: {last_error}")

    def generate_story_seed(self, protagonist: str, task: str, time_available: str) -> dict:
        prompt = f"""You are writing a short fantasy-quest breakdown for a productivity app.
Protagonist: {protagonist}
Task: {task}
Time available: {time_available}

Return STRICT JSON matching this shape exactly, no prose outside the JSON:
{{
  "chapter": {{"number": 1, "title": "...", "epigraph": "..."}},
  "setting": {{"place": "...", "timeOfDay": "...", "mood": "..."}},
  "openingProse": "1-2 paragraphs naming the protagonist, framing the task as a place to stand before",
  "boss": {{"name": "...", "epithet": "...", "fightIntro": "...", "hp": 100}},
  "quests": [{{"id": "q1", "emoji": "...", "action": "...", "narrative": "...", "difficulty": "trivial|easy|medium|hard|epic"}}],
  "protagonist": {{"name": "{protagonist}", "hearts": 3, "titles": []}},
  "rewardLines": {{"gate": "...", "onQuest": ["...", "..."], "onReturn": "...", "onShrink": "...", "onBossDown": "..."}}
}}

Rules: split the task into as many quests as its complexity actually warrants -- no fixed count.
Never mention XP, coins, streaks, or any numeric score anywhere in prose. The boss always has hp: 100.
Do not include a "damage" field on quests -- only "difficulty"."""
        try:
            return self._generate_json(prompt)
        except Exception:
            logger.error("Falling back to default story seed for task=%r", task)
            return _fallback_story_seed(protagonist, task)

    def generate_detour(self, session: dict) -> dict:
        prompt = f"""Continuing this story (task: {session['task']}), invent one short, legitimate
side errand as a JSON object: {{"id": "sq_1", "title": "...", "prose": "...", "action": "...",
"timeBoundary": "...", "completedAt": null, "heroWise": false}}. No numeric scores."""
        try:
            return self._generate_json(prompt)
        except Exception:
            logger.error("Falling back to default detour")
            return _fallback_detour()
