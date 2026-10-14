# Sith’ari — constellation visuelle des mods

## Modifications de cette livraison

- Les possibilités de renforcement/calibrage montrent le visuel réel du mod (forme, niveau, tier et nombre de points) via le composant partagé `modIconHtml`.
- Chaque possibilité affiche le portrait du personnage propriétaire quand il est équipé, ou un repère de mod libre.
- Les secondaires et la primaire proviennent des données du mod ; la vitesse totale et l’écart à la vitesse du mod actuel sont calculés à partir des fonctions existantes.
- Les résultats s’ouvrent comme une constellation : étoiles, liens rouges pulsés et apparition progressive. Les animations sont désactivées si le système préfère réduire les mouvements.
- Cliquer une seconde fois sur le même bouton de renforcement/calibrage replie la constellation. Le bouton « Fermer » reste disponible.
- Aucun calcul Kyber ni aucune règle de sélection métier n’a été remplacé.

## Vérifications

- `node --check modules/sithari.js`
- `python -m unittest discover -s tests -v` — 13 tests réussis.

Les résultats restent fondés sur les données présentes dans le roster ; aucun gain fictif n’est généré.
