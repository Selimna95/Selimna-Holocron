# Collecteur GAC navigateur — Holocron

Le collecteur utilise la session du navigateur sur SWGOH.GG pour lire les pages de classement depuis leur propre domaine. Il évite le relais Reader qui renvoie HTTP 403 aux runners GitHub Actions.

## Installation / lancement

1. Ouvrir [SWGOH.GG — Unit Tier List](https://swgoh.gg/tier-list/units/) dans le navigateur habituel.
2. Vérifier que la page affiche bien les classements (et non une page Cloudflare).
3. Ouvrir les outils de développement du navigateur, onglet Console.
4. Copier le contenu de `tools/gac-collector.js` dans la console et valider.
5. Attendre le téléchargement de `gac-browser-export.json`.

Le collecteur interroge les 20 vues personnages (5 ligues × 2 formats × 2 côtés), puis les 10 vues flottes (5 ligues × 2 côtés). Il attend entre les requêtes pour limiter la charge. Il annule l'export complet si une vue personnage n'est pas correctement lue.

## Publication dans le dépôt

1. Dans GitHub, ouvrir le dépôt `Selimna95/Selimna-Holocron`.
2. Ajouter le fichier téléchargé à la racine du dépôt sous le nom exact `gac-browser-export.json`.
3. Committer sur `main`.
4. L'action **Refresh GAC data** valide le fichier, génère `gac-usage.json` et `gac-usage.js`, puis publie les deux fichiers.

Ne pas ajouter manuellement de zéros pour les unités absentes. Les classements flottes SWGOH.GG sont des compositions les plus jouées, pas un recensement exhaustif : les vaisseaux non observés restent inconnus.

## Limites de la source

- Les statistiques personnages correspondent aux batailles de première tentative, en escouades complètes, exposées par les classements SWGOH.GG.
- Les vues sont séparées par ligue, format et côté. Le générateur additionne les observations publiées dans ces vues.
- Les statistiques de flottes sont des apparitions dans les compositions publiées. Elles ne représentent pas toutes les sorties de chaque vaisseau.
- Si SWGOH.GG change son HTML ou bloque la session, le collecteur affiche une erreur et ne télécharge pas de fichier incomplet.
