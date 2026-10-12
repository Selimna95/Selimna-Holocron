# Holocron — système visuel Sith (v3.1.0)

## Intention

Une interface de commandement du Côté obscur : obsidienne, graphite chaud, rouge Sith et accents braise/or. L'ambiance vient du contraste, de la profondeur des surfaces et du sceau Holocron existant, pas d'une accumulation d'effets lumineux.

## Tokens de référence

Les variables centrales sont définies dans le bloc `:root` de `app.css`.

| Rôle | Valeur de référence |
| --- | --- |
| Fond profond | `#080609` |
| Surface sombre | `#161110` |
| Surface surélevée | `#1F1817` |
| Texte principal | `#F4F0F0` |
| Texte secondaire | `#ADA1A0` |
| Rouge Sith | `#F04450` |
| Or / braise | `#D7B477` |
| Succès | `#70C69A` |
| Avertissement | `#E3B65A` |

Les couleurs de succès et d'avertissement restent sémantiques : elles ne doivent pas être réutilisées comme couleurs décoratives de marque.

## Règles de cohérence

- `app.css` contient le thème et les composants partagés.
- `sithari.css` reste réservé aux composants propres au module Sith'ari.
- Les identifiants `data-page`, les points d'entrée HTML et les modules métier sont conservés pour ne pas casser la navigation ni le moteur.
- Modifier une règle existante ou son token avant de créer une nouvelle règle concurrente.
- Ne pas ajouter de correctif en fin de fichier pour contourner un style existant : déplacer la règle dans la section du composant concerné et supprimer la règle devenue redondante.
- Toute animation décorative doit rester discrète et respecter `prefers-reduced-motion`.

## Parcours

Le Sanctuaire sert de point de départ. Acolyte identifie les priorités, Disciple analyse les mods, Seigneur Sith ouvre la forge, Sith'ari propose l'analyse avancée et le Codex reste l'espace de consultation. Le menu latéral conserve l'accès direct à tous les modules.
