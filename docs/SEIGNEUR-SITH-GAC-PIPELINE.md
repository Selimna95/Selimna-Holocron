# Seigneur Sith — chaîne de décision GAC et réaffectation

## Objectif

Seigneur Sith utilise les données GAC pour choisir les bénéficiaires prioritaires, identifier des donneurs peu prioritaires, puis mesurer le coût du transfert sur le roster. Le moteur bleu reste une source stratégique ; il ne remplace pas l'optimiseur de mods.

## 1. Données GAC et ordre de priorité

Le pont `modules/seigneur-gac.js` applique l'ordre suivant :

1. Utiliser `window.__SWGOH_GAC_USAGE__` si le flux complet personnages + flottes contient des observations.
2. Si ce flux est vide, lire `blue-gac/gac-catalog.json` et agréger les compositions défensives réellement publiées, pondérées par leur nombre de batailles.
3. Le repli catalogue est explicitement marqué `evidenceType: defense-composition` et `sourceStatus: partial`. Il ne prétend pas représenter l'utilisation offensive ou l'ensemble du GAC.
4. Les saisons courantes sont sélectionnées indépendamment par format (actuellement 5v5 S84 et 3v3 S83). Une observation historique ne remplace une donnée courante que si le personnage n'est pas observé dans la saison courante du format.
5. Une absence de ligne reste inconnue ; elle n'est jamais convertie en zéro.

## 2. Bénéficiaires

Le sélecteur de personnage place en tête les personnages avec des observations GAC positives, du plus utilisé au moins utilisé. L'étiquette indique explicitement « GAC défense » lorsque le repli catalogue est employé. La sélection reste manuelle : l'ordre aide à choisir, il ne force pas une cible.

## 3. Donneurs

Seigneur Sith conserve les mods de la cible dans le vivier et exclut les GL comme donneurs. Pour les autres personnages, seuls les statuts incomplets, très faibles et faibles sont autorisés par défaut ; les statuts moyens et bons sont protégés.

Les donneurs équipés sont classés d'abord par usage GAC terrestre. Lorsque les associations pilotes-vaisseaux et les observations de flotte existent, l'usage flotte complète ce classement. Si l'usage terrestre est connu mais que les associations ou statistiques de flotte sont absentes, le donneur reste classable sur son seul usage terrestre et l'exposition flotte est signalée comme non vérifiée. Si l'usage terrestre lui-même est absent, le personnage reste protégé. Les pilotes identifiés dont l'usage flotte est inconnu restent protégés. Les mods libres restent disponibles.

## 4. Sécurité du bénéficiaire et bilan global

Chaque build de six mods doit respecter les six slots uniques et ne peut pas diminuer la vitesse totale de la cible. Le contrôle inclut le bonus de set Speed de quatre pièces ; si la vitesse de base est inconnue, perdre ce bonus entraîne un rejet conservateur.

Pour chaque build retenu, le bilan global affiche :
- la variation de vitesse du bénéficiaire ;
- la vitesse retirée aux donneurs ;
- le nombre de mods restant sur chaque donneur et son statut avant/après ;
- l'écart pondéré d'usage GAC entre bénéficiaire et donneurs.

Un donneur qui passe à un statut plus faible ou devient incomplet est signalé. Le bilan ne prétend pas calculer une puissance totale du roster : les secondaires perdues, les datacrons, les interactions d'équipe et les conditions d'affrontement ne sont pas modélisés ici.

## 5. Validation

Les tests dédiés couvrent le repli défense GAC, la priorité saisonnière 5v5/3v3, l'absence de données comme état inconnu, le filtre des donneurs, la non-régression de vitesse sur les six mods et le calcul du bilan donneur/bénéficiaire.
