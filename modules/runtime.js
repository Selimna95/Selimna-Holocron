function updateGuardianContext(page){
  const root=document.getElementById('guardianContext');
  const copy=document.getElementById('guardianContextText');
  if(!root || !copy) return;
  const hasProfile=!!(typeof currentData!=='undefined' && currentData);
  const messages={
    dashboard: hasProfile ? 'Profil chargé · choisis la prochaine action utile.' : 'Commence par synchroniser ton roster.',
    'top-changes': hasProfile ? 'Acolyte · commence par le gain prioritaire le plus utile.' : 'Charge un profil pour calculer les priorités.',
    'mods-analysis': hasProfile ? 'Disciple · avance du diagnostic à la recherche, étape par étape.' : 'Charge un profil pour examiner les mods disponibles.',
    optimizer: hasProfile ? 'Forge · diagnostique le personnage avant de lancer la recherche.' : 'Choisis ou charge un profil pour ouvrir la Forge.',
    sithari: hasProfile ? 'Sith’ari · compare les slots avant de renforcer ou calibrer.' : 'Charge un profil pour comparer les six slots au Kyber.',
    help: 'Système · consulte le relais, le moteur et les limites des données.'
  };
  const message=messages[page] || messages.dashboard;
  copy.textContent=message;
  root.dataset.state=hasProfile ? 'ready' : 'idle';
  root.setAttribute('aria-label','Conseil du Gardien : '+message);
  root.title=message;
}
function showPage(page){
  // Le Codex du roster est volontairement masqué dans l’interface ; ses données
  // et ses points d’entrée techniques restent présents pour les modules existants.
  if(page==='data') page='dashboard';
  document.body.dataset.page=page;
  document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
  document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x.id===page));
  updateGuardianContext(page);
  if(page==='mods-analysis') renderModsAnalysis();
  if(page==='top-changes') renderHolocronTopChanges();
  if(page==='sithari') renderSithariNexus();
}

// Consultation de l’aide : filtre uniquement les rubriques documentaires.
// Les actions de session restent visibles même quand une recherche est active.
const helpSearchInput=document.getElementById('helpSearch');
if(helpSearchInput){
  helpSearchInput.addEventListener('input',()=>{
    const term=String(helpSearchInput.value||'').trim().toLocaleLowerCase('fr');
    const sections=[...document.querySelectorAll('#help .help:not(.help-search-panel):not(.system-data-actions)')];
    let shown=0;
    sections.forEach(section=>{
      const match=!term || section.textContent.toLocaleLowerCase('fr').includes(term);
      section.hidden=!match;
      if(match) shown++;
    });
    const status=document.getElementById('helpSearchStatus');
    if(status) status.textContent=term ? `${shown} rubrique${shown>1?'s':''} correspondante${shown>1?'s':''}.` : `${sections.length} rubriques disponibles.`;
  });
}
['optimizerIncomplete','optimizerVeryLow','optimizerLow','optimizerMedium','optimizerAllRoster'].forEach(id=>$(id)?.addEventListener('change',()=>{
  const all=$('optimizerAllRoster')?.checked===true;
  ['optimizerIncomplete','optimizerVeryLow','optimizerLow','optimizerMedium'].forEach(x=>{const el=$(x);if(el)el.disabled=all;});
  updateCharacterInfo();
}));

document.querySelectorAll('[data-speed-tier]').forEach(btn=>btn.addEventListener('click',()=>setReallocationSpeedTier(btn.dataset.speedTier)));
$('reallocationCharacterChoices')?.addEventListener('click',event=>{
  const btn=event.target.closest('[data-character-key]');
  if(btn)setReallocationCharacter(btn.dataset.characterKey);
});

$('reallocationModSelect')?.addEventListener('change',()=>{
  const n=Number($('reallocationModSelect')?.value);
  if(Number.isFinite(n) && mods[n]) setReallocationMod(n);
  else { reallocationSelectedModIndex=null; renderReallocationSelectionVisual(null); renderReallocationSecondaryOptions(''); renderReallocationResults(); }
});
function discipleHandleSearchEvent(event){
  // Each Disciple control has exactly one owner and one direct handler.
  // No propagation tricks: unrelated page-level handlers remain intact.
  if(!event?.target?.matches?.('#reallocationSecondary,#reallocationIncomplete,#reallocationVeryLow,#reallocationLow,#runReallocation'))return;
  discipleForceSearch();
}
$('reallocationSecondary')?.addEventListener('change',discipleHandleSearchEvent);
$('reallocationIncomplete')?.addEventListener('change',discipleHandleSearchEvent);
$('reallocationVeryLow')?.addEventListener('change',discipleHandleSearchEvent);
$('reallocationLow')?.addEventListener('change',discipleHandleSearchEvent);
$('runReallocation')?.addEventListener('click',discipleHandleSearchEvent);
$('clearData').addEventListener('click',()=>{currentData=null;mods=[];modFiltersReady=false;const mf=$('modFilters'),ms=$('modSummary');if(mf)mf.hidden=true;if(ms)ms.hidden=true;rosterCharacters=[];rosterShips=[];factionMap={};analysisSelectedCharacter='';analysisFaction='';analysisSide='ALL';analysisStatus='TOUS';analysisAuditSpeed='TOUS';analysisAuditSort='priority';updateRosterCounts([],[]);fillCharacters([]);if($('v18DashboardSpeed'))$('v18DashboardSpeed').innerHTML='';$('results').textContent='Chargez d’abord vos données.';$('dataInfo').textContent='Aucune donnée.';if($('playerName'))$('playerName').textContent='Profil non chargé';if($('playerAlly'))$('playerAlly').textContent='—';if($('heroPlayerName'))$('heroPlayerName').textContent='Profil non chargé';if($('heroPlayerAlly'))$('heroPlayerAlly').textContent='—';if($('heroProfileState'))$('heroProfileState').textContent='EN ATTENTE';$('dataTableMeta').textContent='Aucune donnée.';$('dataTable').innerHTML='<div class="empty">Chargez un profil pour afficher les données.</div>';$('log').textContent='Données effacées.';renderSithariNexus();updateGuardianContext(document.body.dataset.page||'dashboard');});

document.querySelectorAll('.analysis-tab').forEach(btn=>btn.addEventListener('click',()=>setAnalysisTab(btn.dataset.analysisTab)));
$('analysisFaction')?.addEventListener('change',()=>{analysisFaction=$('analysisFaction').value;analysisSelectedCharacter='';renderSelectionPanel();});
$('analysisSide')?.addEventListener('change',()=>{analysisSide=$('analysisSide').value;renderSelectionPanel();});
$('analysisStatus')?.addEventListener('change',()=>{analysisStatus=$('analysisStatus').value;renderSelectionPanel();});
$('analysisAuditSpeed')?.addEventListener('change',()=>{analysisAuditSpeed=$('analysisAuditSpeed').value;renderSelectionPanel();});
$('analysisAuditSort')?.addEventListener('change',()=>{analysisAuditSort=$('analysisAuditSort').value;renderSelectionPanel();});
$('analysisCharacter')?.addEventListener('change',()=>{analysisSelectedCharacter=$('analysisCharacter').value;setAnalysisTab('report');});
$('analysisMode')?.addEventListener('change',()=>{analysisMode=$('analysisMode').value;renderSelectionPanel();});
['analysisSearch','analysisSetFilter','analysisSlotFilter','analysisPrimaryFilter','analysisSecondaryFilter','analysisSpeedFilter'].forEach(id=>$(id)?.addEventListener('input',renderInventory));
$('closeModDetail')?.addEventListener('click',closeModDetail);
$('modDetailModal')?.addEventListener('click',e=>{if(e.target.id==='modDetailModal')closeModDetail();});

function navigateToPageFromElement(btn){
  if(!btn)return;
  const page=String(btn.dataset.page||'').trim();
  if(!page || !document.getElementById(page))return;
  showPage(page);
  if(page==='data')renderDataTable();
}

// Navigation principale + boutons du Command Deck.
// Un seul gestionnaire pour éviter les doubles clics et les routages contradictoires.
document.addEventListener('click',e=>{
  const btn=e.target.closest?.('[data-page]');
  if(!btn)return;
  if (btn.tagName === 'A') e.preventDefault();
  navigateToPageFromElement(btn);
});

document.getElementById('sithariAccess')?.addEventListener('click',()=>showPage('sithari'));
$('sithariFaction')?.addEventListener('change',e=>{sithariFaction=e.target.value;sithariRenderAll();});
$('sithariCharacterSearch')?.addEventListener('input',e=>{sithariSearch=e.target.value||'';sithariRenderSelectors();});
$('sithariClearSelection')?.addEventListener('click',()=>{sithariSelectedKeys=[];sithariActiveKey='';sithariRenderAll();});
renderGalacticPower();
renderSithariNexus();
boot();


// DISCIPLE ENGINE SAFETY NET V185
// Direct handlers ensure the result area is always updated even if another
// legacy listener was attached earlier or a dynamically rebuilt panel replaced
// the original element. Select elements fire `change` on committed choices.
function discipleForceSearch(){
  try { renderReallocationResults(); }
  catch(err){
    const box=$('reallocationResults');
    if(box)box.innerHTML=`<div class="disciple-no-result disciple-quest-result"><b>LANCEZ-VOUS DANS LA QUÊTE DE CE MOD</b><span>Impossible d’exécuter la recherche Disciple.</span><small>${esc(err?.message||String(err))}</small></div>`;
  }
}
function discipleBindLiveControls(){
  // Listener registration is handled once above; do not assign .onclick/.onchange
  // here because that creates a second rendering path on mobile.

}
discipleBindLiveControls();
