"""Configuration for the LLM Council."""

from contextvars import ContextVar
from pathlib import Path
from typing import Optional

# Per-request API key: set from the X-API-Key header only for LLM requests.
# ContextVar propagates to child asyncio tasks, so council functions pick it up.
_request_api_key: ContextVar[Optional[str]] = ContextVar('request_api_key', default=None)

# ---------------------------------------------------------------------------
# Public defaults mirror the original LLM Council setup. Edit these IDs to
# choose the models available through the user's OpenRouter account.
# ---------------------------------------------------------------------------
COUNCIL_MODELS = [
    "openai/gpt-5.6-luna",
    "google/gemini-3.7-flash",
    "meta/muse-spark-1.1",
    "qwen/qwen3.8-27b",
]

CHAIRMAN_MODEL = "google/gemini-3.7-flash"

# Per-request customization limits. Custom context is supplied by the local
# browser and is deliberately bounded before it reaches the model prompts.
MAX_CUSTOM_CONTEXT_LENGTH = 60_000

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Resource limits shared by the HTTP, prompt, and OpenRouter layers.
MAX_CONTENT_LENGTH = 20_000
MAX_IMAGE_BYTES = 10 * 1024 * 1024
# 10 MB of image bytes is ~13.4 MB base64 + JSON overhead, so the request
# cap needs headroom above the image cap to avoid false 413s.
MAX_REQUEST_BYTES = 16 * 1024 * 1024
MAX_API_KEY_LENGTH = 512
# Design verdicts (scorecard + prioritized issues + strengths + next steps)
# routinely need more headroom than a plain Q&A answer, so this is generous
# enough to avoid truncating a critique mid-section.
MAX_MODEL_OUTPUT_TOKENS = 10_000

# Data directory for conversation storage
DATA_DIR = str(Path(__file__).resolve().parent.parent / "data" / "conversations")

# Canonical public design-system tokens used by the browser UI and exported HTML.
def _load_tokens_css() -> str:
    try:
        return (
            Path(__file__).resolve().parent.parent / "design-system" / "tokens.css"
        ).read_text(encoding="utf-8").strip() + "\n"
    except OSError:
        # Never crash the API on a missing optional asset; export falls back
        # to unstyled but functional HTML.
        return ""


TOKENS_CSS = _load_tokens_css()

# --- Design critique mode ---
# Directory holding the design-principles skill library (markdown files).
DESIGN_PRINCIPLES_DIR = str(
    Path(__file__).resolve().parent.parent / "skills" / "design-principles"
)

