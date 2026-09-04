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
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.export import render_verdict_html
from backend.storage import get_latest_design_verdict, list_conversations
from backend import config

_GALLERY_TEMPLATE_PATH = PROJECT_ROOT / "backend" / "templates" / "gallery-index.html"


def fetch_published_verdicts() -> List[Dict[str, Any]]:
    """Fetch public verdict metadata so Pages builds do not depend on ignored local JSON."""
    url = (
        f"{config.SUPABASE_URL}/rest/v1/verdicts"
        "?select=id,conversation_id,slug,title,context,image_url,html_url,council,annotations,avg_score,crit_count,high_count,med_count,created_at"
        "&order=created_at.desc"
    )
    request = urllib.request.Request(
        url,
        headers={
            "apikey": config.SUPABASE_ANON_KEY,
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        print(f"Warning: Supabase gallery sync failed: {error}", file=sys.stderr)
        return []
    return payload if isinstance(payload, list) else []


def published_item_to_gallery_item(record: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize a published Supabase row to the fields used by the gallery template."""
    annotations = record.get("annotations") or []
    return {
        "id": record.get("conversation_id") or record.get("id"),
        "slug": record.get("slug") or slug_from_title(record.get("title", ""), record.get("id", "")),
        "title": record.get("title") or "Design Critique",
        "context": record.get("context") or "",
        "created_at": record.get("created_at"),
        "image": record.get("image_url") or "",
        "avg_score": record.get("avg_score"),
        "score_dims_count": 0,
        "annotation_count": len(annotations),
        "crit_count": int(record.get("crit_count") or 0),
        "high_count": int(record.get("high_count") or 0),
        "med_count": int(record.get("med_count") or 0),
        "low_count": 0,
        "council": record.get("council") or [],
        "url": record.get("html_url") or f"{config.SUPABASE_URL}/storage/v1/object/public/{config.SUPABASE_BUCKET}/{record.get('slug', '')}.html",
    }


def fetch_published_html(record: Dict[str, Any]) -> Optional[str]:
    """Download the already-published standalone page for the Pages artifact."""
    html_url = record.get("html_url")
    if not html_url:
        return None
    try:
        request = urllib.request.Request(html_url, headers={"Accept": "text/html"})
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.read().decode("utf-8")
    except (urllib.error.URLError, TimeoutError, UnicodeDecodeError) as error:
        print(f"Warning: published verdict download failed: {error}", file=sys.stderr)
        return None


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
    """Generate one gallery card (Figma 34:309 — image + body + tag pills)."""
    safe_title = html_lib.escape(item.get("title") or "Design Critique")
    safe_context = html_lib.escape(item.get("context") or "Visual UX/UI design evaluation.")
    url = html_lib.escape(item.get("url") or "#")
    img_src = item.get("image") or ""
    avg_score = item.get("avg_score")
    crit_count = item.get("crit_count", 0)
    high_count = item.get("high_count", 0)
    med_count = item.get("med_count", 0)
    annotation_count = item.get("annotation_count", 0)
    category = item.get("category") or "Design"
    position = item.get("position", 1)
    iso_date = item.get("created_at") or ""
    short_date = format_iso_date(iso_date)

    if img_src:
        media_html = f'<img src="{html_lib.escape(img_src)}" alt="{safe_title}" loading="lazy" />'
    else:
        media_html = '<div class="placeholder">No screenshot</div>'

    pills = []
    if crit_count:
        pills.append(f'<span class="tag tag--crit">{crit_count} critical</span>')
    if high_count:
        pills.append(f'<span class="tag tag--high">{high_count} major</span>')
    if med_count:
        pills.append(f'<span class="tag tag--med">{med_count} moderate</span>')
    if annotation_count and not (crit_count or high_count or med_count):
        pills.append(f'<span class="tag tag--pin">{annotation_count} pins</span>')
    pills.append(f'<span class="tag tag--cat">{html_lib.escape(category)}</span>')
    tags_html = "".join(pills)

    date_html = f'<p class="card-date">{html_lib.escape(short_date)}</p>' if short_date else ""

    return (
        f'<a class="card" href="{url}" '
        f'data-title="{safe_title}" '
        f'data-date="{html_lib.escape(iso_date)}">'
        f'<div class="card-img-wrap">{media_html}</div>'
        f'<div class="card-body">'
        f'<h3 class="card-title">{safe_title}</h3>'
        f'<p class="card-context">{safe_context}</p>'
        f'<div class="card-meta">{tags_html}</div>'
        f'{date_html}'
        f'</div></a>'
    )


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

    # Discover local conversations first; local data remains useful during development.
    conversations = list_conversations(storage_dir=str(conv_dir))
    gallery_items: List[Dict[str, Any]] = []
    generated_verdicts: List[str] = []
    seen_slugs: set[str] = set()

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
        seen_slugs.add(slug)

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
            "category": "Design",
            "url": f"verdicts/{filename}",
        })

    # Published rows are the source of truth for GitHub Pages because local
    # conversation JSON files are intentionally excluded from git. Explicit
    # conversation directories stay isolated so unit tests and local fixtures
    # remain deterministic.
    if conversations_dir is None:
        for record in fetch_published_verdicts():
            item = published_item_to_gallery_item(record)
            slug = item["slug"]
            if not slug or slug in seen_slugs:
                continue

            published_html = fetch_published_html(record)
            if published_html:
                filename = f"{slug}.html"
                verdict_path = verdicts_dir / filename
                verdict_path.write_text(published_html, encoding="utf-8")
                generated_verdicts.append(str(verdict_path))
                item["url"] = f"verdicts/{filename}"

            gallery_items.append(item)
            seen_slugs.add(slug)

    # Sort items by created_at descending (newest first)
    gallery_items.sort(key=lambda x: x.get("created_at") or "", reverse=True)

    # 3. Generate cards HTML and replace in template
    for position, item in enumerate(gallery_items, start=1):
        item["position"] = position
    cards_html = "\n".join(build_card_html(item) for item in gallery_items)

    final_index_html = template_html.replace("__GALLERY_CARDS_HTML__", cards_html)

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
