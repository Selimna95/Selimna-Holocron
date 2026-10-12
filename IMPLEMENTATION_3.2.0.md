# Holocron Sith — rapport de livraison v3.2.0

## Corrections appliquées à partir de l’audit

1. **XSS / URL d’images** — ajout d’un helper partagé `safeUrl()` qui n’accepte que HTTPS et échappe les valeurs d’attribut ; les portraits Acolyte/Disciple et les images issues du scraping passent par ce helper. Les 67 usages d’`innerHTML` n’ont pas tous été remplacés : la migration des grands gabarits HTML vers `createElement`/`textContent` reste un chantier séparé.
2. **CSP** — ajout d’une politique restrictive pour les scripts (`'self'`, jsDelivr épinglé pour Pyodide, `wasm-unsafe-eval`) et externalisation du script inline d’enregistrement du service worker. Les scripts locaux ne nécessitent pas de SRI ; l’import dynamique Pyodide ne permet pas de lui appliquer directement un attribut SRI.
3. **Relais** — URL par défaut centralisée dans `runtime-guards.js`, HTTPS exigé hors localhost, avertissement explicite pour un relais personnalisé et suppression de la mémorisation du code allié dans `sessionStorage`.
4. **Scraping** — ajout de fixtures HTML figées pour les parseurs personnages, mods et profil Kyber et d’un scénario Playwright de non-régression. La voie JSON/API reste prioritaire quand elle fournit les données nécessaires.
5. **Worker** — délai maximal sur l’import et le chargement Pyodide, délai réseau sur les ressources, fonction d’annulation qui termine le Worker, et erreur explicite si aucun build n’est produit.
6. **Cache / PWA** — cache versionné `v3.2.0`, stratégie réseau d’abord pour les fichiers de moteur et données modifiables, cache de secours hors ligne. Pyodide venant de jsDelivr n’est pas encore disponible hors ligne au premier chargement.
7. **Optimiseur** — repli non contraint avec avertissement si le plan de sets ne peut pas produire de build ; recherche exhaustive pour les petits espaces de recherche (jusqu’à 100 000 combinaisons) afin de vérifier le classement final ; cache du set normalisé par mod ; correction du slot numérique (`17` n’est plus interprété comme `7`) et identifiants distincts pour les mods anonymes.
8. **Score** — coefficients heuristiques regroupés dans `SCORING_WEIGHTS`, explicités comme des poids de classement, avec tests associés. Leur calibrage empirique sur un corpus de résultats réels reste à réaliser.
9. **Profils** — script reproductible `scripts/generate-profile-index.py` avec validation du schéma minimal, détection des doublons et mode `--check`. Le dépôt contient 334 profils de personnages plus `index.json` (335 fichiers JSON au total).
10. **Lisibilité / observabilité** — les trois feuilles CSS sont maintenant formatées sur plusieurs lignes, le journal de diagnostic est limité aux 500 dernières lignes, Prettier vise désormais les sources complètes, et ESLint signale les variables/globales non résolues dans les scripts classiques sans bloquer la migration progressive.

## Contrôles exécutés localement

- **14 tests Python réussis**, incluant bonus de sets, statistiques finales, identifiants anonymes, repli du plan impossible et comparaison à une recherche exhaustive sur un petit inventaire.
- `node --check` réussi sur les scripts JavaScript et les configurations testées.
- Parsing CSS sans erreur ; aucune déclaration `!important` ; `app.css` fait environ 77,8 Ko (cible < 100 Ko et garde CI à 120 Ko).
- Index des profils régénéré puis validé en mode `--check`.

## Vérifications encore bloquées ou partielles

Le registre npm était inaccessible (`EAI_AGAIN registry.npmjs.org`). Vitest, ESLint, Stylelint, le build Vite et Playwright n’ont donc pas pu être exécutés localement ; la CI GitHub doit confirmer ces contrôles. Le formatage Prettier des fichiers JavaScript n’a pas pu être appliqué sans installer l’outil, bien que le script couvre désormais les sources complètes. La migration de tous les `innerHTML`, des globales historiques vers ES modules, l’audit visuel du contraste WCAG, le cache hors ligne de Pyodide et le calibrage des poids sur des données réelles restent incomplets.

## Publication GitHub Pages

Après intégration de cette archive dans le dépôt, sélectionner **Settings → Pages → Build and deployment → Source → GitHub Actions**. Le workflow publie `dist/` lors d’un push sur `main` si les contrôles passent.
