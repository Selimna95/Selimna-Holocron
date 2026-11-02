"""Regression tests for the public SWGOH.GG counter collector."""
import unittest

from scripts.update_gac_counters import (
    leader_links,
    parse_counter_page,
    season_pages,
)


class GacCounterParserTests(unittest.TestCase):
    def test_discovers_real_season_urls_and_formats(self):
        html = """
        <a href="/gac/counters/season/CHAMPIONSHIPS_GRAND_ARENA_GA2_EVENT_SEASON_84/">Season 84 - 5v5</a>
        <a href="/gac/counters/season/CHAMPIONSHIPS_GRAND_ARENA_GA2_EVENT_SEASON_83/">Season 83 - 3v3</a>
        <a href="/gac/counters/season/CHAMPIONSHIPS_GRAND_ARENA_GA2_EVENT_SEASON_82/">Season 82 - 5v5</a>
        """
        found = season_pages(html)
        self.assertEqual([x["season"] for x in found["5v5"]], [84, 82])
        self.assertEqual(found["3v3"][0]["season"], 83)
        self.assertIn("SEASON_84", found["5v5"][0]["url"])

    def test_extracts_leader_counter_links_with_season_id(self):
        html = """
        <a href="/gac/counters/GLREY/?season_id=CHAMPIONSHIPS_GRAND_ARENA_GA2_EVENT_SEASON_84">Rey Counters</a>
        <a href="/gac/counters/GENERALSKYWALKER/?season_id=CHAMPIONSHIPS_GRAND_ARENA_GA2_EVENT_SEASON_84">General Skywalker Counters</a>
        <a href="/gac/counters/season/CHAMPIONSHIPS_GRAND_ARENA_GA2_EVENT_SEASON_84/">Season 84</a>
        """
        links = leader_links(html, "https://swgoh.gg/gac/counters/season/test/")
        self.assertEqual(len(links), 2)
        self.assertEqual(links[0]["name"], "Rey")
        self.assertEqual(links[0]["slug"], "GLREY")
        self.assertIn("season_id=", links[0]["url"])

    def test_extracts_attack_team_specific_metrics_for_5v5(self):
        members = ["Supreme Leader Kylo Ren", "Rey (Dark Side Vision)", "Sith Trooper",
                   "General Hux", "Kylo Ren (Unmasked)"]
        images = "".join(
            f'<img alt="Image: {name}" src="https://game-assets.swgoh.gg/{i}.png">'
            for i, name in enumerate(members)
        )
        html = f"""
        <html><body><div class="counter-squad">
          {images}
          <div>Seen 1.2K Win % 91.5% Avg 56.8</div>
        </div></body></html>
        """
        leader = {"name": "Rey", "slug": "GLREY",
                  "url": "https://swgoh.gg/gac/counters/GLREY/?season_id=84"}
        rows = parse_counter_page(html, "5v5", leader, 84)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["attackMembers"], members)
        self.assertEqual(rows[0]["battles"], 1200)
        self.assertEqual(rows[0]["winRate"], 91.5)
        self.assertEqual(rows[0]["averageBanners"], 56.8)
        self.assertEqual(rows[0]["scope"], "leader")

    def test_extracts_3v3_and_rejects_wrong_squad_size(self):
        members = ["Darth Bane", "Darth Revan", "Sith Empire Trooper"]
        images = "".join(
            f'<img alt="Image: {name}" src="https://game-assets.swgoh.gg/{i}.png">'
            for i, name in enumerate(members)
        )
        html = f'<div>{images}<p>Seen 125 Win % 88% Avg 55.2</p></div>'
        leader = {"name": "Jabba", "slug": "JABBA",
                  "url": "https://swgoh.gg/gac/counters/JABBA/?season_id=83"}
        rows = parse_counter_page(html, "3v3", leader, 83)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["battles"], 125)
        self.assertEqual(len(rows[0]["attackMembers"]), 3)

        wrong_size = html.replace(images, images + '<img alt="Image: Extra" src="https://game-assets.swgoh.gg/extra.png">')
        self.assertEqual(parse_counter_page(wrong_size, "3v3", leader, 83), [])


if __name__ == "__main__":
    unittest.main()
