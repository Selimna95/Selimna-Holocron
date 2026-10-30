"""Repository hygiene checks for accidental download placeholders."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class RepositoryHygieneTests(unittest.TestCase):
    def test_ignore_rules_live_in_the_standard_file(self):
        ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("__pycache__/", ignore)
        self.assertIn("*.bak", ignore)
        self.assertIn("*.exe", ignore)

    def test_empty_download_placeholders_are_not_reintroduced(self):
        placeholders = [
            path.relative_to(ROOT).as_posix()
            for path in ROOT.rglob("*")
            if path.is_file() and path.name.startswith("download")
        ]
        self.assertEqual(placeholders, [])


if __name__ == "__main__":
    unittest.main()
