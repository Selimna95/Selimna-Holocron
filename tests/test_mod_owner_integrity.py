"""Regression checks for exact mod ownership and Acolyte donor eligibility."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ModOwnerIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.core = (ROOT / "modules/core.js").read_text(encoding="utf-8")
        cls.disciple = (ROOT / "modules/disciple.js").read_text(encoding="utf-8")
        cls.acolyte = (ROOT / "modules/acolyte.js").read_text(encoding="utf-8")

    def test_core_prefers_unique_base_id_when_display_name_collides(self):
        start = self.core.index("function getCharacterMods(c){")
        end = self.core.index("\nfunction modSpeedMetrics(m)", start)
        body = self.core[start:end]
        self.assertIn("baseIdOwners", body)
        self.assertIn("ownBase", body)
        self.assertIn("baseOwners", body)

    def test_disciple_resolves_exact_owner_without_partial_matches(self):
        start = self.disciple.index("function reallocationSourceRows(selected){")
        end = self.disciple.index("\nfunction renderReallocationResults()", start)
        body = self.disciple[start:end]
        self.assertIn("ownerToCharacter.get(owner)", body)
        self.assertIn("baseIdOwners", body)
        self.assertNotIn("owner.includes(", body)
        self.assertNotIn("k.includes(owner)", body)

    def test_acolyte_only_uses_incomplete_or_weak_non_gl_donors(self):
        start = self.acolyte.index("const donorStatuses=")
        end = self.acolyte.index("const modIdentity=", start)
        body = self.acolyte[start:end]
        self.assertIn("'INCOMPLETS'", body)
        self.assertIn("'TRÈS FAIBLES'", body)
        self.assertIn("'FAIBLES'", body)
        self.assertIn("!unit.isGL", body)
        self.assertNotIn("donorPool.slice(0,donorCount)", body)


if __name__ == "__main__":
    unittest.main()
