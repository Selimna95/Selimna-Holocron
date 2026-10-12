# Holocron — notes de livraison

## Vérifications automatisées effectuées
- 10 tests unitaires Python réussis, dont normalisation des six slots, alias de sets, absence de slot, build à six mods et score final exact après le préclassement incrémental.
- Compilation syntaxique Python réussie.
- `node --check` réussi sur les scripts classiques, le Web Worker et le service worker.
- Parsing CSS sans erreur détectée.
- JSON du manifeste et des profils valide.
- Aucun ID HTML dupliqué ni référence locale cassée détectée.
- Les références locales d’images et de feuilles CSS ont été vérifiées ; le service worker met en cache les ressources statiques à leur première requête.

## Changements structurels majeurs
- Le HTML d’accueil passe d’environ 314 Ko à environ 36 Ko : l’image encodée en base64 est maintenant un asset.
- Le fichier `modules/core.js` passe d’environ 466 Ko à environ 73 Ko après suppression du bloc de profils intégré en double ; Les profils de base sont découpés par personnage sous `python/optimizer_profiles/`, avec un index léger chargé au démarrage.
- Suppression des sauvegardes et scripts/fichiers identifiés comme non chargés ou non référencés.
- Les scripts restent volontairement classiques et ordonnés pour conserver leurs variables globales partagées.

## Limites de validation
Les tests automatisés ne remplacent pas une exécution dans un vrai navigateur avec un compte SWGOH.GG réel. Le relais Cloudflare est externe et son code n’est pas présent dans cette archive. Une purge exhaustive de toutes les couches CSS historiques, la conversion complète en modules ES, une règle de lint exhaustive sur `innerHTML` et la minification de production nécessitent une migration complémentaire avec tests visuels et fonctionnels de chaque écran ; elles ne sont pas présentées comme intégralement validées dans cette livraison.


## v3.1.0 — CSS, réseau et qualité
- `app.css` ramené sous 100 Ko ; les styles des pages secondaires et de Sith’ari sont chargés à la demande.
- Retrait des sélecteurs CSS non référencés, des déclarations `!important` et des déclarations redondantes remplacées par une règle identique plus récente.
- `HOLOCRON_STATE`, stockage local/session protégé et requêtes avec `AbortController` + timeout.
- Profils de base découpés par personnage ; Pyodide chargé au premier calcul dans le Worker.
- Ajout de Vite, ESLint, Prettier, Stylelint, Vitest, Playwright et d’une CI de qualité renforcée.
- La migration complète vers ES modules reste progressive : l’ordre des scripts classiques est conservé pour éviter une régression fonctionnelle.


Validation locale de cette livraison : tests Python, syntaxe Node.js et parsing CSS exécutés. Le registre npm n’a pas répondu dans l’environnement de préparation ; Vitest, ESLint, Stylelint, Vite et Playwright sont donc définis dans le projet et seront exécutés par GitHub Actions après installation des dépendances.
