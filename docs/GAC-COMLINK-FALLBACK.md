# Collecte GAC officielle sans clé SWGOH.GG

Cette filière indépendante utilise SWGOH Comlink dans un conteneur temporaire GitHub Actions. Elle interroge les API officielles du jeu accessibles sans clé SWGOH.GG.

## Données collectées

1. **Classements top 50** : les 5 ligues × 5 divisions, via \`getLeaderboard\` avec \`leaderboardType: 6\`.
2. **Groupes de la saison GAC active** : les joueurs de chaque bracket et leurs informations de classement, via \`getEvents\` puis \`getLeaderboard\` avec \`leaderboardType: 4\`.
3. **Découverte des brackets** : recherche exponentielle puis dichotomique de la dernière position de bracket, selon l'algorithme du client Python Comlink maintenu par swgoh-utils. Les brackets ne sont accessibles que pendant un événement GAC actif et peuvent apparaître progressivement.
4. **Profils des meilleurs joueurs** : récupération des profils publics référencés dans les classements top 50, puis agrégation anonyme de la présence des personnages, de leurs paliers d'équipement, reliques et mods équipés. Les identifiants, noms et Ally Codes ne sont pas publiés.

Le workflow \`Refresh official GAC leaderboards\` s'exécute quotidiennement à 05:20 UTC et peut être déclenché manuellement dans GitHub Actions. Il génère :

- \`gac-official-leaderboards.json\`
- \`gac-official-leaderboards.js\`

Aucune clé API SWGOH.GG ni intervention des joueurs n'est requise.

## Limite fondamentale

Comlink expose les profils joueurs, événements, classements GAC et groupes de compétition. Les classements/brackets ne contiennent pas l'historique des combats GAC, les équipes réellement posées en défense, les équipes utilisées en attaque ni les taux de victoire des counters.

**Cette base ne doit donc jamais alimenter directement les statistiques d'utilisation d'équipes ou les taux de réussite du Padawan.** Elle peut enrichir le contexte compétitif (ligue, division, rang, participation et prévalence des personnages dans les rosters du top 50), mais ne remplace pas les données de batailles SWGOH.GG. La présence d'un personnage dans un roster ne prouve jamais qu'il a été utilisé en défense ou en attaque.

## Fiabilité et publication

- Le collecteur refuse de publier si l'un des 25 classements top 50 est incomplet ou si l'API renvoie une erreur.
- Les erreurs sur un bracket ne sont pas interprétées comme une fin de liste.
- Si aucune saison GAC n'est active, les classements top 50 sont conservés et les brackets sont explicitement marqués comme non collectés pour cette exécution.
- Le résultat conserve les réponses officielles brutes afin de ne pas perdre de champs si le jeu fait évoluer son schéma.

La collecte SWGOH.GG reste séparée. Si l'accès API demandé est accordé, elle pourra compléter cette source sans mélanger les deux modèles de données.
