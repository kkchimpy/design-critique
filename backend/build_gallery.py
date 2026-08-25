#!/usr/bin/env python3
"""Static Site Generator for the Design Council Gallery.

Compiles conversation JSONs from `data/conversations` into a static site:
  - `_site/index.html`: Responsive gallery grid with live search & filters
  - `_site/verdicts/<slug>.html`: Standalone interactive verdict pages
  - `_site/manifest.json`: Metadata feed for all published critiques
"""

import argparse
import html as html_lib
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.export import render_verdict_html
from backend.storage import get_latest_design_verdict, list_conversations

_GALLERY_TEMPLATE_PATH = PROJECT_ROOT / "backend" / "templates" / "gallery-index.html"


def slug_from_title(title: str, conv_id: str) -> str:
    """Generate a clean URL slug from title and short UUID prefix."""
    clean = re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-")
    short_hash = (conv_id or "")[:8]
    if clean and clean not in ("design-critique", "new-conversation", "critique"):
        return f"{clean[:32]}-{short_hash}" if short_hash else clean[:40]
    return f"design-critique-{short_hash}" if short_hash else "design-critique"


def parse_scorecard_metrics(verdict_markdown: str) -> Tuple[Optional[float], int]:
    """
    Extract scorecard ratings from the markdown verdict table.

    Looks for patterns like:
    | Dimension | Rating | Reason |
    | **Visual hierarchy...** | **3/5** | ... |
    or `3.5/5`, `4 / 5`, etc.
    """
    if not verdict_markdown:
        return None, 0

    # Pattern for score like `3/5`, `**3/5**`, `3.5 / 5`
    score_matches = re.findall(
        r"\|\s*([^|\n]+?)\s*\|\s*\*?\*?([1-5](?:\.[0-9]+)?)\s*/\s*5\*?\*?\s*\|",
        verdict_markdown,
    )

    if not score_matches:
        # Alternative without /5: e.g. | Dimension | 3 |
        score_matches = re.findall(
            r"\|\s*([^|\n]+?)\s*\|\s*\*?\*?([1-5](?:\.[0-9]+)?)\*?\*?\s*\|\s*[^|\n]+?\|",
            verdict_markdown,
        )

    if not score_matches:
        return None, 0

    valid_scores: List[float] = []
    for match in score_matches:
        try:
            val = float(match[1])
            if 1.0 <= val <= 5.0:
                valid_scores.append(val)
        except (ValueError, TypeError):
            continue

    if not valid_scores:
        return None, 0

    avg_score = round(sum(valid_scores) / len(valid_scores), 1)
    return avg_score, len(valid_scores)


def format_iso_date(iso_str: Optional[str]) -> str:
    """Format an ISO timestamp to human-readable 'MMM D, YYYY'."""
    if not iso_str:
        return ""
    try:
        clean_iso = iso_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_iso)
        return dt.strftime("%b %d, %Y")
    except Exception:
        return iso_str[:10] if len(iso_str) >= 10 else iso_str


def build_card_html(item: Dict[str, Any]) -> str:
    """Generate HTML card for one critique item in the gallery grid."""
    safe_title = html_lib.escape(item.get("title") or "Design Critique")
    safe_context = html_lib.escape(item.get("context") or "Visual UX/UI design evaluation.")
    url = html_lib.escape(item.get("url") or "#")
    img_src = item.get("image")
    avg_score = item.get("avg_score")
    crit_count = item.get("crit_count", 0)
    high_count = item.get("high_count", 0)
    med_count = item.get("med_count", 0)
    annotation_count = item.get("annotation_count", 0)
    council_models = item.get("council", [])
    date_formatted = format_iso_date(item.get("created_at"))

    # Media element
    if img_src and img_src.startswith("data:image"):
        media_html = f'<img src="{img_src}" alt="{safe_title}" class="card-img" loading="lazy" />'
    else:
        media_html = '''
        <div class="card-img-placeholder">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          <span>No Screenshot</span>
        </div>'''

    # Score Pill
    score_pill_html = ""
    if avg_score is not None:
        score_class = "score-val"
        if avg_score < 3.0:
            score_class = "score-val--crit"
        elif avg_score < 4.0:
            score_class = "score-val--warn"
        score_pill_html = f'''
        <div class="score-pill">
          <span>Score</span>
          <span class="{score_class}">{avg_score:.1f} / 5</span>
        </div>'''

    # Badges
    badges_html = []
    if crit_count > 0:
        badges_html.append(f'<span class="badge badge--crit">{crit_count} Critical</span>')
    if high_count > 0:
        badges_html.append(f'<span class="badge badge--high">{high_count} Major</span>')
    if med_count > 0:
        badges_html.append(f'<span class="badge badge--med">{med_count} Moderate</span>')
    if annotation_count > 0 and not (crit_count or high_count or med_count):
        badges_html.append(f'<span class="badge badge--pins">{annotation_count} Pins</span>')

    badges_rendered = "".join(badges_html)

    council_label = f"{len(council_models)} Reviewer{'s' if len(council_models) != 1 else ''}"

    return f'''
    <a class="critique-card" href="{url}"
       data-title="{safe_title}"
       data-context="{safe_context}"
       data-crit-count="{crit_count}"
       data-score="{avg_score if avg_score is not None else 0}">
      <div class="card-media">
        {media_html}
        {score_pill_html}
      </div>
      <div class="card-body">
        <h2 class="card-title">{safe_title}</h2>
        <p class="card-context">{safe_context}</p>
        <div class="card-badges">
          {badges_rendered}
        </div>
        <div class="card-footer">
          <div class="council-models">
            <span class="council-count">{council_label}</span>
          </div>
          <span class="date-str">{date_formatted}</span>
        </div>
      </div>
    </a>'''


def build_gallery(
    conversations_dir: Optional[Path] = None,
    output_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Build static gallery index and all standalone critique verdict HTML pages.

    Returns summary dictionary of built artifacts.
    """
    conv_dir = Path(conversations_dir) if conversations_dir else (PROJECT_ROOT / "data" / "conversations")
    out_dir = Path(output_dir) if output_dir else (PROJECT_ROOT / "_site")
    verdicts_dir = out_dir / "verdicts"

    out_dir.mkdir(parents=True, exist_ok=True)
    verdicts_dir.mkdir(parents=True, exist_ok=True)

    # Read template
    if not _GALLERY_TEMPLATE_PATH.exists():
        raise FileNotFoundError(f"Gallery template not found: {_GALLERY_TEMPLATE_PATH}")
    template_html = _GALLERY_TEMPLATE_PATH.read_text(encoding="utf-8")

    # Discover conversations
    conversations = list_conversations(storage_dir=str(conv_dir))
    gallery_items: List[Dict[str, Any]] = []
    generated_verdicts: List[str] = []

    for conv in conversations:
        conv_id = conv.get("id")
        if not conv_id:
            continue

        verdict_data = get_latest_design_verdict(conv_id, storage_dir=str(conv_dir))
        if not verdict_data or not verdict_data.get("verdict"):
            continue

        title = verdict_data.get("title") or "Design Critique"
        context = verdict_data.get("context") or ""
        verdict_markdown = verdict_data.get("verdict") or ""
        image_data_url = verdict_data.get("image")
        council_members = verdict_data.get("council") or []
        annotations = verdict_data.get("annotations") or []

        # 1. Generate standalone verdict HTML page
        html_page = render_verdict_html(
            title=title,
            context=context,
            verdict_markdown=verdict_markdown,
            image_data_url=image_data_url,
            council_members=council_members,
            annotations=annotations,
        )

        slug = slug_from_title(title, conv_id)
        filename = f"{slug}.html"
        verdict_path = verdicts_dir / filename
        verdict_path.write_text(html_page, encoding="utf-8")
        generated_verdicts.append(str(verdict_path))

        # 2. Extract metrics
        avg_score, score_dims_count = parse_scorecard_metrics(verdict_markdown)
        crit_count = sum(1 for a in annotations if str(a.get("severity")) == "4")
        high_count = sum(1 for a in annotations if str(a.get("severity")) == "3")
        med_count = sum(1 for a in annotations if str(a.get("severity")) == "2")
        low_count = sum(1 for a in annotations if str(a.get("severity")) in ("0", "1"))

        gallery_items.append({
            "id": conv_id,
            "slug": slug,
            "title": title,
            "context": context,
            "created_at": conv.get("created_at"),
            "image": image_data_url,
            "avg_score": avg_score,
            "score_dims_count": score_dims_count,
            "annotation_count": len(annotations),
            "crit_count": crit_count,
            "high_count": high_count,
            "med_count": med_count,
            "low_count": low_count,
            "council": council_members,
            "url": f"verdicts/{filename}",
        })

    # Sort items by created_at descending (newest first)
    gallery_items.sort(key=lambda x: x.get("created_at") or "", reverse=True)

    # 3. Generate cards HTML and replace in template
    cards_html = "\n".join(build_card_html(item) for item in gallery_items)
    count_label = f"Showing {len(gallery_items)} verdict{'s' if len(gallery_items) != 1 else ''}"

    final_index_html = template_html.replace("__GALLERY_CARDS_HTML__", cards_html)
    final_index_html = final_index_html.replace("__COUNT_LABEL__", count_label)

    index_path = out_dir / "index.html"
    index_path.write_text(final_index_html, encoding="utf-8")

    # 4. Generate manifest.json
    manifest_data = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "total_verdicts": len(gallery_items),
        "verdicts": [
            {
                "id": it["id"],
                "slug": it["slug"],
                "title": it["title"],
                "created_at": it["created_at"],
                "url": it["url"],
                "avg_score": it["avg_score"],
                "annotation_count": it["annotation_count"],
                "crit_count": it["crit_count"],
                "high_count": it["high_count"],
                "council": it["council"],
            }
            for it in gallery_items
        ],
    }
    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest_data, indent=2), encoding="utf-8")

    return {
        "output_dir": str(out_dir),
        "index_html": str(index_path),
        "manifest_json": str(manifest_path),
        "verdict_count": len(gallery_items),
        "verdicts": generated_verdicts,
    }


def main():
    parser = argparse.ArgumentParser(description="Build static Design Critique gallery.")
    parser.add_argument(
        "--conversations-dir",
        type=Path,
        default=None,
        help="Path to directory containing conversation JSON files.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=PROJECT_ROOT / "_site",
        help="Path to output directory (default: _site).",
    )

    args = parser.parse_args()
    summary = build_gallery(
        conversations_dir=args.conversations_dir,
        output_dir=args.output_dir,
    )
    print(f"Successfully generated static gallery in {summary['output_dir']}")
    print(f"  • Index: {summary['index_html']}")
    print(f"  • Verdicts generated: {summary['verdict_count']}")


if __name__ == "__main__":
    main()
