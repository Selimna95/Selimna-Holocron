import importlib.util
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "update_gac_usage", Path(__file__).resolve().parents[1] / "scripts" / "update_gac_usage.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_unit_rows_keep_name_and_split_counts_by_role():
    text = """
# Leaders — best squad anchors
1▲2 Supreme Leader Kylo Ren 5s Offense 1496 Rating 238K battles
# Members — best squad pieces
1— Rey (Dark Side Vision) 5s Defense 1821 Rating 483K battles
"""
    parsed = MODULE.parse_unit_page(text, "5v5", "offense")
    assert parsed["Supreme Leader Kylo Ren"]["uses"] == 238000
    assert parsed["Supreme Leader Kylo Ren"]["roles"] == {"leader": 238000}
    assert "Rey (Dark Side Vision)" not in parsed


def test_unit_parser_preserves_member_and_side_dimension():
    text = """
## Members — best squad pieces
11▲1 CC-1119 "Appo" 3s Offense 1543 Rating 451K battles
"""
    parsed = MODULE.parse_unit_page(text, "3v3", "offense")
    assert parsed['CC-1119 "Appo"']["uses"] == 451000
    assert parsed['CC-1119 "Appo"']["byFormat"] == {"3v3": 451000}
    assert parsed['CC-1119 "Appo"']["bySide"] == {"offense": 451000}
    assert parsed['CC-1119 "Appo"']["roles"] == {"member": 451000}


def test_fleet_parser_counts_only_observed_ships():
    text = """
Image: Executor
Image: Hound's Tooth
Image: Razor Crest
Image: IG-2000
Image: Slave I
Image: TIE Dagger
Battles 12.4K
#1
"""
    fleets = MODULE.parse_fleet_page(text, "offense")
    assert len(fleets) == 1
    assert fleets[0]["uses"] == 12400
    assert fleets[0]["ships"] == ["Executor", "Hound's Tooth", "Razor Crest", "IG-2000", "Slave I", "TIE Dagger"]
