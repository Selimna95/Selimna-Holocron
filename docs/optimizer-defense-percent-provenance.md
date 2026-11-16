# Défense % — provenance des statistiques et condition de réactivation

## État actuel

Les mods dont la primaire est **Défense %** sont volontairement refusés par le moteur de calcul partagé avec le diagnostic :

`defense:gear_component_required`

Cette protection ne doit pas être supprimée tant que le profil utilisé par l'Optimizer ne fournit pas la composante exacte attendue par le calculateur de référence.

## Ce que contient réellement le jeu de profils

Audit du fichier `python/optimizer_profiles.json` sur `main` :

- 334 profils examinés ;
- tous ont les mêmes neuf champs de premier niveau : `name`, `base_id`, `base_stats`, `current_stats`, `mod_stat_diffs`, `level`, `rarity`, `gear_level`, `relic_tier` ;
- aucun ne contient de décomposition `gear`, `gear_stats`, `equipped` ou `equipment` ;
- pour 331 profils, les valeurs Armor et Resistance vérifient exactement `current_stats - base_stats - mod_stat_diffs = 0`.

Exemple Moff Gideon (profil `MOFFGIDEONS3`) :

| Statistique | base_stats | current_stats | mod_stat_diffs |
|---|---:|---:|---:|
| Armor | 57.429048 | 60.440583 | 3.011535 |
| Resistance | 52.085682 | 55.247455 | 3.161773 |

Ces nombres sont les valeurs d'affichage de l'armure et de la résistance. Le fichier ne donne pas les valeurs brutes séparées entre composante de base et équipement secondaire. Le champ `gear_level` ne remplace pas la liste des pièces effectivement équipées.

## Ce qu'exige le calculateur de référence

Le code de Crinolo sépare explicitement trois contributions :

1. `stats.base` : statistiques de base, croissance, équipement primaire et reliques ; cette composante sert de base aux bonus de mods en pourcentage ;
2. `stats.gear` : statistiques secondaires des pièces d'équipement, appliquées après les mods ;
3. `stats.mods` : bonus des mods.

Pour Défense %, Crinolo applique la valeur en pourcentage aux valeurs brutes Armor et Resistance de `baseStats[8]` et `baseStats[9]`. La conversion en pourcentage affiché intervient ensuite, en appliquant séparément la contribution de l'équipement secondaire.

Sources de référence :

- [README Crinolo — distinction entre `base` et `gear`](https://github.com/Crinolo/swgoh-stat-calc/blob/master/README.md#L432-L443)
- [Crinolo — calcul des statistiques brutes et séparation des pièces équipées](https://github.com/Crinolo/swgoh-stat-calc/blob/master/statCalculator.js#L121-L152)
- [Crinolo — application de Défense % à Armor et Resistance de base](https://github.com/Crinolo/swgoh-stat-calc/blob/master/statCalculator.js#L394-L405)
- [Crinolo — conversion séparée de base, équipement et mods](https://github.com/Crinolo/swgoh-stat-calc/blob/master/statCalculator.js#L481-L495)
- [Crinolo — conversion de la défense brute en pourcentage affiché](https://github.com/Crinolo/swgoh-stat-calc/blob/master/statCalculator.js#L665-L669)

## Pourquoi la valeur actuelle ne peut pas être réutilisée

Le résidu `current_stats - mod_stat_diffs` retire la contribution des mods, mais le schéma ne permet pas de prouver qu'il retire également les statistiques secondaires de l'équipement. Or Crinolo applique Défense % à `stats.base`, puis ajoute `stats.gear` séparément.

Utiliser directement le pourcentage affiché comme composante de base ferait donc courir le risque de compter une partie de l'équipement dans la base du bonus, puis de la compter une seconde fois après les mods. L'inverse — soustraire une quantité estimée — serait tout aussi spéculatif.

## Conditions nécessaires pour réactiver Défense %

Le profil de référence devra fournir, pour chaque personnage :

- les valeurs brutes de base Armor et Resistance correspondant à `stats.base[8]` et `stats.base[9]`, après croissance, équipement primaire et reliques ;
- la contribution d'équipement secondaire Armor et Resistance séparée ;
- le niveau et le contexte d'équipement exacts utilisés pour construire ces valeurs ;
- une provenance et une version des données sources.

Le moteur pourra alors appliquer le bonus Défense % à la seule composante de base, convertir les valeurs brutes en pourcentages affichés et ajouter séparément l'équipement secondaire. La réactivation devra être accompagnée de tests de parité avec Crinolo sur plusieurs personnages, niveaux d'équipement et niveaux de relique.

**Règle actuelle : aucune estimation, aucune approximation à partir du pourcentage affiché, aucune proposition de build dépendant d'un calcul Défense % incomplet.**
