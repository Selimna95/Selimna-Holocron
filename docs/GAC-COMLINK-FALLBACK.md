# Collecte GAC officielle sans clé SWGOH.GG

Cette filière est indépendante de la collecte SWGOH.GG. Elle lance temporairement SWGOH Comlink dans GitHub Actions, puis interroge l'API publique du jeu pour récupérer les classements GAC par ligue et division.

## Automatisation

Le workflow `Refresh official GAC leaderboards` s'exécute chaque jour à 05:20 UTC et peut aussi être lancé manuellement depuis GitHub Actions. Il démarre un conteneur Comlink éphémère, collecte les 25 combinaisons (5 ligues × 5 divisions), puis publie :

- `gac-official-leaderboards.json`
- `gac-official-leaderboards.js`

Aucune clé SWGOH.GG ni manipulation du joueur n'est nécessaire.

## Limite fondamentale

Comlink expose les classements GAC officiels et les brackets pendant les événements. Il ne fournit pas les statistiques de compositions d'équipes, les placements défensifs, les résultats de combats ni les taux de victoire des counters que SWGOH.GG calcule à partir des batailles observées.

**Cette base ne doit donc jamais alimenter les scores d'utilisation d'équipes ou les taux de réussite du Padawan.** Elle constitue une source officielle complémentaire (classements et contexte de ligue), pas un remplacement des statistiques SWGOH.GG.

La collecte SWGOH.GG reste une filière séparée. Si l'accès API SWGOH.GG demandé est accordé, elle pourra être branchée sans mélanger les deux modèles de données.
