"""
OpenRouter API client — supports both regular and streaming responses.

Model fallback chain
---------------------
Instead of a single model, we try an ordered list (see `settings.openrouter_models_list`,
configured via OPENROUTER_MODELS, smartest/preferred first). If a model is unavailable,
rate-limited, or errors out, we transparently fall back to the next one. This keeps chat
resilient on OpenRouter's free tier, where individual free models are frequently
rate-limited or deprecated.

Streaming semantics: we only fall back to the next model if the current one fails
*before emitting any tokens*. Once the user has started seeing output, we never restart
(that would duplicate text) — a mid-stream failure is raised to the caller instead.
"""
import logging
from typing import AsyncGenerator, List, Dict
from openai import AsyncOpenAI
from core.config import settings

logger = logging.getLogger("mindmate.openrouter")

client = AsyncOpenAI(
    api_key=settings.OPENROUTER_API_KEY,
    base_url=settings.OPENROUTER_BASE_URL,
    default_headers={
        "HTTP-Referer": "https://mindmate.app",
        "X-Title": "MindMate",
    },
)


class AllModelsFailedError(RuntimeError):
    """Raised when every model in the fallback chain fails."""


async def chat_completion(messages: List[Dict[str, str]]) -> str:
    """
    Non-streaming chat completion. Tries each model in the fallback chain in
    order and returns the first successful, non-empty response.

    Raises AllModelsFailedError if every model fails.
    """
    models = settings.openrouter_models_list
    last_error: Exception | None = None

    for model in models:
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.7,
                top_p=0.9,
                presence_penalty=0.1,
                max_tokens=512,
            )
            content = response.choices[0].message.content
            if content and content.strip():
                # Clean any <unk> token degeneration artifacts if present
                if "<unk>" in content:
                    content = content.split("<unk>")[0].strip()
                if content:
                    if model != models[0]:
                        logger.info("chat_completion: fell back to model %s", model)
                    return content
            # Empty response — treat as a soft failure and try the next model.
            last_error = RuntimeError(f"Model '{model}' returned an empty response")
            logger.warning("chat_completion: %s", last_error)
        except Exception as e:  # noqa: BLE001 — any provider error should trigger fallback
            last_error = e
            logger.warning("chat_completion: model '%s' failed: %s", model, e)
            continue

    raise AllModelsFailedError(
        f"All {len(models)} model(s) failed. Last error: {last_error}"
    )


async def chat_completion_stream(
    messages: List[Dict[str, str]],
) -> AsyncGenerator[str, None]:
    """
    Streaming chat completion. Yields text chunks as they arrive.

    Falls back through the model chain if a model fails BEFORE emitting any
    tokens. If a model fails AFTER tokens have already been streamed to the
    user, the error is re-raised (we can't safely restart mid-stream).
    """
    models = settings.openrouter_models_list
    last_error: Exception | None = None

    for model in models:
        emitted = False
        try:
            stream = await client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.7,
                top_p=0.9,
                presence_penalty=0.1,
                max_tokens=512,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    # Immediately break stream if model degenerates into <unk> special tokens
                    if "<unk>" in delta:
                        logger.warning("chat_completion_stream: <unk> token degeneration detected from model %s", model)
                        clean_part = delta.split("<unk>")[0]
                        if clean_part:
                            yield clean_part
                        break
                    if not emitted and model != models[0]:
                        logger.info("chat_completion_stream: fell back to model %s", model)
                    emitted = True
                    yield delta

            if emitted:
                return  # Completed successfully.

            # Stream ended without producing any tokens — soft failure, try next.
            last_error = RuntimeError(f"Model '{model}' produced an empty stream")
            logger.warning("chat_completion_stream: %s", last_error)
        except Exception as e:  # noqa: BLE001
            if emitted:
                # Already streamed partial output to the user — cannot restart.
                logger.error(
                    "chat_completion_stream: model '%s' failed mid-stream: %s", model, e
                )
                raise
            last_error = e
            logger.warning("chat_completion_stream: model '%s' failed: %s", model, e)
            continue

    raise AllModelsFailedError(
        f"All {len(models)} model(s) failed. Last error: {last_error}"
    )


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
