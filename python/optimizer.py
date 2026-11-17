"""
SWGOH Optimizer — version Kyber / Web V17
Drop-in module exposing optimize_kyber().

Important:
- Handles the imported slot "7" as Square.
- Uses the Kyber reference supplied by the project.
- Uses bounded beam search so 1,986 mods do not cause an enormous
  itertools.product() search.
"""

import json
import heapq
import re
import os
import unicodedata
from functools import lru_cache
try:
    from importer import diagnostic_log
except Exception:
    def diagnostic_log(message):
        pass

SLOTS = ("Square", "Arrow", "Diamond", "Triangle", "Circle", "Cross")
_MOD_ENGINE_BRIDGE = None
_MOD_NORMALIZE_BRIDGE = None
_MOD_ENGINE_BATCH_BRIDGE = None
_MOD_ENGINE_SPEED_BRIDGE = None


def set_mod_engine_bridge(bridge, normalize_bridge=None, batch_bridge=None, speed_bridge=None):
    """Inject the shared JS projection, batch, normalization and speed-only bridges."""
    global _MOD_ENGINE_BRIDGE, _MOD_NORMALIZE_BRIDGE, _MOD_ENGINE_BATCH_BRIDGE, _MOD_ENGINE_SPEED_BRIDGE
    _MOD_ENGINE_BRIDGE = bridge
    _MOD_NORMALIZE_BRIDGE = normalize_bridge
    _MOD_ENGINE_BATCH_BRIDGE = batch_bridge
    _MOD_ENGINE_SPEED_BRIDGE = speed_bridge
    _normalized_mod_cached.cache_clear()


@lru_cache(maxsize=20000)
def _normalized_mod_cached(serialized):
    if _MOD_NORMALIZE_BRIDGE is None:
        raise RuntimeError("Normalisation partagée des mods non initialisée.")
    payload = _MOD_NORMALIZE_BRIDGE(serialized)
    result = json.loads(str(payload))
    if not isinstance(result, dict):
        raise RuntimeError("Réponse invalide du normaliseur partagé.")
    return result


def _normalized_mod(mod):
    serialized = json.dumps(mod or {}, ensure_ascii=False, separators=(",", ":"))
    return _normalized_mod_cached(serialized)


def to_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _normalize_profile_identity(value):
    """Normalize SWGOH unit ids/names for safe profile matching."""
    text = unicodedata.normalize("NFKD", str(value or "").casefold())
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]", "", text)


def resolve_character_profile(profiles, base_id="", name=""):
    """Resolve a complete reference profile by id, then unambiguous name."""
    if not isinstance(profiles, dict):
        return {}
    wanted_id = _normalize_profile_identity(base_id)
    wanted_name = _normalize_profile_identity(name)
    if wanted_id:
        direct = profiles.get(str(base_id or "").strip().upper())
        if isinstance(direct, dict) and isinstance(direct.get("base_stats"), dict) and direct["base_stats"]:
            return direct
        matches = [
            profile for profile in profiles.values()
            if isinstance(profile, dict)
            and _normalize_profile_identity(profile.get("base_id")) == wanted_id
            and isinstance(profile.get("base_stats"), dict)
            and profile["base_stats"]
        ]
        if len(matches) == 1:
            return matches[0]
        # An explicit baseId is authoritative. Never substitute a name match:
        # homonyms and stale profile labels must fail closed.
        return {}
    if wanted_name:
        matches = [
            profile for profile in profiles.values()
            if isinstance(profile, dict)
            and _normalize_profile_identity(profile.get("name") or profile.get("character")) == wanted_name
            and isinstance(profile.get("base_stats"), dict)
            and profile["base_stats"]
        ]
        if len(matches) == 1:
            return matches[0]
    return {}


def resolve_character_base_stats(profiles, base_id="", name=""):
    profile = resolve_character_profile(profiles, base_id, name)
    return profile.get("base_stats", {}) if isinstance(profile, dict) else {}


def validate_profile_compatibility(profile, character_metadata):
    """Refuse a static stat snapshot when its progression differs from the live roster."""
    if not isinstance(profile, dict) or not profile:
        raise RuntimeError("Profil de référence absent : compatibilité impossible à vérifier.")
    if not isinstance(character_metadata, dict):
        raise RuntimeError("Métadonnées du personnage absentes : compatibilité impossible à vérifier.")

    fields = (
        ("level", "niveau"),
        ("rarity", "rareté"),
        ("gear_level", "gear"),
        ("relic_tier", "palier de relique"),
    )
    for field, label in fields:
        expected = profile.get(field)
        actual = character_metadata.get(field)
        if expected is None or actual is None:
            raise RuntimeError(
                f"Profil de statistiques non vérifiable : {label} absent "
                f"de la référence ou du roster."
            )
        try:
            expected_number = float(expected)
            actual_number = float(actual)
        except (TypeError, ValueError):
            raise RuntimeError(f"Profil de statistiques non vérifiable : {label} invalide.")
        if expected_number != actual_number:
            raise RuntimeError(
                f"Profil de statistiques incompatible : {label} référence "
                f"{expected_number:g}, roster {actual_number:g}. "
                "Aucune optimisation ne sera calculée avec cette référence."
            )
    return True


def normalize_slot(slot):
    """Delegate slot identity to the shared JavaScript mod engine."""
    if slot is None or isinstance(slot, bool):
        return None
    normalized = _normalized_mod({"slot": slot})
    return normalized.get("slot") or str(slot)


def mod_slot_value(mod):
    """Read a mod slot from all supported importer/exporter field names."""
    if not isinstance(mod, dict):
        return None
    for key in ("slot", "slot_id", "slotId", "mod_slot", "modSlot"):
        if key in mod and mod.get(key) is not None:
            return mod.get(key)
    return None


def mod_id(mod):
    """Return a stable-in-search identity, even when an importer omits mod IDs."""
    if not isinstance(mod, dict):
        return ("__object__", id(mod))
    explicit = mod.get("game_id") or mod.get("id")
    return explicit if explicit is not None else ("__object__", id(mod))


def normalize_set(value):
    normalized = _normalized_mod({"set": value})
    return normalized.get("setName")


def mod_set(mod):
    if not isinstance(mod, dict):
        return None
    return _normalized_mod(mod).get("setName")


def mod_stats(mod):
    """Return canonical stat values from the shared mod normalizer."""
    normalized = _normalized_mod(mod)
    out = {}
    percent_suffix = {"offense", "defense", "health", "protection", "speed"}
    entries = [normalized.get("primary")] + list(normalized.get("secondaries") or [])
    for stat in entries:
        if not isinstance(stat, dict) or stat.get("value") is None or not stat.get("key") or stat.get("unit") not in {"flat", "percentagePoints"}:
            continue
        key = stat["key"]
        name = stat.get("name") or key
        if stat.get("unit") == "percentagePoints" and key in percent_suffix:
            name += " %"
        out[name] = out.get(name, 0.0) + to_float(stat.get("value"))
    return out


def primary_name(mod):
    normalized = _normalized_mod(mod)
    stat = normalized.get("primary") or {}
    if not stat.get("key"):
        return ""
    name = stat.get("name") or stat["key"]
    if stat.get("unit") == "percentagePoints" and stat.get("key") in {
        "offense", "defense", "health", "protection", "speed"
    }:
        name += " %"
    return name


def _mod_metadata(mod):
    """Extract immutable scoring metadata once per candidate mod."""
    normalized = _normalized_mod(mod)
    primary = normalized.get("primary") or {}
    primary_label = primary.get("name") or primary.get("key") or ""
    if primary.get("unit") == "percentagePoints" and primary.get("key") in {
        "offense", "defense", "health", "protection", "speed", "physicalDamage", "specialDamage"
    }:
        primary_label += " %"
    stats = {}
    percent_suffix = {"offense", "defense", "health", "protection", "speed", "physicalDamage", "specialDamage"}
    for stat in [primary] + list(normalized.get("secondaries") or []):
        if not isinstance(stat, dict) or not stat.get("key") or stat.get("unit") not in {"flat", "percentagePoints"}:
            continue
        key = stat["key"]
        name = stat.get("name") or key
        if stat.get("unit") == "percentagePoints" and key in percent_suffix:
            name += " %"
        stats[name] = stats.get(name, 0.0) + to_float(stat.get("value"))
    return {
        "slot": normalized.get("slot") or normalize_slot(mod.get("slot")),
        "set": normalized.get("setName"),
        "primary": primary_label,
        "stats": stats,
        "donor_uses": to_float(mod.get("_source_usage"), 0.0),
    }


def _format_missing_stats(missing):
    labels = {
        "defense": "Défense",
        "offense": "Offense",
        "health": "Health",
        "protection": "Protection",
        "speed": "Speed",
    }
    details = []
    for code in missing or []:
        if str(code).endswith(":gear_component_required"):
            key = str(code).split(":", 1)[0]
            label = labels.get(key, key)
            details.append(
                f"{label} % : le profil ne sépare pas la statistique de base "
                f"des secondaires des pièces d'équipement actuellement équipées ({code})."
            )
        else:
            details.append(str(code))
    return ", ".join(details)


def calculate_speed(mods, base_stats=None, base_profile=None):
    """Calculate only Speed through the shared JS engine (Seigneur hard floor)."""
    if _MOD_ENGINE_SPEED_BRIDGE is None:
        raise RuntimeError("Calcul de vitesse partagé non initialisé dans l'Optimizer.")
    source = base_profile if isinstance(base_profile, dict) and base_profile else (base_stats or {})
    payload = _MOD_ENGINE_SPEED_BRIDGE(
        json.dumps(source, ensure_ascii=False, separators=(",", ":")),
        json.dumps(list(mods or []), ensure_ascii=False, separators=(",", ":")),
    )
    try:
        result = json.loads(str(payload))
    except Exception as exc:
        raise RuntimeError("Réponse invalide du moteur de vitesse partagé.") from exc
    if not isinstance(result, dict):
        raise RuntimeError("Réponse invalide du moteur de vitesse partagé.")
    return result


def final_stats(build, base_stats=None, base_profile=None):
    """Delegate every stat projection to the shared JavaScript engine."""
    if _MOD_ENGINE_BRIDGE is None:
        raise RuntimeError("Moteur de calcul partagé non initialisé dans l'Optimizer.")
    source = base_profile if isinstance(base_profile, dict) and base_profile else (base_stats or {})
    payload = _MOD_ENGINE_BRIDGE(
        json.dumps(source, ensure_ascii=False, separators=(",", ":")),
        json.dumps(list(build or []), ensure_ascii=False, separators=(",", ":")),
        to_float(source.get("level"), None) if isinstance(source, dict) else None,
    )
    try:
        result = json.loads(str(payload))
    except Exception as exc:
        raise RuntimeError("Réponse invalide du moteur de calcul partagé.") from exc
    if not isinstance(result, dict) or not result.get("complete") or not isinstance(result.get("stats"), dict):
        missing = result.get("missing", []) if isinstance(result, dict) else []
        raise RuntimeError("Calcul de statistiques incomplet : " + _format_missing_stats(missing))
    return result["stats"]


_SCORE_REQUIRED_STATS = ("Speed", "Health", "Protection")


def _projection_for_optimizer_score(result, required_stats=None):
    """Accept partial projections only when every stat used by this score is exact."""
    required_stats = tuple(required_stats) if required_stats is not None else _SCORE_REQUIRED_STATS
    required_keys = {str(name).casefold() for name in required_stats}
    if not isinstance(result, dict) or not isinstance(result.get("stats"), dict):
        missing = result.get("missing", []) if isinstance(result, dict) else []
        return RuntimeError("Projection de statistiques absente : " + _format_missing_stats(missing))
    stats = result["stats"]
    missing = list(result.get("missing") or [])
    blocking = [
        code for code in missing
        if str(code).split(":", 1)[0].casefold() in required_keys
    ]
    absent_score_stats = [name for name in required_stats if name not in stats]
    if blocking or absent_score_stats:
        details = []
        if blocking:
            details.append(_format_missing_stats(blocking))
        if absent_score_stats:
            details.append("statistiques du score absentes : " + ", ".join(absent_score_stats))
        return RuntimeError("Calcul incomplet pour le score : " + "; ".join(details))
    accepted = dict(stats)
    if missing:
        accepted["_projection_missing"] = missing
    return accepted


def final_stats_many(builds, base_stats=None, base_profile=None, required_stats=None):
    """Project many candidate builds through the shared JS engine in one bridge call.

    The scalar bridge remains the compatibility fallback for standalone callers/tests.
    Each returned item is either a stats dict or a RuntimeError describing that build.
    """
    builds = list(builds or [])
    if not builds:
        return []
    if _MOD_ENGINE_BATCH_BRIDGE is None:
        if _MOD_ENGINE_BRIDGE is None:
            raise RuntimeError("Moteur de calcul partagé non initialisé dans l'Optimizer.")
        source = base_profile if isinstance(base_profile, dict) and base_profile else (base_stats or {})
        results = []
        for build in builds:
            payload = _MOD_ENGINE_BRIDGE(
                json.dumps(source, ensure_ascii=False, separators=(",", ":")),
                json.dumps(list(build or []), ensure_ascii=False, separators=(",", ":")),
                to_float(source.get("level"), None) if isinstance(source, dict) else None,
            )
            try:
                projection = json.loads(str(payload))
            except Exception as exc:
                results.append(RuntimeError("Réponse invalide du moteur de calcul partagé.")) 
                continue
            results.append(_projection_for_optimizer_score(projection, required_stats))
        return results
    source = base_profile if isinstance(base_profile, dict) and base_profile else (base_stats or {})
    # Candidate builds repeatedly reference the same small pool of mods. Send
    # each normalized mod once per batch and encode builds as integer indexes,
    # rather than serializing the same full mod objects thousands of times.
    mod_indexes = {}
    mod_table = []
    indexed_builds = []
    for build in builds:
        indexes = []
        for mod in build:
            marker = id(mod)
            index = mod_indexes.get(marker)
            if index is None:
                index = len(mod_table)
                mod_indexes[marker] = index
                try:
                    mod_table.append(_normalized_mod(mod))
                except RuntimeError:
                    # Preserve invalid-mod diagnostics in the shared JS engine.
                    mod_table.append(mod)
            indexes.append(index)
        indexed_builds.append(indexes)
    indexed_payload = {"mods": mod_table, "builds": indexed_builds}
    payload = _MOD_ENGINE_BATCH_BRIDGE(
        json.dumps(source, ensure_ascii=False, separators=(",", ":")),
        json.dumps(indexed_payload, ensure_ascii=False, separators=(",", ":")),
        to_float(source.get("level"), None) if isinstance(source, dict) else None,
    )
    try:
        projections = json.loads(str(payload))
    except Exception as exc:
        raise RuntimeError("Réponse invalide du moteur partagé (lot de projections).") from exc
    if not isinstance(projections, list) or len(projections) != len(builds):
        raise RuntimeError("Réponse incomplète du moteur partagé (taille du lot incorrecte).")
    return [_projection_for_optimizer_score(result, required_stats) for result in projections]


def _get_kyber_set_distribution(kyber):
    """Return set usage weights from either dict or Kyber's list format."""
    sets = kyber.get("sets", {}) if isinstance(kyber, dict) else {}
    if isinstance(sets, dict):
        return {str(k): to_float(v) for k, v in sets.items()}
    result = {}
    if isinstance(sets, list):
        for item in sets:
            if isinstance(item, dict) and item.get("name"):
                # `weight` is the observed share; `count` describes the
                # recommended number of mods and is handled separately.
                result[str(item["name"])] = to_float(item.get("weight"))
    return result


def _get_slot_distribution(kyber, slot):
    slots = kyber.get("slots", {}) or {}
    data = slots.get(slot, {}) if isinstance(slots, dict) else {}
    if isinstance(data, dict):
        p = data.get("primaries", data.get("primary", data))
        if isinstance(p, dict):
            return {str(k): to_float(v) for k, v in p.items()}
    return {}


def _reference_average(kyber, stat):
    averages = kyber.get("averages", {}) or {}
    return to_float(averages.get(stat))



def _prepare_scoring_context(kyber):
    """Resolve Kyber distributions and averages once for the whole search."""
    return {
        "set_distribution": _get_kyber_set_distribution(kyber),
        "slot_distributions": {slot: _get_slot_distribution(kyber, slot)
                               for slot in ("Arrow", "Triangle", "Circle", "Cross")},
        "averages": {stat: _reference_average(kyber, stat)
                     for stat in ("Speed", "Health", "Protection")},
    }


def _mod_score(mod, kyber, weights, metadata=None, scoring_context=None):
    score = 0.0
    metadata = metadata or _mod_metadata(mod)
    slot = metadata["slot"]
    primary = metadata["primary"]
    stats = metadata["stats"]

    # Kyber set distribution has priority.
    set_dist = (scoring_context or {}).get("set_distribution")
    if set_dist is None:
        set_dist = _get_kyber_set_distribution(kyber)
    set_share = set_dist.get(str(metadata["set"]), 0.0)
    score += set_share * 5000.0

    # Kyber primary distribution has very strong priority.
    distribution = (scoring_context or {}).get("slot_distributions", {}).get(slot)
    if distribution is None:
        distribution = _get_slot_distribution(kyber, slot)
    if distribution:
        dominant = max(distribution.values(), default=0.0)
        own = distribution.get(primary, 0.0)
        if own == 0.0:
            # Comlink/importer may annotate percentage primaries as "Health %"
            # while the Kyber reference stores them as "Health".
            def _cmp(name):
                return re.sub(r"\s*%\s*$", "", str(name).strip()).casefold()
            target = _cmp(primary)
            own = sum(v for k, v in distribution.items() if _cmp(k) == target)
        score += own * 12000.0
        if own == 0.0 and dominant:
            score -= dominant * 12000.0

    # Secondary stats.
    for stat, value in stats.items():
        if stat == primary:
            continue
        weight_key = str(stat).removesuffix(' %')
        score += value * to_float(weights.get(stat, weights.get(weight_key)), 0.0)

    # Speed secondary is always useful, but remains below Kyber primary.
    score += stats.get("Speed", 0.0) * 8.0

    # Prefer mods from less-used GAC donors after preserving the target build fit.
    # Missing usage is never encoded as zero by the browser-side donor selector.
    donor_uses = to_float(mod.get("_source_usage"), 0.0)
    score += max(0.0, 1000.0 - min(1000.0, donor_uses)) * 0.15
    return score


def build_score(build, kyber, weights, base_stats, base_profile=None, projected_stats=None,
                mod_metadata=None, scoring_context=None):
    score = 0.0
    stats = projected_stats if isinstance(projected_stats, dict) else final_stats(build, base_stats, base_profile)
    scoring_context = scoring_context or _prepare_scoring_context(kyber)
    set_dist = scoring_context["set_distribution"]
    metadata_for = lambda mod: (mod_metadata or {}).get(id(mod)) or _mod_metadata(mod)
    counts = {}
    for mod in build:
        set_name = metadata_for(mod)["set"]
        counts[set_name] = counts.get(set_name, 0) + 1

    # Strongly reward dominant Kyber set compositions.
    for name, share in set_dist.items():
        if share <= 0:
            continue
        count = counts.get(name, 0)
        score += share * 3000.0 * count
        if share >= 0.80:
            score -= (6 - count) * share * 5000.0

    # Strongly reward Kyber primaries.
    for slot in ("Arrow", "Triangle", "Circle", "Cross"):
        mod = next((m for m in build if normalize_slot(m.get("slot")) == slot), None)
        if not mod:
            continue
        dist = scoring_context["slot_distributions"].get(slot, {})
        if not dist:
            continue
        dominant = max(dist.values(), default=0.0)
        primary = metadata_for(mod)["primary"]
        own = dist.get(primary, 0.0)
        if own == 0.0:
            target = re.sub(r"\s*%\s*$", "", str(primary).strip()).casefold()
            own = sum(v for k, v in dist.items()
                      if re.sub(r"\s*%\s*$", "", str(k).strip()).casefold() == target)
        score += own * 9000.0
        if own == 0.0:
            score -= dominant * 10000.0

    # Match Kyber reference stats without making them hard constraints.
    for stat in ("Speed", "Health", "Protection"):
        ref = scoring_context["averages"].get(stat, 0.0)
        if ref <= 0:
            continue
        ratio = to_float(stats.get(stat)) / ref
        score += min(ratio, 1.20) * 1800.0

    # Aggregate donor-use preference across the complete six-mod build.
    donor_priority = 0.0
    for mod in build:
        donor_uses = metadata_for(mod)["donor_uses"]
        donor_priority += max(0.0, 1000.0 - min(1000.0, donor_uses)) * 0.15
    score += donor_priority

    return score


def _kyber_set_plan(kyber):
    """Return the most popular exact six-mod set composition from SWGOH.GG."""
    if not isinstance(kyber, dict):
        return None
    entries = kyber.get("specific_sets") or []
    if not isinstance(entries, list):
        return None
    best = None
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        counts = entry.get("counts")
        if not isinstance(counts, dict):
            continue
        normalized = {}
        for key, raw_count in counts.items():
            name = normalize_set(key)
            try:
                count = int(raw_count)
            except (TypeError, ValueError):
                continue
            if name and count > 0:
                normalized[name] = normalized.get(name, 0) + count
        if sum(normalized.values()) != 6:
            continue
        weight = to_float(entry.get("weight"))
        if best is None or weight > best[0]:
            best = (weight, normalized, entry.get("name") or "")
    return best


def _build_set_name(mod):
    """Read the canonical set cached during candidate preparation.

    Optimizer candidates always carry set_name after shared normalization.
    Keep the normalization fallback for legacy/direct callers and tests.
    """
    if isinstance(mod, dict):
        cached = mod.get("set_name")
        if cached:
            return cached
    return normalize_set(mod_set(mod))


def _partial_matches_set_plan(build, plan):
    if not plan:
        return True
    counts = {}
    for mod in build:
        s = _build_set_name(mod)
        counts[s] = counts.get(s, 0) + 1
    return all(counts.get(name, 0) <= target for name, target in plan.items()) and all(name in plan for name in counts)


def _matches_set_plan(build, plan):
    if not plan:
        return True
    counts = {}
    for mod in build:
        s = _build_set_name(mod)
        counts[s] = counts.get(s, 0) + 1
    return counts == plan


def _retain_best_beam(expanded, beam_width):
    """Keep the exact stable top-k beam without sorting every rejected candidate."""
    if beam_width > 0 and len(expanded) > beam_width:
        return heapq.nlargest(beam_width, expanded, key=lambda item: item[0])
    expanded.sort(key=lambda item: item[0], reverse=True)
    return expanded[:beam_width]


def optimize_kyber(
    mods,
    base_stats=None,
    base_profile=None,
    kyber=None,
    weights=None,
    targets=None,
    number_of_builds=10,
    limit_per_slot=80,
    beam_width=1200,
    projection_batch_size=512,
    progress_callback=None,
    minimum_speed=None,
    **kwargs,
):
    """
    Main public entry point expected by test_optimizer.py.

    Returns:
        list[dict] with build, score and stats.
    """
    if not mods:
        raise RuntimeError("Aucun mod disponible.")
    if kyber is None:
        # Standalone/legacy callers can provide only `character`; load the
        # bundled Kyber reference automatically.
        character = kwargs.get("character")
        if character:
            try:
                from kyber_data import load_kyber_profiles, get_kyber_profile
                profiles_path = os.path.join(os.path.dirname(__file__), "kyber_profiles.json")
                profiles = load_kyber_profiles(profiles_path)
                kyber = get_kyber_profile(character, profiles)
            except Exception:
                kyber = None
        if kyber is None:
            raise RuntimeError("Référence Kyber absente.")

    base_stats = base_stats or {}
    weights = weights or {
        "Speed": 1.0,
        "Health": 0.01,
        "Protection": 0.01,
        "Offense": 0.5,
        "Defense": 0.1,
        "Potency": 0.1,
        "Tenacity": 0.1,
    }

    if minimum_speed is not None:
        minimum_speed = to_float(minimum_speed, None)
        if minimum_speed is None:
            raise RuntimeError("Vitesse minimale invalide : valeur numérique absente.")

    set_plan_info = _kyber_set_plan(kyber)
    set_plan = set_plan_info[1] if set_plan_info else None

    grouped = {slot: [] for slot in SLOTS}
    incomplete_mods = 0
    invalid_slot_values = []
    for mod in mods:
        if not isinstance(mod, dict):
            incomplete_mods += 1
            continue
        item = dict(mod)
        normalized = _normalized_mod(item)
        if not isinstance(normalized, dict) or normalized.get("complete") is not True:
            incomplete_mods += 1
            continue
        # Slot and set are read from the same shared normalization result.
        # This also supports Comlink definitionId-only mods and SWGOH.GG slot IDs.
        slot = normalized.get("slot")
        if slot not in grouped:
            raw_slot = mod_slot_value(item)
            if raw_slot is not None and repr(raw_slot) not in invalid_slot_values:
                invalid_slot_values.append(repr(raw_slot))
            continue
        resolved_set = normalized.get("setName")
        if not resolved_set:
            incomplete_mods += 1
            continue
        item["slot"] = slot
        item["set_name"] = resolved_set
        item["set"] = resolved_set
        grouped[slot].append(item)

    missing = [slot for slot in SLOTS if not grouped[slot]]
    if missing:
        # Diagnostic volontairement explicite : si l'EXE embarque une source
        # différente de celle attendue, l'utilisateur voit immédiatement les
        # valeurs reçues par le moteur au lieu d'un simple "aucun candidat".
        raw_examples = []
        raw_seen = set()
        for mod in mods:
            raw = mod_slot_value(mod)
            marker = repr(raw)
            if marker not in raw_seen:
                raw_seen.add(marker)
                raw_examples.append(marker)
            if len(raw_examples) >= 12:
                break
        diagnostics = []
        if incomplete_mods:
            diagnostics.append(f"{incomplete_mods} mod(s) ignoré(s) pour données incomplètes (stat, set ou niveau absent/inconnu)")
        if invalid_slot_values:
            diagnostics.append("Slots non reconnus : " + ", ".join(invalid_slot_values))
        raise RuntimeError(
            "Aucun candidat valide pour le(s) slot(s) : "
            + ", ".join(missing)
            + "\nValeurs de slot reçues : "
            + ", ".join(raw_examples)
            + ("\n" + "\n".join(diagnostics) if diagnostics else "")
        )

    candidates = {}
    mod_metadata = {
        id(mod): _mod_metadata(mod)
        for slot in SLOTS for mod in grouped[slot]
    }
    scoring_context = _prepare_scoring_context(kyber)
    for slot_index, slot in enumerate(SLOTS, 1):
        ranked = sorted(
            grouped[slot],
            key=lambda m: _mod_score(m, kyber, weights, mod_metadata[id(m)], scoring_context),
            reverse=True,
        )
        candidates[slot] = ranked[:max(1, int(limit_per_slot))]

    # Bounded beam search instead of 50^6 / 80^6 brute force.
    # First try the exact Kyber set composition. If unavailable, retry without
    # the hard constraint instead of returning an empty result.
    projection_failures = []
    projection_warnings = set()
    def record_projection_failure(error):
        message = str(error)
        if "gear_component_required" in message:
            projection_warnings.add("gear_percent_unavailable")
        if len(projection_failures) < 12:
            projection_failures.append(message)

    projection_batch_size = max(1, min(2048, int(to_float(projection_batch_size, 512))))

    def search_builds(plan_constraint):
        # Keep each projection attached to its build throughout the beam search.
        # Speed filtering and final result assembly must reuse this exact projection.
        current_beam = [((), None)]
        for slot_index, slot in enumerate(SLOTS, 1):
            def candidate_builds():
                for partial, _ in current_beam:
                    used = {mod_id(m) for m in partial}
                    for mod in candidates[slot]:
                        if mod_id(mod) in used:
                            continue
                        build = partial + (mod,)
                        if plan_constraint and not _partial_matches_set_plan(build, plan_constraint):
                            continue
                        yield build

            expanded = []
            # Batch across the Python↔JavaScript boundary. The shared engine still
            # calculates every candidate; only repeated bridge/JSON overhead is removed.
            build_iterator = iter(candidate_builds())
            while True:
                batch = []
                for _ in range(projection_batch_size):
                    try:
                        batch.append(next(build_iterator))
                    except StopIteration:
                        break
                if not batch:
                    break
                try:
                    required_score_stats = {
                        stat for stat in _SCORE_REQUIRED_STATS
                        if to_float(scoring_context["averages"].get(stat), 0.0) > 0
                    }
                    if minimum_speed is not None:
                        required_score_stats.add("Speed")
                    projections = final_stats_many(
                        batch, base_stats, base_profile, required_stats=required_score_stats
                    )
                except RuntimeError as exc:
                    record_projection_failure(exc)
                    continue
                for build, projected_stats in zip(batch, projections):
                    if isinstance(projected_stats, RuntimeError):
                        record_projection_failure(projected_stats)
                        continue
                    score = build_score(build, kyber, weights, base_stats, base_profile, projected_stats,
                                        mod_metadata, scoring_context)
                    expanded.append((score, build, projected_stats))
            retained = _retain_best_beam(expanded, beam_width)
            current_beam = [(build, stats) for _, build, stats in retained]
            if progress_callback:
                try:
                    progress_callback(slot_index, slot, len(current_beam))
                except Exception:
                    pass
            if not current_beam:
                break
        return current_beam

    beam = search_builds(set_plan)
    applied_set_plan = set_plan if set_plan and any(_matches_set_plan(build, set_plan) for build, _ in beam) else None
    if set_plan and applied_set_plan is None:
        beam = search_builds(None)
    if not beam:
        detail = projection_failures[0] if projection_failures else "Aucun build ne permet de calculer les statistiques nécessaires au score."
        if "gear_percent_unavailable" in projection_warnings:
            first_projection_failure = projection_failures[0] if projection_failures else "composante d'équipement inconnue"
            detail = ("Bonus multiplicateurs en % non calculables : le profil ne sépare pas "
                      "les statistiques de base des secondaires des pièces d'équipement. "
                      "Un profil avec séparation base/équipement vérifiée est nécessaire pour ces projections. "
                      "Détail du premier rejet : " + first_projection_failure)
        raise RuntimeError("Aucune combinaison ne permet un calcul fiable des statistiques utilisées par le score. " + detail)

    def speed_safe(projected_stats):
        if minimum_speed is None:
            return True
        projected_speed = to_float(projected_stats.get("Speed"), None)
        return projected_speed is not None and projected_speed + 1e-9 >= to_float(minimum_speed)

    safe_beam = [(build, stats) for build, stats in beam if speed_safe(stats)]
    # A Kyber set plan is a preference, never a reason to violate the target's
    # absolute speed floor. If its builds all lose speed, retry without it.
    if applied_set_plan and not safe_beam:
        beam = search_builds(None)
        applied_set_plan = None
        if not beam:
            detail = projection_failures[0] if projection_failures else "Aucun build complet ne peut être calculé avec les données disponibles."
            raise RuntimeError("Aucune combinaison de mods ne permet un calcul complet. " + detail)
        safe_beam = [(build, stats) for build, stats in beam if speed_safe(stats)]

    if minimum_speed is not None and not safe_beam:
        speed_values = [
            value for value in (
                to_float(stats.get("Speed"), None)
                for _, stats in beam
            ) if value is not None
        ]
        if not speed_values:
            raise RuntimeError("Vitesse cible non calculable : la statistique Speed manque dans le profil source.")
        best_speed = max(speed_values)
        raise RuntimeError(
            "Aucune configuration ne respecte la vitesse minimale du personnage cible. "
            f"Vitesse actuelle : {to_float(minimum_speed):.1f} ; "
            f"meilleure configuration examinée : {best_speed:.1f}. "
            "Aucun transfert entraînant une perte de vitesse n'est proposé."
        )

    results = []
    for build, stats in safe_beam:
        results.append({
            "build": list(build),
            "score": build_score(build, kyber, weights, base_stats, base_profile, stats,
                                 mod_metadata, scoring_context),
            "stats": {key: value for key, value in stats.items() if key != "_projection_missing"},
            "missing_stats": list(stats.get("_projection_missing", [])),
            "set_plan": applied_set_plan or {},
            "warnings": sorted(projection_warnings),
        })

    results.sort(key=lambda item: item["score"], reverse=True)
    return results[: int(number_of_builds)]


def find_top_builds(
    mods,
    weights=None,
    number_of_builds=10,
    targets=None,
    base_stats=None,
    limit_per_slot=80,
    kyber=None,
    **kwargs,
):
    return optimize_kyber(
        mods=mods,
        base_stats=base_stats,
        kyber=kyber,
        weights=weights,
        targets=targets,
        number_of_builds=number_of_builds,
        limit_per_slot=limit_per_slot,
        **kwargs,
    )


def optimize(
    mods,
    base_stats=None,
    targets=None,
    weights=None,
    number_of_builds=10,
    limit_per_slot=80,
    kyber=None,
    **kwargs,
):
    return optimize_kyber(
        mods=mods,
        base_stats=base_stats,
        kyber=kyber,
        weights=weights,
        targets=targets,
        number_of_builds=number_of_builds,
        limit_per_slot=limit_per_slot,
        **kwargs,
    )


# ---------------------------------------------------------------------------
# Backwards-compatible API used by the original command-line test scripts.
# ---------------------------------------------------------------------------
def _tuple_mod_to_dict(mod):
    if isinstance(mod, dict):
        return mod
    if isinstance(mod, (tuple, list)):
        fields = [
            "game_id", "set_name", "slot", "rarity", "level",
            "primary_stat", "primary_value",
            "secondary_1_stat", "secondary_1_value",
            "secondary_2_stat", "secondary_2_value",
            "secondary_3_stat", "secondary_3_value",
            "secondary_4_stat", "secondary_4_value",
        ]
        out = {k: (mod[i] if i < len(mod) else None) for i, k in enumerate(fields)}
        return out
    return {}

def calculate_final_stats(build, base_stats=None, base_profile=None):
    return final_stats([_tuple_mod_to_dict(m) for m in build], base_stats, base_profile)

def find_best_build(
    mods, weights=None, minimum_score=0, max_candidates_per_slot=50,
    targets=None, minimums=None, base_stats=None, kyber=None, **kwargs
):
    """Legacy single-build wrapper returning the best build as a list."""
    normalized = [_tuple_mod_to_dict(m) for m in (mods or [])]
    kyber = kyber or {"sets": {}, "slots": {}, "averages": {}}
    results = optimize_kyber(
        normalized, base_stats=base_stats, kyber=kyber, weights=weights,
        targets=targets, number_of_builds=1,
        limit_per_slot=max_candidates_per_slot, **kwargs
    )
    if not results:
        return None
    best = results[0]["build"]
    # Old scripts expect sqlite-style tuples; current application uses dicts.
    if mods and isinstance(next(iter(mods)), (tuple, list)):
        return [
            tuple(_tuple_mod_to_dict(m).get(k) for k in [
                "game_id", "set_name", "slot", "rarity", "level",
                "primary_stat", "primary_value",
                "secondary_1_stat", "secondary_1_value",
                "secondary_2_stat", "secondary_2_value",
                "secondary_3_stat", "secondary_3_value",
                "secondary_4_stat", "secondary_4_value"
            ]) for m in best
        ]
    return best
