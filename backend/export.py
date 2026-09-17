"""Build a polished, standalone HTML file from a design critique verdict.

Reads the public template as the single source of truth and substitutes
__TOKEN__ placeholders with per-verdict data. The generated page is fully
self-contained with inline CSS and an embedded image.
"""

import html as html_lib
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple

from .config import TOKENS_CSS
from .markdown_renderer import render_markdown, section_slug

_TEMPLATE_PATH = (
    Path(__file__).parent / "templates/design-verdict.html"
)

_PIN_TONES = {
    "4": "critical",
    "3": "major",
    "2": "moderate",
}


def _pin_tone_and_label(severity: int, category: str) -> Tuple[str, str]:
    """Return (tone_class, label) for a pin based on severity and category."""
    if category == "strength":
        return "good", "Good"
    sev_str = str(severity)
    tone = _PIN_TONES.get(sev_str, "minor")
    label = "Critical" if severity >= 4 else "Major" if severity == 3 else "Moderate" if severity == 2 else "Minor"
    return tone, label


_TOPIC_KEYWORDS: Tuple[Tuple[str, str], ...] = (
    ("onboard", "Onboarding"),
    ("checkout", "Checkout"),
    ("pay", "Checkout"),
    ("navig", "Navigation"),
    ("search", "Search"),
    ("setting", "Settings"),
    ("error", "Errors"),
    ("dash", "Dashboard"),
    ("notif", "Notifications"),
    ("pricing", "Pricing"),
    ("empty", "Empty state"),
)


def _topic_of(text: str) -> str:
    """Return the first matching topic label from text, or empty string."""
    t = (text or "").lower()
    for needle, label in _TOPIC_KEYWORDS:
        if needle in t:
            return label
    return ""


_SECTION_ORDER: Tuple[Tuple[str, str, str], ...] = (
    ("verdict", "Council Verdict", "sec soft lead"),
    ("scorecard", "Scorecard", "sec"),
    ("issues", "Top Issues (Prioritized)", "sec"),
    ("strengths", "Strengths", "sec"),
    ("next-steps", "Recommended Next Steps", "sec next"),
)

_SECTION_RE = re.compile(
    r'<section class="md-section md-section--([a-z0-9-]+)">(.*?)</section>',
    re.DOTALL,
)
_HEADING_RE = re.compile(r"\s*<(h1|h2)[^>]*>.*?</\1>\s*", re.DOTALL)


def _split_sections(verdict_html: str) -> str:
    found = {}
    for match in _SECTION_RE.finditer(verdict_html or ""):
        slug, inner = match.group(1), match.group(2)
        if slug not in found:
            found[slug] = _HEADING_RE.sub("", inner, count=1).strip()
    lead = found.pop("lead", "")
    blocks = []
    for slug, title, cls in _SECTION_ORDER:
        html = found.pop(slug, "")
        if html:
            blocks.append([cls, title, html])
    leftover = "".join(html for html in found.values() if html)
    if not blocks:
        blocks.append(["sec soft lead", "Council Verdict",
                       (lead + leftover).strip() or (verdict_html or "")])
    else:
        blocks[0][2] = lead + blocks[0][2] + leftover
    return "".join(
        f'<div class="{cls}"><h2>{html_lib.escape(title)}</h2>'
        f'{html if html else "<p>No scorecard in this verdict.</p>" if title == "Scorecard" else ""}</div>'
        for cls, title, html in blocks
        if html or title == "Scorecard"
    )


def _safe_script_json(value: object) -> str:
    """Serialize data without allowing a value to close the template script."""
    return (
        json.dumps(value, ensure_ascii=True)
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )


def _safe_coordinate(value: object) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(number):
        return 0.0
    return max(0.0, min(100.0, number))


def render_verdict_html(
    title: str,
    context: str,
    verdict_markdown: str,
    image_data_url: Optional[str] = None,
    council_members: Optional[list] = None,
    annotations: Optional[List[dict]] = None,
    app_name: str = "",
) -> str:
    """
    Render a complete standalone HTML document for a design verdict.

    Mirrors the live vanilla UI:
    • Header, canvas with clickable severity pins + annotation card
    • Details sections in Figma order (verdict, scorecard, issues, strengths, steps)
    • Canonical design-system tokens; fully self-contained (inline CSS, image)

    Args:
        title: Page/site title.
        context: The user's stated goal/context for the design.
        verdict_markdown: The chairman's final verdict in Markdown.
        image_data_url: Data URL of the first reviewed design image.
        council_members: List of reviewer/model names.
        annotations: List of pin dicts {x, y, title, severity, category, comment, principle}.
        app_name: Optional app/product name.

    Returns:
        A complete, self-contained HTML document as a string.
    """
    verdict_html = render_markdown(verdict_markdown, sectioned=True)

    safe_title = html_lib.escape(title or "Design Critique")
    page_context = (context or "").strip() or "Critique this design."
    safe_page_context = html_lib.escape(page_context)
    primary_image = html_lib.escape(
        image_data_url or "",
        quote=True,
    )
    if primary_image and not primary_image.startswith(("data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,")):
        primary_image = ""
    pins = annotations or []
    pins_json = _safe_script_json(pins)

    # Build the inline pin HTML (rendered server-side for no-JS graceful fallback)
    pins_html = ""
    for i, pin in enumerate(pins):
        tone, label = _pin_tone_and_label(pin.get("severity", 2), pin.get("category", ""))
        x = _safe_coordinate(pin.get("x"))
        y = _safe_coordinate(pin.get("y"))
        pins_html += (
            f'<button class="pin {tone}" '
            f'style="left:{x:.2f}%;top:{y:.2f}%;" '
            f'data-i="{i}" '
            f'aria-label="{html_lib.escape(pin.get("title",""))} — {label}"></button>'
        )

    # Header chips (same counts as the live UI).
    major_count = sum(
        1 for p in pins
        if p.get("category") != "strength" and _pin_tone_and_label(p.get("severity", 2), p.get("category", ""))[0] in ("critical", "major")
    )
    moderate_count = sum(
        1 for p in pins
        if p.get("category") != "strength" and _pin_tone_and_label(p.get("severity", 2), p.get("category", ""))[0] in ("moderate", "minor")
    )
    pills = []
    if major_count:
        pills.append(f'<span class="chip major">{major_count} major</span>')
    if moderate_count:
        pills.append(f'<span class="chip moderate">{moderate_count} moderate</span>')
    topic_label = _topic_of(title) or _topic_of(context)
    if topic_label:
        pills.append(f'<span class="chip topic">{html_lib.escape(topic_label)}</span>')
    else:
        pills.append(f'<span class="chip topic">{html_lib.escape("Design")}</span>')

    safe_app_name = html_lib.escape((app_name or "").strip() or "Untitled")

    pin_count = len(pins)
    hint_str = (
        f"{pin_count} annotation{'s' if pin_count != 1 else ''}"
        " · click a dot to read the feedback"
    )

    context_html = (
        f'<p class="footer-context">'
        f'<span class="context-label">Context</span>'
        f"{html_lib.escape(context.strip())}</p>"
    ) if context and context.strip() else ""

    footer_chips_html = "".join(
        f'<span class="footer-chip">{html_lib.escape(str(m))}</span>'
        for m in (council_members or [])
    )

    generated = datetime.now(timezone.utc).strftime("%B %d, %Y")

    template = _TEMPLATE_PATH.read_text(encoding="utf-8")
    replacements = {
        "__TOKENS_CSS__": TOKENS_CSS,
        "__TITLE__": safe_title,
        "__PAGE_CONTEXT__": safe_page_context,
        "__APP_NAME__": safe_app_name,
        "__CHIPS_HTML__": "".join(pills),
        "__IMG_SRC__": primary_image,
        "__PINS_HTML__": pins_html,
        "__PINS_JSON__": pins_json,
        "__SECTIONS_HTML__": _split_sections(verdict_html),
        "__HINT__": hint_str,
        "__CONTEXT_HTML__": context_html,
        "__FOOTER_CHIPS__": footer_chips_html,
        "__DATELINE__": f"Generated {generated}",
    }
    # Replace only template tokens. A value containing another token-like
    # string must remain literal model/user content.
    return re.sub(r"__([A-Z_]+)__", lambda match: replacements.get(match.group(0), match.group(0)), template)

