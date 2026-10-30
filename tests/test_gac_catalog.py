"""Tests for the SWGOH.GG live GAC catalogue parser."""
import unittest

from scripts.update_gac_catalog import (
    discover_previous_season,
    number_value,
    page_season,
    parse_page,
)


class GacCatalogParserTests(unittest.TestCase):
    def test_number_value_handles_thousands_and_suffixes(self):
        self.assertEqual(number_value("6,225"), 6225)
        self.assertEqual(number_value("51K"), 51000)
        self.assertEqual(number_value("1.2M"), 1200000)

    def test_discovers_latest_previous_season_from_source_links(self):
        html = """
        <a href="?league=kyber&amp;season=78">S78</a>
        <a href="?league=kyber&amp;season=82">S82</a>
        <a href="?league=kyber&amp;season=80">S80</a>
        """
        self.assertEqual(discover_previous_season(html, 84), 82)

    def test_extracts_complete_defense_team_and_statistics(self):
        members = ["The Stranger", "Barriss Offee", "Maul (Hate-Fueled)", "Starkiller", "Visas Marr"]
        images = "".join(f'<img alt="Image: {name}" src="https://game-assets.swgoh.gg/{i}.png">' for i, name in enumerate(members))
        html = f"""
        <html><title>SWGOH GAC 5v5 Squad Defense Tier List — Season 84</title>
        <div class="team-card">
          {images}
          <div>Elo 1944 Hold % 53.2% Battles 51K 221 builds #1</div>
        </div></html>
        """
        teams = parse_page(html, "5v5", "kyber", 84, "https://swgoh.gg/tier-list/gac/?side=defense", minimum_teams=1)
        self.assertEqual(len(teams), 1)
        self.assertEqual(teams[0]["members"], members)
        self.assertEqual(teams[0]["league"], "Kyber")
        self.assertEqual(teams[0]["season"], 84)
        self.assertEqual(teams[0]["rank"], 1)
        self.assertEqual(teams[0]["hold"], 53.2)
        self.assertEqual(teams[0]["battles"], 51000)

    def test_rejects_incomplete_or_wrong_size_team_rows(self):
        images = ''.join(f'<img alt="Image: Unit {i}" src="https://game-assets.swgoh.gg/{i}.png">' for i in range(4))
        html = f'<div>{images}<p>Hold % 50.0% Battles 2K #1</p></div>'
        with self.assertRaisesRegex(ValueError, "only 0 teams parsed"):
            parse_page(html, "5v5", "kyber", 84, "https://swgoh.gg/", minimum_teams=1)

    def test_reads_season_from_page_heading(self):
        self.assertEqual(page_season("<h1>Defense tier list — Season 84</h1>"), 84)

    def test_extracts_teams_from_reader_markdown(self):
        text = """
        Image: The Stranger
        Image: Barriss Offee
        Image: Maul (Hate-Fueled)
        Image: Starkiller
        Image: Visas Marr
        Elo 1944 Hold % 53.2% Battles 51K 221 builds
        #1 —
        Meta Explorer
        """
        teams = parse_page(text, "5v5", "kyber", 84, "https://swgoh.gg/", minimum_teams=1)
        self.assertEqual(len(teams), 1)
        self.assertEqual(teams[0]["members"][0], "The Stranger")
        self.assertEqual(teams[0]["battles"], 51000)


if __name__ == "__main__":
    unittest.main()
