import redis
from core.config import settings

redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)


def get_redis():
    """FastAPI dependency for Redis client."""
    return redis_client
