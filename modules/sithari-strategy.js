/* Sith'ari: analyse cumulative du roster, en lecture seule.
   Pipeline unique: set -> primaire -> secondaires -> références Kyber. */
let sithariStrategyBusy=false;
let sithariStrategySnapshot=null;
const ssEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ssId=m=>String(m?.game_id??m?.id??m?._index??'');
const ssSlot=m=>modSlotLabel(m?.slot??m?.slot_id??m?.slotId??m?.modSlot);
function ssBuildSnapshot(){
 const nodes=[],sources=[],people=(rosterCharacters||[]).filter(c=>rosterUnitType(c)!=='ship');
 for(const c of people){
  const key=characterKey(c),equipped=sithariCharacterMods(c);
  for(const slot of SITHARI_SLOT_ORDER){
   const mod=equipped.find(m=>ssSlot(m)===slot);if(!mod)continue;
   const source={key:key+'::'+slot,owner:key,name:c.name||c.baseId||key,character:c,slot,mod};
   sources.push(source);
   const profile=sithariProfileForCharacter(c);if(!profile)continue;
   nodes.push({...source,profile,setOk:false,primaryOk:false,needsWork:true});
  }
 }
 return {nodes,sources,inventory:sithariEnsureModCache().items,rosterCount:people.length,profiledCount:new Set(nodes.map(n=>n.owner)).size};
}
function ssBuildSetPools(snapshot){
 const bySlot=new Map();for(const source of snapshot.sources){if(!bySlot.has(source.slot))bySlot.set(source.slot,[]);bySlot.get(source.slot).push(source);}
 const pools=new Map();let count=0;
 for(const target of snapshot.nodes){
  const matches=(bySlot.get(target.slot)||[]).filter(source=>source.owner!==target.owner&&sithariSetMatch(source.mod,target.profile,target.character));
  target.setOk=sithariSetMatch(target.mod,target.profile,target.character);
  target.needsWork=!target.setOk;
  pools.set(target.key,matches);count+=matches.length;
 }
 return {pools,count};
}
function ssBuildPrimaryPools(snapshot,setPools){
 const pools=new Map();let count=0;
 for(const target of snapshot.nodes){
  const matches=(setPools.get(target.key)||[]).filter(source=>sithariPrimaryMatch(source.mod,target.profile,target.slot));
  target.primaryOk=sithariPrimaryMatch(target.mod,target.profile,target.slot);
  target.needsWork=!target.setOk||!target.primaryOk;
  pools.set(target.key,matches);count+=matches.length;
 }
 return {pools,count};
}
function ssBuildSecondaryEdges(snapshot,primaryPools){
 const edges=new Map();let count=0;
 for(const target of snapshot.nodes){
  const scored=(primaryPools.get(target.key)||[]).map(source=>({target,source,secondary:ssSecondaryCoverage(source.mod,target.profile),kyber:ssKyberSecondaryFit(source.mod,target.profile),speed:modTotalSpeed(source.mod)}));
  const best=scored.reduce((best,edge)=>Math.max(best,edge.secondary),0);
  const retained=best>0?scored.filter(edge=>Math.abs(edge.secondary-best)<1e-9):scored;
  retained.sort((a,b)=>b.kyber-a.kyber||b.speed-a.speed);
  edges.set(target.key,retained);count+=retained.length;
 }
 return {edges,count};
}
function ssSecondaryCoverage(mod,profile){
 const priorities=Object.keys(profile?.secondary_focus||{});
 if(!priorities.length)return 0;
 const values=sithariModSecondaryMap(mod);
 return priorities.reduce((count,stat)=>count+(Number(values[sithariStatKey(stat)]||0)>0?1:0),0)/priorities.length;
}
function ssKyberSecondaryFit(mod,profile){
 const focus=profile?.secondary_focus||{},entries=Object.entries(focus);
 if(!entries.length)return 0;
 const values=sithariModSecondaryMap(mod);
 return entries.reduce((sum,[stat,reference])=>{
  const target=Number(reference)||0,actual=Number(values[sithariStatKey(stat)]||0);
  return sum+(target>0?Math.min(1,Math.max(0,actual)/target):0);
 },0)/entries.length;
}
function ssCyclePreservesSpeed(items,openTerminal=false){
 const replacements=new Map();
 for(const edge of items){
  const key=edge.target.owner;
  if(!replacements.has(key))replacements.set(key,{character:edge.target.character,mods:sithariCharacterMods(edge.target.character).slice()});
  const entry=replacements.get(key),slot=edge.target.slot;
  entry.mods=entry.mods.filter(mod=>ssSlot(mod)!==slot);
  entry.mods.push(edge.source.mod);
 }
 if(openTerminal&&items.length){
  const terminal=items[items.length-1].source;
  if(!replacements.has(terminal.owner)){
   const remaining=sithariCharacterMods(terminal.character).filter(mod=>ssSlot(mod)!==terminal.slot);
   replacements.set(terminal.owner,{character:terminal.character,mods:remaining});
  }
 }
 for(const entry of replacements.values()){
  const before=sithariProjectedSpeed(entry.character,sithariCharacterMods(entry.character));
  const after=sithariProjectedSpeed(entry.character,entry.mods);
  if(before.baseSpeed>0&&after.total+1e-9<before.total)return false;
  if(before.baseSpeed<=0&&after.modSpeed+1e-9<before.modSpeed)return false;
  if(before.baseSpeed<=0&&before.speedSetPieces>=4&&after.speedSetPieces<4)return false;
 }
 return true;
}
function ssBuildEdges(snapshot){
 const bySlot=new Map();for(const source of (snapshot.sources||snapshot.nodes)){if(!bySlot.has(source.slot))bySlot.set(source.slot,[]);bySlot.get(source.slot).push(source);}
 const edges=new Map();let setCandidates=0,primaryCandidates=0,secondaryCandidates=0;
 for(const target of snapshot.nodes){
  // Donors come from the entire equipped roster, including characters without a Kyber profile.
  const setPool=(bySlot.get(target.slot)||[]).filter(source=>source.owner!==target.owner&&sithariSetMatch(source.mod,target.profile,target.character));
  setCandidates+=setPool.length;
  const primaryPool=setPool.filter(source=>sithariPrimaryMatch(source.mod,target.profile,target.slot));
  primaryCandidates+=primaryPool.length;
  const scored=primaryPool.map(source=>({target,source,secondary:ssSecondaryCoverage(source.mod,target.profile),kyber:ssKyberSecondaryFit(source.mod,target.profile),speed:modTotalSpeed(source.mod)}));
  // Stage 3 is a real cumulative filter: retain the best available coverage tier for this target.
  const bestCoverage=scored.reduce((best,edge)=>Math.max(best,edge.secondary),0);
  const secondaryPool=bestCoverage>0?scored.filter(edge=>Math.abs(edge.secondary-bestCoverage)<1e-9):scored;
  secondaryCandidates+=secondaryPool.length;
  secondaryPool.sort((a,b)=>b.kyber-a.kyber||b.speed-a.speed);
  edges.set(target.key,secondaryPool);
 }
 return {edges,setCandidates,primaryCandidates,secondaryCandidates};
}
async function ssFindCycles(edges){
 // Exploration volontairement bornée : le graphe d'un grand roster est dense.
 // On garde les meilleurs donneurs par slot et on cède régulièrement la main au navigateur.
 const found=new Map(),starts=[...edges.keys()].sort(),maxLength=4;
 const MAX_EDGES_PER_SLOT=8,MAX_EXPANSIONS=6000,MAX_CLOSED_CYCLES=500,YIELD_EVERY=100;
 let expansions=0,closedCycles=0,exhausted=false;
 const yieldToBrowser=()=>new Promise(resolve=>setTimeout(resolve,0));
 for(const start of starts){
  if(exhausted)break;
  const walk=async(at,path,used)=>{
   if(exhausted||path.length>=maxLength)return;
   const candidates=(edges.get(at)||[]).slice(0,MAX_EDGES_PER_SLOT);
   for(const edge of candidates){
    if(exhausted)return;
    expansions++;
    if(expansions>=MAX_EXPANSIONS){exhausted=true;return;}
    if(expansions%YIELD_EVERY===0)await yieldToBrowser();
    const next=edge.source.key;
    if(next===start&&path.length>=1){
     closedCycles++;
     const chain=[...path,edge],sig='CYCLE:'+chain.map(x=>x.target.key).sort().join('|');
     if(closedCycles<=MAX_CLOSED_CYCLES&& !found.has(sig) && ssCyclePreservesSpeed(chain))found.set(sig,{items:chain,open:false});
     if(closedCycles>=MAX_CLOSED_CYCLES){exhausted=true;return;}
     continue;
    }
    if(!edges.has(next)){
     const chain=[...path,edge],sig='OPEN:'+chain.map(x=>x.target.key).sort().join('|');
     if(!found.has(sig)&&ssCyclePreservesSpeed(chain,true))found.set(sig,{items:chain,open:true});
     continue;
    }
    if(used.has(next)||next<start)continue;
    const nextUsed=new Set(used);nextUsed.add(next);
    await walk(next,[...path,edge],nextUsed);
   }
  };
  await walk(start,[],new Set([start]));
 }
 const cycles=[...found.values()].map(candidate=>({items:candidate.items,open:candidate.open,length:candidate.items.length,
  secondary:candidate.items.reduce((s,x)=>s+x.secondary,0)/candidate.items.length,
  kyberFit:candidate.items.reduce((s,x)=>s+x.kyber,0)/candidate.items.length,
  speed:candidate.items.reduce((s,x)=>s+x.speed,0)
 })).filter(cycle=>cycle.items.some(edge=>edge.target.needsWork)).sort((a,b)=>b.kyberFit-a.kyberFit||b.secondary-a.secondary||b.speed-a.speed).slice(0,30);
 return {cycles,expansions,closedCycles,exhausted};
}
let sithariStepState=null;
function ssStepLabel(phase){
 return ({profiles:'ÉTAPE 1/5 · RÉFÉRENCES KYBER',sets:'ÉTAPE 2/5 · FILTRE DES SETS',primaries:'ÉTAPE 3/5 · FILTRE DES PRIMAIRES',secondaries:'ÉTAPE 4/5 · FILTRE DES SECONDAIRES',permutations:'ÉTAPE 5/5 · RECHERCHE DES PERMUTATIONS',done:'ANALYSE TERMINÉE'})[phase]||'PRÉPARATION';
}
function ssRender(snapshot,result,message){
 const root=document.getElementById('sithariStrategy');if(!root)return;
 const needs=snapshot.nodes.filter(n=>n.needsWork),setBad= snapshot.nodes.filter(n=>!n.setOk).length,primaryBad=snapshot.nodes.filter(n=>!n.primaryOk).length;
 const peopleSummary=[...needs.reduce((map,node)=>{const item=map.get(node.owner)||{name:node.name,slots:0,sets:0,primaries:0};item.slots++;if(!node.setOk)item.sets++;if(!node.primaryOk)item.primaries++;map.set(node.owner,item);return map;},new Map()).values()].sort((a,b)=>b.slots-a.slots||a.name.localeCompare(b.name,'fr'));
 const peopleHtml=peopleSummary.length?'<div class="ss-people">'+peopleSummary.map(person=>'<div><b>'+ssEsc(person.name)+'</b><span>'+person.slots+' slot(s) à revoir</span><small>'+person.sets+' set(s) · '+person.primaries+' primaire(s)</small></div>').join('')+'</div>':'<div class="ss-empty">Aucun emplacement équipé hors critères Set / primaire parmi les personnages disposant d’une référence Kyber.</div>';
 const rows=(result.cycles||[]).map((cycle,i)=>{
  const moves=cycle.items.map(e=>'<div class="ss-move"><span>'+ssEsc(e.source.name)+'</span><i>→</i><b>'+ssEsc(e.target.name)+'</b><small>'+ssEsc(e.source.mod.set_name||'Set ?')+' · '+ssEsc(e.source.mod.primary_stat||'Primaire ?')+' · '+num(modTotalSpeed(e.source.mod))+' vit.</small></div>').join('');
  return '<article class="ss-cycle"><header><b>SCÉNARIO '+String(i+1).padStart(2,'0')+'</b><span>'+cycle.length+' transferts</span><strong>Kyber '+Math.round(cycle.kyberFit*100)+'%</strong></header>'+moves+'<footer>Couverture secondaires : '+Math.round(cycle.secondary*100)+'% · Référence Kyber : '+Math.round(cycle.kyberFit*100)+'% · Vitesse mods : '+num(cycle.speed)+'</footer></article>';
 }).join('');
 const phase=sithariStepState?.phase||'profiles',busy=sithariStrategyBusy;
 const label=phase==='done'?'RECOMMENCER':phase==='profiles'?'CHARGER LE LOT DE RÉFÉRENCES':phase==='sets'?'EXÉCUTER LE FILTRE SETS':phase==='primaries'?'EXÉCUTER LE FILTRE PRIMAIRES':phase==='secondaries'?'EXÉCUTER LE FILTRE SECONDAIRES':'LANCER LA RECHERCHE DES PERMUTATIONS';
 root.innerHTML='<header class="ss-head"><div><small>SITH’ARI // STRATÈGE ULTIME</small><h3>ANALYSE CUMULATIVE DU ROSTER</h3><p>Chaque étape s’exécute séparément. La suivante attend ta commande.</p></div><button id="ss-run" type="button" '+(busy?'disabled':'')+'>'+ (busy?'ÉTAPE EN COURS…':label)+'</button></header>'+
 '<div class="ss-kpis"><div><b>'+snapshot.rosterCount+'</b><span>PERSONNAGES</span></div><div><b>'+snapshot.inventory.length+'</b><span>MODS</span></div><div><b>'+needs.length+'</b><span>SLOTS À AMÉLIORER</span></div><div><b>'+(result.cycles||[]).length+'</b><span>PERMUTATIONS</span></div></div>'+
 '<div class="ss-pipeline"><div><b>01 · SETS</b><strong>'+setBad+'</strong><small>'+(result.setCandidates||0)+' donneurs compatibles</small></div><i>→</i><div><b>02 · PRIMAIRES</b><strong>'+primaryBad+'</strong><small>'+(result.primaryCandidates||0)+' donneurs retenus</small></div><i>→</i><div><b>03 · SECONDAIRES</b><strong>'+(result.secondaryCandidates||0)+'</strong><small>meilleure couverture conservée</small></div><i>→</i><div><b>04 · KYBER</b><strong>'+(result.cycles||[]).length+'</strong><small>scénarios validés</small></div></div>'+
 '<div class="ss-status"><b>'+ssStepLabel(phase)+'</b><br>'+ssEsc(message)+'</div><h4>PERSONNAGES HORS CRITÈRES KYBER</h4>'+peopleHtml+'<h4>PERMUTATIONS EN CHAÎNE</h4>'+(rows||'<div class="ss-empty">Les permutations apparaîtront après l’exécution de la cinquième étape.</div>')+
 '<p class="ss-note">Analyse en lecture seule. Aucune modification des mods n’est appliquée.</p>';
 document.getElementById('ss-run')?.addEventListener('click',ssAdvance);
}
async function ssAdvance(){
 if(sithariStrategyBusy)return;
 if(!sithariStepState||sithariStepState.phase==='done')sithariStepState={phase:'profiles',people:(rosterCharacters||[]).filter(c=>rosterUnitType(c)!=='ship'),profileCursor:0,snapshot:null,setPools:null,primaryPools:null,result:{setCandidates:0,primaryCandidates:0,secondaryCandidates:0,cycles:[]}};
 const state=sithariStepState;sithariStrategyBusy=true;
 const show=(message)=>{state.message=message;ssRender(state.snapshot||{nodes:[],inventory:sithariEnsureModCache().items,rosterCount:state.people.length,profiledCount:0},state.result,message);};
 try{
  if(state.phase==='profiles'){
   const batch=40,end=Math.min(state.people.length,state.profileCursor+batch),items=state.people.slice(state.profileCursor,end);let cursor=0,done=0,found=0,missing=0;
   show('Récupération de '+items.length+' profils maximum. Aucun autre filtre ne démarre pendant cette étape.');
   await Promise.all(Array.from({length:4},async()=>{while(cursor<items.length){const c=items[cursor++];let profile=sithariProfileForCharacter(c);if(!profile){try{profile=await fetchKyberProfile(c);}catch(_){profile=null;}}if(profile)found++;else missing++;done++;const status=document.querySelector('#sithariStrategy .ss-status');if(status)status.innerHTML='<b>'+ssStepLabel('profiles')+'</b><br>Profils traités dans ce lot : '+done+' / '+items.length;}}));
   state.profileCursor=end;state.profileStats=state.profileStats||{found:0,missing:0};state.profileStats.found+=found;state.profileStats.missing+=missing;
   if(end>=state.people.length)state.phase='sets';
   state.message='Lot terminé : '+end+' / '+state.people.length+' personnages examinés. '+found+' références disponibles dans ce lot, '+missing+' sans référence exploitable. Total chargé : '+state.profileStats.found+'. '+(state.phase==='sets'?'Les références sont prêtes. Lance le filtre des sets.':'Relance cette étape pour charger le lot suivant.');
   show(state.message);
  }else if(state.phase==='sets'){
   state.snapshot=ssBuildSnapshot();state.setPools=ssBuildSetPools(state.snapshot);state.result.setCandidates=state.setPools.count;state.phase='primaries';
   show(state.result.setCandidates+' donneurs compatibles après le filtre des sets. Étape suivante : primaires.');
  }else if(state.phase==='primaries'){
   state.primaryPools=ssBuildPrimaryPools(state.snapshot,state.setPools.pools);state.result.primaryCandidates=state.primaryPools.count;state.phase='secondaries';
   show(state.result.primaryCandidates+' donneurs restent après le filtre des primaires. Étape suivante : secondaires.');
  }else if(state.phase==='secondaries'){
   const secondary=ssBuildSecondaryEdges(state.snapshot,state.primaryPools.pools);state.result.secondaryCandidates=secondary.count;state.result.edges=secondary.edges;state.phase='permutations';
   show(secondary.count+' donneurs restent après le filtre des secondaires. Étape suivante : recherche des permutations.');
  }else if(state.phase==='permutations'){
   const search=await ssFindCycles(state.result.edges);state.result.cycles=search.cycles;state.phase='done';
   show(search.cycles.length+' scénarios validés. '+search.expansions+' explorations effectuées'+(search.exhausted?' avant la limite de sécurité.':'.'));
  }
 }catch(error){show('Étape interrompue : '+String(error?.message||error));console.error('Sith’ari strategy:',error);}
 finally{sithariStrategyBusy=false;ssRender(state.snapshot||{nodes:[],inventory:sithariEnsureModCache().items,rosterCount:state.people.length,profiledCount:0},state.result,state.message||(state.phase==='done'?'Analyse terminée.':'Étape terminée. Tu peux lancer la suivante.'));}
}
function renderSithariStrategy(){
 const people=(rosterCharacters||[]).filter(c=>rosterUnitType(c)!=='ship');
 if(!sithariStepState||sithariStepState.people.length!==people.length)sithariStepState={phase:'profiles',people,profileCursor:0,snapshot:null,setPools:null,primaryPools:null,result:{setCandidates:0,primaryCandidates:0,secondaryCandidates:0,cycles:[]}};
 ssRender(sithariStepState.snapshot||{nodes:[],inventory:sithariEnsureModCache().items,rosterCount:people.length,profiledCount:0},sithariStepState.result,'Le moteur attend la première commande. Chaque clic exécute une seule étape.');
}

