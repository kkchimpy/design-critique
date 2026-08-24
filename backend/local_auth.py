"""Per-process token so browser CSRF from other sites cannot call /api."""

import secrets
import time
from typing import Optional

_APP_TOKEN: Optional[str] = None
_APP_TOKEN_EXPIRES_AT = 0.0
APP_TOKEN_TTL_SECONDS = 30 * 60


def rotate_app_token() -> str:
    """Create a new token for this backend process."""
    global _APP_TOKEN, _APP_TOKEN_EXPIRES_AT
    _APP_TOKEN = secrets.token_urlsafe(32)
    _APP_TOKEN_EXPIRES_AT = time.monotonic() + APP_TOKEN_TTL_SECONDS
    return _APP_TOKEN


def get_app_token() -> str:
    if not _APP_TOKEN or time.monotonic() >= _APP_TOKEN_EXPIRES_AT:
        rotate_app_token()
    return _APP_TOKEN


def token_matches(provided: Optional[str]) -> bool:
    if not provided:
        return False
    if time.monotonic() >= _APP_TOKEN_EXPIRES_AT:
        return False
    return secrets.compare_digest(provided, get_app_token())
