"""Per-process token so browser CSRF from other sites cannot call /api."""

import secrets
from typing import Optional

_APP_TOKEN: Optional[str] = None


def rotate_app_token() -> str:
    """Create a new token for this backend process."""
    global _APP_TOKEN
    _APP_TOKEN = secrets.token_urlsafe(32)
    return _APP_TOKEN


def get_app_token() -> str:
    if not _APP_TOKEN:
        rotate_app_token()
    return _APP_TOKEN


def token_matches(provided: Optional[str]) -> bool:
    if not provided:
        return False
    return secrets.compare_digest(provided, get_app_token())
