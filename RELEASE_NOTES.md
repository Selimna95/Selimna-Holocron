# Holocron v3.0.0 — notes de livraison

## Vérifications automatisées effectuées
- 8 tests unitaires Python réussis, dont normalisation des six slots, alias de sets, absence de slot et construction d’un build à six mods.
- Compilation syntaxique Python réussie.
- `node --check` réussi sur les scripts classiques, le Web Worker et le service worker.
- Parsing CSS sans erreur détectée.
- JSON du manifeste et des profils valide.
- Aucun ID HTML dupliqué ni référence locale cassée détectée.
- Toutes les ressources pré-cachées par le service worker existent.

## Changements structurels majeurs
- Le HTML d’accueil passe d’environ 314 Ko à environ 36 Ko : l’image encodée en base64 est maintenant un asset.
- Le fichier `modules/core.js` passe d’environ 466 Ko à environ 73 Ko après suppression du bloc de profils intégré en double ; `python/optimizer_profiles.json` est la source unique des profils de base.
- Suppression des sauvegardes et scripts/fichiers identifiés comme non chargés ou non référencés.
- Les scripts restent volontairement classiques et ordonnés pour conserver leurs variables globales partagées.

## Limites de validation
Les tests automatisés ne remplacent pas une exécution dans un vrai navigateur avec un compte SWGOH.GG réel. Le relais Cloudflare est externe et son code n’est pas présent dans cette archive. Une purge exhaustive de toutes les couches CSS historiques, la conversion complète en modules ES, une règle de lint exhaustive sur `innerHTML` et la minification de production nécessitent une migration complémentaire avec tests visuels et fonctionnels de chaque écran ; elles ne sont pas présentées comme intégralement validées dans cette livraison.

## Complément UI — 2026-10-13

### Cohérence et ergonomie
- Ajout de la feuille `holocron-system.css` pour les tokens de typographie/espacement, les contrôles, les focus clavier, les états vides/erreurs et les règles responsives partagées.
- La porte d’entrée utilise un panneau plus lisible et des états visuels plus sémantiques ; les accents lumineux sont réservés à l’activation et aux éléments significatifs.
- Le verdict du Sanctuaire est placé avant les statistiques sur mobile et centré dans la composition desktop.
- Les priorités Acolyte, les phases Disciple, les zones de la Forge et les comparaisons de slots Sith’ari sont plus distinctes.
- Le Gardien présente un seul conseil contextuel dans l’en-tête ; la recherche de l’aide filtre les rubriques documentaires.
- Le Codex détaillé du roster est masqué sans suppression de ses éléments internes. Le bouton d’effacement du profil reste accessible depuis Système & Aide ; l’import JSON revient au Sanctuaire.
- Les deux références CSS à des images absentes du dépôt ont été remplacées par des fonds CSS, sans requête vers des assets manquants.

### Vérifications exécutées
- 8 tests unitaires Python réussis ; compilation syntaxique Python réussie.
- `node --check` réussi sur 10 scripts JavaScript / Worker / service worker.
- Parsing des trois feuilles CSS sans erreur ; aucune référence locale cassée dans le HTML, les URL CSS ou le précache.
- 154 identifiants HTML uniques.
- Rendu statique Chromium et contrôle des largeurs aux viewports 390 px et 1440 px ; recherche d’aide et repli de navigation du Codex vérifiés dans le harnais visuel.

### Limites
- La navigation normale vers `localhost` et `file://` est bloquée par la politique administrateur de l’environnement. Le rendu Chromium a donc été effectué avec HTML/CSS et assets intégrés dans un contexte isolé ; il ne valide pas l’intégration complète du moteur métier.
- Pas de profil réel chargé : les résultats Acolyte, Disciple, Forge et Sith’ari avec données réelles restent à tester.
- L’exécution réelle de Pyodide dans le Web Worker, la synchronisation avec le relais et l’installation/hors-ligne de la PWA ne sont pas certifiées par cette session.
