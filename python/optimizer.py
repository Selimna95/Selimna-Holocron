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


def set_mod_engine_bridge(bridge, normalize_bridge=None):
    """Inject the single JavaScript calculation and normalization engine."""
    global _MOD_ENGINE_BRIDGE, _MOD_NORMALIZE_BRIDGE
    _MOD_ENGINE_BRIDGE = bridge
    _MOD_NORMALIZE_BRIDGE = normalize_bridge
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
        if not (expected_number == actual_number):
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
    return mod.get("game_id") or mod.get("id")


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
        raise RuntimeError("Calcul de statistiques incomplet : " + ", ".join(map(str, missing)))
    return result["stats"]


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


def _mod_score(mod, kyber, weights):
    score = 0.0
    slot = normalize_slot(mod.get("slot"))
    primary = primary_name(mod)
    stats = mod_stats(mod)

    # Kyber set distribution has priority.
    set_dist = _get_kyber_set_distribution(kyber)
    set_share = set_dist.get(str(mod_set(mod)), 0.0)
    score += set_share * 5000.0

    # Kyber primary distribution has very strong priority.
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


def build_score(build, kyber, weights, base_stats, base_profile=None):
    score = 0.0
    stats = final_stats(build, base_stats, base_profile)

    set_dist = _get_kyber_set_distribution(kyber)
    counts = {}
    for mod in build:
        counts[mod_set(mod)] = counts.get(mod_set(mod), 0) + 1

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
        dist = _get_slot_distribution(kyber, slot)
        if not dist:
            continue
        dominant = max(dist.values(), default=0.0)
        primary = primary_name(mod)
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
        ref = _reference_average(kyber, stat)
        if ref <= 0:
            continue
        ratio = to_float(stats.get(stat)) / ref
        score += min(ratio, 1.20) * 1800.0

    # Aggregate donor-use preference across the complete six-mod build.
    donor_priority = 0.0
    for mod in build:
        donor_uses = to_float(mod.get("_source_usage"), 0.0)
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


def _partial_matches_set_plan(build, plan):
    if not plan:
        return True
    counts = {}
    for mod in build:
        s = normalize_set(mod_set(mod))
        counts[s] = counts.get(s, 0) + 1
    return all(counts.get(name, 0) <= target for name, target in plan.items()) and all(name in plan for name in counts)


def _matches_set_plan(build, plan):
    if not plan:
        return True
    counts = {}
    for mod in build:
        s = normalize_set(mod_set(mod))
        counts[s] = counts.get(s, 0) + 1
    return counts == plan


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
    for slot_index, slot in enumerate(SLOTS, 1):
        ranked = sorted(
            grouped[slot],
            key=lambda m: _mod_score(m, kyber, weights),
            reverse=True,
        )
        candidates[slot] = ranked[:max(1, int(limit_per_slot))]

    # Bounded beam search instead of 50^6 / 80^6 brute force.
    # First try the exact Kyber set composition. If unavailable, retry without
    # the hard constraint instead of returning an empty result.
    projection_failures = []

    def search_builds(plan_constraint):
        current_beam = [()]
        for slot_index, slot in enumerate(SLOTS, 1):
            expanded = []
            for partial in current_beam:
                used = {mod_id(m) for m in partial}
                for mod in candidates[slot]:
                    if mod_id(mod) in used:
                        continue
                    build = partial + (mod,)
                    if plan_constraint and not _partial_matches_set_plan(build, plan_constraint):
                        continue
                    try:
                        score = build_score(build, kyber, weights, base_stats, base_profile)
                    except RuntimeError as exc:
                        if len(projection_failures) < 12:
                            projection_failures.append(str(exc))
                        continue
                    expanded.append((score, build))
            expanded.sort(key=lambda x: x[0], reverse=True)
            current_beam = [build for _, build in expanded[:beam_width]]
            if progress_callback:
                try:
                    progress_callback(slot_index, slot, len(current_beam))
                except Exception:
                    pass
            if not current_beam:
                break
        return current_beam

    beam = search_builds(set_plan)
    applied_set_plan = set_plan if set_plan and any(_matches_set_plan(build, set_plan) for build in beam) else None
    if set_plan and applied_set_plan is None:
        beam = search_builds(None)
    if not beam:
        detail = projection_failures[0] if projection_failures else "Aucun build complet ne peut être calculé avec les données disponibles."
        raise RuntimeError("Aucune combinaison de mods ne permet un calcul complet. " + detail)

    def speed_safe(build):
        if minimum_speed is None:
            return True
        projected_speed = to_float(final_stats(build, base_stats, base_profile).get("Speed"), None)
        return projected_speed is not None and projected_speed + 1e-9 >= to_float(minimum_speed)

    safe_beam = [build for build in beam if speed_safe(build)]
    # A Kyber set plan is a preference, never a reason to violate the target's
    # absolute speed floor. If its builds all lose speed, retry without it.
    if applied_set_plan and not safe_beam:
        beam = search_builds(None)
        applied_set_plan = None
        if not beam:
            detail = projection_failures[0] if projection_failures else "Aucun build complet ne peut être calculé avec les données disponibles."
            raise RuntimeError("Aucune combinaison de mods ne permet un calcul complet. " + detail)
        safe_beam = [build for build in beam if speed_safe(build)]

    if minimum_speed is not None and not safe_beam:
        speed_values = [
            value for value in (
                to_float(final_stats(build, base_stats, base_profile).get("Speed"), None)
                for build in beam
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
    for build in safe_beam:
        stats = final_stats(build, base_stats, base_profile)
        results.append({
            "build": list(build),
            "score": build_score(build, kyber, weights, base_stats, base_profile),
            "stats": stats,
            "set_plan": applied_set_plan or {},
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
