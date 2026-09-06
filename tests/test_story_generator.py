from story_generator import StubStoryGenerator


def test_generate_story_seed_has_no_damage_field():
    seed = StubStoryGenerator().generate_story_seed("Hero", "Finish the report", "90 minutes")
    for quest in seed["quests"]:
        assert "damage" not in quest
        assert "difficulty" in quest
        assert "action" in quest


def test_generate_story_seed_boss_always_100_hp():
    seed = StubStoryGenerator().generate_story_seed("Hero", "Anything", "1 hour")
    assert seed["boss"]["hp"] == 100


def test_generate_story_seed_uses_given_protagonist_name():
    seed = StubStoryGenerator().generate_story_seed("Ameen", "Task", "1 hour")
    assert seed["protagonist"]["name"] == "Ameen"


def test_generate_detour_has_required_fields():
    detour = StubStoryGenerator().generate_detour({"task": "x"})
    for field in ("id", "title", "prose", "action", "timeBoundary", "completedAt", "heroWise"):
        assert field in detour
