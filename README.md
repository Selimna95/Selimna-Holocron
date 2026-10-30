# Selimna’s Holocron — SWGOH Optimizer Web

**Version : 4.1.0** · Application web statique en français pour analyser un inventaire de mods de *Star Wars: Galaxy of Heroes*.

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
- Le Sanctuaire bleu charge ses styles et son code depuis des fichiers dédiés au lieu d'un document HTML monolithique.
- Les instantanés GAC sont attribués à leur ligue source : Kyber (S84/S83) ou Chromium (S82/S81). Les autres ligues ne réutilisent plus silencieusement des compositions d'une ligue différente.
- Les équipes éligibles sont classées par volume de combats observés, puis par taux de tenue.
- Le moteur Python relance une recherche sans contrainte de composition Kyber si le plan exact n'est pas réalisable.

### Limite connue des données GAC
Le catalogue embarqué n'est pas un flux live. Il ne contient actuellement que Kyber S84/S83 et Chromium S82/S81. Aurodium, Bronzium et Carbonite sont signalées comme non couvertes plutôt que de recevoir des équipes présentées à tort comme spécifiques à leur ligue. L'actualisation automatique des sources reste à implémenter.
\n\n## Catalogue GAC dynamique — V4.1.0\n- Le Sanctuaire bleu ne contient plus de compositions défensives codées en dur. Il charge `blue-gac/gac-catalog.json`.\n- Le relevé automatique lit les classements SWGOH.GG en défense pour Kyber, Aurodium, Chromium, Bronzium et Carbonite, en 3v3 et 5v5.\n- Pour chaque format, les deux saisons publiées les plus récentes sont récupérées automatiquement depuis les liens de saison SWGOH.GG. Les données sont triées par nombre de combats observés, puis par taux de tenue.\n- GitHub Actions actualise le snapshot toutes les six heures et sur demande. La publication est atomique : si une page source manque ou si le parseur ne retrouve pas assez d'équipes, le dernier catalogue valide est conservé.\n- Le service worker utilise une stratégie réseau d'abord pour ce fichier, avec copie en cache comme secours hors ligne.\n- Les compositions sont toujours filtrées sur la possession complète des personnages et l'absence de doublons. Les flottes sont exclues.\n- Source : [SWGOH.GG — classements GAC défensifs](https://swgoh.gg/tier-list/), récupérés via le lecteur public Jina Reader car SWGOH.GG refuse les requêtes directes des runners automatisés. Les statistiques sont celles des premières tentatives enregistrées par SWGOH.GG, pas une garantie de résultat en combat.\n