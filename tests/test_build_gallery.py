import json
import tempfile
import unittest
from pathlib import Path

from backend.build_gallery import (
    build_card_html,
    build_gallery,
    format_iso_date,
    parse_scorecard_metrics,
    slug_from_title,
)


class BuildGalleryTests(unittest.TestCase):
    def test_slug_from_title(self):
        self.assertEqual(
            slug_from_title("Onboarding Checkout Flow", "03fe2aa8-5932-4cb6-a417-ceaebf535f70"),
            "onboarding-checkout-flow-03fe2aa8",
        )
        self.assertEqual(
            slug_from_title("Design Critique", "03fe2aa8-5932-4cb6-a417-ceaebf535f70"),
            "design-critique-03fe2aa8",
        )
        self.assertEqual(
            slug_from_title("", "76278964-daf5-4187-9e48-fba81374328a"),
            "design-critique-76278964",
        )
    def test_parse_scorecard_metrics_standard_format(self):
        markdown = """
## Council Verdict
Overall solid design.

## Scorecard
| Dimension | Rating (1-5) | Justification |
| :--- | :---: | :--- |
| **Visual hierarchy & Gestalt grouping** | **3/5** | Clear layout |
| **Learnability & discoverability** | **2/5** | Complex nav |
| **Accessibility & WCAG** | **4/5** | Good contrast |
| **Cognitive load** | **3/5** | Moderate density |
"""
        avg_score, dims_count = parse_scorecard_metrics(markdown)
        self.assertEqual(dims_count, 4)
        self.assertEqual(avg_score, 3.0)

    def test_parse_scorecard_metrics_decimal_format(self):
        markdown = """
| Dimension | Score | Details |
| Visuals | 4.5/5 | High polish |
| Layout | 3.5/5 | Needs alignment |
"""
        avg_score, dims_count = parse_scorecard_metrics(markdown)
        self.assertEqual(dims_count, 2)
        self.assertEqual(avg_score, 4.0)

    def test_parse_scorecard_metrics_empty(self):
        avg_score, dims_count = parse_scorecard_metrics("")
        self.assertIsNone(avg_score)
        self.assertEqual(dims_count, 0)

        avg_score, dims_count = parse_scorecard_metrics("No table here")
        self.assertIsNone(avg_score)
        self.assertEqual(dims_count, 0)

    def test_format_iso_date(self):
        formatted = format_iso_date("2026-08-25T14:30:00.000000")
        self.assertEqual(formatted, "Aug 25, 2026")

        formatted_z = format_iso_date("2026-01-05T12:00:00Z")
        self.assertEqual(formatted_z, "Jan 05, 2026")

        self.assertEqual(format_iso_date(""), "")

    def test_build_card_html_escaping_and_badges(self):
        item = {
            "title": "Checkout Flow <script>alert(1)</script>",
            "context": "Review <b>primary</b> buttons & inputs",
            "url": "verdicts/12345678.html",
            "image": "data:image/png;base64,iVBORw0KGgo=",
            "avg_score": 3.2,
            "crit_count": 2,
            "high_count": 1,
            "med_count": 0,
            "annotation_count": 3,
            "council": ["openai/gpt-5", "google/gemini-3"],
            "created_at": "2026-08-25T10:00:00",
        }
        card_html = build_card_html(item)
        self.assertIn("Checkout Flow &lt;script&gt;alert(1)&lt;/script&gt;", card_html)
        self.assertNotIn("<script>alert(1)</script>", card_html)
        self.assertIn("2 critical", card_html)
        self.assertIn("1 major", card_html)
        self.assertNotIn("3.2 / 5", card_html)
        self.assertNotIn("2 Reviewers", card_html)
        self.assertIn("verdicts/12345678.html", card_html)

    def test_build_gallery_generates_index_and_verdicts(self):
        with tempfile.TemporaryDirectory() as conv_dir, tempfile.TemporaryDirectory() as out_dir:
            conv_id = "03fe2aa8-5932-4cb6-a417-ceaebf535f70"
            conv_data = {
                "id": conv_id,
                "created_at": "2026-08-25T12:00:00",
                "title": "Onboarding Design Review",
                "messages": [
                    {
                        "role": "user",
                        "content": "Check onboarding CTA hierarchy",
                        "image": "data:image/png;base64,iVBORw0KGgo=",
                    },
                    {
                        "role": "assistant",
                        "mode": "design",
                        "stage3": {
                            "model": "google/gemini-3.7-flash",
                            "response": "## Council Verdict\nSolid CTA visibility.\n\n## Scorecard\n| Dimension | Rating (1-5) | Justification |\n| Visuals | 4/5 | Clear |\n| WCAG | 4/5 | Good |",
                        },
                        "annotations": [
                            {
                                "x": 50.0,
                                "y": 50.0,
                                "title": "Primary Action",
                                "severity": 4,
                                "category": "issue",
                                "comment": "Low contrast button",
                            }
                        ],
                        "metadata": {
                            "council_models": ["google/gemini-3.7-flash", "openai/gpt-4o"],
                        },
                    },
                ],
            }
            conv_path = Path(conv_dir) / f"{conv_id}.json"
            conv_path.write_text(json.dumps(conv_data), encoding="utf-8")

            summary = build_gallery(
                conversations_dir=Path(conv_dir),
                output_dir=Path(out_dir),
            )

            expected_slug = slug_from_title("Onboarding Design Review", conv_id)
            self.assertEqual(summary["verdict_count"], 1)
            index_path = Path(out_dir) / "index.html"
            manifest_path = Path(out_dir) / "manifest.json"
            verdict_path = Path(out_dir) / "verdicts" / f"{expected_slug}.html"

            self.assertTrue(index_path.exists())
            self.assertTrue(manifest_path.exists())
            self.assertTrue(verdict_path.exists())

            # Check index contents
            index_content = index_path.read_text(encoding="utf-8")
            self.assertIn("Onboarding Design Review", index_content)
            self.assertIn(f"verdicts/{expected_slug}.html", index_content)
            self.assertIn("1 critical", index_content)

            # Check manifest contents
            manifest_content = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(manifest_content["total_verdicts"], 1)
            self.assertEqual(manifest_content["verdicts"][0]["slug"], expected_slug)
            self.assertEqual(manifest_content["verdicts"][0]["avg_score"], 4.0)


if __name__ == "__main__":
    unittest.main()
