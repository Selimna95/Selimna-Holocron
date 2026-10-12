# Selimna’s Holocron — SWGOH Optimizer Web

**Version : 3.2.1** · Application web statique en français pour analyser un inventaire de mods de *Star Wars: Galaxy of Heroes*.

## Fonctionnalités
- Import et synchronisation du profil public SWGOH.GG via un relais HTTPS configurable ou par les chemins d’import prévus dans l’application.
- Analyse et optimisation des mods avec un moteur Python exécuté dans Web Worker via Pyodide.
- Analyse de roster, comparaison aux références Kyber et outils Holocron/Sith’ari.
- Interface responsive, installation PWA et prise en charge de `prefers-reduced-motion`.

## Démarrage local
Les modules navigateur et le Web Worker utilisent `fetch`, les modules ES et les chemins relatifs. Ouvrir `index.html` directement avec `file://` peut bloquer les requêtes. Utilisez un serveur HTTP local depuis la racine du dépôt, par exemple :

```bash
python -m http.server 8000
```

Puis ouvrez `http://localhost:8000/`.

## Synchronisation et données
L’application peut transmettre le code allié à l’URL du relais configuré afin de récupérer les données publiques de profil. Configurez uniquement un relais de confiance. L’URL est conservée dans le stockage local du navigateur. Le relais est un service tiers : sa disponibilité et sa politique de conservation ne sont pas garanties par ce dépôt. Ne saisissez aucun mot de passe EA/Google ni donnée d’authentification.

Le relais par défaut est `https://swgoh-optimizer-relay.lorg75017.workers.dev`. Une URL HTTPS personnalisée peut être saisie dans les paramètres de synchronisation. HTTP n’est accepté que pour localhost en développement. Le code du relais n’est pas contenu dans ce dépôt : il doit être audité séparément avant de prétendre garantir sa sécurité ou sa confidentialité.

## Architecture
- `index.html` : structure et gabarits de l’interface.
- `app.css` : styles globaux et thème principal.
- `sithari.css` : styles spécifiques à Sith’ari.
- `modules/core.js` : import, données communes, roster, mods et références.
- `modules/acolyte.js` : recommandations de changements prioritaires.
- `modules/disciple.js` : réaffectation de mods.
- `modules/seigneur.js` : forge personnage.
- `modules/sithari.js` : analyse d’équipe et comparaison de statistiques.
- `modules/runtime.js` : navigation et branchement des événements.
- `interface-adapter.js` : indicateurs du tableau de bord et gate de connexion.
- `optimizer-worker.mjs` + `python/optimizer.py` : moteur d’optimisation et données Kyber.

Les scripts navigateur restent pour le moment des scripts classiques car ils partagent un contrat historique de variables globales. Une migration ES modules doit se faire par étapes avec des tests de non-régression, pas par renommage mécanique des fichiers.

## Qualité
Tests Python :

```bash
python -m unittest discover -s tests -v
```

Installation des outils web : `npm install`, puis `npm run check`. Le build Vite produit `dist/` avec des noms d’assets hachés ; les scripts historiques restent chargés dans l’ordre classique pour préserver leurs dépendances globales.

## Publication GitHub Pages
Le workflow de qualité construit `dist/` et publie automatiquement le site lors d’un push sur `main`. Dans GitHub, ouvre **Settings → Pages**, puis règle **Build and deployment → Source** sur **GitHub Actions** (au lieu de `Deploy from a branch`). Le build conserve les chemins relatifs du dépôt et produit des noms d’assets hachés.

La CI GitHub Actions exécute ESLint, Stylelint (interdiction de `!important`), les tests Vitest, les tests Python, le budget CSS, le build Vite et le scénario Playwright « charger profil → ouvrir la Forge → vérifier les candidats ».

## Données de référence
`python/optimizer_profiles/index.json` référence les profils du moteur ; chaque personnage est chargé depuis son fichier dédié dans `python/optimizer_profiles/`. Le fichier JavaScript de profils redondant a été supprimé car aucune référence active ne le chargeait. `python/kyber_profiles.json` reste une donnée distincte pour les références Kyber.

## Licence
Le projet est distribué sous licence MIT ; voir `LICENSE`.

## Sécurité et fonctionnement hors ligne
- Les URL de ressources d’images sont limitées à HTTPS et échappées avant insertion dans les attributs HTML. Le nettoyage général des 67 usages de `innerHTML` reste progressif ; les gabarits qui composent de grands tableaux doivent encore être migrés vers `createElement`/`textContent`.
- Une CSP limite les scripts à la même origine et à la distribution Pyodide épinglée sur jsDelivr. Pyodide reste chargé depuis le CDN et ne dispose pas encore d’un cache hors ligne complet ni d’une SRI applicable à son import dynamique.
- Le service worker revalide les fichiers de données et de moteur au réseau et conserve un cache de secours ; le moteur Pyodide nécessite toujours une connexion au CDN lors de son premier chargement.
- Les tests HTML figés sont fournis dans `tests/fixtures/` et exécutés par Playwright en CI.
