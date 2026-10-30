# Sith’ari — refonte de lisibilité

## Intention
Sith’ari représente la maîtrise ultime. L’interface doit aider à décider rapidement, sans afficher simultanément tous les outils et toutes les vues secondaires.

## Changements
- La sélection de personnages est disponible dans un panneau repliable, au lieu d’occuper en permanence le premier plan.
- Les personnages sélectionnés restent visibles en tant que puces ; cliquer sur une puce sélectionne le personnage à analyser.
- La liste latérale qui dupliquait les personnages est masquée visuellement, mais son conteneur est conservé pour ne pas casser le code de rendu existant.
- L’état d’équipe est replié par défaut et peut être ouvert pour consulter les renforcements et calibrages de tous les personnages.
- Le panneau principal concentre l’analyse du personnage actif, les statistiques actuelles face à la référence Kyber et les six slots.
- Les actions détaillées de renforcement/calibrage restent accessibles au niveau du slot.
- Typographie, espacements, contrastes et empilement mobile ont été harmonisés.

## Périmètre préservé
Aucune fonction de calcul, référence Kyber, règle de choix des mods ou logique d’optimisation n’a été modifiée. Le GAC n’est pas concerné.

## Validation
Les 13 tests Python du projet passent et `node --check modules/sithari.js` réussit. Les contrôles de structure confirment la présence unique des identifiants utilisés par les contrôles Sith’ari. L’application doit encore être testée dans un navigateur avec un roster réel, en particulier la sélection, l’ouverture des panneaux et les actions de slot.
