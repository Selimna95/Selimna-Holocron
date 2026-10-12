# Changelog

## [3.2.0] — 2026-10-12

### Sécurité et fiabilité
- Helper `safeUrl()` HTTPS-only pour les images et politique CSP restrictive.
- Relais centralisé, HTTPS exigé hors localhost, avertissement des relais personnalisés et suppression du stockage du code allié en session.
- Timeout/annulation du Worker et erreurs explicites lorsque l’optimiseur ne peut pas proposer de build.
- Revalidation réseau des profils et du moteur avec cache de secours.

### Moteur et tests
- Repli visible si le plan de sets Kyber est impossible, recherche exhaustive sur petits inventaires, cache du set normalisé et identifiants uniques des mods anonymes.
- Constantes de scoring nommées, fixtures HTML de scraping et génération reproductible de l’index des profils.
- Feuilles CSS formatées sur plusieurs lignes ; `app.css` reste sous 100 Ko.
- 14 tests Python exécutés localement avec succès. Les tests npm et Playwright restent à confirmer par la CI, car le registre npm était inaccessible lors de la préparation.


## [3.0.0] — 2026-10-12

### Corrigé
- Extraction de l’image d’accueil du HTML vers `assets/backgrounds/holocron-gate.jpg`.
- Suppression du polling permanent de rendu du tableau de bord ; rafraîchissement sur événement de données.
- Chargement du compte via une promesse, sans boucle de polling toutes les 300 ms.
- URL du relais personnalisable depuis l’écran de connexion et message de transparence sur les données transmises.
- Cache HTTP des ressources du moteur versionnées au lieu de `no-store`.
- Suppression du diagnostic de production codé en dur pour Darth Bane.
- Amélioration de la lisibilité des petites tailles de police et prise en charge des préférences de mouvement réduit.
- Suppression des sauvegardes, profils JS redondants non référencés, changelogs épars et marqueurs `.gitkeep` inutiles.

### Qualité et maintenance
- Ajout d’un README, d’une licence MIT, d’un `.gitignore`, de tests Python et d’une CI.
- Ajout des icônes PWA et d’un service worker statique.
- Version visible et cache d’assets alignés sur `3.0.0`.

### À vérifier manuellement avant mise en production
- Le relais Cloudflare reste un service externe dont le code et la politique de conservation ne sont pas présents dans ce dépôt.
- Les scripts navigateur conservent des globals historiques ; leur conversion en modules ES exige une migration progressive et des tests navigateur.
- Le nettoyage complet des couches CSS sédimentaires doit être validé visuellement sur toutes les pages et tailles d’écran.
