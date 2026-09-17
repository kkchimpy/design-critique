"""JSON-based storage for conversations."""

import json
import logging
import os
import re
import shutil
import threading
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from pathlib import Path
from .config import DATA_DIR


logger = logging.getLogger(__name__)

DEFAULT_CONVERSATION_TITLE = "New Conversation"

_STORAGE_LOCK = threading.RLock()

def _write_conversation(path: str, conversation: Dict[str, Any]):
    """Write a conversation to disk."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with _STORAGE_LOCK:
        import tempfile
        fd, temporary_path = tempfile.mkstemp(prefix='.conversation-', suffix='.tmp', dir=os.path.dirname(path))
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(conversation, f, indent=2, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())
            os.chmod(temporary_path, 0o600)
            os.replace(temporary_path, path)
        finally:
            if os.path.exists(temporary_path):
                os.unlink(temporary_path)


def _conversation_mode(messages: List[Dict[str, Any]]) -> str:
    for message in messages:
        if message.get("role") == "assistant" and message.get("mode") == "design":
            return "design"
    return "text"


def ensure_data_dir():
    """Ensure the data directory exists."""
    Path(DATA_DIR).mkdir(parents=True, exist_ok=True)


def _safe_conversation_id(conversation_id: str) -> Optional[str]:
    """Return a canonical UUID string, or None if the value is not a UUID."""
    try:
        return str(uuid.UUID(str(conversation_id)))
    except (ValueError, TypeError, AttributeError):
        return None


def slug_from_title(title: str, conv_id: str) -> str:
    """Generate a clean URL slug from title and short UUID prefix."""
    clean = re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-")
    short_hash = (conv_id or "")[:8]
    if clean and clean not in ("design-critique", "new-conversation", "critique"):
        return f"{clean[:32]}-{short_hash}" if short_hash else clean[:40]
    return f"design-critique-{short_hash}" if short_hash else "design-critique"


def get_conversation_path(conversation_id: str) -> Optional[str]:
    """Get the file path for a conversation, or None for an invalid id."""
    safe_id = _safe_conversation_id(conversation_id)
    if safe_id is None:
        return None
    data_root = Path(DATA_DIR).resolve()
    path = (data_root / f"{safe_id}.json").resolve()
    try:
        path.relative_to(data_root)
    except ValueError:
        return None
    return str(path)


def create_conversation(conversation_id: str) -> Dict[str, Any]:
    """
    Create a new conversation.

    Args:
        conversation_id: Unique identifier for the conversation

    Returns:
        New conversation dict
    """
    ensure_data_dir()

    conversation = {
        "id": conversation_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "title": DEFAULT_CONVERSATION_TITLE,
        "app_name": "",
        "messages": []
    }

    path = get_conversation_path(conversation_id)
    if path is None:
        raise ValueError("Invalid conversation id")
    _write_conversation(path, conversation)

    return conversation


def get_conversation(conversation_id: str) -> Optional[Dict[str, Any]]:
    """
    Load a conversation from storage.

    Args:
        conversation_id: Unique identifier for the conversation

    Returns:
        Conversation dict or None if not found
    """
    path = get_conversation_path(conversation_id)
    if path is None or not os.path.exists(path):
        return None

    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def list_conversations() -> List[Dict[str, Any]]:
    """
    List all conversations (metadata only).

    Returns:
        List of conversation metadata dicts
    """
    ensure_data_dir()
    target_dir = DATA_DIR

    conversations = []
    for filename in os.listdir(target_dir):
        if filename.endswith('.json'):
            path = os.path.join(target_dir, filename)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            except (OSError, json.JSONDecodeError, KeyError, TypeError) as exc:
                logger.debug("Skipping unreadable conversation file %s: %s", path, exc)
                continue
            if not isinstance(data, dict) or not data.get("id") or not data.get("created_at"):
                continue
            messages = data.get("messages", [])
            if not isinstance(messages, list):
                messages = []
            conversations.append({
                "id": data["id"],
                "created_at": data["created_at"],
                "title": data.get("title", DEFAULT_CONVERSATION_TITLE),
                "message_count": len(messages),
                "mode": _conversation_mode(messages),
            })

    # Sort by creation time, newest first
    conversations.sort(key=lambda x: x["created_at"], reverse=True)

    return conversations


def add_user_message(conversation_id: str, content: str, image: Optional[str] = None):
    """
    Add a user message to a conversation.

    Args:
        conversation_id: Conversation identifier
        content: User message content
        image: Optional image data URL (design critique mode)
    """
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    message: Dict[str, Any] = {
        "role": "user",
        "content": content
    }
    if image:
        message["image"] = image

    conversation.setdefault("messages", []).append(message)
    path = get_conversation_path(conversation["id"])
    if path is None:
        raise ValueError("Invalid conversation id")
    _write_conversation(path, conversation)


def add_assistant_message(
    conversation_id: str,
    stage1: List[Dict[str, Any]],
    stage2: List[Dict[str, Any]],
    stage3: Dict[str, Any],
    mode: str = "text",
    annotations: Optional[List[Dict[str, Any]]] = None,
    metadata: Optional[Dict[str, Any]] = None,
):
    """
    Add an assistant message with all 3 stages to a conversation.

    Args:
        conversation_id: Conversation identifier
        stage1: List of individual model responses
        stage2: List of model rankings
        stage3: Final synthesized response
        mode: "text" (default Q&A) or "design" (image critique)
        annotations: Optional list of design annotation pins (design mode only)
        metadata: Optional dictionary of evaluation metadata
    """
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    message: Dict[str, Any] = {
        "role": "assistant",
        "stage1": stage1,
        "stage2": stage2,
        "stage3": stage3,
        "mode": mode
    }
    if annotations is not None:
        message["annotations"] = annotations
    if metadata is not None:
        message["metadata"] = metadata

    conversation.setdefault("messages", []).append(message)
    path = get_conversation_path(conversation["id"])
    if path is None:
        raise ValueError("Invalid conversation id")
    _write_conversation(path, conversation)


def delete_conversation(conversation_id: str) -> bool:
    """
    Delete a conversation JSON file from storage.

    Returns:
        True if deleted, False if not found.
    """
    path = get_conversation_path(conversation_id)
    if path is None:
        return False
    if not os.path.exists(path):
        return False
    os.remove(path)
    return True


def update_conversation_title(conversation_id: str, title: str):
    """
    Update the title of a conversation.

    Args:
        conversation_id: Conversation identifier
        title: New title for the conversation
    """
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")
    conversation["title"] = str(title).strip()[:100] or DEFAULT_CONVERSATION_TITLE
    path = get_conversation_path(conversation["id"])
    if path is None:
        raise ValueError("Invalid conversation id")
    _write_conversation(path, conversation)


def update_conversation_app_name(conversation_id: str, app_name: str):
    """
    Update the published app/product name for a conversation (Figma App Details row).

    Args:
        conversation_id: Conversation identifier
        app_name: New app/product name, empty string clears it
    """
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")
    conversation["app_name"] = str(app_name).strip()[:120]
    path = get_conversation_path(conversation["id"])
    if path is None:
        raise ValueError("Invalid conversation id")
    _write_conversation(path, conversation)


def get_latest_design_verdict(conversation_id: str) -> Optional[Dict[str, Any]]:
    """
    Find the most recent design-mode verdict in a conversation, along with the
    user message (and image) that prompted it.

    Returns a dict with keys: title, context, verdict, image, council, or None
    if the conversation has no design-mode verdict.
    """
    conversation = get_conversation(conversation_id)
    if conversation is None:
        return None

    messages = conversation.get("messages", [])
    title = conversation.get("title", "Design Critique")

    for i in range(len(messages) - 1, -1, -1):
        msg = messages[i]
        if msg.get("role") == "assistant" and msg.get("mode") == "design":
            stage3 = msg.get("stage3") or {}
            verdict = stage3.get("response", "")

            # Walk backwards to find the user message + image that prompted it.
            context = ""
            image = None
            for j in range(i - 1, -1, -1):
                prev = messages[j]
                if prev.get("role") == "user":
                    context = prev.get("content", "")
                    image = prev.get("image")
                    break

            council = [
                s.get("model", "")
                for s in (msg.get("stage1") or [])
                if s.get("model")
            ]

            return {
                "title": title,
                "context": context,
                "app_name": conversation.get("app_name", ""),
                "verdict": verdict,
                "image": image,
                "annotations": msg.get("annotations") or [],
                "council": council,
                "metadata": msg.get("metadata") or {},
            }

    return None


def reset_all_data():
    """Remove stored conversations and generated artifacts, then recreate folders."""
    targets = [DATA_DIR]

    for target in targets:
        if os.path.exists(target):
            shutil.rmtree(target)

    ensure_data_dir()
