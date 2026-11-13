import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.mjs";
import "./modules/mod-engine.js?v=0.3.5";

let pyodideReadyPromise = (async () => {
  const pyodide = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/" });
  const optimizerResponse = await fetch(new URL("./python/optimizer.py?v=3.5.3-shared-mod-engine", import.meta.url), { cache: "force-cache" });
  if (!optimizerResponse.ok) throw new Error(`Impossible de charger optimizer.py (HTTP ${optimizerResponse.status})`);
  const optimizerSource = await optimizerResponse.text();
  pyodide.FS.writeFile("/home/pyodide/optimizer.py", optimizerSource);

  const kyberResponse = await fetch(new URL("./python/kyber_data.py?v=3.4.4-cache-sync", import.meta.url), { cache: "force-cache" });
  if (kyberResponse.ok) {
    pyodide.FS.writeFile("/home/pyodide/kyber_data.py", await kyberResponse.text());
  }

  // The optimizer reference data is loaded by the Worker itself.
  // This removes the fragile dependency on a browser-side script tag.
  const profilesResponse = await fetch(new URL("./python/optimizer_profiles.json?v=3.4.4-cache-sync", import.meta.url), { cache: "force-cache" });
  if (!profilesResponse.ok) throw new Error(`Impossible de charger optimizer_profiles.json (HTTP ${profilesResponse.status})`);
  const profilesText = await profilesResponse.text();
  pyodide.FS.writeFile("/home/pyodide/optimizer_profiles.json", profilesText);

  const modEngineBridge = (baseJson, modsJson, level) => {
    const base = JSON.parse(baseJson);
    const mods = JSON.parse(modsJson);
    const result = self.HolocronModEngine.calculateFinalStats(base, mods, Number.isFinite(Number(level)) && Number(level) > 0 ? Number(level) : null);
    return JSON.stringify(result);
  };
  const modNormalizeBridge = (modJson) => {
    return JSON.stringify(self.HolocronModEngine.normalizeMod(JSON.parse(modJson)));
  };
  pyodide.globals.set("holocron_mod_engine_bridge", modEngineBridge);
  pyodide.globals.set("holocron_mod_normalize_bridge", modNormalizeBridge);

  pyodide.runPython(`
import sys, json
sys.path.append('/home/pyodide')
import optimizer
optimizer.set_mod_engine_bridge(holocron_mod_engine_bridge, holocron_mod_normalize_bridge)
with open('/home/pyodide/optimizer_profiles.json', encoding='utf-8') as _f:
    _optimizer_profiles = json.load(_f)
`);
  return pyodide;
})();

self.onmessage = async (event) => {
  const data = event.data || {};
  const id = data.id;
  try {
    self.postMessage({ id, type: "status", message: "Chargement du moteur Optimizer…" });
    const pyodide = await pyodideReadyPromise;

    pyodide.globals.set("mods_json", JSON.stringify(data.mods || []));
    pyodide.globals.set("profile_json", JSON.stringify(data.profile || {}));
    pyodide.globals.set("base_stats_json", JSON.stringify(data.base_stats || {}));
    pyodide.globals.set("current_target_mods_json", JSON.stringify(data.current_target_mods || []));
    pyodide.globals.set("n_builds", Number(data.n_builds || 5));
    pyodide.globals.set("limit_slot", Number(data.limit_slot || 80));
    pyodide.globals.set("character_name", String(data.character_name || ""));
    pyodide.globals.set("character_base_id", String(data.character_base_id || ""));
    const characterLevel = Number(data.character_level);
    pyodide.globals.set("character_level", Number.isFinite(characterLevel) && characterLevel > 0 ? characterLevel : null);
    pyodide.globals.set("context_json", JSON.stringify(data.context || {}));

    self.postMessage({ id, type: "status", message: "Recherche des candidats par slot…" });

    const raw = await pyodide.runPythonAsync(`
import json
mods = json.loads(mods_json)
profile = json.loads(profile_json)
base_stats = json.loads(base_stats_json)
base_profile = optimizer.resolve_character_profile(_optimizer_profiles, character_base_id, character_name)
if not isinstance(base_profile, dict) or not base_profile:
    base_profile = {'base_stats': base_stats} if isinstance(base_stats, dict) and base_stats else {}
else:
    base_profile = dict(base_profile)
if character_level is not None:
    base_profile['level'] = character_level
else:
    base_profile.pop('level', None)
current_target_mods = json.loads(current_target_mods_json)
context = json.loads(context_json)

# Resolve real base stats from canonical profile data when the UI has no
# populated base_stats. Never substitute current roster stats here.
if not isinstance(base_stats, dict) or not base_stats:
    base_stats = base_profile.get('base_stats', {}) if isinstance(base_profile, dict) else {}

if not isinstance(base_stats, dict) or not base_stats:
    raise RuntimeError(
        "Profil de statistiques de base introuvable pour "
        f"{character_name or 'personnage inconnu'} "
        f"(base_id={character_base_id or 'absent'}). "
        f"Aucun profil exploitable parmi {len(_optimizer_profiles)} références ; "
        "aucune statistique courante ou inventée ne sera utilisée."
    )

# An empty local Kyber reference is valid: optimizer.py then uses its generic
# stat weights while still optimizing the real six equipped mod slots.
if not isinstance(profile, dict):
    profile = {}

minimum_speed = None
if context.get("mode") == "seigneur-six-mods":
    # The current six-mod speed is the hard floor for Seigneur Sith.
    # final_stats includes arrow primary speed and the four-piece Speed-set bonus.
    minimum_speed = optimizer.final_stats(current_target_mods, base_stats, base_profile).get("Speed")
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
    self.postMessage({ id, type: "done", result });
  } catch (error) {
    self.postMessage({
      id,
      type: "error",
      error: error?.message || String(error),
    });
  }
};
