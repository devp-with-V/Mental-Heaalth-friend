"""
OpenRouter API client — supports both regular and streaming responses.
"""
import json
from typing import AsyncGenerator, List, Dict
from openai import AsyncOpenAI
from core.config import settings

client = AsyncOpenAI(
    api_key=settings.OPENROUTER_API_KEY,
    base_url=settings.OPENROUTER_BASE_URL,
    default_headers={
        "HTTP-Referer": "https://mindmate.app",
        "X-Title": "MindMate",
    },
)


async def chat_completion(messages: List[Dict[str, str]]) -> str:
    """Non-streaming chat completion. Returns full response string."""
    response = await client.chat.completions.create(
        model=settings.OPENROUTER_MODEL,
        messages=messages,
        temperature=0.85,
        max_tokens=512,
    )
    return response.choices[0].message.content


async def chat_completion_stream(
    messages: List[Dict[str, str]],
) -> AsyncGenerator[str, None]:
    """Streaming chat completion. Yields text chunks as they arrive."""
    stream = await client.chat.completions.create(
        model=settings.OPENROUTER_MODEL,
        messages=messages,
        temperature=0.85,
        max_tokens=512,
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


async def test_connection() -> bool:
    """Quick health check to verify OpenRouter is reachable."""
    try:
        result = await chat_completion([
            {"role": "user", "content": "Say 'OK' and nothing else."}
        ])
        return "OK" in result
    except Exception as e:
        print(f"OpenRouter connection test failed: {e}")
        return False
