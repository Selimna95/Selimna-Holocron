# Selimna’s Holocron — SWGOH Optimizer Web

**Version : 3.1.0** · Application web statique en français pour analyser un inventaire de mods de *Star Wars: Galaxy of Heroes*.

## Direction artistique v3.1.0
- Identité visuelle obsidienne, rouge Sith et accents braise, harmonisée entre les vues.
- Hiérarchie renforcée pour la navigation, les panneaux et les actions.
- Thème appliqué directement aux règles existantes pour éviter une feuille de surcouche dédiée.

## Fonctionnalités
- Import et synchronisation du profil public SWGOH.GG via un relais HTTP(S) configurable ou par les chemins d’import prévus dans l’application.
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

`holocron-system.css` regroupe les tokens d’interface et les ajustements transversaux (focus clavier, états, composants partagés et adaptations responsives). Elle ne contient aucune logique de calcul. Le Codex détaillé du roster peut être masqué visuellement sans supprimer les données ou les fonctions métier.
