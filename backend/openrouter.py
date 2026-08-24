"""OpenRouter API client for making LLM requests."""

import asyncio
import httpx
from typing import List, Dict, Any, Optional
from .config import CHAIRMAN_MODEL, COUNCIL_MODELS, get_effective_api_key, MAX_MODEL_OUTPUT_TOKENS, OPENROUTER_API_URL

OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"


# A single shared client reused across all requests. Reusing one client keeps
# the underlying connection pool warm so we avoid a fresh TLS handshake on every
# LLM call (3 models x multiple stages per message adds up quickly).
_client: Optional[httpx.AsyncClient] = None
_client_lock = asyncio.Lock()
_request_slots = asyncio.Semaphore(8)


async def get_client() -> httpx.AsyncClient:
    """Return the shared AsyncClient, creating it on first use."""
    global _client
    if _client is None or _client.is_closed:
        async with _client_lock:
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
    timeout: float = 120.0
) -> Optional[Dict[str, Any]]:
    """
    Query a single model via OpenRouter API.

    Args:
        model: OpenRouter model identifier (e.g., "openai/gpt-4o")
        messages: List of message dicts with 'role' and 'content'
        timeout: Request timeout in seconds

    Returns:
        Response dict with 'content' and optional 'reasoning_details', or None if failed
    """
    api_key = get_effective_api_key()
    if not api_key:
        print("No OpenRouter API key supplied for model request")
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
        message = data['choices'][0]['message']

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
        print(f"Error querying model {model}: HTTP {e.response.status_code} {detail}")
        return None
    except Exception as e:
        print(f"Error querying model {model}: {type(e).__name__}")
        return None


async def query_models_parallel(
    models: List[str],
    messages: List[Dict[str, str]]
) -> Dict[str, Optional[Dict[str, Any]]]:
    """
    Query multiple models in parallel.

    Args:
        models: List of OpenRouter model identifiers
        messages: List of message dicts to send to each model

    Returns:
        Dict mapping model identifier to response dict (or None if failed)
    """
    # Create tasks for all models
    tasks = [query_model(model, messages) for model in models]

    # Wait for all to complete
    responses = await asyncio.gather(*tasks, return_exceptions=True)
    responses = [None if isinstance(response, Exception) else response for response in responses]

    # Map models to their responses
    return {model: response for model, response in zip(models, responses)}


async def warn_if_models_unavailable() -> None:
    """
    Best-effort startup check: fetch OpenRouter's public model catalog (no API
    key required) and print a warning for any configured model ID that isn't
    currently listed. This does not block startup and never raises — it only
    helps a self-hosting user notice a stale ``backend/config.py`` model ID
    before running a review, instead of getting a generic "all council
    members failed" error later.
    """
    try:
        client = await get_client()
        response = await client.get(OPENROUTER_MODELS_URL, timeout=10.0)
        response.raise_for_status()
        data = response.json()
        available = {item.get("id") for item in data.get("data", []) if isinstance(item, dict)}
    except Exception:
        # Network issues, rate limits, or API shape changes should never
        # prevent the app from starting.
        return

    if not available:
        return

    configured = set(COUNCIL_MODELS) | {CHAIRMAN_MODEL}
    missing = sorted(configured - available)
    if missing:
        print(
            "WARNING: the following model IDs in backend/config.py were not found "
            f"in OpenRouter's current model list: {', '.join(missing)}. "
            "Reviews using them will fail until you update COUNCIL_MODELS/CHAIRMAN_MODEL "
            "to models that exist on your OpenRouter account."
        )
