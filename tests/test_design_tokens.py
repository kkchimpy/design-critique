"""Guards against reintroducing per-component copies of design-system/tokens.css.

See design-system/README.md: tokens.css is the single canonical source for the
shared palette; app CSS and backend HTML templates must not redeclare them.
"""

import re
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
TOKENS_CSS = REPO_ROOT / "design-system" / "tokens.css"
VANILLA_CSS = REPO_ROOT / "vanilla" / "styles.css"
EXPORT_TEMPLATE = REPO_ROOT / "backend" / "templates" / "design-verdict.html"

TOKEN_PREFIXES = ("--dc-", "--color-", "--clay-", "--friendly-", "--radius-", "--shadow-")
CUSTOM_PROPERTY_RE = re.compile(r"--[a-z][a-z0-9-]*\s*:", re.IGNORECASE)


class DesignTokenConsistencyTests(unittest.TestCase):
    def test_tokens_css_defines_expected_names(self):
        content = TOKENS_CSS.read_text(encoding="utf-8")
        for name in ("--ink", "--surface-alt", "--color-type-default", "--pill-major-bg"):
            self.assertIn(name, content, f"design-system/tokens.css is missing {name}")

    def test_export_template_inlines_canonical_tokens(self):
        template = EXPORT_TEMPLATE.read_text(encoding="utf-8")
        self.assertIn("__TOKENS_CSS__", template)

    def test_no_app_css_redeclares_token_custom_properties(self):
        offenders = []
        for css_file in (VANILLA_CSS,):
            content = css_file.read_text(encoding="utf-8")
            for match in CUSTOM_PROPERTY_RE.finditer(content):
                name = match.group(0).rstrip(": \t").strip()
                if name.startswith(TOKEN_PREFIXES):
                    offenders.append(f"{css_file.relative_to(REPO_ROOT)}: {name}")
        self.assertEqual(
            offenders,
            [],
            "Found per-component token redeclarations; define these once in "
            f"design-system/tokens.css instead: {offenders}",
        )


if __name__ == "__main__":
    unittest.main()
