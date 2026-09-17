"""OpenRouter API client for making LLM requests."""

import asyncio
import httpx
import logging
from typing import List, Dict, Any, Optional
from .config import (
    MAX_MODEL_OUTPUT_TOKENS,
    OPENROUTER_API_URL,
    _request_api_key,
)


logger = logging.getLogger(__name__)


# A single shared client reused across all requests. Reusing one client keeps
# the underlying connection pool warm so we avoid a fresh TLS handshake on every
# LLM call (3 models x multiple stages per message adds up quickly).
_client: Optional[httpx.AsyncClient] = None
_request_slots = asyncio.Semaphore(8)


async def get_client() -> httpx.AsyncClient:
    """Return the shared AsyncClient, creating it on first use."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(120.0),
            limits=httpx.Limits(
                max_connections=20,
                max_keepalive_connections=10,
            ),
        )
    return _client


async def close_client() -> None:
    """Close the shared client. Called on application shutdown."""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None


async def query_model(
    model: str,
    messages: List[Dict[str, str]],
    timeout: float = 120.0,
    errors: Optional[Dict[str, str]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Query a single model via OpenRouter API.

    Args:
        model: OpenRouter model identifier (e.g., "openai/gpt-4o")
        messages: List of message dicts with 'role' and 'content'
        timeout: Request timeout in seconds
        errors: Optional out-param mapping model id -> failure reason

    Returns:
        Response dict with 'content' and optional 'reasoning_details', or None if failed
    """
    def _fail(reason: str) -> None:
        logger.warning("Error querying model %s: %s", model, reason[:500])
        if errors is not None:
            errors[model] = reason[:300]

    api_key = _request_api_key.get() or ""
    if not api_key:
        _fail("No OpenRouter API key supplied for model request")
        return None

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": MAX_MODEL_OUTPUT_TOKENS,
    }

    try:
        client = await get_client()
        async with _request_slots:
            response = await client.post(
                OPENROUTER_API_URL,
                headers=headers,
                json=payload,
                timeout=timeout,
            )
            response.raise_for_status()

            data = response.json()
        choices = data.get("choices") if isinstance(data, dict) else None
        message = choices[0].get("message") if choices and isinstance(choices[0], dict) else None
        if not isinstance(message, dict):
            error = data.get("error") if isinstance(data, dict) else None
            detail = error.get("message") if isinstance(error, dict) else str(error or "missing choices[0].message")
            _fail(f"invalid response shape: {detail}")
            return None

        return {
            'content': message.get('content'),
            'reasoning_details': message.get('reasoning_details')
        }

    except httpx.HTTPStatusError as e:
        detail = e.response.reason_phrase
        try:
            payload = e.response.json()
            error = payload.get("error") if isinstance(payload, dict) else None
            if isinstance(error, dict) and error.get("message"):
                detail = error["message"]
            elif isinstance(error, str):
                detail = error
        except Exception:
            detail = (e.response.text or detail)[:300]
        _fail(f"HTTP {e.response.status_code} {detail}")
        return None
    except Exception as e:
        _fail(f"{type(e).__name__}: {str(e)[:300]}")
        return None


async def query_models_parallel(
    models: List[str],
    messages: List[Dict[str, str]],
    errors: Optional[Dict[str, str]] = None,
) -> Dict[str, Optional[Dict[str, Any]]]:
    """
    Query multiple models in parallel.

    Args:
        models: List of OpenRouter model identifiers
        messages: List of message dicts to send to each model
        errors: Optional out-param mapping failed model ids to reasons

    Returns:
        Dict mapping model identifier to response dict (or None if failed)
    """
    # Create tasks for all models
    tasks = [query_model(model, messages, errors=errors) for model in models]

    # Wait for all to complete
    responses = await asyncio.gather(*tasks, return_exceptions=True)
    if errors is not None:
        for model, response in zip(models, responses):
            if isinstance(response, Exception) and model not in errors:
                errors[model] = f"{type(response).__name__}: {str(response)[:200]}"
    responses = [None if isinstance(response, Exception) else response for response in responses]

    # Map models to their responses
    return {model: response for model, response in zip(models, responses)}
