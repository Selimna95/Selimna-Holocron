# Selimna’s Holocron — SWGOH Optimizer Web

**Version : 4.0.55** · Application web statique en français pour analyser un inventaire de mods de *Star Wars: Galaxy of Heroes*.

## Direction artistique et expérience v3.2.0
- Identité visuelle obsidienne, rouge Sith et accents braise, harmonisée entre les vues.
- Hiérarchie renforcée pour la navigation, les panneaux et les actions.
- Thème appliqué directement aux règles existantes pour éviter une feuille de surcouche dédiée.

## Fonctionnalités
- Import et synchronisation du profil public SWGOH.GG via un relais HTTP(S) configurable ou par les chemins d’import prévus dans l’application.
- Analyse et optimisation des mods avec un moteur Python exécuté dans Web Worker via Pyodide.
- Analyse de roster, comparaison aux références Kyber et outils Holocron/Sith’ari.
- Interface responsive, installation PWA et prise en charge de `prefers-reduced-motion`.
- Parcours UX clarifié : états vides explicites, descriptions des modules, navigation accessible et Codex ouvert depuis le Sanctuaire.
- Synchronisation avec délai maximal de 20 secondes par requête et message d'erreur compréhensible en cas de délai dépassé.

## Démarrage local
Les modules navigateur et le Web Worker utilisent `fetch`, les modules ES et les chemins relatifs. Ouvrir `index.html` directement avec `file://` peut bloquer les requêtes. Utilisez un serveur HTTP local depuis la racine du dépôt, par exemple :

```bash
python -m http.server 8000
```

Puis ouvrez `http://localhost:8000/`.

## Synchronisation et données
L’application peut transmettre le code allié à l’URL du relais configuré afin de récupérer les données publiques de profil. Configurez uniquement un relais de confiance. L’URL est conservée dans le stockage local du navigateur. Le relais est un service tiers : sa disponibilité et sa politique de conservation ne sont pas garanties par ce dépôt. Ne saisissez aucun mot de passe EA/Google ni donnée d’authentification.

Le relais par défaut est `https://swgoh-optimizer-relay.lorg75017.workers.dev`. Une URL HTTP(S) personnalisée peut être saisie dans les paramètres de synchronisation. Le code du relais n’est pas contenu dans ce dépôt : il doit être audité séparément avant de prétendre garantir sa sécurité ou sa confidentialité.

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

La CI vérifie les tests Python, la syntaxe JavaScript, la cohérence des ressources versionnées du service worker et un smoke test navigateur Playwright (navigation et invariant des six emplacements de mods). Le test navigateur utilise un stub Pyodide : il valide le shell et les interactions locales, pas l'exécution complète du moteur d’optimisation ni l’accès au relais.

Tests Python :

```bash
python -m unittest discover -s tests -v
```

La CI GitHub Actions exécute les tests Python et vérifie la syntaxe des scripts JavaScript avec Node.js. Les contrôles statiques ne remplacent pas un test navigateur réel : avant publication, vérifier la synchronisation du profil, les six slots de mods, les filtres, la navigation, les vues mobile et l’optimisation via Web Worker.

## Données de référence
`python/optimizer_profiles.json` est la source de référence des profils du moteur. Le fichier JavaScript de profils redondant a été supprimé car aucune référence active ne le chargeait. `python/kyber_profiles.json` reste une donnée distincte pour les références Kyber.

## Licence
Le projet est distribué sous licence MIT ; voir `LICENSE`.


### Couche visuelle partagée

`holocron-system.css` regroupe les tokens d’interface et les ajustements transversaux (focus clavier, états, composants partagés et adaptations responsives). Elle ne contient aucune logique de calcul. Le Codex du roster reste accessible comme destination de consultation.


## Consolidation V4.0.55
- Le Sanctuaire bleu charge désormais ses styles et son code depuis des fichiers dédiés (`blue-gac/blue-gac.css` et `blue-gac/blue-gac.js`) au lieu d'un document HTML monolithique.
- Le catalogue GAC est un instantané local attribué explicitement à sa ligue source : Kyber (S84/S83) ou Chromium (S82/S81). Les autres ligues ne réutilisent plus silencieusement des compositions d'une ligue différente.
- Les équipes éligibles sont classées par volume de combats observés, puis par taux de tenue, avant les critères secondaires de saison et de rang.
- Le moteur Python retente une recherche sans contrainte de composition Kyber lorsque l'inventaire ne peut pas satisfaire le plan de sets ou que la recherche bornée ne trouve aucun build exact.
- La CI reste un contrôle statique et un smoke test avec Pyodide simulé ; une validation de bout en bout avec un vrai roster et une collecte automatique SWGOH.GG restent à effectuer.

### Limite connue des données GAC
Le catalogue embarqué n'est pas un flux live. Il ne contient actuellement que les instantanés Kyber S84/S83 et Chromium S82/S81. Les ligues Aurodium, Bronzium et Carbonite sont explicitement signalées comme non couvertes plutôt que de recevoir des équipes présentées à tort comme spécifiques à leur ligue. Les sources doivent être actualisées et contrôlées avant d'étendre cette couverture.
