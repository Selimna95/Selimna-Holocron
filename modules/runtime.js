const HOLOCRON_STYLE_PROMISES = new Map();
function ensureHolocronStylesheet(file){
  const href=new URL(`./${file}`,document.baseURI).href;
  const existing=[...document.querySelectorAll('link[rel=stylesheet]')].find(link=>link.href===href);
  if(existing)return HOLOCRON_STYLE_PROMISES.get(file)||Promise.resolve();
  if(HOLOCRON_STYLE_PROMISES.has(file))return HOLOCRON_STYLE_PROMISES.get(file);
  const promise=new Promise((resolve,reject)=>{
    const link=document.createElement('link');link.rel='stylesheet';link.href=href;
    link.onload=resolve;link.onerror=()=>reject(new Error(`Impossible de charger ${file}`));
    document.head.appendChild(link);
  });
  HOLOCRON_STYLE_PROMISES.set(file,promise);
  return promise;
}
async function showPage(page){
  const styles=[];
  if(page!=='dashboard')styles.push(ensureHolocronStylesheet('pages.css'));
  if(page==='sithari')styles.push(ensureHolocronStylesheet('sithari.css'));
  try{await Promise.all(styles);}catch(error){console.warn('[Holocron] Feuille de style secondaire indisponible:',error);}
  window.HOLOCRON_STATE.ui.activePage=page;
  document.body.dataset.page=page;
  document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
  document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x.id===page));
  if(page==='mods-analysis') renderModsAnalysis();
  if(page==='top-changes') renderHolocronTopChanges();
  if(page==='sithari') renderSithariNexus();
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
$('clearData').addEventListener('click',()=>{currentData=null;mods=[];modFiltersReady=false;const mf=$('modFilters'),ms=$('modSummary');if(mf)mf.hidden=true;if(ms)ms.hidden=true;rosterCharacters=[];rosterShips=[];factionMap={};analysisSelectedCharacter='';analysisFaction='';analysisSide='ALL';analysisStatus='TOUS';analysisAuditSpeed='TOUS';analysisAuditSort='priority';updateRosterCounts([],[]);fillCharacters([]);if($('v18DashboardSpeed'))$('v18DashboardSpeed').innerHTML='';$('results').textContent='Chargez d’abord vos données.';$('dataInfo').textContent='Aucune donnée.';if($('playerName'))$('playerName').textContent='Profil non chargé';if($('playerAlly'))$('playerAlly').textContent='—';if($('heroPlayerName'))$('heroPlayerName').textContent='Profil non chargé';if($('heroPlayerAlly'))$('heroPlayerAlly').textContent='—';if($('heroProfileState'))$('heroProfileState').textContent='EN ATTENTE';$('dataTableMeta').textContent='Aucune donnée.';$('dataTable').innerHTML='<div class="empty">Chargez un profil pour afficher les données.</div>';$('log').textContent='Données effacées.';renderSithariNexus();});

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
