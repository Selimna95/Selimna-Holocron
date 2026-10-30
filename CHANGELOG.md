## [4.0.55] — 2026-10-30

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
