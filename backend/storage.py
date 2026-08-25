"""JSON-based storage for conversations."""

import json
import os
import shutil
import tempfile
import threading
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
from pathlib import Path
from .config import DATA_DIR


DEFAULT_CONVERSATION_TITLE = "New Conversation"
_STORAGE_LOCK = threading.RLock()


def _ensure_dir(path: str):
    Path(path).mkdir(parents=True, exist_ok=True)


def _load_conversation_or_raise(conversation_id: str) -> Dict[str, Any]:
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")
    return conversation


def _conversation_mode(messages: List[Dict[str, Any]]) -> str:
    for message in messages:
        if message.get("role") == "assistant" and message.get("mode") == "design":
            return "design"
    return "text"


def ensure_data_dir(storage_dir: Optional[str] = None):
    """Ensure the data directory exists."""
    _ensure_dir(storage_dir or DATA_DIR)


def _safe_conversation_id(conversation_id: str) -> Optional[str]:
    """Return a canonical UUID string, or None if the value is not a UUID."""
    try:
        return str(uuid.UUID(str(conversation_id)))
    except (ValueError, TypeError, AttributeError):
        return None


def get_conversation_path(conversation_id: str, storage_dir: Optional[str] = None) -> Optional[str]:
    """Get the file path for a conversation, or None for an invalid id."""
    safe_id = _safe_conversation_id(conversation_id)
    if safe_id is None:
        return None
    data_root = Path(storage_dir or DATA_DIR).resolve()
    path = (data_root / f"{safe_id}.json").resolve()
    try:
        path.relative_to(data_root)
    except ValueError:
        return None
    return str(path)


def create_conversation(conversation_id: str, storage_dir: Optional[str] = None) -> Dict[str, Any]:
    """
    Create a new conversation.

    Args:
        conversation_id: Unique identifier for the conversation
        storage_dir: Optional override for data directory

    Returns:
        New conversation dict
    """
    ensure_data_dir(storage_dir)

    conversation = {
        "id": conversation_id,
        "created_at": datetime.utcnow().isoformat(),
        "title": DEFAULT_CONVERSATION_TITLE,
        "messages": []
    }

    # Save to file
    path = get_conversation_path(conversation_id, storage_dir=storage_dir)
    if path is None:
        raise ValueError("Invalid conversation id")
    _atomic_write(path, conversation)

    return conversation


def get_conversation(conversation_id: str, storage_dir: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Load a conversation from storage.

    Args:
        conversation_id: Unique identifier for the conversation
        storage_dir: Optional override for data directory

    Returns:
        Conversation dict or None if not found
    """
    path = get_conversation_path(conversation_id, storage_dir=storage_dir)
    if path is None or not os.path.exists(path):
        return None

    try:
        with _STORAGE_LOCK, open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def _atomic_write(path: str, conversation: Dict[str, Any]):
    """Write a conversation without exposing a partially-written JSON file."""
    directory = os.path.dirname(path)
    with _STORAGE_LOCK:
        fd, temporary_path = tempfile.mkstemp(prefix='.conversation-', suffix='.tmp', dir=directory)
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


def save_conversation(conversation: Dict[str, Any], storage_dir: Optional[str] = None):
    """
    Save a conversation to storage.

    Args:
        conversation: Conversation dict to save
        storage_dir: Optional override for data directory
    """
    ensure_data_dir(storage_dir)

    path = get_conversation_path(conversation['id'], storage_dir=storage_dir)
    if path is None:
        raise ValueError("Invalid conversation id")
    _atomic_write(path, conversation)


def list_conversations(storage_dir: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    List all conversations (metadata only).

    Args:
        storage_dir: Optional override for data directory

    Returns:
        List of conversation metadata dicts
    """
    ensure_data_dir(storage_dir)
    target_dir = storage_dir or DATA_DIR

    conversations = []
    for filename in os.listdir(target_dir):
        if filename.endswith('.json'):
            path = os.path.join(target_dir, filename)
            try:
                with _STORAGE_LOCK, open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            except (OSError, json.JSONDecodeError, KeyError, TypeError):
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


def add_user_message(conversation_id: str, content: str, image: Optional[str] = None, storage_dir: Optional[str] = None):
    """
    Add a user message to a conversation.

    Args:
        conversation_id: Conversation identifier
        content: User message content
        image: Optional image data URL (design critique mode)
        storage_dir: Optional override for data directory
    """
    with _STORAGE_LOCK:
        conversation = get_conversation(conversation_id, storage_dir=storage_dir)
        if conversation is None:
            raise ValueError(f"Conversation {conversation_id} not found")

        message: Dict[str, Any] = {
            "role": "user",
            "content": content
        }
        if image:
            message["image"] = image

        conversation.setdefault("messages", []).append(message)
        save_conversation(conversation, storage_dir=storage_dir)


def add_assistant_message(
    conversation_id: str,
    stage1: List[Dict[str, Any]],
    stage2: List[Dict[str, Any]],
    stage3: Dict[str, Any],
    mode: str = "text",
    annotations: Optional[List[Dict[str, Any]]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    storage_dir: Optional[str] = None,
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
        storage_dir: Optional override for data directory
    """
    with _STORAGE_LOCK:
        conversation = get_conversation(conversation_id, storage_dir=storage_dir)
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
        save_conversation(conversation, storage_dir=storage_dir)


def delete_conversation(conversation_id: str, storage_dir: Optional[str] = None) -> bool:
    """
    Delete a conversation JSON file from storage.

    Returns:
        True if deleted, False if not found.
    """
    path = get_conversation_path(conversation_id, storage_dir=storage_dir)
    if path is None:
        return False
    with _STORAGE_LOCK:
        if not os.path.exists(path):
            return False
        os.remove(path)
        return True


def update_conversation_title(conversation_id: str, title: str, storage_dir: Optional[str] = None):
    """
    Update the title of a conversation.

    Args:
        conversation_id: Conversation identifier
        title: New title for the conversation
        storage_dir: Optional override for data directory
    """
    with _STORAGE_LOCK:
        conversation = get_conversation(conversation_id, storage_dir=storage_dir)
        if conversation is None:
            raise ValueError(f"Conversation {conversation_id} not found")
        conversation["title"] = str(title).strip()[:100] or DEFAULT_CONVERSATION_TITLE
        save_conversation(conversation, storage_dir=storage_dir)


def get_latest_design_verdict(conversation_id: str, storage_dir: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Find the most recent design-mode verdict in a conversation, along with the
    user message (and image) that prompted it.

    Returns a dict with keys: title, context, verdict, image, council, or None
    if the conversation has no design-mode verdict.
    """
    conversation = get_conversation(conversation_id, storage_dir=storage_dir)
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

    with _STORAGE_LOCK:
        for target in targets:
            if os.path.exists(target):
                shutil.rmtree(target)

        ensure_data_dir()
