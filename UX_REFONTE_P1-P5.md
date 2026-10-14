# Refonte UX Holocron Sith — v3.2.0

Cette version applique les priorités P1 à P5 au projet existant. Les calculs d'optimisation, les profils Kyber et les modules métier sont conservés.

## P1 — Synchronisation et orientation
- Le code allié est décrit comme un identifiant public à neuf chiffres ; l'écran précise qu'aucun mot de passe EA/Google n'est demandé.
- Les erreurs de validation sont associées au champ de code et l'état de chargement est annoncé.
- Les requêtes réseau disposent d'un délai maximal de 20 secondes et renvoient une erreur lisible en cas de dépassement.
- Le Sanctuaire distingue un profil non chargé d'un roster réellement vide.
- Effacer le profil retire aussi les informations de session qui auraient relancé sa récupération au rechargement.

## P2 — Navigation cohérente
- Le Codex est de nouveau accessible depuis le menu et la carte du Sanctuaire.
- Le clic sur Codex ouvre la page `data` au lieu de rediriger silencieusement vers le Sanctuaire.
- La page active est annoncée par `aria-current="page"` et les pages inactives sont masquées aux technologies d'assistance.
- La navigation initialise son état accessible au chargement.

## P3 — Parcours plus compréhensibles
- Ajout d'explications concrètes aux écrans de Forge, Codex et Aide.
- Les descriptions existantes de Disciple et Sith'ari sont conservées.
- Le parcours initiatique reste conseillé, sans imposer de verrouillage entre les modules.

## P4 — États vides et retours
- Les indicateurs de roster affichent « — » avant synchronisation au lieu de faux zéros.
- Les ventilations de personnages et de mods expliquent comment faire apparaître les données.
- Le verdict du Sanctuaire décrit l'action à effectuer tant qu'aucun profil n'est chargé.
- Les résultats calculés après synchronisation restent pilotés par le moteur métier.

## P5 — Lisibilité et usage mobile
- Renforcement du focus clavier et des états de navigation.
- Zones de recherche et contrôles de consultation avec une hauteur minimale plus confortable.
- Défilement horizontal localisé pour les tableaux du Codex sur petits écrans.
- Prise en charge renforcée de `prefers-reduced-motion`.

## Vérifications effectuées
- 13 tests unitaires Python réussis.
- `py_compile` réussi sur le moteur Python et les données Kyber.
- `node --check` réussi sur les scripts JavaScript, le Web Worker et le service worker.
- Aucun ID HTML dupliqué ni destination `data-page` manquante.
- Les fichiers CSS ont été analysés sans erreur de syntaxe détectée ; les JSON de référence sont valides.
- Les ressources locales référencées par `index.html` et le service worker existent.

## Vérifications manuelles encore nécessaires
Les tests automatisés ne remplacent pas une session réelle dans Edge/Chrome. Avant de considérer la version comme validée en production, tester :
1. la synchronisation d'un compte SWGOH.GG réel ;
2. l'échec du relais et l'expiration du délai ;
3. l'ouverture du Codex depuis le menu et le Sanctuaire ;
4. les parcours Acolyte, Disciple, Seigneur Sith et Sith'ari avec un roster réel ;
5. l'effacement du profil puis le rechargement de la page ;
6. les écrans à 360 px, 390 px, tablette et ordinateur.

Le relais Cloudflare est un service externe : cette archive ne permet pas d'auditer son code ni sa politique de conservation.
