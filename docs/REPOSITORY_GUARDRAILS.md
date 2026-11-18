# Garde-fous du dépôt

## Protection de `main`

Dans **Settings → Rules → Rulesets** (ou **Settings → Branches → Branch protection rules**), appliquer une règle à `main` :

- Exiger une Pull Request avant fusion.
- Exiger les trois vérifications du workflow **Quality checks** :
  - `python-tests`
  - `javascript-syntax`
  - `browser-smoke`
  - `review-gate` (revue de l'outil sur le SHA exact de la tête de PR)
- Exiger la résolution des conversations de revue.
- Exiger que la branche soit à jour avec `main` avant fusion.
- Interdire les force-push et la suppression de `main`.

La relecture du diff reste obligatoire pour chaque PR ; utiliser le modèle de PR du dépôt et consigner le nom de la personne ou de l'outil de revue. Une case cochée sans relecture réelle ne vaut pas validation.

## Publication GitHub Pages

Après ajout du workflow `.github/workflows/deploy-pages-after-quality.yml`, régler une seule fois :

**Settings → Pages → Build and deployment → Source → GitHub Actions**.

Ne pas laisser la source sur **Deploy from a branch** : ce mode lance la publication indépendamment de `Quality checks`.

Le workflow de déploiement attend la fin du workflow **Quality checks**, vérifie qu'il s'agit d'un push réussi sur `main`, puis construit et publie exactement le commit qui a passé les tests. Un échec ou une annulation des tests ne déclenche aucune publication.

## Discipline des Pull Requests

- Une PR = un sujet.
- Créer la branche depuis le `main` à jour.
- Ne pas accumuler des commits de tentative dont les tests échouent.
- Avant d'ouvrir la PR, relire le diff complet et exécuter les tests ciblés.
- Avant fusion, attendre tous les contrôles obligatoires et traiter tous les retours de revue.
