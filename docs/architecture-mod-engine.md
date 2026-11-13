# Architecture — moteur unique des mods

- Statut : migration en cours, branche isolée `refactor/unified-mod-engine-clean`
- Moteur de référence : `modules/mod-engine.js` v0.3.22
- Base de travail : `main@9b2f3962ad2639b50cd23849b713047054fb6421`
- Portée : Acolyte, Disciple, Seigneur Sith, Visionnaire et Optimizer Python.
- Publication : aucune modification de `main` ni de GitHub Pages pendant cette migration.

## Décision non négociable

Une seule implémentation porte les règles communes des mods :
- identité canonique des statistiques, unités et identifiants source ;
- identité canonique des sets et des slots ;
- vitesse totale et bonus de set ;
- score générique de mod ;
- projection des statistiques finales du personnage.

Les modules métier gardent leurs critères de décision (Kyber, GAC, sélection de donneurs, contraintes de scénario, affichage), mais ne doivent pas réimplémenter les formules de jeu.

## Répartition des responsabilités

| Zone | Responsabilité |
|---|---|
| `modules/mod-engine.js` | Normalisation canonique, règles de jeu, calculs communs, complétude des résultats |
| `modules/core.js` v4.2.31 | Import des données, wrappers historiques temporaires et présentation |
| Acolyte | Priorisation GAC et choix des changements ; score générique délégué ; mods incomplets exclus des échanges |
| Disciple | Filtres de réallocation et choix des donneurs ; identité stat/set/slot et vitesse projetée déléguées |
| Seigneur Sith | Objectifs Kyber/GAC et recherche de mods ; calculs de vitesse et identité délégués |
| Visionnaire | Références Kyber, sélection des mods et scénarios ; projection des stats et identité déléguées |
| Optimizer Python | Exploration combinatoire et score spécifique Kyber ; normalisation et projection des stats déléguées via Pyodide |
| Import/adaptateurs | Conversion de format uniquement, aucune formule métier |

## Contrat canonique

Une statistique conserve son identifiant source quand il existe, sa clé métier, son unité et sa valeur. Le libellé d'affichage ne suffit jamais à déterminer l'unité.

```js
{
  id: 48,
  key: "offense",
  unit: "percentagePoints", // flat | percentagePoints | unknown
  value: 2.5,
  source: "comlink"
}
```

Une unité inconnue ou une formule non implémentée rend le calcul incomplet. Aucun zéro ou bonus supposé ne doit être inventé.

## État de la migration

| Zone | État |
|---|---|
| Moteur central | Créé ; stat/set/slot, vitesse, score générique et projection finale regroupés |
| Core/import | Normalisation déléguée au moteur ; conversion des formats conservée |
| Acolyte | Vitesse, score générique et identité de stats délégués ; vérification de complétude avant échange |
| Disciple | Identité stat/set/slot et vitesse projetée déléguées ; filtres métier conservés |
| Seigneur Sith | Identité stat/set et vitesse projetée déléguées ; classement Kyber/GAC conservé |
| Visionnaire | Projection finale déléguée ; identité stat/set/slot déléguée ; scoring de scénario conservé |
| Optimizer Python | `final_stats`, `mod_stats`, primaire et set délégués au pont JavaScript ; recherche conservée en Python |
| Worker Pyodide | Une seule source moteur importée ; pont de normalisation et de projection initialisé |
| Cache/version | Références index, service worker et Worker réalignées pour cette branche |

Les anciennes fonctions qui ne font que transmettre les données au moteur peuvent rester temporairement comme adaptateurs d'interface. Toute fonction qui recalcule une formule commune doit être supprimée.

## Limites de calcul actuellement explicites

- Les bonus de set distinguent le bonus complet au niveau 15 du demi-bonus si un mod du set n'est pas au niveau 15.
- Le niveau utilisé pour la conversion Défense provient du personnage du roster ; le niveau 85 du profil de référence n'est jamais substitué au niveau réel.
- Offense fixe et Offense en pourcentage sont des unités différentes ; les dégâts physiques et spéciaux sont projetés séparément.
- La Défense en pourcentage n'est pas projetée tant que le profil ne fournit pas la composante de défense du palier d'équipement courant. Les valeurs Armor/Resistance affichées ne suffisent pas à la reconstituer exactement.
- Les statistiques reconnues mais dont la projection n'est pas encore implémentée (par exemple précision/pénétration) rendent le résultat incomplet au lieu d'être ignorées.
- Les identifiants de taux critique 14/15 sont traités comme des ratings et convertis à raison de 24 points de rating par point de pourcentage, conformément au calculateur Crinolo ; les identifiants non documentés restent inconnus.
- Le fallback HTML SWGOH.GG conserve le signe `%` affiché pour éviter de confondre une valeur en pourcentage avec un rating plat ; sans unité affichée ou identifiant source, une statistique ambiguë reste inconnue. Une valeur ou un niveau absent reste `null` : aucun zéro n'est injecté par l'importeur.
- Les scénarios qui nécessitent un résultat complet doivent donc s'abstenir de proposer une permutation quand ces données manquent.

## Sources externes vérifiées (sans dépendance à l'API SWGOH.GG)

- Formules indépendantes de statistiques : [Crinolo SWGOH Stat Calculator](https://github.com/Crinolo/swgoh-stat-calc) et [fork swgoh-utils](https://github.com/swgoh-utils/swgoh-stat-calc). Ces sources servent à vérifier les conversions et les formules ; elles ne sont pas chargées en production et ne remplacent pas le moteur Holocron.
- Bonus et nombre de pièces des sets : [swgoh-utils/gamedata — statModSet.json](https://github.com/swgoh-utils/gamedata/blob/main/statModSet.json).
- Encodage Comlink : le troisième chiffre de `definitionId` est un code de slot 1 à 6 ; le champ `statMod.slot` correspondant vaut ce code + 1. L'adaptateur mappe directement 1→`Square`, 2→`Arrow`, 3→`Diamond`, 4→`Triangle`, 5→`Circle`, 6→`Cross`. Le fichier [statMod.json](https://github.com/swgoh-utils/gamedata/blob/main/statMod.json) confirme par exemple `id=111` avec `slot=2` ; le code `111` désigne donc `Square`. La documentation est [Comlink player data](https://github.com/swgoh-utils/swgoh-comlink/wiki/Player-Data).
- Les numéros de slot historiques de l'importeur restent distincts : `1` et `2` désignent `Square`, puis `3` à `7` désignent respectivement `Arrow`, `Diamond`, `Triangle`, `Circle` et `Cross`. Les valeurs numériques `8` à `12` ne sont pas reconnues. Cette table conserve le comportement historique du dépôt ; elle n'est pas utilisée pour décoder `definitionId`.

L'Optimizer Python écarte les mods dont le set, le niveau, la primaire ou une unité de statistique ne peuvent pas être validés. Une projection impossible est signalée et ne devient jamais un score ou une vitesse égale à zéro.

## Vérification indépendante des formules

Les règles suivantes ont été confrontées au code source du calculateur [Crinolo SWGOH Stat Calculator](https://github.com/Crinolo/swgoh-stat-calc), à ses conversions internes et aux définitions Comlink :

- **Offense** : l'identifiant 41 est un bonus fixe ; l'identifiant 48 est un bonus en points de pourcentage. Ils affectent séparément Physical Damage et Special Damage, à partir des valeurs de base correspondantes.
- **Defense** : l'identifiant 42 ajoute du rating de défense aux deux voies Armor/Resistance. La conversion du rating utilise le niveau réel (`rating / (rating + 7.5 × level)`). L'identifiant 49 est un pourcentage appliqué au rating de base ; Holocron refuse encore ce cas lorsque la composante de base requise n'est pas disponible.
- **Critical Chance / Critical Avoidance** : les ratings physiques/spéciaux 14/15 et 39/40 sont convertis séparément. Le calculateur Crinolo utilise 2400 points de rating pour un ratio décimal de 1,0 (soit 100 points de pourcentage). Après normalisation Comlink par 1e8 et conversion du ratio décimal en points de pourcentage, l'incrément Holocron est `rating / 24`. Les points de pourcentage 21/22, 35/36, 53/54 sont traités séparément.
- **Vitesse** : l'identifiant 5 est plat ; l'identifiant 57 est un pourcentage de la vitesse de base. Le bonus de set est calculé à part et ne doit pas être confondu avec les secondaires.
- **Sets** : les huit tailles de set et leurs bonus minimums proviennent de `statModSet.json`. Les bonus maximums au niveau 15 correspondent au tableau de référence des [bonus de sets SWGOH](https://swgoh.wiki/wiki/Mods). Les tests vérifient chaque set, pas seulement Speed et Health.
- Les identifiants génériques 45 (Critical Rating) et 47 (Critical Negate Rating) ne sont pas assimilés arbitrairement aux ratings physiques/spéciaux : tant qu'aucune formule de conversion validée n'est disponible pour ces identifiants, ils rendent la projection incomplète.
- Les statistiques de précision, pénétration et autres effets non pris en charge restent explicitement non calculables ; elles ne sont ni ignorées ni ramenées à zéro.

Les donneurs dont les données sont incomplètes sont signalés comme impact partiel ; un statut inconnu ne peut jamais être interprété comme une amélioration.

Le calculateur Crinolo n'est pas une dépendance de production : il sert de référence indépendante. Le moteur Holocron reste l'unique moteur exécuté par les modules.
## Vérification des profils de statistiques

Le fichier `python/optimizer_profiles.json` contient 334 profils. La relation attendue entre les champs `base_stats`, `current_stats` et `mod_stat_diffs` a été contrôlée sur les 2 913 valeurs comparables : `current_stats[stat] - base_stats[stat] - mod_stat_diffs[stat] = 0`, avec une tolérance de 1e-6. Le résidu maximal observé est inférieur à 1.2e-16.

Cela confirme, pour les champs couverts par ces profils, que `base_stats` est le point de départ avant bonus de mods et que `mod_stat_diffs` représente l'écart de mods vers `current_stats`. Le test Python relit désormais le fichier complet et vérifie cette relation sur chaque profil à chaque exécution. La provenance externe initiale de ces profils reste à documenter ; ce contrôle valide leur cohérence interne, pas l'exactitude de leur collecte d'origine.

## Tests et critères d'intégration

1. Fixtures brutes Comlink et import JSON : identifiants, échelles, unités et slots.
2. Tests comportementaux du moteur : stats fixes/%, bonus de sets, vitesse, défense et stat non prise en charge.
3. Non-régression par module : Acolyte, Disciple, Seigneur, Visionnaire et Optimizer.
4. Parcours navigateur complet : import Ally Code/JSON, tableau de bord, sanctuaire rouge, salle du conseil bleue, export/import.
5. Mesure de performance sur un inventaire réel et un jeu de recherche reproductible.
6. Pull Request relue et contrôles verts avant intégration par squash ; aucun déploiement depuis la branche.

## Garde-fous

- Ne pas modifier le Worker Cloudflare sans preuve qu'il est impliqué.
- Ne pas changer les règles métier pendant la migration du calcul.
- Ne pas supprimer un fichier avant d'avoir vérifié toutes ses références.
- Ne pas considérer un test structurel comme une preuve de justesse mathématique.
- Ne pas intégrer tant que les formules et les formats non couverts ne sont pas documentés et testés.
