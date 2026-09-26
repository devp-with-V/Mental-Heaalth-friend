from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # App
    APP_NAME: str = "MindMate"
    DEBUG: bool = True
    # Comma-separated string in .env, e.g.: http://localhost:5173,http://localhost:3000
    CORS_ORIGINS: str = "http://localhost:5173"

    # OpenRouter
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    # Single default model (kept for backward compatibility).
    OPENROUTER_MODEL: str = "mistralai/mistral-7b-instruct:free"
    # Ordered fallback chain, smartest/preferred first, comma-separated.
    # If a model is unavailable, rate-limited, or errors, the next one is tried.
    # Falls back to OPENROUTER_MODEL if left empty.
    OPENROUTER_MODELS: str = "mistralai/mistral-7b-instruct:free"

    # Database
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/mindmate"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # JWT
    SECRET_KEY: str = "change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse comma-separated CORS_ORIGINS into a list."""
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def openrouter_models_list(self) -> List[str]:
        """
        Ordered list of models to try (smartest/preferred first).

        Parsed from OPENROUTER_MODELS (comma-separated). If that is empty,
        falls back to the single OPENROUTER_MODEL. Guaranteed non-empty.
        """
        raw = self.OPENROUTER_MODELS.strip() or self.OPENROUTER_MODEL
        models = [m.strip() for m in raw.split(",") if m.strip()]
        return models or ["openrouter/free"]

    class Config:
        env_file = ".env"
        extra = "ignore"  # ignore unknown env vars


settings = Settings()
