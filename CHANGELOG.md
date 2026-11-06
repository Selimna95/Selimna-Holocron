## V4.1.54 — récupération GAC fiabilisée

- La collecte GAC tente désormais la source SWGOH.GG en direct, puis utilise un export navigateur complet si le serveur est bloqué ; à défaut, elle conserve le dernier snapshot valide.
- Les snapshots de plus de 35 jours sont explicitement marqués périmés et ne peuvent plus classer les donneurs de mods.
- Le workflow GitHub Actions retente automatiquement la collecte chaque jour et à chaque nouvel export navigateur.
- Le collecteur navigateur v1.2 retente les erreurs réseau transitoires, reprend les vues déjà collectées pendant 12 heures et refuse les exports incomplets ou mélangeant plusieurs saisons.
- Les noms de personnages nettoient désormais les badges de progression de rang (A→S, S→A, etc.) avant agrégation.

## V4.1.53 — diagnostic des donneurs indisponibles

- Si aucun mod source n'est éligible, le Visionnaire distingue désormais explicitement l'absence de mods libres de l'absence d'utilisation GAC vérifiée.
- Le moteur ne présente plus ce cas comme une simple absence de permutation stratégique.

## V4.1.52 — transparence du score stratégique

- La fiche de scénario affiche désormais la pondération complète du score : 45% référence Kyber, 25% équilibre statistique cible, 30% coût des donneurs.
- La pondération interne des sets, primaires et secondaires varie selon le mode choisi ; le coût donneur détaille usage GAC, impact statistique et évolution du statut.
- La vitesse reste un garde-fou obligatoire et ne rapporte aucun point.

## V4.1.51 — secondaires Kyber dans le classement

- Le score intègre les valeurs « Secondary Stat Focus » extraites des profils SWGOH.GG.
- La contribution des secondaires est affichée séparément des sets/primaires, des statistiques globales et du coût des donneurs.
- Les références secondaires absentes restent non disponibles ; les poids sont renormalisés sur les signaux présents.
- Tests dynamiques couvrant les statistiques, les sets, les échanges coordonnés, les cibles GL, les donneurs GL, les mods libres et le plancher de vitesse.

## V4.1.50 — validation stratégique du Visionnaire

- Les mods libres de l'inventaire sont désormais candidats aux échanges ; le mod remplacé retourne à l'inventaire sans créer de faux donneur.
- Calcul des statistiques complètes avant/après pour la cible et chaque donneur, à partir des statistiques de base et des bonus de sets du moteur d'optimisation.
- Si les statistiques de base d'un personnage manquent, le calcul est explicitement déclaré non vérifiable ; aucune valeur de remplacement n'est inventée.
- Les donneurs doivent conserver leurs six slots et leurs bonus de sets après restitution des mods remplacés ; les GL restent interdites comme donneurs, mais restent éligibles comme cibles.
- Classement transparent sur 100 : adéquation Kyber, équilibre statistique de la cible, coût stratégique des donneurs (usage GAC, statistiques et statut). La vitesse n'est pas utilisée comme récompense de score : elle reste un garde-fou dur.
- Ajout de tests de contrat pour l'impact statistique, les sources libres, la protection des GL, les bonus de sets et le classement.
- Aucun déplacement automatique ; application manuelle uniquement.

## V4.1.49 — Recherche coordonnée des échanges du Visionnaire

- Activation de la recherche depuis les slots explicitement sélectionnés ; les transferts d'un même scénario sont évalués ensemble.
- Les donneurs équipés doivent avoir un usage GAC vérifié, sont classés par usage croissant et les GL sont exclues.
- Chaque donneur reçoit le mod remplacé sur le même slot ; le scénario est rejeté si un bonus de set actif du donneur disparaît après l'ensemble des restitutions.
- Le personnage cible doit conserver ses six slots et sa vitesse totale ; si la vitesse de base est inconnue, la protection du bonus 4 pièces Speed reste stricte.
- En mode Sets, le scénario doit réduire la distance à une composition complète SWGOH.GG ; en mode Primaires, les primaires reçues doivent être observées dans la distribution Kyber.
- Aucun mod n'est déplacé automatiquement ; les propositions restent des scénarios à appliquer manuellement.
- Cache navigateur et versions des ressources incrémentés.

## V4.1.48 — Menu déroulant de faction reconstruit

- Remplacement du contrôle natif non sélectionnable par un menu déroulant accessible composé de boutons de faction.
- Ouverture/fermeture, choix de faction, fermeture au clic extérieur et filtrage immédiat sans relancer l'audit Kyber.
- Menu placé dans une couche dédiée au-dessus de la liste pour éviter les problèmes de superposition.
- Cache navigateur et versions des ressources incrémentés.

## V4.1.47 — Filtre de faction interactif

- Le filtre de faction utilise désormais un gestionnaire d'événement délégué persistant, indépendant des reconstructions successives de la liste.
- Le contrôle natif est explicitement interactif, accessible au pointeur et prioritaire dans la pile d'affichage ; le changement de faction filtre les résultats immédiatement sans relancer l'audit Kyber.
- Cache navigateur et versions des ressources incrémentés.

## V4.1.46 — Extraction des distributions Kyber

- Le parseur accepte les lignes de données où SWGOH.GG sépare le nom d'un set ou d'une primaire et son pourcentage dans deux éléments HTML distincts.
- Les distributions Primary Set, Secondary Set, Specific Mod Sets et les primaires par slot utilisent désormais le même extracteur tolérant.
- Les configurations détaillées du tableau et du texte explicatif sont conservées ; aucun seuil de conformité n'est assoupli.

## V4.1.45 — Récupération et validation des références Kyber

- Le chargement des profils ne dépend plus exclusivement de l'index SWGOH.GG : en cas d'index indisponible ou incomplet, le Visionnaire tente aussi le slug déterministe du personnage.
- Les références locales Kyber partielles restent exploitables pour leurs distributions de primaires pendant que la configuration combinée complète est recherchée.
- Une référence partielle ne peut plus être présentée comme une configuration exacte de six mods ; les sets restent non vérifiables tant que SWGOH.GG ne fournit pas les configurations combinées.
- Le parseur expose un diagnostic des sections reconnues : sets principaux/secondaires, configurations combinées, slots de primaires, échantillon et data slice.
- Le compteur distingue les profils Kyber exploitables des seules références complètes.
- Cache navigateur, ressources et versions incrémentés.

## V4.1.44 — Audit Kyber progressif et requêtes protégées

- L'audit du roster complet publie maintenant les résultats par lots au lieu d'attendre la fin des 342 personnages.
- L'interface indique la progression, le nombre de profils Kyber complets et les erreurs de récupération.
- Chaque requête SWGOH.GG est interrompue après 12 secondes afin qu'une réponse bloquée ne fige plus la file de récupération.
- Aucun plafond de roster ajouté ; les profils absents restent non vérifiables et ne sont pas déclarés non conformes.

## V4.1.43 — Extraction et analyse complètes des références Kyber SWGOH.GG

- Le parseur conserve toutes les configurations de sets du tableau « Specific Mod Sets » et fusionne les configurations complémentaires listées dans le détail « Best Mod Set ».
- Extraction séparée des distributions de sets principaux et secondaires, des primaires de chaque slot, de la taille de l'échantillon et de l'indication de fraîcheur.
- La comparaison des sets teste toutes les configurations publiées, et non plus uniquement la première ; les pièces isolées sans bonus de set ne faussent plus le diagnostic.
- Les primaires sont comparées à toute leur distribution : une alternative utilisée par les joueurs Kyber n'est plus rejetée simplement parce qu'elle n'est pas majoritaire.
- Les builds inférés à partir des distributions séparées sont identifiés comme tels et ne sont pas utilisés pour déclarer un écart strict sans configuration exacte.
- Invalidation du cache Kyber antérieur pour forcer une nouvelle extraction avec le parseur complet.
- Tests de régression ajoutés pour les compositions Double/Triple, les configurations secondaires et les répartitions de primaires.
- Versions des ressources et cache PWA incrémentés.

## V4.1.42 — Comparaison réelle aux recommandations Kyber dominantes

- Les primaires sont comparées à la recommandation dominante de chaque slot, au lieu d'accepter toutes les primaires observées, même marginales.
- Une primaire dont la distribution Kyber n'a pas de dominante claire (moins de 50 %) reste non vérifiable.
- Les sets sont comparés comme une répartition complète des six mods, en privilégiant les combinaisons spécifiques Kyber lorsqu'elles existent.
- Les références sets et primaires sont comptabilisées séparément.
- Les profils sans provenance Kyber/SWGOH.GG explicite sont exclus de l'audit.
- Cache PWA et versions d'assets incrémentés.

## V4.1.41 — Filtre de faction et résultats directs du Visionnaire

- Suppression de la recherche nominative à l'étape 2 : les personnages ne sont plus à retrouver un par un.
- Ajout d'un filtre de faction, réglé par défaut sur « Toutes les factions », alimenté par le référentiel partagé du roster.
- Les personnages présentant les écarts Kyber du domaine choisi s'affichent directement ; changer de faction réduit immédiatement cette liste.
- Les résultats conservent le détail des slots et restent sélectionnables pour poursuivre l'analyse.
- Version des assets et cache PWA incrémentés.

## V4.1.40 — Filtres d'écarts Kyber du Visionnaire

- Remplacement du grand choix de domaine par trois filtres compacts : mauvais sets, mauvaises primaires, sets + primaires.
- Chaque filtre affiche le nombre de personnages concernés ; la liste et les slots détaillés suivent le filtre actif.
- En mode combiné, les personnages doivent présenter les deux types d'écarts et les slots indiquent précisément la nature de chaque anomalie.
- Version des assets et cache PWA incrémentés.

## V4.1.39 — Chargement à l'ouverture du Visionnaire

- Le scan Kyber complet démarre uniquement lorsque la page Visionnaire est ouverte, pas pendant la synchronisation du profil sur le Sanctuaire.
- Cache et version des assets incrémentés.

## V4.1.38 — Le Visionnaire (premier incrément)

- Remplacement de l’ancien Sith’ari par une interface neuve et guidée.
- Audit Kyber sur l’ensemble du roster de personnages, sans plafond de 50.
- Choix du domaine Sets ou Primaires ; filtre optionnel Sets + Primaires.
- Références absentes ou incomplètes explicitement exclues des anomalies vérifiables.
- Sélection explicite de slots ; aucun déplacement automatique.
- Retrait du moteur de permutations et des styles historiques Sith’ari.
- La synchronisation du roster appelle désormais le nouveau Visionnaire ; les services partagés de profils Kyber, GAC et import/export sont conservés.
- Suppression des anciens styles Sith’ari résiduels dans `app.css` et adaptation des tests CI.

## V4.1.37 — Pool donneur fondé sur l'utilisation GAC

- Suppression du seuil de puissance du pool donneur : la puissance ne filtre plus les personnages peu utilisés en GAC.
- Conservation des garde-fous : usage GAC connu et bas, personnage hors pool prioritaire, non-GL et six mods équipés.
- Version du moteur et cache statique incrémentés.

# V4.1.36 — échanges multi-mods par donneur

- Un même donneur peut céder plusieurs mods au même receveur si les emplacements sont distincts.
- La conservation des bonus de set est vérifiée sur l'équipement final complet de chaque donneur, après restitution de tous les mods remplacés.
- Suppression du rejet prématuré qui évaluait chaque mod donneur isolément et empêchait des échanges groupés pourtant valides.
- La cible conserve son plancher de vitesse et la composition finale doit toujours correspondre exactement à une référence Kyber.

# V4.1.35 — recherche ciblée des permutations Sith’ari

- Remplacement de l’énumération arbitraire des groupes de slots par des plans calculés depuis les sets excédentaires et manquants de chaque composition Kyber exacte.
- Recherche des donneurs uniquement pour le set attendu sur chaque emplacement, avec primaire compatible et bonus de set du donneur préservés.
- Recherche bornée à 500 essais par receveur ; la vitesse du receveur reste un plancher strict, tandis que le donneur peut perdre de la vitesse.
- Diagnostics séparant les plans, candidats donneurs, rejets de composition et rejets de vitesse.


## [4.1.34] — 2026-11-05

### Sith’ari — recherche multi-donneurs
- Recherche de blocs de 2 ou 4 mods dont les pièces peuvent provenir de plusieurs donneurs distincts.
- Chaque donneur reçoit le mod remplacé sur le même slot ; ses bonus de set sont contrôlés individuellement.
- La vitesse du receveur reste protégée ; une baisse de vitesse chez un donneur reste autorisée.
- Diagnostic détaillé des filtres set, primaire, sécurité donneur, composition Kyber et vitesse cible, avec indication du plafond de recherche.
- Présentation de l'impact vitesse de chaque donneur et du receveur.
- Correction de la version visible de l'en-tête : V4.1.34.

## V4.1.33 — Pipeline Sith’ari et pool donneur fiabilisés (2026-11-05)

- Attend explicitement la fin du chargement du catalogue GAC avant de constituer les 50 prioritaires et le pool des donneurs ; les priorités sont recalculées après disponibilité des observations.
- Les donneurs doivent avoir une observation GAC positive et faible, une puissance de roster faible, six mods équipés et ne pas appartenir au pool prioritaire.
- La vitesse de la cible reste protégée ; le donneur peut céder de la vitesse, conformément à la règle métier, tout en conservant ses bonus de set.
- Les personnages sans profil Kyber et les profils sans composition exacte sont désormais listés comme non vérifiables au lieu d'être silencieusement exclus.
- Déduplication des compositions identiques et affichage des compteurs d'observations GAC, donneurs, groupes testés et rejets.
- Les GL restent prioritaires comme receveurs ; ils ne peuvent jamais être donneurs.

## V4.1.32 — Audit exact des compositions de sets Sith’ari (2026-11-05)

- Comparaison des six mods équipés aux compositions complètes `specific_sets` publiées par SWGOH.GG, au lieu de considérer chaque set individuellement comme conforme.
- Les références ne publiant que des sets individuels sont classées « non vérifiables » lorsque la composition complète ne peut pas être prouvée ; elles ne sont plus comptées comme conformes par défaut.
- Les échanges atomiques de 2 ou 4 mods ne sont proposés que si les six mods du receveur correspondent exactement à une composition Kyber publiée.
- Conservation des protections de vitesse, des bonus de set du donneur et du pool distinct de donneurs faibles avec usage GAC observé.
- Affichage du nombre de compositions vérifiables, des compositions non vérifiables et des rejets.

## V4.1.31 — Échanges atomiques de sets Sith’ari (2026-11-05)

- Remplacement des échanges mod par mod par des permutations groupées de 2 ou 4 mods issus du même donneur.
- Le receveur doit obtenir un set Kyber complet avec les primaires attendues ; le donneur récupère tous les mods remplacés.
- Vérification stricte des six slots, des bonus de set conservés chez le donneur et du plancher de vitesse des deux personnages.
- Suppression de l'exigence artificielle d'un profil Kyber donneur : le donneur doit préserver ses bonus et sa vitesse, pas reproduire un build Kyber.
- Ajout d'un bilan des groupes examinés et des rejets par incompatibilité de set, primaire ou protection du donneur.

## V4.1.30 — Refonte ciblée de Sith’ari (2026-11-05)

- Limitation du pool des receveurs à 50 personnages prioritaires maximum : légendes galactiques, usage GAC observé, puis puissance du roster.
- Détection des mauvais sets uniquement sur ce pool ; les références ne sont plus recherchées sur l’ensemble des personnages du compte.
- Création d’un pool distinct de donneurs : personnages hors pool prioritaire, faibles en puissance, peu utilisés selon les observations GAC disponibles et disposant de six mods équipés.
- Remplacement de la recherche de cycles généraux par des échanges 1-pour-1 contrôlés : le donneur reçoit le mod remplacé.
- Validation des deux personnages avant proposition : slot, référence de set et primaire pour le receveur, bonus de set préservés et aucune perte de vitesse pour l’un ou l’autre.
- Les personnages sans observation GAC restent inconnus et ne sont jamais considérés comme ayant zéro utilisation. Les données GAC partielles sont utilisées comme signal observé, pas comme couverture exhaustive.

## V4.1.29 — Arrêt rapide des échecs Kyber (2026-11-05)

- Ouverture d'un coupe-circuit de 60 secondes après une erreur réseau ou HTTP 5xx du relais / de SWGOH.GG ; les requêtes suivantes échouent rapidement au lieu de s'empiler.
- Suppression des tentatives de slugs devinés lorsque l'index SWGOH.GG est indisponible : un index défaillant ne déclenche plus une rafale de pages de profils.
- Conservation de la file sérialisée et du cache des profils Kyber validés ; les réponses réussies ne sont pas ralenties par les reprises inutiles.
- Libellé Sith’ari précisé : « Références Kyber » distingue les données de référence des profils Optimizer.
- La synchronisation du roster et les règles de permutation / vitesse ne sont pas modifiées.

## V4.1.28 — Récupération Kyber résiliente (2026-11-05)

- Sérialisation des requêtes SWGOH.GG de référence : une seule page est demandée à la fois, avec un espacement entre les appels.
- Reprises limitées avec temporisation progressive sur les erreurs réseau et HTTP temporaires ; les erreurs amont sont maintenant distinguées dans le journal.
- Arrêt des variantes de slug après une erreur amont définitive, pour éviter de multiplier inutilement les requêtes.
- Mise en cache locale des profils Kyber validés pendant 12 heures afin de conserver les récupérations réussies entre les sessions.
- Aucun changement à la synchronisation du roster, aux règles d'optimisation ou aux protections de vitesse.

## V4.1.3 — Fiabilisation des fondations (2026-11-02)

- Synchronisation atomique : les nouvelles données ne remplacent le profil affiché qu'après validation du roster et de l'inventaire des mods.
- En cas d'échec ou de lecture HTML incomplète, le dernier profil validé est conservé au lieu d'être mélangé à des métriques réinitialisées.
- Normalisation des valeurs de puissance galactique, avec calcul du total lorsque seules les puissances terrestre et spatiale sont disponibles.
- Correction du cache PWA : les navigations accueil et Sanctuaire bleu sont stockées séparément ; le cache du catalogue GitHub Raw fonctionne désormais malgré son origine externe.
- Versionnement des ressources et du cache porté à 4.1.3.

## [4.1.0] — 2026-10-30\n\n### Catalogue GAC dynamique\n- Suppression des compositions défensives codées en dur dans le Sanctuaire bleu.\n- Ajout d'un collecteur SWGOH.GG actualisable pour les cinq ligues, en 3v3 et 5v5 ; les deux saisons les plus récentes contenant des compositions complètes sont choisies indépendamment pour chaque ligue.\n- Détection des deux saisons les plus récentes disponibles par format, classement par volume de combats puis taux de tenue.\n- Publication protégée : une collecte incomplète ne remplace pas le dernier catalogue valide.\n- Actualisation GitHub Actions toutes les six heures et à la demande ; stratégie réseau d'abord dans le service worker.\n- Conservation des règles Padawan : roster complet, aucune équipe inventée, aucun personnage réutilisé, flottes exclues.\n\n## [4.0.55] — 2026-10-30

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
