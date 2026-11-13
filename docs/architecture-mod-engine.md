# Architecture — moteur unique des mods

- Statut : migration en cours, branche isolée `refactor/unified-mod-engine`
- Moteur de référence : `modules/mod-engine.js` v0.3.5
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
| `modules/core.js` v4.2.22 | Import des données, wrappers historiques temporaires et présentation |
| Acolyte | Priorisation GAC et choix des changements ; score générique délégué au moteur |
| Disciple | Filtres de réallocation et choix des donneurs ; identité stat/set/slot et vitesse déléguées |
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
| Acolyte | Vitesse, score générique et identité de stats délégués |
| Disciple | Identité stat/set/slot et vitesse déléguées ; filtres métier conservés |
| Seigneur Sith | Identité stat/set et vitesse projetée déléguées ; classement Kyber/GAC conservé |
| Visionnaire | Projection finale déléguée ; identité stat/set/slot déléguée ; scoring de scénario conservé |
| Optimizer Python | `final_stats`, `mod_stats`, primaire et set délégués au pont JavaScript ; recherche conservée en Python |
| Worker Pyodide | Une seule source moteur importée ; pont de normalisation et de projection initialisé |
| Cache/version | Références index, service worker et Worker réalignées pour cette branche |

Les anciennes fonctions qui ne font que transmettre les données au moteur peuvent rester temporairement comme adaptateurs d'interface. Toute fonction qui recalcule une formule commune doit être supprimée.

## Limites de calcul actuellement explicites

- Les bonus de set distinguent le bonus complet au niveau 15 du demi-bonus si un mod du set n'est pas au niveau 15.
- Offense fixe et Offense en pourcentage sont des unités différentes ; les dégâts physiques et spéciaux sont projetés séparément.
- La Défense en pourcentage n'est pas projetée tant que le profil ne fournit pas la composante de défense du palier d'équipement courant. Les valeurs Armor/Resistance affichées ne suffisent pas à la reconstituer exactement.
- Les statistiques reconnues mais dont la projection n'est pas encore implémentée (par exemple précision/pénétration) rendent le résultat incomplet au lieu d'être ignorées.
- Les identifiants de taux critique 14/15 sont traités comme des ratings et convertis à raison de 24 points de rating par point de pourcentage, conformément au calculateur Crinolo ; les identifiants non documentés restent inconnus.
- Le fallback HTML SWGOH.GG conserve le signe `%` affiché pour éviter de confondre une valeur en pourcentage avec un rating plat ; sans unité affichée ou identifiant source, une statistique ambiguë reste inconnue.
- Les scénarios qui nécessitent un résultat complet doivent donc s'abstenir de proposer une permutation quand ces données manquent.

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
