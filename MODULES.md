# Architecture — Holocron v3.0.0

| Fichier | Responsabilité |
|---|---|
| `index.html` | Structure des pages, formulaires et gabarits de l’interface |
| `app.css` | Thème global, navigation, pages et composants partagés |
| `sithari.css` | Couche de présentation spécifique à Sith’ari |
| `modules/core.js` | Import, synchronisation, état du compte, roster, mods, références et fonctions partagées |
| `modules/acolyte.js` | Acolyte / changements prioritaires |
| `modules/disciple.js` | Disciple / réaffectation de mods |
| `modules/seigneur.js` | Seigneur Sith / forge personnage et chargement des références |
| `modules/sithari.js` | Sith’Ari / analyse d’équipe et comparaison |
| `modules/runtime.js` | Navigation, branchement des événements et démarrage |
| `interface-adapter.js` | Indicateurs de tableau de bord et connexion Holocron |
| `optimizer-worker.mjs` | Worker isolé qui charge Pyodide et le moteur Python |
| `python/optimizer.py` | Normalisation des mods, recherche bornée et calcul des builds |
| `python/optimizer_profiles.json` | Source unique des profils de base de l’Optimizer |
| `python/kyber_profiles.json` | Références Kyber locales, distinctes des profils de base |

Les scripts navigateur restent des scripts classiques dans cette version, car ils partagent des variables globales historiques. L’ordre de chargement est donc contractuel et documenté dans `index.html`. Les modifications d’architecture doivent préserver cet ordre jusqu’à ce qu’une migration ES modules soit couverte par des tests de non-régression.
