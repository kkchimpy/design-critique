"""Build a polished, standalone HTML file from a design critique verdict.

Reads the public template as the single source of truth and substitutes
__TOKEN__ placeholders with per-verdict data. The generated page is fully
self-contained with inline CSS and an embedded image.
"""

import html as html_lib
import json
import math
import re
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from .markdown_renderer import render_markdown

_TEMPLATE_PATH = (
    Path(__file__).parent / "templates/design-verdict.html"
)

# ---------------------------------------------------------------------------
# Annotation pin helpers (mirrors DesignCritique.jsx)
# ---------------------------------------------------------------------------

SEVERITY_LABELS = {
    "0": "Note",
    "1": "Minor",
    "2": "Moderate",
    "3": "Major",
    "4": "Critical",
}

_PIN_TONES = {
    "0": "note",
    "1": "low",
    "2": "med",
    "3": "high",
    "4": "crit",
}

# Optional pin ring color (overrides severity tone). Figma 34:2 uses hand-placed
# red+blue circles independent of severity. Council may set this; absent -> fall
# back to severity tone. Ponytail: extra key on pin, no new enum layer.
_RING_OVERRIDE = {"red": "crit", "blue": "high", "orange": "high", "green": "good"}


def _pin_tone(pin: dict) -> str:
    ring = str(pin.get("ring") or "").lower()
    if ring in _RING_OVERRIDE:
        return _RING_OVERRIDE[ring]
    if pin.get("category") == "strength":
        return "good"
    return _PIN_TONES.get(str(pin.get("severity", 2)), "med")


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
) -> str:
    """
    Render a complete standalone HTML document for a design verdict.

    Matches the interactive DesignCritique answers-page layout:
    • Image shown full-width with clickable numbered annotation pins
    • Clicking a pin slides open a right panel with the finding detail
    • "View full verdict" button progressively discloses the full Markdown verdict
    • Clay design-system tokens (cream canvas, Inter type, brand accents)
    • Principle-keyword colour-coding with hover tooltips in the verdict text

    Args:
        title: Page/site title.
        context: The user's stated goal/context for the design.
        verdict_markdown: The chairman's final verdict in Markdown.
        image_data_url: Data URL of the first reviewed design image.
        council_members: List of reviewer/model names.
        annotations: List of pin dicts {x, y, title, severity, category, comment, principle}.

    Returns:
        A complete, self-contained HTML document as a string.
    """
    verdict_html = render_markdown(verdict_markdown, sectioned=True)

    safe_title = html_lib.escape(title or "Design Critique")
    page_context = (context or "").strip() or "Critique this design."
    safe_page_context = html_lib.escape(page_context)
    council_name = "Design Critique Council"
    safe_council_name = html_lib.escape(council_name)
    primary_image = html_lib.escape(
        image_data_url or "",
        quote=True,
    )
    if primary_image and not primary_image.startswith(("data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,")):
        primary_image = ""
    pins = annotations or []
    pins_json = _safe_script_json(pins)
    callouts_json = _safe_script_json([p for p in pins if p.get("callout")])

    # Build the inline pin HTML (rendered server-side for no-JS graceful fallback)
    pins_html = ""
    for i, pin in enumerate(pins):
        tone = _pin_tone(pin)
        label = SEVERITY_LABELS.get(str(pin.get("severity", 2)), "Note")
        if pin.get("category") == "strength":
            label = "Strength"
        x = _safe_coordinate(pin.get("x"))
        y = _safe_coordinate(pin.get("y"))
        pins_html += (
            f'<button class="dc-pin dc-pin--{tone}" '
            f'style="left:{x:.2f}%;top:{y:.2f}%;" '
            f'data-index="{i}" '
            f'aria-label="{html_lib.escape(pin.get("title",""))} — {label}">'
            f'<span class="dc-pin-dot">{i + 1}</span>'
            f'</button>'
        )

    # Optional callout layer (Figma 34:2): structured notes anchored to pins.
    # Schema: { text, x, y, variant: "quote"|"note"|"plain" }.
    callouts_html = ""
    for pin in pins:
        c = pin.get("callout")
        if not isinstance(c, dict) or not c.get("text"):
            continue
        cx = _safe_coordinate(c.get("x", pin.get("x")))
        cy = _safe_coordinate(c.get("y", pin.get("y")))
        variant = html_lib.escape(str(c.get("variant") or "plain"))
        callouts_html += (
            f'<div class="dc-callout dc-callout--{variant}" '
            f'style="left:{cx:.2f}%;top:{cy:.2f}%;">'
            f'{html_lib.escape(c.get("text", ""))}</div>'
        )

    # Severity tag pills for the rail (Figma 34:196).
    crit_count = sum(1 for p in pins if str(p.get("severity")) == "4")
    high_count = sum(1 for p in pins if str(p.get("severity")) == "3")
    med_count = sum(1 for p in pins if str(p.get("severity")) == "2")
    pills = []
    if crit_count:
        pills.append(f'<span class="dc-tag dc-tag--crit">{crit_count} critical</span>')
    if high_count:
        pills.append(f'<span class="dc-tag dc-tag--high">{high_count} major</span>')
    if med_count:
        pills.append(f'<span class="dc-tag dc-tag--med">{med_count} moderate</span>')
    # Category pill: heuristic from title/context (Figma 34:196 always shows one).
    category_label: Optional[str] = None
    for needle, label in (("onboard", "Onboarding"), ("feed", "Feed"), ("navig", "Navigation"), ("dash", "Dashboard"), ("modal", "Modal"), ("settings", "Settings")):
        if needle in (title or "").lower() or needle in (context or "").lower():
            category_label = label
            break
    if not category_label:
        category_label = "Design"
    pills.append(f'<span class="dc-tag dc-tag--cat">{html_lib.escape(category_label)}</span>')
    tag_pills_html = "".join(pills)

    pin_count = len(pins)
    hint_str = (
        f"{pin_count} annotation{'s' if pin_count != 1 else ''}"
        " · click a circle to read the feedback"
    )

    context_html = ""
    if context and context.strip():
        context_html = (
            f'<p class="footer-context">'
            f'<span class="context-label">Context</span>'
            f"{html_lib.escape(context.strip())}</p>"
        )

    footer_chips_html = "".join(
        f'<span class="footer-chip">{html_lib.escape(str(m))}</span>'
        for m in (council_members or [])
    )

    generated = datetime.utcnow().strftime("%B %d, %Y")

    template = _TEMPLATE_PATH.read_text(encoding="utf-8")
    replacements = {
        "__TITLE__": safe_title,
        "__COUNCIL_NAME__": safe_council_name,
        "__PAGE_CONTEXT__": safe_page_context,
        "__IMG_SRC__": primary_image,
        "__PINS_HTML__": pins_html,
        "__PINS_JSON__": pins_json,
        "__CALLOUTS_HTML__": callouts_html,
        "__VERDICT_JSON__": _safe_script_json(verdict_html),
        "__HINT__": hint_str,
        "__CONTEXT_HTML__": context_html,
        "__FOOTER_CHIPS__": footer_chips_html,
        "__TAG_PILLS_HTML__": tag_pills_html,
        "__DATELINE__": f"Generated {generated}",
    }
    # Replace only template tokens. A value containing another token-like
    # string must remain literal model/user content.
    return re.sub(r"__([A-Z_]+)__", lambda match: replacements.get(match.group(0), match.group(0)), template)

