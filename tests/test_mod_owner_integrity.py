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
        cls.seigneur = (ROOT / "modules/seigneur.js").read_text(encoding="utf-8")
        cls.sithari = (ROOT / "modules/sithari.js").read_text(encoding="utf-8")

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
        self.assertIn("resolveModOwnerKey(m,ownerResolver)", body)
        self.assertIn("buildRosterOwnerResolver(rosterCharacters)", body)
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

    def test_all_four_mod_engines_wire_the_speed_safety_gate(self):
        self.assertIn("holocronAcolyteTransferPreservesSpeed(currentMod,donorMod,r.mods)", self.acolyte)
        self.assertIn("discipleSpeedSafeCandidates(selected,sourceRows,secondaryKey)", self.disciple)
        self.assertIn("forgeCandidatePreservesSpeed(character,profile,equipped,current,m)", self.seigneur)
        self.assertIn("sithariReplacementPreservesSpeed(selectedCharacter,current,m)", self.sithari)

    def test_sithari_uses_shared_base_id_first_owner_resolution(self):
        self.assertIn("buildRosterOwnerResolver(rosterCharacters)", self.sithari)
        self.assertIn("resolveModOwnerKey(m,ownerResolver)", self.sithari)
        self.assertNotIn("aliases.set(a,key)", self.sithari)
        self.assertIn("return getCharacterMods(c)||[]", self.sithari)

    def test_disciple_selection_uses_the_same_base_id_first_resolver(self):
        self.assertIn("resolveModOwnerKey(mod)", self.disciple)
        self.assertIn("resolveModOwnerKey(m,ownerResolver)", self.disciple)
        self.assertIn("ownerKey===selectedOwnerKey", self.disciple)

    def test_speed_set_bonus_is_counted_when_base_speed_is_known(self):
        self.assertIn("beforeProjection.baseSpeed<=0&&beforeProjection.hasFourPieceSpeedSet", self.seigneur)
        self.assertIn("before.baseSpeed<=0&&before.speedSetPieces>=4", self.sithari)
        self.assertIn("afterProjection.total+1e-9>=beforeProjection.total", self.seigneur)
        self.assertIn("after.total+1e-9<before.total", self.sithari)


if __name__ == "__main__":
    unittest.main()
