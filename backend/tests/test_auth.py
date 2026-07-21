"""
Tests for authentication endpoints.
Covers: register, login, token refresh, /auth/me.
"""
import pytest


class TestRegister:
    def test_register_success(self, client):
        resp = client.post("/auth/register", json={
            "email": "newuser@test.com",
            "password": "Password123!",
            "name": "New User",
            "gender": "male",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == "newuser@test.com"
        assert data["name"] == "New User"
        assert data["gender"] == "male"
        assert data["subscription_tier"] == "free"
        assert "id" in data
        # Ensure password is NOT returned
        assert "password" not in data
        assert "password_hash" not in data

    def test_register_duplicate_email(self, client, registered_user):
        resp = client.post("/auth/register", json={
            "email": registered_user["email"],
            "password": "AnotherPass!",
            "name": "Dupe User",
        })
        assert resp.status_code == 400
        assert "already registered" in resp.json()["detail"].lower()

    def test_register_invalid_email(self, client):
        resp = client.post("/auth/register", json={
            "email": "not-an-email",
            "password": "Password123!",
            "name": "Bad Email",
        })
        assert resp.status_code == 422  # Pydantic validation error

    def test_register_missing_name(self, client):
        resp = client.post("/auth/register", json={
            "email": "missingname@test.com",
            "password": "Password123!",
        })
        assert resp.status_code == 422


class TestLogin:
    def test_login_success(self, client, registered_user):
        resp = client.post("/auth/login", json={
            "email": registered_user["email"],
            "password": registered_user["password"],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client, registered_user):
        resp = client.post("/auth/login", json={
            "email": registered_user["email"],
            "password": "WrongPassword!",
        })
        assert resp.status_code == 401

    def test_login_unknown_email(self, client):
        resp = client.post("/auth/login", json={
            "email": "ghost@test.com",
            "password": "SomePass!",
        })
        assert resp.status_code == 401


class TestTokenRefresh:
    def test_refresh_success(self, client, registered_user):
        login_resp = client.post("/auth/login", json={
            "email": registered_user["email"],
            "password": registered_user["password"],
        })
        refresh_token = login_resp.json()["refresh_token"]
        resp = client.post("/auth/refresh", json={"refresh_token": refresh_token})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_refresh_with_access_token_fails(self, client, registered_user):
        login_resp = client.post("/auth/login", json={
            "email": registered_user["email"],
            "password": registered_user["password"],
        })
        access_token = login_resp.json()["access_token"]
        # Should not accept an access token as a refresh token
        resp = client.post("/auth/refresh", json={"refresh_token": access_token})
        assert resp.status_code == 401

    def test_refresh_invalid_token(self, client):
        resp = client.post("/auth/refresh", json={"refresh_token": "totally.fake.token"})
        assert resp.status_code == 401


class TestGetMe:
    def test_get_me_success(self, client, auth_headers, registered_user):
        resp = client.get("/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == registered_user["email"]
        assert data["name"] == registered_user["name"]

    def test_get_me_no_token(self, client):
        resp = client.get("/auth/me")
        assert resp.status_code == 401

    def test_get_me_bad_token(self, client):
        resp = client.get("/auth/me", headers={"Authorization": "Bearer bad.token.here"})
        assert resp.status_code == 401
