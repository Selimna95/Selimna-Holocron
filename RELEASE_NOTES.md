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
