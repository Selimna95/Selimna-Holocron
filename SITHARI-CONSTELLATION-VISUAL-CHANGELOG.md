# Sith'ari — refonte de la constellation

## Présentation
- Le mod sélectionné est maintenant affiché au centre de la constellation après lancement de la recherche/calibrage.
- Les mods candidats sont distribués autour du mod central (haut, gauche, droite, bas) avec connexions énergétiques rouges pulsantes.
- Les cartes candidates conservent les visuels de mods déjà fournis par le projet, les portraits des personnages porteurs, les statistiques secondaires et le delta de vitesse calculé par rapport au mod central.
- Le second clic sur le même mod ferme toujours le panneau.
- En largeur mobile, les propositions se réorganisent en grille pour préserver la lisibilité.

## Périmètre préservé
- Les fonctions de calcul des candidats, le filtrage par set/primaire/secondaires, la référence Kyber et le tri des résultats ne sont pas réécrits.
- Aucun changement demandé aux autres modules ou à GAC.

## Validation
- `node --check modules/sithari.js` : réussi.
- `python -m unittest discover -s tests -v` : 13 tests réussis.
- La validation visuelle dans un navigateur avec un roster réel reste à faire ; les tests automatisés ne garantissent pas le rendu pixel par pixel.
