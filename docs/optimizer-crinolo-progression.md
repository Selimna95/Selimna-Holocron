# Optimizer — progression dynamique Crinolo

Le moteur ne doit plus dépendre d'un instantané unique par personnage.

- Le roster SWGOH.GG conservé dans `character.raw` fournit l'identifiant, le niveau, la rareté, le gear, les pièces du gear courant et le palier de relique.
- `modules/optimizer-progression.mjs` transforme uniquement les données complètes et identifiables en entrée Crinolo. Pour G1–G12, les six slots du gear courant doivent être présents avec un booléen `is_obtained`; les identifiants de pièces doivent exister dans `gameData.gearData`.
- Pour G13, Crinolo calcule la progression avec le palier de relique réel et sans contribution de gear courant, conformément au contrat du moteur de mods partagé.
- Les composantes `stats.base` et `stats.gear` sont conservées séparément. Leur somme alimente `base_stats`; le moteur partagé vérifie leur cohérence avant tout bonus en pourcentage.
- Si les pièces, la progression ou les données de jeu ne permettent pas un calcul exact, le moteur retombe sur un instantané statique seulement si ses quatre champs de progression correspondent exactement. Sinon, il refuse le calcul.

Dépendances épinglées :

- Calculateur Crinolo maintenu par swgoh-utils : `swgoh-utils/swgoh-stat-calc@e42bf44898c92276143e766e7bb82be9790c4eec` (MIT, attribution dans `vendor/CRINOLO-LICENSE.txt`).
- Données de jeu : `swgoh-utils/gamedata@e96f00d4bcddb41d9bb93428a00ab7b4bb6fcdef/gameData.json`, chargées depuis GitHub Raw au démarrage du Worker. Aucun serveur payant n'est ajouté.
