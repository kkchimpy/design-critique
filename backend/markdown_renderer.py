"""Canonical Markdown-to-safe-HTML renderer for all review surfaces."""

from __future__ import annotations

import re
from typing import Any, Dict, Optional

import bleach
import markdown as md


PRINCIPLES = (
    {
        "id": "visual-hierarchy",
        "words": ("visual hierarchy", "gestalt", "grouping", "proximity", "similarity"),
    },
    {
        "id": "learnability",
        "words": ("learnab", "discoverabil", "affordance", "heuristic", "mental model", "consistency"),
    },
    {
        "id": "error-prevention",
        "words": ("error", "feedback", "recovery", "undo", "redo", "prevention", "validation", "confirmation"),
    },
    {
        "id": "accessibility",
        "words": ("accessib", "wcag", "contrast", "aria", "screen reader", "colour blind", "color blind", "keyboard", "touch target"),
    },
    {
        "id": "motivation",
        "words": ("fogg", "behaviour", "behavior", "motivation", "ability", "prompt", "trigger", "call to action"),
    },
    {
        "id": "content",
        "words": ("microcopy", "voice", "tone", "plain language", "wording"),
    },
    {
        "id": "cognitive-load",
        "words": ("cognitive load", "cognitive", "dark pattern", "overload", "complexity", "overwhelm"),
    },
)

_ALLOWED_TAGS = [
    "a", "blockquote", "code", "em", "h1", "h2", "h3", "h4", "li", "ol",
    "p", "pre", "section", "strong", "table", "tbody", "td", "th",
    "thead", "tr", "ul",
]
_ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "target", "rel"],
    "section": ["class"],
}
_ALLOWED_PROTOCOLS = ["http", "https", "mailto"]


def section_slug(text: str) -> str:
    lower = str(text or "").lower()
    if "next step" in lower:
        return "next-steps"
    if "strength" in lower:
        return "strengths"
    if "scorecard" in lower:
        return "scorecard"
    if "issue" in lower:
        return "issues"
    if "verdict" in lower:
        return "verdict"
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", lower.strip())) or "section"


def _wrap_sections(rendered: str) -> str:
    parts = re.split(r"(?=<h[12][ >])", rendered)
    output: list[str] = []
    leading = parts.pop(0) if parts and not parts[0].startswith(("<h1", "<h2")) else ""
    if leading.strip():
        output.append(f'<div class="md-section md-section--lead">{leading}</div>')
    for part in parts:
        heading = re.match(r"<h[12][^>]*>(.*?)</h[12]>", part, re.DOTALL)
        slug = section_slug(re.sub(r"<[^>]+>", "", heading.group(1) if heading else "section"))
        output.append(f'<section class="md-section md-section--{slug}">{part}</section>')
    return "".join(output) or rendered


def render_markdown(markdown_text: str, *, sectioned: bool = False) -> str:
    rendered = md.markdown(
        str(markdown_text or ""),
        extensions=["extra", "tables", "fenced_code", "sane_lists"],
    )
    rendered = bleach.clean(
        rendered,
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRIBUTES,
        protocols=_ALLOWED_PROTOCOLS,
        strip=True,
    )
    rendered = _highlight_principles(rendered)
    return _wrap_sections(rendered) if sectioned else rendered


def _highlight_principles(text: str) -> str:
    for principle in PRINCIPLES:
        for word in principle["words"]:
            text = re.sub(
                re.escape(word),
                lambda m: f'<span class="p-ref">{m.group(0)}</span>',
                text,
                flags=re.IGNORECASE,
            )
    return text


def render_response(payload: Any, *, sectioned: bool = False) -> Any:
    if not isinstance(payload, dict):
        return payload
    result = dict(payload)
    if isinstance(result.get("response"), str):
        result["response_html"] = render_markdown(result["response"], sectioned=sectioned)
    return result


def render_ranking(payload: Any, label_to_model: Optional[Dict[str, str]] = None) -> Any:
    if not isinstance(payload, dict):
        return payload
    result = dict(payload)
    text = result.get("ranking", "")
    if isinstance(text, str) and label_to_model:
        # Model IDs come from the server's configured allowlist. They are
        # inserted as Markdown and escaped by the Markdown renderer.
        for label, model in label_to_model.items():
            text = text.replace(label, f"**{str(model)}**")
    if isinstance(text, str):
        result["ranking_html"] = render_markdown(text)
    return result


def render_conversation(conversation: Dict[str, Any]) -> Dict[str, Any]:
    """Add derived HTML to a stored conversation without mutating storage."""
    result = dict(conversation)
    rendered_messages = []
    for message in conversation.get("messages", []):
        if not isinstance(message, dict):
            continue
        rendered = dict(message)
        if rendered.get("role") == "assistant":
            stage1 = rendered.get("stage1") or []
            stage2 = rendered.get("stage2") or []
            metadata = rendered.get("metadata") or {}
            label_to_model = metadata.get("label_to_model") if isinstance(metadata, dict) else None
            rendered["stage1"] = [render_response(item) for item in stage1]
            rendered["stage2"] = [render_ranking(item, label_to_model) for item in stage2]
            rendered["stage3"] = render_response(
                rendered.get("stage3"),
                sectioned=rendered.get("mode") == "design",
            )
        rendered_messages.append(rendered)
    result["messages"] = rendered_messages
    return result