# Holocron Sith — rapport de livraison v3.1.0

## Les 10 chantiers

1. **Purge CSS G1/G2** — sélecteurs non référencés supprimés, déclarations redondantes retirées, styles des pages secondaires séparés. `app.css` est passé d’environ 241 Ko à environ 63 Ko, sous la cible de 100 Ko.
2. **Propriété CSS G3** — les règles de composants Sith’ari ont été déplacées hors de `app.css` vers `sithari.css`. Les règles Acolyte/Disciple/Forge et les composants de pages secondaires résident dans `pages.css`, chargé lors de la première navigation hors du Sanctuaire.
3. **Lisibilité G4** — tailles fonctionnelles secondaires ciblées à 11 px, texte secondaire Sith’ari éclairci pour viser un contraste WCAG AA de 4,5:1. Les codes couleur Sith’ari sont explicites : inventaire/renforcement en vert, recherche/calibrage en rouge.
4. **Gardes réseau T6/T9** — ajout de `holoFetch` avec `AbortController` et timeout ; accès au stockage local/session centralisé dans `safeStorage` et `safeSessionStorage`.
5. **CSS sans `!important`** — les déclarations `!important` ont été supprimées des trois feuilles ; Stylelint bloque leur réintroduction.
6. **Outillage T4** — ajout de Vite, ESLint, Prettier et Stylelint. Le build de l’application hache les scripts classiques et les feuilles CSS ; les chaînes `?v=3.0.0` ont été retirées. Le mode application est utilisé plutôt que `build.lib`, car la livraison est un site HTML complet, pas une bibliothèque JavaScript.
7. **État T1** — ajout de `HOLOCRON_STATE` pour le compte, les préférences, l’interface, le cache et les requêtes. La migration vers les modules ES reste progressive afin de préserver l’ordre d’exécution historique ; les nouveaux gardes réseau sont lintés strictement.
8. **Tests T2** — ajout de tests Vitest sur `normalizeMod`, les alias de sets et le score des mods ; scénario Playwright de profil → Forge → résultats candidats. Ces suites sont exécutées par la CI.
9. **Poids/performance T5** — les profils de base sont découpés en 334 fichiers, référencés par `python/optimizer_profiles/index.json`. Le navigateur ne charge que l’index puis le profil du personnage sélectionné. Pyodide est importé par le Worker à la première demande de calcul. Le beam search accumule un score local incrémental pour classer les candidats partiels ; le score complet est recalculé pour les builds terminés.
10. **CI et publication** — le workflow exécute ESLint, Stylelint, Vitest, les tests Python, le budget CSS, le build Vite et Playwright. Un push sur `main` publie `dist/` avec GitHub Pages Actions.

## Vérifications locales réalisées

- 10 tests unitaires Python réussis.
- `node --check` réussi sur les scripts JavaScript et les configurations ajoutées.
- Parsing CSS réussi ; aucune déclaration `!important` ; aucune URL locale d’image CSS manquante.
- Aucun identifiant HTML dupliqué.
- `app.css` : environ 63 Ko ; budget CI bloquant à 120 Ko.
- Aucun `?v=3.0.0` restant dans les scripts/styles/pages.

**Limite de validation locale :** le registre npm n’a pas répondu pendant la préparation. Les suites dépendant de npm (Vitest, ESLint, Stylelint, build Vite et Playwright) sont configurées mais n’ont pas pu être exécutées dans cet environnement ; elles seront exécutées par GitHub Actions après installation des dépendances.

## Publication GitHub Pages

Dans le dépôt GitHub, ouvrir **Settings → Pages**, puis sélectionner **GitHub Actions** comme source de publication. Le workflow déploie automatiquement le site après les contrôles, lors d’un push sur `main`.
