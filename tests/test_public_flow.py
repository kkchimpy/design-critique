import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pydantic import ValidationError

from backend import config, storage
from backend.council import (
    calculate_aggregate_rankings,
    generate_design_title,
    parse_ranking_from_text,
    stage0_ground_truth,
    stage1_collect_design_feedback,
)
from backend.export import render_verdict_html
from backend.main import SendMessageRequest, slug_from_title
from backend.markdown_renderer import render_markdown, render_ranking


class PublicFlowTests(unittest.TestCase):
    def test_ranking_parser_and_aggregate_are_transparent(self):
        ranking = """Evaluation\n\nFINAL RANKING:\n1. Response A\n2. Response A\n3. Response B"""
        self.assertEqual(
            parse_ranking_from_text(ranking),
            ["Response A", "Response A", "Response B"],
        )

        aggregate = calculate_aggregate_rankings(
            [
                {"ranking": ranking, "parsed_ranking": parse_ranking_from_text(ranking)},
            ],
            {"Response A": "openai/gpt-5.1", "Response B": "x-ai/grok-4"},
        )
        self.assertEqual(aggregate[0]["model"], "openai/gpt-5.1")
        self.assertEqual(aggregate[0]["rankings_count"], 1)
        self.assertEqual(aggregate[1]["rankings_count"], 1)

    def test_assistant_metadata_survives_storage_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            original_data_dir = storage.DATA_DIR
            storage.DATA_DIR = directory
            try:
                conversation_id = "11111111-1111-4111-8111-111111111111"
                storage.create_conversation(conversation_id)
                storage.add_assistant_message(
                    conversation_id,
                    [],
                    [],
                    {"model": "google/gemini-3-pro-preview", "response": "done"},
                    metadata={
                        "label_to_model": {"Response A": "openai/gpt-5.1"},
                        "aggregate_rankings": [],
                        "council_models": ["openai/gpt-5.1"],
                    },
                )
                saved = storage.get_conversation(conversation_id)
                self.assertEqual(
                    saved["messages"][0]["metadata"]["council_models"],
                    ["openai/gpt-5.1"],
                )
            finally:
                storage.DATA_DIR = original_data_dir

    def test_export_strips_unsafe_markup_and_embeds_image(self):
        html = render_verdict_html(
            title="Public review",
            context="Check the primary action",
            verdict_markdown="## Council Verdict\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(2))",
            image_data_url="data:image/png;base64,AAAA",
            annotations=[{"x": 50, "y": 50, "title": "Main action", "severity": 2}],
        )
        self.assertIn("data:image/png;base64,AAAA", html)
        self.assertNotIn("<script>alert(1)</script>", html)
        self.assertNotIn("javascript:alert(2)", html)
        self.assertNotIn("__VERDICT_JSON__", html)

    def test_export_matches_live_sections_pins_and_chips(self):
        html = render_verdict_html(
            title="Onboarding Review",
            context="Check the primary action",
            verdict_markdown=(
                "## Council Verdict\n\nSolid CTA visibility.\n\n"
                "## Scorecard\n\n| D | R |\n|---|---|\n| A | 5 |\n\n"
                "## Top Issues (Prioritized)\n\n1. Weak CTA\n\n"
                "## Strengths\n\nGood grid\n\n"
                "## Recommended Next Steps\n\nShip it"
            ),
            app_name="Example App",
            annotations=[
                {"x": 10, "y": 20, "title": "Weak CTA", "severity": 4},
                {"x": 30, "y": 40, "title": "Nice grid", "severity": 1, "category": "strength"},
                {"x": 50, "y": 60, "title": "Copy", "severity": 2},
            ],
        )
        for heading in ("Council Verdict", "Scorecard", "Top Issues (Prioritized)",
                        "Strengths", "Recommended Next Steps"):
            self.assertIn(f"<h2>{heading}</h2>", html)
        self.assertIn('class="pin critical"', html)
        self.assertIn('class="pin good"', html)
        self.assertIn('class="pin moderate"', html)
        self.assertIn('<span class="chip major">1 major</span>', html)
        self.assertIn('<span class="chip moderate">1 moderate</span>', html)
        self.assertIn("<h1>Onboarding Review</h1>", html)
        self.assertIn("1 moderate</span>", html)
        for dead in ("dc-callout", "__CALLOUTS__", '"ring"', "__AUDIENCE__",
                     "__VERDICT_JSON__", "dc-popover"):
            self.assertNotIn(dead, html)

    def test_invalid_conversation_id_does_not_touch_the_filesystem(self):
        self.assertIsNone(storage.get_conversation("../secret"))
        self.assertIsNone(storage.get_conversation_path("../secret"))
        self.assertFalse(storage.delete_conversation("not-a-uuid"))

    def test_message_validation_rejects_untrusted_image_payloads(self):
        with self.assertRaises(ValidationError):
            SendMessageRequest(image="data:image/png;base64,AAAA")

        valid_png = "data:image/png;base64,iVBORw0KGgo="
        request = SendMessageRequest(content="hello", image=valid_png)
        self.assertEqual(request.image, valid_png)

    def test_storage_list_skips_corrupt_files(self):
        with tempfile.TemporaryDirectory() as directory:
            original_data_dir = storage.DATA_DIR
            storage.DATA_DIR = directory
            try:
                with open(f"{directory}/broken.json", "w", encoding="utf-8") as file:
                    file.write("not json")
                self.assertEqual(storage.list_conversations(), [])
            finally:
                storage.DATA_DIR = original_data_dir

    def test_design_mode_stage0_and_stage1_build_prompts_without_crashing(self):
        # Regression test: stage0_ground_truth previously referenced an
        # undefined `stage0_result` variable (a leftover from a prompt-size
        # optimization meant for stage1), causing a NameError on every
        # design-critique review. query_model is mocked so this exercises the
        # real prompt-building code paths without hitting the network.
        fake_image = "data:image/png;base64,iVBORw0KGgo="

        with patch("backend.council.query_model") as mocked_query_model:
            mocked_query_model.return_value = {"content": "{}"}
            stage0_result = asyncio.run(stage0_ground_truth(fake_image, "First-time user onboarding"))
            self.assertIsInstance(stage0_result, dict)

        with patch("backend.council.query_models_parallel") as mocked_query_models_parallel:
            mocked_query_models_parallel.return_value = {"openai/gpt-5.1": {"content": "critique"}}
            stage1_results = asyncio.run(
                stage1_collect_design_feedback(
                    fake_image,
                    "First-time user onboarding",
                    models=["openai/gpt-5.1"],
                    stage0_result=stage0_result,
                )
            )
            self.assertEqual(stage1_results, [{"model": "openai/gpt-5.1", "response": "critique"}])

    def test_canonical_markdown_renderer_supports_shared_contract(self):
        rendered = render_markdown(
            "## Scorecard\n\n| Area | Score |\n| --- | --- |\n| Accessibility | **4** |\n\n```js\nalert(1)\n```\n\n[Safe](https://example.com) [Unsafe](javascript:alert(1))",
            sectioned=True,
        )
        self.assertIn('class="md-section md-section--scorecard"', rendered)
        self.assertIn("<table>", rendered)
        self.assertIn("<pre><code", rendered)
        self.assertIn('class="p-ref"', rendered)
        self.assertIn('href="https://example.com"', rendered)
        self.assertNotIn("javascript:", rendered)
        self.assertNotIn("<script", rendered)

    def test_ranking_renderer_deanonymizes_before_rendering(self):
        rendered = render_ranking(
            {"model": "reviewer", "ranking": "1. Response A"},
            {"Response A": "openai/gpt"},
        )
        self.assertIn("openai/gpt", rendered["ranking_html"])
        self.assertNotIn("Response A", rendered["ranking_html"])

    def test_canonical_design_tokens_are_declared_in_a_single_source(self):
        root = Path(__file__).resolve().parents[1]
        tokens_path = root / "design-system" / "tokens.css"
        self.assertTrue(tokens_path.exists(), "Expected a canonical design-system tokens file to exist")
        token_text = tokens_path.read_text(encoding="utf-8")
        self.assertIn("--ink: #292827;", token_text)
        self.assertIn("--secondary-text: #666666;", token_text)
        self.assertIn("--paper: #ffffff;", token_text)
        self.assertIn("--surface-alt: #f7f5f2;", token_text)
        self.assertIn("--radius-card: 12px;", token_text)
        self.assertIn("--pill-major-bg:#ffb084;", token_text)
        self.assertIn("--surface-alt", config.TOKENS_CSS if hasattr(config, 'TOKENS_CSS') else "")

    def test_smart_design_title_and_slug_generation(self):
        title_from_prompt = generate_design_title("Please review this onboarding checkout flow and primary buttons")
        self.assertEqual(title_from_prompt, "Onboarding Checkout Flow And Primary")

        title_from_stage0 = generate_design_title(
            "",
            stage0_result={"screen_type": "AI Web App Builder Workspace / Live Canvas"},
        )
        self.assertEqual(title_from_stage0, "Ai Web App Builder Workspace")

        slug = slug_from_title(title_from_stage0, "76278964-daf5-4187-9e48-fba81374328a")
        self.assertEqual(slug, "ai-web-app-builder-workspace-76278964")


class CouncilClientTests(unittest.TestCase):
    def test_parallel_failures_are_recorded_per_model(self):
        from backend import openrouter as or_mod

        async def fake(model, messages, errors=None, **kwargs):
            if model == "bad:free":
                if errors is not None:
                    errors[model] = "HTTP 400 Provider returned error"
                return None
            return {"content": "ok", "reasoning_details": None}

        async def run():
            errors = {}
            with patch.object(or_mod, "query_model", side_effect=fake):
                out = await or_mod.query_models_parallel(
                    ["good:free", "bad:free"], [{"role": "user", "content": "hi"}], errors=errors
                )
            return out, errors

        out, errors = asyncio.run(run())
        self.assertEqual(out["good:free"]["content"], "ok")
        self.assertIsNone(out["bad:free"])
        self.assertEqual(errors, {"bad:free": "HTTP 400 Provider returned error"})


if __name__ == "__main__":
    unittest.main()
