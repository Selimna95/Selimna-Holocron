const PROFILE_INDEX_URL = new URL('./python/optimizer_profiles/index.json', import.meta.url);
let pyodideReadyPromise = null;
let profileIndexPromise = null;
const profileCache = new Map();

async function fetchWithTimeout(input, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Délai réseau dépassé', 'TimeoutError')), timeoutMs);
  const externalSignal = options.signal;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true });
  }
  try {
    return await fetch(input, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loadEngine() {
  const { loadPyodide } = await import('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.mjs');
  const pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/' });
  for (const [path, required] of [['./python/optimizer.py', true], ['./python/kyber_data.py', false]]) {
    const response = await fetchWithTimeout(new URL(path, import.meta.url), { cache: 'force-cache' });
    if (!response.ok) {
      if (required) throw new Error(`Impossible de charger ${path} (HTTP ${response.status})`);
      continue;
    }
    pyodide.FS.writeFile(`/home/pyodide/${path.split('/').pop()}`, await response.text());
  }
  pyodide.runPython("import sys; sys.path.append('/home/pyodide'); import optimizer");
  return pyodide;
}

function getPyodide() {
  if (!pyodideReadyPromise) pyodideReadyPromise = loadEngine();
  return pyodideReadyPromise;
}

async function getProfileIndex() {
  if (!profileIndexPromise) {
    profileIndexPromise = fetchWithTimeout(PROFILE_INDEX_URL, { cache: 'force-cache' }).then(async response => {
      if (!response.ok) throw new Error(`Index des profils indisponible (HTTP ${response.status})`);
      return response.json();
    });
  }
  return profileIndexPromise;
}

async function getCharacterProfile(baseId, name) {
  const index = await getProfileIndex();
  const wantedBase = String(baseId || '').trim().toUpperCase();
  const wantedName = String(name || '').trim().toLocaleLowerCase();
  const entry = index[wantedBase] || Object.values(index).find(item => String(item.name || '').trim().toLocaleLowerCase() === wantedName);
  if (!entry?.file) throw new Error(`Profil local introuvable pour ${name || baseId || 'ce personnage'}.`);
  if (profileCache.has(entry.base_id)) return profileCache.get(entry.base_id);
  const response = await fetchWithTimeout(new URL(`./python/optimizer_profiles/${encodeURIComponent(entry.file)}`, import.meta.url), { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Profil ${entry.name} indisponible (HTTP ${response.status})`);
  const profile = await response.json();
  profileCache.set(entry.base_id, profile);
  return profile;
}

self.onmessage = async event => {
  const data = event.data || {};
  const id = data.id;
  try {
    self.postMessage({ id, type: 'status', message: 'Chargement du moteur Optimizer…' });
    const [pyodide, localProfile] = await Promise.all([
      getPyodide(),
      data.base_stats && Object.keys(data.base_stats).length
        ? Promise.resolve(null)
        : getCharacterProfile(data.character_base_id, data.character_name),
    ]);
    const baseStats = data.base_stats && Object.keys(data.base_stats).length
      ? data.base_stats
      : (localProfile?.base_stats || {});
    if (!Object.keys(baseStats).length) throw new Error('Statistiques de base introuvables pour ce personnage.');

    pyodide.globals.set('mods_json', JSON.stringify(data.mods || []));
    pyodide.globals.set('profile_json', JSON.stringify(data.profile || {}));
    pyodide.globals.set('base_stats_json', JSON.stringify(baseStats));
    pyodide.globals.set('n_builds', Number(data.n_builds || 5));
    pyodide.globals.set('limit_slot', Number(data.limit_slot || 80));
    pyodide.globals.set('character_name', String(data.character_name || ''));
    pyodide.globals.set('context_json', JSON.stringify(data.context || {}));
    self.postMessage({ id, type: 'status', message: 'Recherche des candidats par slot…' });

    const raw = await pyodide.runPythonAsync(`
import json
mods = json.loads(mods_json)
profile = json.loads(profile_json)
base_stats = json.loads(base_stats_json)
context = json.loads(context_json)
if not isinstance(profile, dict):
    profile = {}
r = optimizer.find_top_builds(
    mods,
    base_stats=base_stats,
    number_of_builds=n_builds,
    limit_per_slot=limit_slot,
    kyber=profile,
    character=character_name,
    context=context,
)
json.dumps(r)
`);
    self.postMessage({ id, type: 'done', result: typeof raw === 'string' ? raw : String(raw) });
  } catch (error) {
    self.postMessage({ id, type: 'error', error: error?.stack || error?.message || String(error) });
  }
};
