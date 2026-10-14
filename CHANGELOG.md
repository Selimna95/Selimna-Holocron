## [3.2.0] — 2026-10-14

### Navigation et compréhension (P1–P5)
- La navigation ouvre désormais le Codex du roster au lieu de rediriger silencieusement vers le Sanctuaire.
- Le Codex est rétabli dans le menu et depuis la carte du Sanctuaire ; l'état actif de navigation est exposé via `aria-current`.
- Les compteurs du tableau de bord affichent « — » tant qu'aucun roster n'est chargé, plutôt que de présenter l'absence de données comme un compte à zéro.
- Les répartitions personnages/mods et le verdict du Sanctuaire expliquent désormais comment commencer lorsque le profil n'est pas chargé.
- Ajout d'explications opérationnelles au point d'entrée, à la Forge Seigneur Sith, au Codex et à l'aide.
- Ajout d'un délai maximal de 20 secondes par requête réseau, avec un message explicite si le relais ou la source ne répond pas.
- Renforcement de la lisibilité mobile, des zones de défilement des tableaux, du focus clavier et de la préférence de mouvement réduit.
- Version des ressources et cache PWA alignés sur `3.2.0`.

### Compatibilité
- Les identifiants HTML, les points d'entrée des modules et le moteur Python de l'optimiseur sont conservés.
- Aucun calcul de classement, profil Kyber ou règle métier d'optimisation n'a été modifié.

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

## Nouvelle couche d'expérience — audit ciblé et harmonisation visuelle

- Ajout de `holocron-system.css` pour les tokens partagés, les états, le focus clavier et les adaptations responsives.
- Ajout d'un conseil contextuel unique du Gardien dans l'en-tête, adapté à l'espace actif et à l'état de chargement du profil.
- Réorganisation visuelle des états de la porte d'entrée, du verdict du Sanctuaire, des priorités Acolyte, des étapes Disciple, de la Forge Seigneur Sith et des comparaisons Sith'ari.
- Le Codex détaillé personnages/vaisseaux/mods reste accessible comme destination de consultation ; ses données et points d'entrée métier sont conservés.
- Version du cache statique incrémentée afin d'inclure la nouvelle feuille de style.
