#!/usr/bin/env python3
"""Regenerate or validate the deterministic character-profile index."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROFILE_DIR = ROOT / "python" / "optimizer_profiles"
INDEX_PATH = PROFILE_DIR / "index.json"


def build_index() -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    errors: list[str] = []
    for path in sorted(PROFILE_DIR.glob("*.json")):
        if path.name == "index.json":
            continue
        try:
            profile = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"{path.name}: JSON illisible ({exc})")
            continue
        base_id = str(profile.get("base_id", "")).strip().upper()
        name = str(profile.get("name", "")).strip()
        stats = profile.get("base_stats")
        if not base_id or not name or not isinstance(stats, dict) or not stats:
            errors.append(f"{path.name}: champs requis absents (base_id, name, base_stats)")
            continue
        if any(not isinstance(v, (int, float)) or isinstance(v, bool) for v in stats.values()):
            errors.append(f"{path.name}: base_stats doit contenir uniquement des nombres")
            continue
        if base_id in result:
            errors.append(f"{path.name}: base_id dupliqué {base_id}")
            continue
        if path.name != f"{base_id}.json":
            errors.append(f"{path.name}: nom de fichier attendu {base_id}.json")
            continue
        result[base_id] = {"base_id": base_id, "name": name, "file": path.name}
    if errors:
        raise ValueError("\n".join(errors))
    return dict(sorted(result.items()))


def serialized(index: dict[str, dict[str, str]]) -> str:
    return json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="échoue si index.json n’est pas à jour")
    args = parser.parse_args()
    try:
        output = serialized(build_index())
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    if args.check:
        current = INDEX_PATH.read_text(encoding="utf-8") if INDEX_PATH.exists() else ""
        if current != output:
            print("index.json est obsolète. Exécutez : python scripts/generate-profile-index.py", file=sys.stderr)
            return 1
        print(f"Index valide : {len(json.loads(output))} profils de personnages.")
        return 0
    INDEX_PATH.write_text(output, encoding="utf-8")
    print(f"Index généré : {len(json.loads(output))} profils de personnages.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
