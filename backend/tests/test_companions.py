"""
Tests for the companion (persona) system.

Covers:
- GET /companions/ — list all companions
- GET /companions/{slug} — single companion detail
- GET /companions/{slug}/conversations — user's conversations per companion
- Persona seed data correctness
- Prompt builder persona injection
"""
import pytest
from services.personas import PERSONAS, get_persona_by_slug, get_all_personas
from services.prompt_builder import build_system_prompt, _build_guide_gender_line


# ─── Seed Data Correctness ────────────────────────────────────────────────────

class TestPersonaSeedData:
    def test_all_four_companions_defined(self):
        slugs = [p["slug"] for p in PERSONAS]
        assert "riya" in slugs
        assert "arjun" in slugs
        assert "alex" in slugs
        assert "guide" in slugs

    def test_all_personas_have_required_fields(self):
        required = ["slug", "display_name", "tagline", "archetype", "avatar_emoji", "speaking_style"]
        for persona in PERSONAS:
            for field in required:
                assert field in persona and persona[field], \
                    f"Persona '{persona.get('slug')}' is missing or has empty '{field}'"

    def test_companion_names_are_indian_or_neutral(self):
        names = {p["slug"]: p["display_name"] for p in PERSONAS}
        assert names["riya"] == "Riya"
        assert names["arjun"] == "Arjun"
        assert names["alex"] == "Alex"
        assert names["guide"] == "The Guide"

    def test_no_western_names_as_default(self):
        """Ensure 'Mia' is not present as a companion name."""
        display_names = [p["display_name"] for p in PERSONAS]
        assert "Mia" not in display_names

    def test_no_persona_is_gender_adaptive(self):
        # Gender adaptation was intentionally dropped in the persona redesign —
        # no persona (including The Guide) adapts to the user's gender anymore.
        for persona in PERSONAS:
            assert persona.get("is_gender_adaptive", False) is False, \
                f"'{persona['slug']}' should not be gender_adaptive"

    def test_all_have_example_responses(self):
        for persona in PERSONAS:
            assert persona.get("example_responses"), \
                f"'{persona['slug']}' has no example_responses"
            assert len(persona["example_responses"]) >= 1

    def test_sort_order_is_sequential(self):
        orders = sorted(p["sort_order"] for p in PERSONAS)
        assert orders == list(range(1, len(PERSONAS) + 1))


# ─── Guide Gender Adaptation ──────────────────────────────────────────────────

class TestGuideGenderAdaptation:
    def test_male_user_gets_male_line(self):
        line = _build_guide_gender_line("male")
        assert "male" in line.lower() or "brother" in line.lower()

    def test_female_user_gets_female_line(self):
        line = _build_guide_gender_line("female")
        assert "female" in line.lower() or "sister" in line.lower()

    def test_prefer_not_to_say_gets_neutral(self):
        line = _build_guide_gender_line("prefer_not_to_say")
        assert "neutral" in line.lower() or "gender" in line.lower()

    def test_unknown_gender_value_defaults_to_neutral(self):
        line = _build_guide_gender_line("martian")  # invalid value
        assert line  # Should return something, not crash


# ─── API Endpoints ────────────────────────────────────────────────────────────

class TestCompanionListEndpoint:
    def test_list_companions_returns_all_four(self, client, db):
        # Seed directly into the same db session the client uses
        from models.db_models import Persona
        from services.personas import PERSONAS
        for data in PERSONAS:
            p = Persona(**data)
            db.add(p)
        db.flush()  # Make visible within this transaction (no commit needed for same session)

        resp = client.get("/api/companions/")
        assert resp.status_code == 200
        result = resp.json()
        # All seeded personas are returned (riya, arjun, alex, guide, squad, ...).
        assert len(result) == len(PERSONAS)
        slugs = {c["slug"] for c in result}
        assert {"riya", "arjun", "alex", "guide"}.issubset(slugs)

    def test_list_companions_no_auth_required(self, client, db):
        """Companion list is public — should work without a token."""
        from models.db_models import Persona
        from services.personas import PERSONAS
        for data in PERSONAS:
            p = Persona(**data)
            db.add(p)
        db.flush()

        resp = client.get("/api/companions/")
        assert resp.status_code == 200

    def test_companions_have_expected_fields(self, client, db):
        from models.db_models import Persona
        from services.personas import PERSONAS
        for data in PERSONAS:
            p = Persona(**data)
            db.add(p)
        db.flush()

        resp = client.get("/api/companions/")
        for companion in resp.json():
            assert "slug" in companion
            assert "display_name" in companion
            assert "tagline" in companion
            assert "avatar_emoji" in companion
            assert "is_gender_adaptive" in companion

    def test_companions_sorted_by_sort_order(self, client, db):
        from models.db_models import Persona
        from services.personas import PERSONAS
        for data in PERSONAS:
            p = Persona(**data)
            db.add(p)
        db.flush()

        resp = client.get("/api/companions/")
        orders = [c["sort_order"] for c in resp.json()]
        assert orders == sorted(orders)


class TestCompanionDetailEndpoint:
    def _seed(self, db):
        from models.db_models import Persona
        from services.personas import PERSONAS
        for data in PERSONAS:
            p = Persona(**data)
            db.add(p)
        db.flush()

    def test_get_riya_by_slug(self, client, db):
        self._seed(db)
        resp = client.get("/api/companions/riya")
        assert resp.status_code == 200
        data = resp.json()
        assert data["slug"] == "riya"
        assert data["display_name"] == "Riya"

    def test_get_guide_not_gender_adaptive(self, client, db):
        # Gender adaptation was intentionally dropped — The Guide no longer adapts.
        self._seed(db)
        resp = client.get("/api/companions/guide")
        assert resp.status_code == 200
        assert resp.json()["is_gender_adaptive"] is False

    def test_invalid_slug_returns_404(self, client, db):
        self._seed(db)
        resp = client.get("/api/companions/mia")  # Old name — should not exist
        assert resp.status_code == 404

    def test_another_old_name_returns_404(self, client, db):
        self._seed(db)
        resp = client.get("/api/companions/coach")  # From old plan — not in Phase 1
        assert resp.status_code == 404


class TestCompanionConversationsEndpoint:
    def _seed(self, db):
        from models.db_models import Persona
        from services.personas import PERSONAS
        for data in PERSONAS:
            p = Persona(**data)
            db.add(p)
        db.flush()

    def test_requires_auth(self, client, db):
        self._seed(db)
        resp = client.get("/api/companions/riya/conversations")
        assert resp.status_code == 401

    def test_returns_empty_for_new_user(self, client, db, auth_headers):
        self._seed(db)
        resp = client.get("/api/companions/riya/conversations", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []


# ─── Prompt Builder Persona Injection ─────────────────────────────────────────

class TestPromptBuilderPersonaInjection:
    def _make_user(self, gender="prefer_not_to_say"):
        """Create a minimal mock user object."""
        class MockUser:
            name = "Priya"
            subscription_tier = "free"
            preferred_language = "en"
        u = MockUser()
        u.gender = gender
        return u

    def test_riya_persona_injected_into_prompt(self, db):
        from services.personas import seed_personas
        seed_personas(db)

        persona = get_persona_by_slug("riya", db)
        prompt = build_system_prompt(self._make_user(), [], "Hello", persona=persona)
        assert "Riya" in prompt
        assert "warm" in prompt.lower()

    def test_arjun_persona_injected_into_prompt(self, db):
        from services.personas import seed_personas
        seed_personas(db)

        persona = get_persona_by_slug("arjun", db)
        prompt = build_system_prompt(self._make_user(), [], "Hello", persona=persona)
        assert "Arjun" in prompt

    def test_guide_prompt_is_gender_independent(self, db):
        # Gender adaptation was intentionally dropped: The Guide's system prompt
        # must be identical regardless of the user's gender.
        from services.personas import seed_personas
        seed_personas(db)

        persona = get_persona_by_slug("guide", db)
        male_prompt = build_system_prompt(self._make_user(gender="male"), [], "Hello", persona=persona)
        female_prompt = build_system_prompt(self._make_user(gender="female"), [], "Hello", persona=persona)
        neutral_prompt = build_system_prompt(
            self._make_user(gender="prefer_not_to_say"), [], "Hello", persona=persona
        )
        assert male_prompt == female_prompt == neutral_prompt

    def test_no_persona_falls_back_to_riya_defaults(self, db):
        """When persona=None, the prompt builder uses the inline Riya defaults."""
        user = self._make_user()
        prompt = build_system_prompt(user, [], "Hello", persona=None)
        assert "Riya" in prompt
        assert len(prompt) > 100  # Should still be a proper prompt

    def test_cultural_context_in_all_prompts(self, db):
        from services.personas import seed_personas
        seed_personas(db)

        for slug in ["riya", "arjun", "alex", "guide"]:
            persona = get_persona_by_slug(slug, db)
            prompt = build_system_prompt(self._make_user(), [], "Hello", persona=persona)
            assert "india" in prompt.lower() or "Indian" in prompt, \
                f"Cultural context missing from {slug} prompt"
