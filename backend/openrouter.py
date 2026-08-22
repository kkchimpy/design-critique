"""OpenRouter API client for making LLM requests."""

import asyncio
import httpx
from typing import List, Dict, Any, Optional
from .config import get_effective_api_key, OPENROUTER_API_URL


# A single shared client reused across all requests. Reusing one client keeps
# the underlying connection pool warm so we avoid a fresh TLS handshake on every
# LLM call (3 models x multiple stages per message adds up quickly).
_client: Optional[httpx.AsyncClient] = None
_client_lock = asyncio.Lock()


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
    }

    try:
        client = await get_client()
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
    responses = await asyncio.gather(*tasks)

    # Map models to their responses
    return {model: response for model, response in zip(models, responses)}
