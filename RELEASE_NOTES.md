# Holocron — notes de livraison v3.2.0

## Modifications
- URL de ressource centralisée et HTTPS-only pour les images générées depuis les pages scrapées ; CSP restrictive pour les scripts.
- URL du relais centralisée, HTTP refusé hors localhost, avertissement en cas de relais personnalisé, code allié non persisté dans `sessionStorage`.
- Worker Pyodide avec délais, arrêt du Worker sur annulation/timeout et erreur explicite quand aucun build n’est trouvé.
- Service worker v3.2.0 : réseau d’abord pour le moteur et les données modifiables, cache de secours en cas de coupure. Pyodide reste dépendant du CDN au premier chargement et n’est pas encore entièrement hors ligne.
- Recherche exhaustive jusqu’à 100 000 combinaisons pour les petits inventaires, repli non contraint avec avertissement lorsque le plan de sets est impossible, normalisation du slot corrigée, identifiants uniques pour les mods sans ID.
- Poids du scoring nommés et documentés ; index des profils régénérable et validable par script.
- Feuilles CSS lisibles et multi-lignes ; journal limité à 500 lignes.

## Contrôles locaux réalisés
- 14 tests Python réussis.
- Syntaxe JavaScript vérifiée par `node --check`.
- Parsing CSS sans erreur ; aucune déclaration `!important`.
- Index de profils régénéré et vérifié : 334 profils + index.

## Limites de cette livraison
Le registre npm était inaccessible (`EAI_AGAIN registry.npmjs.org`), donc Vitest, ESLint, Stylelint, Vite et Playwright n’ont pas pu être lancés localement. La CI GitHub doit confirmer ces étapes. Le nettoyage complet des `innerHTML`, la migration complète en modules ES, le formatage Prettier de tout le JavaScript, la validation visuelle du contraste WCAG, le cache hors ligne de Pyodide et le calibrage des poids sur des données réelles restent à terminer.
