"""Configuration for the LLM Council."""

from contextvars import ContextVar
from pathlib import Path
from typing import Optional

# Per-request API key: set from the X-API-Key header only for LLM requests.
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
    "openai/gpt-5.6-luna",
    "google/gemini-3.7-flash",
    "meta/muse-spark-1.1",
    "qwen/qwen3.8-27b",
]

CHAIRMAN_MODEL = "google/gemini-3.7-flash"

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Resource limits shared by the HTTP, prompt, and OpenRouter layers.
MAX_CONTENT_LENGTH = 20_000
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_REQUEST_BYTES = 14 * 1024 * 1024
MAX_API_KEY_LENGTH = 512
# Design verdicts (scorecard + prioritized issues + strengths + next steps)
# routinely need more headroom than a plain Q&A answer, so this is generous
# enough to avoid truncating a critique mid-section.
MAX_MODEL_OUTPUT_TOKENS = 10_000

# Data directory for conversation storage
DATA_DIR = str(Path(__file__).resolve().parent.parent / "data" / "conversations")

# --- Design critique mode ---
# Directory holding the design-principles skill library (markdown files).
DESIGN_PRINCIPLES_DIR = str(
    Path(__file__).resolve().parent.parent / "skills" / "design-principles"
)

# --- Supabase Community Gallery Publishing ---
SUPABASE_URL = "https://ybnptwflkjxqhuzyrdky.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlibnB0d2Zsa2p4cWh1enlyZGt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDU3MTUsImV4cCI6MjEwMzIyMTcxNX0.uhPZf5qua6JzVVreuDH0fAeOaXSE96kCqHbsITId3iE"
SUPABASE_BUCKET = "verdicts"
PUBLIC_GALLERY_BASE_URL = "https://kkchimpy.github.io/design-critique"

