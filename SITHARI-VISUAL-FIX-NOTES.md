# Sith'ari — correction visuelle

Cette livraison corrige la présentation interactive des mods et des portraits dans Sith'ari.

- Le mod équipé devient lui-même un bouton d'interaction : un clic ouvre l'analyse de renforcement/calibrage, un second clic sur le même mod referme la constellation.
- Les portraits des personnages essaient les URLs fournies par les données, les textures du jeu et le miroir d'icônes communautaire, avec repli sur une initiale si aucune image ne répond.
- Les résultats calculés sont présentés en cartes graphiques sur une grille de constellation, avec les visuels de mod, le personnage propriétaire et les statistiques/gains déjà calculés par le moteur.
- Le style de rareté des mods et les règles métier de calcul restent inchangés.

Vérifications locales : `node --check modules/sithari.js` et `python -m unittest discover -s tests -v` (13 tests réussis).

À vérifier après publication : chargement des portraits distants depuis GitHub Pages et interaction avec un roster réel. Les portraits distants dépendent de la disponibilité des sources d'images.
