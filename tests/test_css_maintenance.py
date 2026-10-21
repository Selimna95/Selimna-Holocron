"""Guardrails for incremental CSS cleanup.

Repeated selectors are not automatically defects: responsive media queries and
keyframes legitimately repeat them. This baseline prevents accidental growth
while the visual cascade is being refactored with browser coverage.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
BASELINE_EXTRA_SELECTOR_BLOCKS = {
    "app.css": 673,
    "holocron-system.css": 251,
    "sithari.css": 311,
}


def repeated_selector_extras(css: str) -> int:
    blocks = re.findall(r"([^{}]+)\{[^{}]*\}", css, re.S)
    selectors = []
    for raw in blocks:
        selector = re.sub(r"/\*[\s\S]*?\*/", "", raw).strip()
        if selector and not selector.startswith("@") and len(selector) < 250:
            selectors.append(selector)
    counts = {}
    for selector in selectors:
        counts[selector] = counts.get(selector, 0) + 1
    return sum(max(0, count - 1) for count in counts.values())


class CssMaintenanceTests(unittest.TestCase):
    def test_stylesheets_keep_the_intended_cascade_order(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        app = html.index('href="app.css?')
        sithari = html.index('href="sithari.css?')
        shared = html.index('href="holocron-system.css?')
        self.assertLess(app, sithari)
        self.assertLess(sithari, shared)

    def test_sithari_logic_remains_separate_from_its_visual_styles(self):
        sithari_js = (ROOT / "modules" / "sithari.js").read_text(encoding="utf-8")
        sithari_css = (ROOT / "sithari.css").read_text(encoding="utf-8")
        self.assertIn("function sithariCharacterMods", sithari_js)
        self.assertIn(".sithari-page", sithari_css)
        self.assertNotIn("<script", sithari_css)

    def test_duplicate_selector_debt_does_not_grow(self):
        for filename, maximum in BASELINE_EXTRA_SELECTOR_BLOCKS.items():
            with self.subTest(stylesheet=filename):
                css = (ROOT / filename).read_text(encoding="utf-8")
                self.assertLessEqual(
                    repeated_selector_extras(css),
                    maximum,
                    f"{filename} gained repeated selector blocks; review the cascade before adding another override.",
                )


if __name__ == "__main__":
    unittest.main()
