
/* V3.2.5 — live Sanctuary character / mod energy view */
let sanctuarySelectedKey = '';
function sanctuaryStatValue(character, statName){
  const p=optimizerProfileForCharacter(character)||{};
  const stats=p.current_stats||character?.stats||character?.current_stats||{};
  const aliases={'Speed':['Speed','speed'],'Health':['Health','health'],'Protection':['Protection','protection']};
  for(const key of aliases[statName]||[statName]){const v=stats[key];const parsed=Number(String(v??'').replace(/,/g,''));if(v!==undefined&&v!==null&&Number.isFinite(parsed)&&parsed>0)return parsed;}
  return 0;
}
function sanctuaryFormatStat(value){return Number(value||0).toLocaleString('fr-FR',{maximumFractionDigits:0});}
function sanctuaryRenderModNode(character,slot){
  const mod=sithariCharacterMods(character).find(m=>modSlotLabel(m.slot??m.slot_id??m.slotId)===slot);
  const label=SITHARI_SLOT_LABEL[slot]||slot;
  if(!mod)return `<button type="button" class="sanctuary-mod-node missing" data-sanctuary-slot="${slot}" aria-label="Analyser le slot ${label}, aucun mod équipé"><span class="sanctuary-mod-empty">＋</span><span class="sanctuary-mod-node-copy"><small>${label}</small><strong>EMPLACEMENT VIDE</strong><span>Aucun mod équipé</span><em>OUVRIR L’ANALYSE ↗</em></span></button>`;
  const speed=modTotalSpeed(mod);
  const primary=String(mod.primary_stat||'—');
  return `<button type="button" class="sanctuary-mod-node" data-sanctuary-slot="${slot}" aria-label="Analyser le mod ${label} de ${esc(character.name||'ce personnage')}"><span>${modIconHtml(mod,'54')}</span><span class="sanctuary-mod-node-copy"><small>${label} · ${esc(String(mod.set_name||'SET INCONNU'))}</small><strong>${esc(primary)} ${num(mod.primary_value,1)}</strong><span>${speed?'+ '+num(speed)+' Speed':'Sans secondaire Speed'}</span><em>OUVRIR L’ANALYSE ↗</em></span></button>`;
}
function sanctuaryRenderEnergy(){
  const select=$('sanctuaryCharacterSelect'),left=$('sanctuaryModsLeft'),right=$('sanctuaryModsRight');
  if(!select||!left||!right)return;
  const chars=(rosterCharacters||[]).filter(c=>rosterUnitType(c)!=='ship').slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'fr'));
  const previous=sanctuarySelectedKey;
  if(!sanctuarySelectedKey||!chars.some(c=>characterKey(c)===sanctuarySelectedKey))sanctuarySelectedKey=chars.length?characterKey(chars[0]):'';
  select.innerHTML=chars.length?chars.map(c=>`<option value="${esc(characterKey(c))}">${esc(c.name||c.baseId||'Personnage')}</option>`).join(''):'<option value="">Charge un profil pour commencer</option>';
  select.value=sanctuarySelectedKey;
  const character=chars.find(c=>characterKey(c)===sanctuarySelectedKey);
  const core=$('sanctuaryCharacterCore'),status=$('sanctuaryStatus');
  if(!character){
    left.innerHTML='';right.innerHTML='';
    core.innerHTML='<div class="sanctuary-core-orbit orbit-one"></div><div class="sanctuary-core-orbit orbit-two"></div><div class="sanctuary-character-portrait"><span>✧</span></div><div class="sanctuary-character-identity"><small>PERSONNAGE SÉLECTIONNÉ</small><h3>EN ATTENTE DU ROSTER</h3><p>Synchronise ton profil pour révéler les statistiques.</p></div><div class="sanctuary-character-stats"><div><span>SPEED</span><b>—</b></div><div><span>SANTÉ</span><b>—</b></div><div><span>PROTECTION</span><b>—</b></div><div><span>MODS</span><b>0 / 6</b></div></div><button type="button" class="sanctuary-knowledge-core" id="sanctuaryKnowledgeAccess" aria-label="Ouvrir Le savoir se mérite" title="Le savoir se mérite"><span class="sanctuary-mini-holocron" aria-hidden="true"><i></i><b></b><em></em></span><span class="sanctuary-core-sr">LE SAVOIR SE MÉRITE</span></button>';
    status.textContent='EN ATTENTE DU PROFIL';return;
  }
  const equipped=sithariCharacterMods(character);
  const slots=['Square','Arrow','Diamond','Triangle','Circle','Cross'];
  left.innerHTML=slots.slice(0,3).map(slot=>sanctuaryRenderModNode(character,slot)).join('');
  right.innerHTML=slots.slice(3).map(slot=>sanctuaryRenderModNode(character,slot)).join('');
  const portrait=sithariPortrait(character);
  const speed=sanctuaryStatValue(character,'Speed'),health=sanctuaryStatValue(character,'Health'),protection=sanctuaryStatValue(character,'Protection');
  const relic=Number(character.relic?.currentTier??character.relic_level??character.relicLevel??character.relic??0)||0;
  const corePortrait=core.querySelector('.sanctuary-character-portrait');
  if(corePortrait)corePortrait.innerHTML=portrait;
  const identity=core.querySelector('.sanctuary-character-identity');
  if(identity)identity.innerHTML=`<small>PERSONNAGE AU CŒUR DES FLUX</small><h3>${esc(character.name||character.baseId||'Personnage')}</h3><p>${relic>0?'RELIQUE '+relic+' · ':''}${equipped.length} MODS ÉQUIPÉS · ${num(sithariCharacterSpeed(character))} SPEED MOD MAX</p>`;
  const stats=core.querySelector('.sanctuary-character-stats');
  if(stats)stats.innerHTML=`<div><span>SPEED</span><b class="${speed?'good':''}">${speed?sanctuaryFormatStat(speed):'—'}</b></div><div><span>SANTÉ</span><b>${health?sanctuaryFormatStat(health):'—'}</b></div><div><span>PROTECTION</span><b>${protection?sanctuaryFormatStat(protection):'—'}</b></div><div><span>MODS</span><b>${equipped.length} / 6</b></div>`;
  if(!core.querySelector('#sanctuaryKnowledgeAccess'))core.insertAdjacentHTML('beforeend','<button type="button" class="sanctuary-knowledge-core" id="sanctuaryKnowledgeAccess" aria-label="Ouvrir l’onglet Le savoir se mérite"><span>✧</span><strong>LE SAVOIR SE MÉRITE</strong><small>ACCÉDER AU NŒUD CENTRAL</small></button>');
  status.textContent=chars.length?`SANCTUAIRE ACTIF · ${chars.length} PERSONNAGES DISPONIBLES`:'EN ATTENTE DU PROFIL';
}
document.addEventListener('change',event=>{
  if(event.target?.id==='sanctuaryCharacterSelect'){
    sanctuarySelectedKey=event.target.value||'';
    sanctuaryRenderEnergy();
  }
});
document.addEventListener('click',event=>{
  const knowledge=event.target.closest?.('#sanctuaryKnowledgeAccess');
  if(knowledge){showPage('knowledge');return;}
  const node=event.target.closest?.('[data-sanctuary-slot]');
  if(!node)return;
  const character=sithariCharacterByKey(sanctuarySelectedKey);
  if(!character)return;
  const slot=node.dataset.sanctuarySlot;
  sithariSelectedKeys=[sanctuarySelectedKey];sithariActiveKey=sanctuarySelectedKey;
  sithariActionState={key:'',mode:'',secondaryA:'',secondaryB:'',ran:false,scope:{incomplete:true,veryLow:true,low:true,medium:false,all:false}};
  showPage('sithari');sithariRenderAll(false);
  const state=sithariSlotState(character,slot);
  if(state.status==='REINFORCE'||state.status==='CALIBRATE')sithariOpenAction(state,state.status==='REINFORCE'?'REINFORCEMENT':'CALIBRATION');
});
window.addEventListener('holocron:data-updated',sanctuaryRenderEnergy);
window.addEventListener('load',sanctuaryRenderEnergy);

function updateGuardianContext(page){
  const root=document.getElementById('guardianContext');
  const copy=document.getElementById('guardianContextText');
  if(!root || !copy) return;
  const hasProfile=!!(typeof currentData!=='undefined' && currentData);
  const messages={
    dashboard: hasProfile ? 'Profil chargé · consulte les signaux du Sanctuaire.' : 'Commence par synchroniser ton roster.',
    knowledge: hasProfile ? 'Le savoir se mérite · choisis une voie pour approfondir ton roster.' : 'Synchronise ton roster pour révéler les voies de l’Holocron.',
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
  // Chaque destination visible doit ouvrir son écran réel. Le Codex est une
  // destination de consultation à part entière, accessible depuis le Sanctuaire.
  document.body.dataset.page=page;
  document.querySelectorAll('.nav').forEach(x=>{
    const active=x.dataset.page===page;
    x.classList.toggle('active',active);
    if(active) x.setAttribute('aria-current','page');
    else x.removeAttribute('aria-current');
  });
  document.querySelectorAll('.page').forEach(x=>{
    const active=x.id===page;
    x.classList.toggle('active',active);
    x.setAttribute('aria-hidden',String(!active));
  });
  updateGuardianContext(page);
  if(page==='mods-analysis') renderModsAnalysis();
  if(page==='top-changes') renderHolocronTopChanges();
  if(page==='sithari') renderSithariNexus();
  if(page==='dashboard') sanctuaryRenderEnergy();
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
$('clearData').addEventListener('click',()=>{currentData=null;mods=[];modFiltersReady=false;const mf=$('modFilters'),ms=$('modSummary');if(mf)mf.hidden=true;if(ms)ms.hidden=true;rosterCharacters=[];rosterShips=[];factionMap={};analysisSelectedCharacter='';analysisFaction='';analysisSide='ALL';analysisStatus='TOUS';analysisAuditSpeed='TOUS';analysisAuditSort='priority';updateRosterCounts([],[]);fillCharacters([]);if($('v18DashboardSpeed'))$('v18DashboardSpeed').innerHTML='';$('results').textContent='Chargez d’abord vos données.';$('dataInfo').textContent='Aucune donnée.';if($('playerName'))$('playerName').textContent='Profil non chargé';if($('playerAlly'))$('playerAlly').textContent='—';if($('heroPlayerName'))$('heroPlayerName').textContent='Profil non chargé';if($('heroPlayerAlly'))$('heroPlayerAlly').textContent='—';if($('heroProfileState'))$('heroProfileState').textContent='EN ATTENTE';$('dataTableMeta').textContent='Aucune donnée.';$('dataTable').innerHTML='<div class="empty">Chargez un profil pour afficher les données.</div>';$('log').textContent='Données effacées.';if($('topAccountName'))$('topAccountName').textContent='—';if($('topProfileState'))$('topProfileState').textContent='EN ATTENTE';if($('topUnitsCount'))$('topUnitsCount').textContent='—';try{sessionStorage.removeItem('holocronSessionEstablished');sessionStorage.removeItem('holocronLastAllyCode');}catch(_){}window.dispatchEvent(new Event('holocron:data-updated'));renderSithariNexus();updateGuardianContext(document.body.dataset.page||'dashboard');});

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

document.getElementById('sithariAccess')?.addEventListener('click',()=>showPage('knowledge'));

// KNOWLEDGE HOLOCRON — four rotatable faces, Acolyte is the default orientation.
(function initKnowledgeHolocron(){
  const stage=document.getElementById('knowledgeHolocronStage');
  const cube=document.getElementById('knowledgeHolocronCube');
  if(!stage||!cube)return;
  const names=['ACOLYTE','DISCIPLE','SEIGNEUR SITH','SITH’ARI'];
  let rotation=0,startX=0,startY=0,dragging=false;
  const normalize=n=>((n%4)+4)%4;
  function render(){
    rotation=normalize(rotation);
    cube.dataset.rotation=String(rotation);
    cube.style.setProperty('--knowledge-rotation',String(rotation));
    const counter=document.getElementById('knowledgeFaceCounter');
    const name=document.getElementById('knowledgeFaceName');
    if(counter)counter.textContent='FACE '+String(rotation+1).padStart(2,'0')+' / 04';
    if(name)name.textContent=names[rotation];
    cube.setAttribute('aria-label','Holocron rotatif. Face avant : '+names[rotation]+'.');
    cube.querySelectorAll('.knowledge-cube-face').forEach((face,index)=>{
      face.setAttribute('aria-current',String(index===rotation));
      face.tabIndex=index===rotation?0:-1;
    });
  }
  stage.querySelectorAll('[data-holocron-rotate]').forEach(button=>button.addEventListener('click',()=>{
    rotation+=Number(button.dataset.holocronRotate)||0;render();
  }));
  let suppressFaceClick=false;
  stage.addEventListener('pointerdown',event=>{
    if(event.target.closest('[data-holocron-rotate]'))return;
    startX=event.clientX;startY=event.clientY;dragging=true;suppressFaceClick=false;
    if(stage.setPointerCapture)try{stage.setPointerCapture(event.pointerId)}catch(_){}
  });
  stage.addEventListener('pointerup',event=>{
    if(!dragging)return;dragging=false;
    const dx=event.clientX-startX,dy=event.clientY-startY;
    if(Math.abs(dx)>34&&Math.abs(dx)>Math.abs(dy)){
      rotation+=dx<0?1:-1;render();suppressFaceClick=true;
    }
  });
  stage.addEventListener('click',event=>{
    if(!suppressFaceClick)return;
    event.preventDefault();event.stopPropagation();suppressFaceClick=false;
  },true);
  stage.addEventListener('pointercancel',()=>{dragging=false;});
  stage.addEventListener('keydown',event=>{
    if(event.key==='ArrowRight'){event.preventDefault();rotation++;render();}
    if(event.key==='ArrowLeft'){event.preventDefault();rotation--;render();}
  });
  render();
})();

$('sithariFaction')?.addEventListener('change',e=>{sithariFaction=e.target.value;sithariRenderAll();});
$('sithariCharacterSearch')?.addEventListener('input',e=>{sithariSearch=e.target.value||'';sithariRenderSelectors();});
$('sithariClearSelection')?.addEventListener('click',()=>{sithariSelectedKeys=[];sithariActiveKey='';sithariRenderAll();});
showPage(document.querySelector('.page.active')?.id || 'dashboard');
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
