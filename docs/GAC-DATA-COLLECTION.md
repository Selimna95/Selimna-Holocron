# Collecte GAC — Holocron

## Catalogue défensif Padawan

Le catalogue des compositions défensives est collecté automatiquement depuis les pages publiques SWGOH.GG.

- Source : classements « GAC 5v5 Squad Defense » et « GAC 3v3 Squad Defense ».
- Couverture visée : cinq ligues (Kyber, Aurodium, Chromium, Bronzium, Carbonite), deux formats et les deux dernières saisons disponibles de chaque format.
- Données conservées par composition : cinq ou trois personnages complets, rang source, nombre de combats, taux de tenue, ligue, format, saison et lien source.
- Priorité des saisons : le collecteur enregistre explicitement la saison en cours pour chaque format, même si une ligue ne contient aucune composition ou seulement quelques compositions. Padawan trie d'abord par saison décroissante ; les combats, le taux de tenue et le rang ne départagent qu'à l'intérieur d'une même saison. Les saisons précédentes ne complètent que les places encore vacantes et chaque carte conserve sa saison d'origine. Une page inaccessible ou incohérente fait échouer la collecte afin de ne pas remplacer le dernier snapshot fiable. Les vues vides ou partielles, elles, sont acceptées et signalées.
- Publication : GitHub Actions ajoute explicitement le fichier généré avant de vérifier les différences Git, puis le publie dans `blue-gac/gac-catalog.json`.

Le workflow **Refresh public GAC defense catalogue** reste déclenché manuellement : il conserve le dernier catalogue valide si SWGOH.GG bloque la collecte serveur.

Le workflow **Refresh GAC usage database** se lance automatiquement chaque jour à 07:17 UTC et à chaque ajout d'un export navigateur. Il tente d'abord les pages publiques via Jina Reader. Si l'accès serveur est bloqué, il importe l'export navigateur versionné ; si aucun export n'est disponible, il conserve le dernier snapshot valide sans jamais publier une base vide. Une base de plus de 35 jours est marquée `stale` et n'est plus utilisable pour classer les donneurs de mods. Une nouvelle collecte complète rétablit le statut `observed`.

## Collecte des statistiques d'unités et des flottes

Le fichier `gac-usage.json` est une base distincte. Son importeur utilise trois niveaux de récupération :
1. collecte complète depuis les pages publiques SWGOH.GG via Jina Reader ;
2. export complet de session navigateur `gac-browser-export.json` lorsque le serveur est bloqué ;
3. conservation du dernier snapshot complet, avec statut de fraîcheur explicite, si les deux sources sont temporairement indisponibles.

Le collecteur navigateur est résumable : les vues déjà collectées sont conservées 12 heures dans la session. Les erreurs transitoires (429/5xx) sont retentées ; un défi Cloudflare est signalé immédiatement. Avant publication, les 20 vues personnages et 10 vues flottes sont contrôlées, et les saisons doivent être cohérentes par format.

Les statistiques d'unités sont des observations de combats de première tentative en escouades complètes. Les vues distinguent format, côté et ligue. Les flottes sont des apparitions dans les compositions publiées, pas un recensement exhaustif.

## Lecture statistique dans l'audit Padawan

L'audit calcule, pour chaque composition, un intervalle de confiance de Wilson à 95 % autour du taux de tenue publié, à partir du nombre de combats observés. Il compare ensuite ce taux à une moyenne pondérée par les combats des autres compositions du même format, de la même ligue et de la même saison. Les saisons, formats et ligues ne sont jamais mélangés dans cette comparaison.

Les écarts sont présentés comme des signaux statistiques, pas comme une note de synergie ni comme une prédiction de victoire. Une marge d'incertitude étroite indique une mesure plus précise ; elle ne prouve pas que l'équipe est meilleure dans toutes les conditions. Le rapport affiche les cinq signaux positifs et les cinq signaux négatifs les plus marqués parmi les compositions dont l'incertitude est au plus moyenne.

## Limites à respecter

- Une composition fréquemment observée ou un taux de tenue n'est pas une garantie de victoire.
- Les classements de compositions ne prouvent pas que tous les personnages d'une équipe sont possédés par le joueur.
- Padawan doit continuer à vérifier chaque composition contre le roster synchronisé et interdire les personnages manquants ou les doublons.
- Les données Comlink (classements officiels et profils) ne contiennent pas l'historique des combats GAC, les équipes d'attaque, les défenses posées ou les taux de contre. Elles ne remplacent donc pas les statistiques de combat SWGOH.GG.
