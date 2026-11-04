# Collecte GAC — Holocron

## Catalogue défensif Padawan

Le catalogue des compositions défensives est collecté automatiquement depuis les pages publiques SWGOH.GG.

- Source : classements « GAC 5v5 Squad Defense » et « GAC 3v3 Squad Defense ».
- Couverture visée : cinq ligues (Kyber, Aurodium, Chromium, Bronzium, Carbonite), deux formats et les deux dernières saisons disponibles de chaque format.
- Données conservées par composition : cinq ou trois personnages complets, rang source, nombre de combats, taux de tenue, ligue, format, saison et lien source.
- Validation : au moins huit compositions complètes par vue. Si une page est inaccessible, si le format/les personnages sont incomplets ou si le nombre minimal n'est pas atteint, le snapshot précédent est conservé et le workflow échoue.
- Publication : GitHub Actions ajoute explicitement le fichier généré avant de vérifier les différences Git, puis le publie dans `blue-gac/gac-catalog.json`.

Le workflow **Refresh public GAC defense catalogue** est déclenché par les changements du collecteur et s'exécute également chaque jour à 05 h 35 UTC. Il peut aussi être lancé manuellement depuis GitHub Actions.

## Collecte des statistiques d'unités et des flottes

Le fichier `gac-usage.json` est une base distincte. Son importeur accepte deux modes :
1. une collecte depuis les pages publiques SWGOH.GG lorsqu'elles sont accessibles au collecteur ;
2. un export de session navigateur `gac-browser-export.json`, utilisé lorsque le relais public bloque les requêtes automatisées.

Les statistiques d'unités sont des observations de combats de première tentative en escouades complètes. Les vues distinguent format, côté et ligue. Les flottes sont des apparitions dans les compositions publiées, pas un recensement exhaustif.

## Limites à respecter

- Une composition fréquemment observée ou un taux de tenue n'est pas une garantie de victoire.
- Les classements de compositions ne prouvent pas que tous les personnages d'une équipe sont possédés par le joueur.
- Padawan doit continuer à vérifier chaque composition contre le roster synchronisé et interdire les personnages manquants ou les doublons.
- Les données Comlink (classements officiels et profils) ne contiennent pas l'historique des combats GAC, les équipes d'attaque, les défenses posées ou les taux de contre. Elles ne remplacent donc pas les statistiques de combat SWGOH.GG.
