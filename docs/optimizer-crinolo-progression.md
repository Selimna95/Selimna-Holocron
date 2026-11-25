# Optimizer — progression dynamique Crinolo

Le moteur ne doit plus dépendre d'un instantané unique par personnage.

- Le roster SWGOH.GG conservé dans `character.raw` fournit l'identifiant, le niveau, la rareté, le gear, les pièces du gear courant et le palier de relique.
- `modules/optimizer-progression.mjs` transforme uniquement les données complètes et identifiables en entrée Crinolo. Pour G1–G12, les six slots du gear courant doivent être présents avec un booléen `is_obtained`; les identifiants de pièces doivent exister dans `gameData.gearData`.
- SWGOH.GG G13 est représenté dans Crinolo par le gear 12 avec les six pièces du dernier palier équipées et le palier de relique réel. Les six slots sont donc requis à tous les gears; G13 exige six pièces obtenues.
- Les composantes `stats.base` et `stats.gear` sont conservées séparément à tous les paliers, y compris G13. Leur somme alimente `base_stats`; le moteur partagé vérifie leur cohérence avant tout bonus en pourcentage. Un instantané statique sans cette séparation ne peut pas servir à projeter les bonus multiplicateurs.
- Si les pièces, la progression ou les données de jeu ne permettent pas un calcul exact, le moteur retombe sur un instantané statique seulement si ses quatre champs de progression correspondent exactement. Sinon, il refuse le calcul.

Dépendances épinglées :

- Calculateur Crinolo maintenu par swgoh-utils : `swgoh-utils/swgoh-stat-calc@e42bf44898c92276143e766e7bb82be9790c4eec` (MIT, attribution dans `vendor/CRINOLO-LICENSE.txt`).
- Données de jeu : `https://swgoh-stat-calc.glitch.me/gameData.json`, le fichier de référence au format Crinolo indiqué par la documentation du calculateur. Il est chargé au démarrage du Worker et mis en cache par le navigateur. Aucun serveur payant n'est ajouté.
