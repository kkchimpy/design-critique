"""Configuration for the LLM Council."""

from contextvars import ContextVar
from pathlib import Path
from typing import Optional

# Per-request API key: set from the X-API-Key header in each FastAPI endpoint.
# ContextVar propagates to child asyncio tasks, so council functions pick it up.
_request_api_key: ContextVar[Optional[str]] = ContextVar('request_api_key', default=None)


def get_effective_api_key() -> str:
    """Return the API key supplied by the local browser client."""
    return _request_api_key.get() or ""

# ---------------------------------------------------------------------------
# Public defaults mirror the original LLM Council setup. Edit these IDs to
# choose the models available through the user's OpenRouter account.
# ---------------------------------------------------------------------------
COUNCIL_MODELS = [
    "openai/gpt-5.1",
    "google/gemini-3-pro-preview",
    "anthropic/claude-sonnet-4.5",
    "x-ai/grok-4",
]

CHAIRMAN_MODEL = "google/gemini-3-pro-preview"

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Data directory for conversation storage
DATA_DIR = "data/conversations"

# --- Design critique mode ---
# Directory holding the design-principles skill library (markdown files).
DESIGN_PRINCIPLES_DIR = str(
    Path(__file__).resolve().parent.parent / "skills" / "design-principles"
)
