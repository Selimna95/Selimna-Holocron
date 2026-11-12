# Architecture decision: moteur unique des mods

- Statut : migration en cours, intégration interdite tant que les formules non couvertes restent incomplètes
- Moteur : `modules/mod-engine.js` v0.3.1
- Statut des calculs : Defense % et statistiques non prises en charge sont signalés incomplets, jamais estimés
- Base : `main@9b2f3962ad2639b50cd23849b713047054fb6421`
- Portée : toute l'application, pas uniquement Visionnaire.

## Décision

Le projet aura une seule implémentation de référence pour :
- l'identification et la normalisation des statistiques ;
- les unités (valeur fixe, points de pourcentage, ratio interne) ;
- les statistiques finales d'un personnage ;
- les bonus de sets et leurs conditions de niveau ;
- les indicateurs dérivés communs (vitesse, score de mod, qualité).

Le module central sera `modules/mod-engine.js`. Les modules métier ne pourront conserver que leurs règles de décision et de présentation. Ils ne pourront pas redéfinir les formules communes.

## Frontière de responsabilité

| Couche | Responsabilité autorisée |
|---|---|
| `mod-engine.js` | Normalisation, règles du jeu, calculs, validation des entrées |
| Acolyte | Choix des cibles/donneurs et explication des recommandations |
| Disciple | Filtrage et classement des candidats de réallocation |
| Seigneur Sith | Construction des objectifs et contraintes de recherche |
| Visionnaire | Références Kyber, sélection des personnages/mods, scénarios d'échange |
| Optimizer | Exploration des combinaisons, contraintes et classement des builds |
| Import / adaptateurs | Conversion des formats sources vers le contrat canonique, sans calcul métier |

## Contrat canonique

Une statistique doit conserver son identité et son unité. Le seul nom d'affichage ne suffit pas.

Forme logique attendue :

```js
{
  id: 48,                 // identifiant source conservé si connu
  key: "offense",
  unit: "percent",       // flat | percent | percentagePoints
  value: 2.5,
  source: "comlink"      // comlink | swgohgg | json | profile
}
```

Le moteur doit distinguer explicitement les valeurs fixes, les pourcentages appliqués à une statistique de base et les statistiques exprimées en points de pourcentage. Une valeur dont l'unité ne peut pas être établie ne doit pas être devinée : elle est marquée inconnue et le calcul concerné doit être signalé incomplet.

## Intégration JavaScript / Python

Le calculateur de recherche Python est aujourd'hui exécuté dans Pyodide, dans `optimizer-worker.mjs`. Il ne doit pas conserver une seconde copie des formules.

La cible est :
1. le moteur JavaScript central est la seule implémentation des formules ;
2. l'Optimizer conserve en Python, dans un premier temps, l'exploration combinatoire et les contraintes métier ;
3. Python appelle le moteur central via un pont Pyodide/JavaScript, avec des évaluations groupées pour éviter les appels unitaires coûteux ;
4. si les mesures montrent que ce pont pénalise la recherche, l'exploration sera migrée en JavaScript plutôt que de dupliquer les formules en Python.

Le moteur central doit être utilisable depuis les scripts classiques de l'interface et depuis le Worker module, sans créer deux fichiers source.

## Migration obligatoire

| Zone actuelle | Action |
|---|---|
| `modules/core.js` | Déplacer les fonctions communes et remplacer les anciennes implémentations par des appels temporaires, puis les supprimer |
| `modules/acolyte.js` | Utiliser le moteur pour scores et statistiques |
| `modules/disciple.js` | Supprimer `discipleCanonicalStat` et déléguer au moteur |
| `modules/visionnaire.js` | Supprimer `exchangeFinalStats` et déléguer au moteur |
| `modules/seigneur.js` / `seigneur-impact.js` | Déléguer tout calcul commun au moteur |
| `python/optimizer.py` | Supprimer les formules communes de `final_stats` / `mod_stats` après branchement du pont |
| `optimizer-worker.mjs` | Charger une seule source moteur et initialiser le pont |
| Tests | Tests comportementaux du contrat commun + non-régression par module |

## Ordre de migration

1. Inventorier les formats réellement reçus (Comlink, JSON joueur, secours SWGOH.GG, profils).
2. Vérifier les identifiants et les échelles avec des fixtures brutes ; ne pas déduire une unité du libellé traduit.
3. Implémenter le contrat canonique et ses tests unitaires.
4. Migrer les modules un par un sans changer leurs règles métier.
5. Brancher l'Optimizer sur le même moteur et mesurer les performances.
6. Supprimer les anciennes fonctions, alias, mappings et tests structurels devenus inutiles.
7. Valider l'application complète, l'import/export, la synchronisation, les parcours GAC bleu et mods rouge.
8. Mettre à jour les versions, le cache et la documentation depuis une source unique.

## Garde-fous

- Aucun changement sur le Worker Cloudflare sans preuve qu'il est impliqué.
- Aucun changement de fonctionnalité métier au cours de la migration du calcul.
- Aucun bonus de set, unité ou identifiant non vérifié ne sera ajouté.
- Un calcul sans données suffisantes doit être déclaré incomplet, jamais remplacé par zéro inventé.
- Aucune suppression de fichier avant vérification de ses références et de ses usages.
- Pas de déploiement depuis cette branche ; validation par tests puis Pull Request.
