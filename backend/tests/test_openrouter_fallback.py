"""
Tests for the OpenRouter model fallback chain.

Verifies that chat_completion transparently falls back to the next model when
one fails, and raises AllModelsFailedError only when every model is exhausted.
"""
import pytest
from types import SimpleNamespace
from services import openrouter


def _fake_response(text: str):
    """Mimic the shape openai returns: response.choices[0].message.content."""
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=text))])


@pytest.mark.asyncio
async def test_falls_back_to_next_model_on_failure(monkeypatch):
    monkeypatch.setattr(openrouter.settings, "OPENROUTER_MODELS", "model-a,model-b,model-c")
    tried = []

    async def fake_create(*, model, **kwargs):
        tried.append(model)
        if model == "model-a":
            raise RuntimeError("model-a is rate-limited")
        return _fake_response("hi from the fallback model")

    monkeypatch.setattr(openrouter.client.chat.completions, "create", fake_create)

    result = await openrouter.chat_completion([{"role": "user", "content": "hello"}])
    assert result == "hi from the fallback model"
    assert tried == ["model-a", "model-b"]  # stopped at first success


@pytest.mark.asyncio
async def test_empty_response_triggers_fallback(monkeypatch):
    monkeypatch.setattr(openrouter.settings, "OPENROUTER_MODELS", "model-a,model-b")

    async def fake_create(*, model, **kwargs):
        return _fake_response("" if model == "model-a" else "real answer")

    monkeypatch.setattr(openrouter.client.chat.completions, "create", fake_create)

    result = await openrouter.chat_completion([{"role": "user", "content": "hello"}])
    assert result == "real answer"


@pytest.mark.asyncio
async def test_all_models_failing_raises(monkeypatch):
    monkeypatch.setattr(openrouter.settings, "OPENROUTER_MODELS", "model-a,model-b")

    async def fake_create(*, model, **kwargs):
        raise RuntimeError(f"{model} down")

    monkeypatch.setattr(openrouter.client.chat.completions, "create", fake_create)

    with pytest.raises(openrouter.AllModelsFailedError):
        await openrouter.chat_completion([{"role": "user", "content": "hello"}])
