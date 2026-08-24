"""Canonical Markdown-to-safe-HTML renderer for all review surfaces."""

from __future__ import annotations

import html
import re
from typing import Any, Dict, Optional

import bleach
import markdown as md


PRINCIPLES = (
    {
        "id": "visual-hierarchy",
        "label": "Visual Hierarchy & Gestalt",
        "definition": "People perceive nearby, similar, aligned, or enclosed elements as groups. Use spacing, contrast, and order to make relationships clear at a glance.",
        "url": "https://en.wikipedia.org/wiki/Principles_of_grouping",
        "article_label": "Principles of grouping",
        "words": ("visual hierarchy", "gestalt", "grouping", "proximity", "similarity"),
    },
    {
        "id": "learnability",
        "label": "Learnability & Discovery",
        "definition": "Users should be able to discover what actions are possible and build a reliable mental model without needing prior instruction.",
        "url": "https://www.nngroup.com/articles/ten-usability-heuristics/",
        "article_label": "Nielsen heuristics",
        "words": ("learnab", "discoverabil", "affordance", "heuristic", "mental model", "consistency"),
    },
    {
        "id": "error-prevention",
        "label": "Error Prevention & Feedback",
        "definition": "Good interfaces prevent problems before they happen and give clear, timely feedback with an obvious recovery path when something needs attention.",
        "url": "https://www.nngroup.com/articles/ten-usability-heuristics/",
        "article_label": "Nielsen heuristics (#5 & #1)",
        "words": ("error", "feedback", "recovery", "undo", "redo", "prevention", "validation", "confirmation"),
    },
    {
        "id": "accessibility",
        "label": "Accessibility & WCAG",
        "definition": "Interfaces should be perceivable, operable, understandable, and robust for people using different abilities, devices, inputs, and assistive tools.",
        "url": "https://www.w3.org/WAI/WCAG22/quickref/?versions=2.1",
        "article_label": "WCAG 2.1 quick ref",
        "words": ("accessib", "wcag", "contrast", "aria", "screen reader", "colour blind", "color blind", "keyboard", "touch target"),
    },
    {
        "id": "motivation",
        "label": "Behaviour & Motivation",
        "definition": "A user acts when motivation, ability, and a prompt converge. Reduce friction and place the prompt where the user is ready to act.",
        "url": "https://www.behaviormodel.org/",
        "article_label": "Fogg Behavior Model",
        "words": ("fogg", "behaviour", "behavior", "motivation", "ability", "prompt", "trigger", "call to action"),
    },
    {
        "id": "content",
        "label": "Content & Microcopy",
        "definition": "Interface text should be specific, plain, timely, and action-oriented so users understand what happened and what to do next.",
        "url": "https://uxcontent.com/10-content-design-heuristics/",
        "article_label": "Content design heuristics",
        "words": ("microcopy", "voice", "tone", "plain language", "wording"),
    },
    {
        "id": "cognitive-load",
        "label": "Cognitive Load & Friction",
        "definition": "Reduce unnecessary mental effort by simplifying choices, exposing only relevant information, and making state, priority, and next steps obvious.",
        "url": "https://en.wikipedia.org/wiki/Heuristic_evaluation#Gerhardt-Powals_cognitive_engineering_principles",
        "article_label": "Gerhardt-Powals principles",
        "words": ("cognitive load", "cognitive", "dark pattern", "overload", "complexity", "overwhelm"),
    },
)

_ALLOWED_TAGS = [
    "a", "blockquote", "code", "em", "h1", "h2", "h3", "h4", "li", "ol",
    "p", "pre", "section", "span", "strong", "table", "tbody", "td", "th",
    "thead", "tr", "ul",
]
_ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "target", "rel"],
    "section": ["class"],
    "span": ["class", "data-principle-id", "data-principle-label", "data-principle-definition", "data-principle-url", "data-principle-article-label"],
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


def _highlight_principles(fragment: str) -> str:
    """Add controlled principle spans to already-sanitized HTML text nodes."""
    import html.parser

    class Highlighter(html.parser.HTMLParser):
        def __init__(self) -> None:
            super().__init__(convert_charrefs=False)
            self.output: list[str] = []
            self.skip_depth = 0

        def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
            self.output.append("<" + tag)
            for name, value in attrs:
                self.output.append(f' {name}="{html.escape(value or "", quote=True)}"')
            self.output.append(">")
            if tag in {"code", "pre", "script", "style", "a"}:
                self.skip_depth += 1

        def handle_startendtag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
            self.handle_starttag(tag, attrs)
            self.output[-1] = self.output[-1][:-1] + "/>"

        def handle_endtag(self, tag: str) -> None:
            self.output.append(f"</{tag}>")
            if tag in {"code", "pre", "script", "style", "a"} and self.skip_depth:
                self.skip_depth -= 1

        def handle_comment(self, data: str) -> None:
            self.output.append(f"<!--{data}-->")

        def handle_entityref(self, name: str) -> None:
            self.output.append(f"&{name};")

        def handle_charref(self, name: str) -> None:
            self.output.append(f"&#{name};")

        def handle_data(self, data: str) -> None:
            if self.skip_depth:
                self.output.append(data)
                return
            cursor = 0
            matches = []
            for principle in PRINCIPLES:
                for word in principle["words"]:
                    matches.extend((match.start(), match.end(), match.group(), principle) for match in re.finditer(re.escape(word), data, re.IGNORECASE))
            for start, end, value, principle in sorted(matches, key=lambda item: (item[0], -(item[1] - item[0]))):
                if start < cursor:
                    continue
                self.output.append(html.escape(data[cursor:start]))
                self.output.append(
                    '<span class="p-ref" data-principle-id="{}" data-principle-label="{}" data-principle-definition="{}" data-principle-url="{}" data-principle-article-label="{}">{}</span>'.format(
                        html.escape(principle["id"], quote=True),
                        html.escape(principle["label"], quote=True),
                        html.escape(principle["definition"], quote=True),
                        html.escape(principle["url"], quote=True),
                        html.escape(principle["article_label"], quote=True),
                        html.escape(value),
                    )
                )
                cursor = end
            self.output.append(html.escape(data[cursor:]))

    parser = Highlighter()
    parser.feed(fragment)
    return "".join(parser.output)


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
        for label, model in label_to_model.items():
            # Model IDs come from the server's configured allowlist. They are
            # inserted as Markdown and escaped by the Markdown renderer.
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


def render_stage1_results(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [render_response(item) for item in results]


def render_stage2_results(
    results: list[dict[str, Any]],
    label_to_model: Optional[Dict[str, str]] = None,
) -> list[dict[str, Any]]:
    return [render_ranking(item, label_to_model) for item in results]
