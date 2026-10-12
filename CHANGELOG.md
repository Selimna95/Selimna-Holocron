# Changelog

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
