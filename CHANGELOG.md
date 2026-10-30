## [4.0.55] — 2026-10-30

### Fiabilité du moteur d’optimisation
- Correction du repli Kyber : si le plan exact de sets n'est pas réalisable avec les mods disponibles, le moteur relance une recherche sans cette contrainte au lieu de renvoyer une liste vide.
- Le résultat indique le plan de sets uniquement lorsqu'il a réellement été respecté.
- Normalisation défensive des valeurs de composition Kyber mal formées.
- Ajout de tests pour le cas où le plan Kyber est réalisable et celui où il ne l'est pas.

### Sanctuaire bleu — données GAC et architecture
- Extraction du CSS et du JavaScript dans des fichiers dédiés ; l'HTML n'embarque plus les 40 Ko de styles et de logique.
- Attribution explicite des instantanés de données à Kyber (S84/S83) et Chromium (S82/S81).
- Classement des équipes par volume de combats observés, puis taux de tenue, au lieu de privilégier mécaniquement la saison la plus récente et le rang affiché.
- Les ligues sans instantané local sont signalées comme non couvertes ; aucune composition Kyber/Chromium n'est présentée comme spécifique à Aurodium, Bronzium ou Carbonite.
- Ajout des nouveaux fichiers et de l'image Padawan au précache PWA.

### Lisibilité et documentation
- Renforcement des tailles minimales de texte, du focus clavier et des zones d'interaction dans le Sanctuaire bleu.
- README et versions visibles alignés sur V4.0.55.
- La documentation distingue désormais les contrôles CI des essais réels avec un roster et une source GAC externe.

### Limites qui restent ouvertes
- Le relais Cloudflare n'est pas dans ce dépôt et doit être audité séparément.
- Le catalogue GAC est encore un instantané statique ; son actualisation automatique et sa couverture des cinq ligues ne sont pas implémentées.
- La CI ne remplace pas un essai réel de l'optimiseur sur un roster importé.
