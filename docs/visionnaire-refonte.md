# Refonte du Visionnaire

## Décision produit

L'ancien module Sith'ari devient **Le Visionnaire**. Il cesse d'être un moteur de permutations globales et devient un assistant de décision guidé, en lecture seule.

Le moteur analyse **tous les personnages du roster**. Aucun plafond de 50 personnages, aucun pool prioritaire préalable. Les filtres de conformité Kyber déterminent les personnages à afficher.

## Parcours utilisateur

### 1. Choisir le domaine

Deux entrées exclusives :

- **Sets** : repérer les personnages dont l'équipement de sets ne correspond pas aux références Kyber.
- **Primaires** : repérer les personnages dont une ou plusieurs primaires de mods ne correspondent pas aux références Kyber.

Dans le mode Sets, une option permet d'élargir la liste aux personnages dont les sets **et** les primaires sont tous deux non conformes. Cette option ne doit pas masquer les personnages dont seuls les sets sont incorrects.

Dans le mode Primaires, le filtre porte sur les primaires uniquement.

### 2. Liste des personnages à corriger

La liste est calculée sur l'intégralité du roster de personnages disposant d'une référence Kyber exploitable.

Chaque entrée doit préciser :
- le personnage et son portrait ;
- le nombre de slots concernés ;
- l'état actuel comparé à la référence ;
- la qualité/couverture de la référence Kyber ;
- si la conformité est confirmée, non conforme ou non vérifiable.

Une donnée Kyber absente ou insuffisante reste « non vérifiable » et n'est jamais assimilée à une non-conformité.

### 3. Choisir les slots à travailler

Après sélection d'un personnage, afficher ses six mods et permettre de sélectionner explicitement de 1 à 6 slots.

Le moteur ne travaille que sur les slots sélectionnés. Il ne modifie pas implicitement les autres slots. Si un changement de composition de sets exige plusieurs pièces, l'interface doit l'expliquer et demander la sélection des slots nécessaires.

### 4. Recherche de solutions

Pour chaque slot sélectionné, chercher un mod de même emplacement qui répond au domaine choisi et à la référence Kyber du receveur.

Priorité des donneurs :
1. personnages avec usage GAC observé faible ;
2. classement croissant par nombre d'utilisations observées ;
3. puissance du personnage uniquement comme critère secondaire de départage, jamais comme filtre d'éligibilité.

Règles :
- tout le roster peut être considéré comme source potentielle ;
- un receveur ne peut pas être son propre donneur ;
- les GL ne sont jamais donneurs ;
- les usages GAC absents restent inconnus et ne sont pas assimilés à zéro ;
- les donneurs doivent conserver leurs bonus de sets après restitution des mods remplacés ;
- la vitesse du receveur ne doit jamais diminuer ;
- la perte de vitesse du donneur est autorisée si les autres garde-fous sont respectés ;
- aucune proposition ne doit laisser un personnage participant avec un slot vide ;
- plusieurs mods peuvent venir du même donneur si les slots sont distincts et si son équipement final reste valide.

La recherche doit être ciblée par le personnage et les slots choisis, pas par des permutations globales entre personnages.

### 5. Comparaison des incidences

Pour chaque solution, afficher séparément :
- le receveur : statistiques complètes avant/après et écarts ;
- chaque donneur : statistiques complètes avant/après et écarts ;
- les mods transférés et les mods retournés ;
- la conformité des critères du domaine choisi ;
- les garde-fous vérifiés.

Les statistiques doivent être recalculées sur les équipements complets après échange, bonus de sets inclus. Ne pas présenter un simple total de vitesse comme un bilan global.

Une solution est un scénario coordonné : son nombre de mods transférés ne doit pas être présenté comme un nombre de scénarios indépendants.

### 6. Mod à rechercher en l'absence d'échange sûr

Si aucun échange sûr n'est trouvé, afficher une recommandation exploitable :
- slot exact ;
- set attendu ;
- primaire attendue ;
- secondaires prioritaires issues des données Kyber disponibles ;
- valeurs de référence ou distribution lorsqu'elles existent ;
- distinction explicite entre donnée observée et conseil dérivé.

Ne pas inventer de seuils de secondaires. Si la référence ne contient pas ces données, l'indiquer.

## Principes de fiabilité

- L'analyse couvre tous les personnages, sans plafond arbitraire.
- Les références Kyber sont qualifiées : exactes, partielles ou absentes.
- Les critères Set et Primaire restent indépendants et visibles.
- Le domaine sélectionné pilote le filtre et l'évaluation ; les autres dimensions restent informatives.
- Un résultat vide doit expliquer pourquoi : aucune anomalie détectée, référence non vérifiable, aucun donneur sûr, ou slots incomplets.
- Aucun mouvement automatique de mods.
- Les données GAC inconnues ne sont jamais traitées comme zéro.
- Les GL sont autorisés comme receveurs mais interdits comme donneurs.

## Architecture cible

Le code doit être séparé en responsabilités, sans conserver les multiples redéfinitions successives présentes dans l'ancien `modules/sithari-strategy.js` :

1. **Snapshot roster** : personnages, équipement complet, profils Kyber et données GAC.
2. **Audit Kyber** : conformité Set, Primaire et qualité de référence par personnage/slot.
3. **Filtrage** : mode Sets / mode Primaires et option d'élargissement Sets + Primaires.
4. **Recherche ciblée** : slots explicitement choisis, classement des donneurs, garde-fous d'échange.
5. **Projection des statistiques** : recalcul complet des receveurs et donneurs après échange.
6. **Recommandation de recherche** : mod exact à acquérir si aucun échange sûr n'existe.
7. **Interface** : parcours en étapes, résultats lisibles, retour à la liste et modification de sélection.

Le code historique de permutations globales ne doit pas être repris comme moteur du nouveau parcours. Les fonctions de normalisation des mods, de lecture des profils Kyber, de calcul des statistiques et les garde-fous métier ne seront réutilisés qu'après vérification de leur exactitude.

## Découpage d'implémentation

### Phase A — Fondations
- Renommer Sith'ari en Visionnaire dans l'interface, la navigation et les textes.
- Remplacer le point d'entrée historique par un espace propre au nouveau parcours.
- Supprimer le plafond de 50 et les anciennes étapes automatiques de constitution d'un pool.
- Mettre à jour les tests pour vérifier le nouveau contrat fonctionnel.

### Phase B — Audit et filtres
- Construire l'audit Kyber de tout le roster.
- Implémenter les modes Sets et Primaires.
- Implémenter l'option Sets + Primaires.
- Vérifier les états conforme / non conforme / non vérifiable.

### Phase C — Intervention ciblée
- Sélection de personnage et de 1 à 6 slots.
- Recherche des donneurs GAC à faible usage.
- Validation des équipements complets et des garde-fous.

### Phase D — Incidences et solution de repli
- Comparaison des statistiques complètes avant/après.
- Recommandation du mod exact à rechercher si aucun échange sûr n'existe.
- Tests de non-régression et validation sur le roster réel.

## Hors périmètre

- Aucun changement au Worker Cloudflare ou à la synchronisation du roster.
- Aucun changement aux modules Acolyte, Disciple, Seigneur Sith ou au Sanctuaire bleu GAC.
- Aucun transfert automatique de mods.
