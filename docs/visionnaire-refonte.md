# Le Visionnaire — architecture et contrat fonctionnel

## Objectif

Remplacer l'ancien Sith'ari par un assistant de décision guidé, en lecture seule. Le Visionnaire ne lance aucune permutation globale et ne déplace jamais un mod automatiquement.

## Parcours

1. Choisir **Sets** ou **Primaires**.
2. Afficher tous les personnages du roster présentant un écart vérifiable avec Kyber.
3. En mode Sets, proposer le filtre complémentaire **Sets ET Primaires**.
4. Choisir un personnage.
5. Sélectionner explicitement de un à six slots à travailler.
6. Rechercher des échanges sûrs, puis comparer les incidences complètes.
7. En l'absence d'échange sûr, indiquer le mod précis à rechercher à partir des seules données Kyber disponibles.

## Périmètre de l'audit

- Aucun plafond de 50 personnages : le roster complet est examiné.
- Les personnages-vaisseaux sont exclus.
- Les profils Kyber sont obtenus par le service partagé `fetchKyberProfile` et validés par `kyberProfileValid`.
- Les références absentes ou incomplètes restent non vérifiables ; elles ne sont jamais assimilées à une non-conformité.
- Le domaine choisi commande le filtre ; l'autre domaine peut être utilisé pour le filtre croisé Sets + Primaires.
- Les slots sélectionnés sont explicites et persistants pendant l'étape de travail.

## Garde-fous prévus pour la recherche d'échanges

- Tous les personnages peuvent être des receveurs.
- Les personnages GL ne peuvent jamais être donneurs.
- Les donneurs sont classés selon leurs usages GAC connus, du plus faible au plus élevé.
- Un usage GAC absent reste inconnu et n'est pas traité comme zéro.
- La puissance ne sert qu'à départager des donneurs, jamais à les exclure.
- Le receveur ne doit jamais perdre de vitesse.
- Un donneur peut perdre de la vitesse si les autres garde-fous sont respectés.
- Le donneur doit conserver ses bonus de sets après l'échange complet.
- Aucun slot ne peut rester vide.
- Plusieurs mods peuvent provenir d'un même donneur si son équipement final reste valide.
- Les statistiques complètes avant/après doivent être recalculées avec les bonus de sets.
- Les résultats sont des scénarios coordonnés, pas des permutations isolées.

## Services partagés conservés

Le Visionnaire réutilise les sources de vérité existantes : synchronisation du roster, import/export JSON, profils Kyber, données GAC, catalogue des personnages, normalisation des mods, résolution des propriétaires, calculs de statistiques et helpers d'interface. Aucun doublon de ces services n'est créé.

## Nettoyage de l'ancien module

Les anciens fichiers d'interface, de stratégie et de styles Sith'ari ont été retirés. Les points d'entrée de navigation, de synchronisation et les tests CI ont été réorientés vers le Visionnaire. Les autres modules et le Worker Cloudflare restent hors périmètre.

## État de livraison

**V4.1.38 — premier incrément :** nouvelle interface, audit Sets/Primaires sur tout le roster, filtre croisé et sélection explicite des slots. La recherche d'échanges, le bilan statistique complet et la recommandation de mod à acquérir constituent les étapes suivantes ; ils ne sont pas présentés comme déjà disponibles.
