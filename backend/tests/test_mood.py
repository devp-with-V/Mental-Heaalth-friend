"""
Tests for mood logging and history endpoints.
"""
import pytest


class TestMoodLog:
    def test_log_mood_success(self, client, auth_headers):
        resp = client.post("/mood/log", json={
            "mood_score": 7.5,
            "emotion_tag": "good",
            "note": "Had a nice walk today.",
        }, headers=auth_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["mood_score"] == 7.5
        assert data["emotion_tag"] == "good"
        assert "id" in data
        assert "created_at" in data

    def test_log_mood_no_tag(self, client, auth_headers):
        resp = client.post("/mood/log", json={"mood_score": 5.0}, headers=auth_headers)
        assert resp.status_code == 201
        assert resp.json()["mood_score"] == 5.0

    def test_log_mood_invalid_score_high(self, client, auth_headers):
        resp = client.post("/mood/log", json={"mood_score": 11.0}, headers=auth_headers)
        assert resp.status_code == 400

    def test_log_mood_invalid_score_low(self, client, auth_headers):
        resp = client.post("/mood/log", json={"mood_score": 0.5}, headers=auth_headers)
        assert resp.status_code == 400

    def test_log_mood_unauthenticated(self, client):
        resp = client.post("/mood/log", json={"mood_score": 5.0})
        assert resp.status_code == 401


class TestMoodHistory:
    def test_get_history_empty(self, client, auth_headers):
        resp = client.get("/mood/history", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_get_history_with_logs(self, client, auth_headers):
        # Log 3 mood entries
        for score in [3.0, 6.0, 9.0]:
            client.post("/mood/log", json={"mood_score": score}, headers=auth_headers)

        resp = client.get("/mood/history?limit=10", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 3
        # Verify all 3 scores are present (order may vary in SQLite with identical timestamps)
        scores = {d["mood_score"] for d in data}
        assert scores == {3.0, 6.0, 9.0}

    def test_get_history_limit(self, client, auth_headers):
        for i in range(5):
            client.post("/mood/log", json={"mood_score": float(i + 1)}, headers=auth_headers)

        resp = client.get("/mood/history?limit=3", headers=auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 3

    def test_history_unauthenticated(self, client):
        resp = client.get("/mood/history")
        assert resp.status_code == 401


class TestEmotionSuggestions:
    @pytest.mark.parametrize("score,expected_category", [
        (2.0, ["overwhelmed", "devastated", "hopeless", "crying"]),
        (4.0, ["anxious", "sad", "lonely", "drained", "numb"]),
        (6.0, ["okay", "neutral", "tired", "meh", "uncertain"]),
        (8.0, ["good", "hopeful", "calm", "relieved", "grateful"]),
        (10.0, ["amazing", "happy", "excited", "energized", "great"]),
    ])
    def test_suggestions_for_score(self, client, score, expected_category):
        resp = client.get(f"/mood/suggestions?score={score}")
        assert resp.status_code == 200
        suggestions = resp.json()["suggestions"]
        # At least one suggestion should match the expected category
        assert any(s in expected_category for s in suggestions)

    def test_suggestions_invalid_score(self, client):
        resp = client.get("/mood/suggestions?score=15")
        assert resp.status_code == 400
