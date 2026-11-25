import "./modules/mod-engine.js?v=0.3.34-crinolo-defense-components";
import crinoloStatCalc from "./vendor/crinolo-stat-calc.mjs?v=1.0.0-crinolo-maintained";
import { calculateCrinoloProfile } from "./modules/optimizer-progression.mjs?v=1.0.0-crinolo-dynamic";

const CRINOLO_GAME_DATA_URL = new URL("./statCalcData/gameData.json", import.meta.url).href;
const crinoloGameDataPromise = (async () => {
  try {
    const response = await fetch(CRINOLO_GAME_DATA_URL, { cache: "force-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const gameData = await response.json();
    if (!gameData?.unitData || !gameData?.gearData || !gameData?.relicData) {
      throw new Error("Structure gameData incomplète.");
    }
    crinoloStatCalc.setGameData(gameData);
    return { gameData, error: null };
  } catch (error) {
    return { gameData: null, error: error?.message || String(error) };
  }
})();

let pyodideReadyPromise = null;
function getPyodide() {
  if (!pyodideReadyPromise) pyodideReadyPromise = (async () => {
  const { loadPyodide } = await import("https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.mjs");
  const pyodide = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/" });
  const optimizerResponse = await fetch(new URL("./python/optimizer.py?v=3.5.20-exact-profile-variants", import.meta.url), { cache: "force-cache" });
  if (!optimizerResponse.ok) throw new Error(`Impossible de charger optimizer.py (HTTP ${optimizerResponse.status})`);
  const optimizerSource = await optimizerResponse.text();
  pyodide.FS.writeFile("/home/pyodide/optimizer.py", optimizerSource);

  const kyberResponse = await fetch(new URL("./python/kyber_data.py?v=3.4.4-cache-sync", import.meta.url), { cache: "force-cache" });
  if (kyberResponse.ok) {
    pyodide.FS.writeFile("/home/pyodide/kyber_data.py", await kyberResponse.text());
  }

  // The optimizer reference data is loaded by the Worker itself.
  // This removes the fragile dependency on a browser-side script tag.
  const profilesResponse = await fetch(new URL("./statCalcData/optimizer_profiles.v2.json?v=4.1.90-exact-progression", import.meta.url), { cache: "force-cache" });
  if (!profilesResponse.ok) throw new Error(`Impossible de charger optimizer_profiles.json (HTTP ${profilesResponse.status})`);
  const profilesText = await profilesResponse.text();
  pyodide.FS.writeFile("/home/pyodide/optimizer_profiles.json", profilesText);

  const modEngineBridge = (baseJson, modsJson, level) => {
    const base = JSON.parse(baseJson);
    const mods = JSON.parse(modsJson);
    const result = self.HolocronModEngine.calculateFinalStats(base, mods, Number.isFinite(Number(level)) && Number(level) > 0 ? Number(level) : null);
    return JSON.stringify(result);
  };
  const modEngineSpeedBridge = (baseJson, modsJson) => {
    const source = JSON.parse(baseJson);
    const base = source.base_stats && typeof source.base_stats === "object" ? source.base_stats : source;
    const speed = base.Speed ?? base.speed;
    const result = self.HolocronModEngine.calculateSpeed(
      speed,
      JSON.parse(modsJson),
      source.gear_level ?? source.gearLevel,
      source.stat_components ?? null
    );
    return JSON.stringify(result);
  };
  const modNormalizeBridge = (modJson) => {
    return JSON.stringify(self.HolocronModEngine.normalizeMod(JSON.parse(modJson)));
  };
  const modEngineBatchBridge = (baseJson, indexedBuildsJson, level) => {
    const base = JSON.parse(baseJson);
    const payload = JSON.parse(indexedBuildsJson);
    if (!Array.isArray(payload.mods) || !Array.isArray(payload.builds)) {
      throw new Error("Lot de projections indexé invalide.");
    }
    const resolvedLevel = Number.isFinite(Number(level)) && Number(level) > 0 ? Number(level) : null;
    return JSON.stringify(payload.builds.map(indexes => {
      if (!Array.isArray(indexes)) throw new Error("Index de build invalide.");
      const mods = indexes.map(index => {
        if (!Number.isInteger(index) || index < 0 || index >= payload.mods.length) {
          throw new Error("Référence de mod invalide dans le lot de projections.");
        }
        return payload.mods[index];
      });
      return self.HolocronModEngine.calculateFinalStats(base, mods, resolvedLevel);
    }));
  };
  pyodide.globals.set("holocron_mod_engine_bridge", modEngineBridge);
  pyodide.globals.set("holocron_mod_normalize_bridge", modNormalizeBridge);
  pyodide.globals.set("holocron_mod_engine_batch_bridge", modEngineBatchBridge);
  pyodide.globals.set("holocron_mod_engine_speed_bridge", modEngineSpeedBridge);

  pyodide.runPython(`
import sys, json
sys.path.append('/home/pyodide')
import optimizer
optimizer.set_mod_engine_bridge(holocron_mod_engine_bridge, holocron_mod_normalize_bridge, holocron_mod_engine_batch_bridge, speed_bridge=holocron_mod_engine_speed_bridge)
with open('/home/pyodide/optimizer_profiles.json', encoding='utf-8') as _f:
    _optimizer_profiles = json.load(_f)
`);
  return pyodide;
  })();
  return pyodideReadyPromise;
}

self.onmessage = async (event) => {
  const data = event.data || {};
  const id = data.id;
  try {
    if (data.type === "profile-batch") {
      self.postMessage({ id, type: "status", message: "Calcul des profils Crinolo du roster…" });
      const crinoloData = await crinoloGameDataPromise;
      if (!crinoloData.gameData) {
        throw new Error(`Données de jeu Crinolo indisponibles (${crinoloData.error || "erreur inconnue"}).`);
      }
      const profiles = [];
      const errors = [];
      const characters = Array.isArray(data.characters) ? data.characters : [];
      for (const source of characters) {
        const resolved = calculateCrinoloProfile(source || {}, crinoloStatCalc, crinoloData.gameData);
        if (resolved.profile) profiles.push(resolved.profile);
        else errors.push({
          base_id: source?.data?.base_id || source?.base_id || source?.baseId || "",
          error: resolved.error || "Profil Crinolo non calculable.",
        });
      }
      self.postMessage({ id, type: "profiles-done", profiles, errors, total: characters.length });
      return;
    }

    self.postMessage({ id, type: "status", message: "Chargement du moteur Optimizer…" });
    const pyodide = await getPyodide();

    pyodide.globals.set("mods_json", JSON.stringify(data.mods || []));
    pyodide.globals.set("profile_json", JSON.stringify(data.profile || {}));
    pyodide.globals.set("base_stats_json", JSON.stringify(data.base_stats || {}));
    self.postMessage({ id, type: "status", message: "Calcul des statistiques de progression Crinolo…" });
    const crinoloData = await crinoloGameDataPromise;
    let dynamicProfile = null;
    let dynamicProfileError = crinoloData.error
      ? `Données de jeu Crinolo indisponibles (${crinoloData.error}).`
      : "";
    if (crinoloData.gameData) {
      const resolved = calculateCrinoloProfile(data.character_source || {}, crinoloStatCalc, crinoloData.gameData);
      dynamicProfile = resolved.profile;
      dynamicProfileError = resolved.error || "";
    }
    pyodide.globals.set("dynamic_profile_json", JSON.stringify(dynamicProfile || {}));
    pyodide.globals.set("dynamic_profile_error", dynamicProfileError);
    pyodide.globals.set("current_target_mods_json", JSON.stringify(data.current_target_mods || []));
    pyodide.globals.set("n_builds", Number(data.n_builds || 5));
    pyodide.globals.set("limit_slot", Number(data.limit_slot || 80));
    pyodide.globals.set("character_name", String(data.character_name || ""));
    pyodide.globals.set("character_base_id", String(data.character_base_id || ""));
    const characterLevel = Number(data.character_level);
    pyodide.globals.set("character_level", Number.isFinite(characterLevel) && characterLevel > 0 ? characterLevel : null);
    pyodide.globals.set("character_metadata_json", JSON.stringify(data.character_metadata || {}));
    pyodide.globals.set("context_json", JSON.stringify(data.context || {}));

    self.postMessage({ id, type: "status", message: "Recherche des candidats par slot…" });

    const raw = await pyodide.runPythonAsync(`
import json
mods = json.loads(mods_json)
profile = json.loads(profile_json)
base_stats = json.loads(base_stats_json)
character_metadata = json.loads(character_metadata_json)
dynamic_profile = json.loads(dynamic_profile_json)
dynamic_profile_error = dynamic_profile_error or ""
if isinstance(dynamic_profile, dict) and dynamic_profile.get('base_stats'):
    # Exact live progression calculated from the roster's equipped gear and relic.
    # Keep the Python compatibility gate: it now validates the freshly calculated profile.
    base_profile = dynamic_profile
    optimizer.validate_profile_compatibility(base_profile, character_metadata)
    base_stats = base_profile['base_stats']
elif isinstance(base_stats, dict) and base_stats:
    # Explicit base stats supplied with the live character take precedence.
    base_profile = {'base_stats': base_stats, **(character_metadata if isinstance(character_metadata, dict) else {})}
else:
    # Static snapshots remain a strict fallback, never a substitute for another tier.
    base_profile = optimizer.resolve_character_profile(_optimizer_profiles, character_base_id, character_name, character_metadata)
    if isinstance(base_profile, dict) and base_profile:
        optimizer.validate_profile_compatibility(base_profile, character_metadata)
        base_profile = dict(base_profile)
    else:
        base_profile = {}
if character_level is not None:
    base_profile['level'] = character_level
else:
    base_profile.pop('level', None)
current_target_mods = json.loads(current_target_mods_json)
context = json.loads(context_json)

if not isinstance(base_stats, dict) or not base_stats:
    base_stats = base_profile.get('base_stats', {}) if isinstance(base_profile, dict) else {}

if not isinstance(base_stats, dict) or not base_stats:
    detail = f" Calcul Crinolo : {dynamic_profile_error}" if dynamic_profile_error else ""
    raise RuntimeError(
        "Profil de statistiques de base introuvable pour "
        f"{character_name or 'personnage inconnu'} "
        f"(base_id={character_base_id or 'absent'}). "
        f"Aucun profil exploitable parmi {len(_optimizer_profiles)} références ; "
        "aucune statistique courante ou inventée ne sera utilisée."
        + detail
    )

# An empty local Kyber reference is valid: optimizer.py then uses its generic
# stat weights while still optimizing the real six equipped mod slots.
if not isinstance(profile, dict):
    profile = {}

minimum_speed = None
if context.get("mode") == "seigneur-six-mods":
    # The Seigneur hard floor depends only on Speed. Do not reject the current
    # build because unrelated stats (Health, Offense, Defense, etc.) are unavailable.
    speed_projection = optimizer.calculate_speed(current_target_mods, base_stats, base_profile)
    minimum_speed = speed_projection.get("total") if speed_projection.get("complete") else None
    if minimum_speed is None or float(minimum_speed) <= 0:
        raise RuntimeError(
            "Vitesse actuelle du personnage non calculable : "
            "la recherche Seigneur Sith est arrêtée sans plancher de vitesse vérifiable."
        )
resolved_base_profile_json = json.dumps(base_profile)
r = optimizer.find_top_builds(
    mods,
    base_stats=base_stats,
    base_profile=base_profile,
    number_of_builds=n_builds,
    limit_per_slot=limit_slot,
    kyber=profile,
    character=character_name,
    context=context,
    minimum_speed=minimum_speed,
    beam_width=2400 if context.get("mode") == "seigneur-six-mods" else 1200,
)
json.dumps(r)
`);

    const result = typeof raw === "string" ? raw : String(raw);
    const resolvedBaseProfile = JSON.parse(pyodide.runPython("resolved_base_profile_json"));
    self.postMessage({ id, type: "done", result, base_profile: resolvedBaseProfile });
  } catch (error) {
    self.postMessage({
      id,
      type: "error",
      error: error?.message || String(error),
    });
  }
};
