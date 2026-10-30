## [4.1.0] — 2026-10-30\n\n### Catalogue GAC dynamique\n- Suppression des compositions défensives codées en dur dans le Sanctuaire bleu.\n- Ajout d'un collecteur SWGOH.GG actualisable pour les cinq ligues, en 3v3 et 5v5.\n- Détection des deux saisons les plus récentes disponibles par format, classement par volume de combats puis taux de tenue.\n- Publication protégée : une collecte incomplète ne remplace pas le dernier catalogue valide.\n- Actualisation GitHub Actions toutes les six heures et à la demande ; stratégie réseau d'abord dans le service worker.\n- Conservation des règles Padawan : roster complet, aucune équipe inventée, aucun personnage réutilisé, flottes exclues.\n\n## [4.0.55] — 2026-10-30

### Moteur de mods
- Correction du repli Kyber : si le plan exact de sets n'est pas réalisable, le moteur relance une recherche sans cette contrainte au lieu de renvoyer une liste vide.
- Le résultat n'annonce le plan de sets que s'il a réellement été respecté.
- Normalisation défensive des valeurs de composition mal formées et tests de régression associés.

### Sanctuaire bleu / GAC
- Extraction du CSS et du JavaScript dans des fichiers dédiés.
- Attribution explicite des instantanés à Kyber (S84/S83) et Chromium (S82/S81).
- Classement des équipes par volume de combats observés puis taux de tenue.
- Les ligues non couvertes sont signalées au lieu d'utiliser des données d'une autre ligue.
- Ajout des ressources extraites et de l'image Padawan au précache PWA.

### Interface et maintenance
- Renforcement des tailles minimales de texte et du focus clavier dans le Sanctuaire bleu.
- Versions visibles et documentation mises à jour.
- La validation CI reste distincte des essais réels avec roster et relais.

### Limites ouvertes
- Le catalogue GAC reste un instantané statique ; l'actualisation automatique et la couverture Aurodium/Bronzium/Carbonite ne sont pas encore implémentées.
- Le Worker Cloudflare est externe au dépôt et ne peut pas être audité ici.
- Un test réel avec roster importé reste nécessaire.

## [3.2.1] — 2026-10-14

### Sith’ari — constellation visuelle des mods
- Affichage des véritables icônes de mods dans les résultats de renforcement et calibrage, avec niveau, tier et nombre de points.
- Portrait du personnage propriétaire affiché pour chaque option, ou repère explicite lorsqu’un mod est libre.
- Affichage de la primaire, des secondaires et de la vitesse totale réelle, avec différence calculée par rapport au mod actuel.
- Possibilités présentées comme des étoiles reliées par des lignes rouges pulsantes, avec animations discrètes et respect de la préférence de mouvement réduit.
- Un second clic sur le bouton actif replie les possibilités ; le bouton Fermer reste disponible.
- Les calculs et règles métier existants sont conservés.

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

## Affinage UX Sith’ari — Maîtrise ultime

- Réduction de la densité initiale : la sélection des personnages est désormais repliée dans un panneau explicite, toujours accessible.
- Suppression visuelle de la double liste des personnages dans la zone d’analyse ; les sélections restent accessibles via les puces d’équipe et la structure interne nécessaire au code est conservée.
- Repli par défaut de la vue d’ensemble d’équipe, consultable à la demande.
- Nouvelle hiérarchie visuelle : titre plus sobre, textes plus lisibles, cartes espacées, moins de bordures et d’effets décoratifs.
- Comparaison actuelle / référence Kyber et actions par slot conservées ; aucune formule de calcul ni règle métier modifiée.
- Mise en page mobile simplifiée, avec comparaison des deux modulations empilée verticalement.
- Cache-busting de la feuille de style Sith’ari pour que GitHub Pages charge la nouvelle présentation.
- Vérifications : 13 tests Python réussis, syntaxe JavaScript contrôlée et identifiants HTML Sith’ari vérifiés. Un test interactif avec un roster réel reste nécessaire.
