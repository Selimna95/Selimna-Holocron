/* Données GAC agrégées. Le moteur choisit la saison la plus récente non vide.
   Format attendu :
   {
     season: 84,
     characters: { BASE_ID: { uses: 12345 } },
     ships: { SHIP_BASE_ID: { uses: 6789 } }
   }
   `ships` compte les apparitions des vaisseaux dans les flottes GAC ;
   le roster doit fournir les associations vaisseau -> pilote pour protéger les
   mods des pilotes en fonction de l'utilisation réelle de leurs flottes.
   Une donnée absente reste inconnue et ne vaut jamais zéro.
*/
window.__SWGOH_GAC_USAGE__ = { seasons: [] };
