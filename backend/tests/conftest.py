"""
Pytest configuration and shared fixtures for MindMate backend tests.

Uses SQLite in-memory for tests (no PostgreSQL needed).
Redis calls are mocked to avoid needing a real Redis connection.
"""
import pytest
import pytest_asyncio
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch

# ─── Test database setup ──────────────────────────────────────────────────────
SQLALCHEMY_TEST_DATABASE_URL = "sqlite:///./test_mindmate.db"

engine = create_engine(
    SQLALCHEMY_TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    """Create all tables at start of test session, drop them at end."""
    from core.database import Base
    import models.db_models  # noqa — ensure all models are registered
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    """Yield a test DB session and roll back after each test."""
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db):
    """FastAPI test client with DB dependency overridden to use test DB."""
    from main import app
    from core.database import get_db

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db

    # Mock Redis to avoid connection errors in unit tests
    # Also mock persona seeding to avoid hitting DB in lifespan on test startup
    with patch("core.redis_client.redis_client") as mock_redis, \
         patch("services.personas.seed_personas", return_value=None):
        mock_redis.incr.return_value = 1
        mock_redis.expire.return_value = True
        mock_redis.get.return_value = None
        with TestClient(app) as c:
            yield c

    app.dependency_overrides.clear()


@pytest.fixture
def registered_user(client):
    """Register a test user and return their credentials."""
    payload = {
        "email": "test@mindmate.com",
        "password": "SecurePass123!",
        "name": "Test User",
        "gender": "prefer_not_to_say",
    }
    resp = client.post("/api/auth/register", json=payload)
    assert resp.status_code == 201, f"Registration failed: {resp.json()}"
    return payload


@pytest.fixture
def auth_headers(client, registered_user):
    """Log in and return Authorization headers for the test user."""
    resp = client.post("/api/auth/login", json={
        "email": registered_user["email"],
        "password": registered_user["password"],
    })
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
