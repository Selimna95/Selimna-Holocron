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
  // Les GL restent hors du graphe : ni donneurs ni receveurs, pour sanctuariser leurs six mods.
  if(ssIsProtectedLegend(c))continue;
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
function ssIsProtectedLegend(character){
 const base=String(character?.baseId||character?.base_id||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 return typeof HOLOCRON_GALACTIC_LEGENDS!=='undefined'&&typeof HOLOCRON_GALACTIC_LEGENDS.has==='function'&&HOLOCRON_GALACTIC_LEGENDS.has(base);
}
function ssSetBonusCounts(mods){
 const counts=new Map();
 for(const mod of mods||[]){
  const set=String(mod?.set_name||mod?.set||mod?.setId||mod?.set_id||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(set)counts.set(set,(counts.get(set)||0)+1);
 }
 return counts;
}
function ssPreservesSetBonuses(beforeMods,afterMods){
 const before=ssSetBonusCounts(beforeMods),after=ssSetBonusCounts(afterMods);
 for(const [set,count] of before){
  const required=count>=4?4:count>=2?2:0;
  if(required&&(after.get(set)||0)<required)return false;
 }
 return true;
}
function ssBuildSetPools(snapshot){
 const bySlot=new Map();for(const source of snapshot.sources){if(!ssIsProtectedLegend(source.character)){if(!bySlot.has(source.slot))bySlot.set(source.slot,[]);bySlot.get(source.slot).push(source);}}
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
function ssKyberMoveAudit(edge){
 const profile=edge?.target?.profile||{},mod=edge?.source?.mod||{},slot=edge?.target?.slot||'';
 const sets=sithariKyberSetChoices(profile);
 const primaries=sithariPrimaryRefs(profile,slot);
 const secondaries=Object.entries(profile.secondary_focus||{}).map(([stat,reference])=>{
  const actual=Number(sithariModSecondaryMap(mod)[sithariStatKey(stat)]||0);
  return {stat:sithariStatLabel(stat),reference:Number(reference)||0,actual,present:actual>0};
 });
 return {
  source:profile.source||'Référence Kyber',
  set:{actual:String(mod.set_name||'—'),choices:sets,matches:sithariSetMatch(mod,profile,edge.target.character)},
  primary:{actual:String(mod.primary_stat||'—'),choices:primaries.map(x=>({name:x.name,weight:Number(x.weight)||0})),matches:sithariPrimaryMatch(mod,profile,slot)},
  secondaries,secondaryFit:Number(edge.kyber)||0
 };
}
function ssKyberAuditHtml(edge){
 const audit=ssKyberMoveAudit(edge);
 const setChoices=audit.set.choices.length?audit.set.choices.join(' / '):'aucune donnée';
 const primaryChoices=audit.primary.choices.length?audit.primary.choices.map(x=>x.name+' '+Math.round(x.weight*100)+'%').join(' / '):'aucune donnée';
 const secondary=audit.secondaries.length?audit.secondaries.map(x=>ssEsc(x.stat)+' '+num(x.actual,1)+' / '+num(x.reference,1)).join(' · '):'aucune priorité secondaire publiée';
 return '<small class="ss-kyber-audit"><b>RÉFÉRENCE KYBER · '+ssEsc(audit.source)+'</b><br>Set reçu : '+ssEsc(audit.set.actual)+' · Choix : '+ssEsc(setChoices)+' · '+(audit.set.matches?'conforme':'non conforme')+'<br>Primaire reçue : '+ssEsc(audit.primary.actual)+' · Choix : '+ssEsc(primaryChoices)+' · '+(audit.primary.matches?'conforme':'non conforme')+'<br>Secondaires : '+secondary+'</small>';
}
function ssCyclePreservesSpeed(items,openTerminal=false){
 // Open chains are forbidden: every donor must also receive a replacement mod.
 if(openTerminal)return false;
 // Hard protection: a GL may never participate, even if a malformed/stale graph contains it.
 if(items.some(edge=>ssIsProtectedLegend(edge.target?.character)||ssIsProtectedLegend(edge.source?.character)))return false;
 const replacements=new Map();
 for(const edge of items){
  const key=edge.target.owner;
  if(!replacements.has(key))replacements.set(key,{character:edge.target.character,mods:sithariCharacterMods(edge.target.character).slice()});
  const entry=replacements.get(key),slot=edge.target.slot;
  entry.mods=entry.mods.filter(mod=>ssSlot(mod)!==slot);
  entry.mods.push(edge.source.mod);
 }
 for(const entry of replacements.values()){
  const beforeMods=sithariCharacterMods(entry.character),before=sithariProjectedSpeed(entry.character,beforeMods);
  const after=sithariProjectedSpeed(entry.character,entry.mods);
  // Keep the equipped roster complete: no participant may finish with a missing slot.
  if(beforeMods.length===6&&entry.mods.length!==6)return false;
  if(new Set(entry.mods.map(ssSlot)).size!==entry.mods.length)return false;
  if(before.baseSpeed>0&&after.total+1e-9<before.total)return false;
  if(before.baseSpeed<=0&&after.modSpeed+1e-9<before.modSpeed)return false;
  if(before.baseSpeed<=0&&before.speedSetPieces>=4&&after.speedSetPieces<4)return false;
 }
 return true;
}
function ssBuildEdges(snapshot){
 const bySlot=new Map();for(const source of (snapshot.sources||snapshot.nodes)){
  if(ssIsProtectedLegend(source.character))continue;
  if(!bySlot.has(source.slot))bySlot.set(source.slot,[]);bySlot.get(source.slot).push(source);
 }
 const edges=new Map();let setCandidates=0,primaryCandidates=0,secondaryCandidates=0;
 for(const target of snapshot.nodes){
  if(ssIsProtectedLegend(target.character)){edges.set(target.key,[]);continue;}
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
    if(!edges.has(next))continue; // No terminal donor: never leave a character with an empty slot.
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
function ssCycleImpactMap(cycle){
 const affected=new Map();
 const ensure=(character,owner,name)=>{
  if(!affected.has(owner)){
   const beforeMods=sithariCharacterMods(character).slice();
   affected.set(owner,{character,name,beforeMods,afterMods:beforeMods.slice()});
  }
  return affected.get(owner);
 };
 for(const edge of cycle.items){
  const target=ensure(edge.target.character,edge.target.owner,edge.target.name);
  target.afterMods=target.afterMods.filter(mod=>ssSlot(mod)!==edge.target.slot);
  target.afterMods.push(edge.source.mod);
 }
 if(cycle.open){
  const terminal=cycle.items[cycle.items.length-1].source;
  if(!affected.has(terminal.owner)){
   const donor=ensure(terminal.character,terminal.owner,terminal.name);
   donor.afterMods=donor.afterMods.filter(mod=>ssId(mod)!==ssId(terminal.mod));
  }
 }
 for(const item of affected.values()){
  item.before=sithariProjectedSpeed(item.character,item.beforeMods);
  item.after=sithariProjectedSpeed(item.character,item.afterMods);
  item.delta=Number(item.after.total||item.after.modSpeed||0)-Number(item.before.total||item.before.modSpeed||0);
 }
 return affected;
}
function ssImpactLabel(impact){
 if(!impact)return 'Impact vitesse non calculable';
 const delta=impact.delta,sign=delta>0?'+':'';
 return 'Vitesse totale : '+num(impact.before.total||impact.before.modSpeed)+' → '+num(impact.after.total||impact.after.modSpeed)+' ('+sign+num(delta)+')';
}
function ssKyberAuditHtml(edge){
 const audit=ssKyberMoveAudit(edge);
 const setChoices=audit.set.choices.length?audit.set.choices.join(' / '):'aucune donnée';
 const primaryChoices=audit.primary.choices.length?audit.primary.choices.map(x=>x.name+' '+Math.round(x.weight*100)+'%').join(' / '):'aucune donnée';
 const secondary=audit.secondaries.length?audit.secondaries.map(x=>ssEsc(x.stat)+' '+num(x.actual,1)+' / '+num(x.reference,1)).join(' · '):'aucune priorité secondaire publiée';
 return '<details class="ss-kyber-audit"><summary>DÉTAIL DE LA RÉFÉRENCE KYBER</summary><div><b>'+ssEsc(audit.source)+'</b><p><strong>Set</strong> · reçu : '+ssEsc(audit.set.actual)+' · attendu : '+ssEsc(setChoices)+' · '+(audit.set.matches?'Conforme':'Non conforme')+'</p><p><strong>Primaire</strong> · reçue : '+ssEsc(audit.primary.actual)+' · attendue : '+ssEsc(primaryChoices)+' · '+(audit.primary.matches?'Conforme':'Non conforme')+'</p><p><strong>Secondaires</strong> · valeur du mod / référence : '+secondary+'</p></div></details>';
}
function ssRender(snapshot,result,message){
 const root=document.getElementById('sithariStrategy');if(!root)return;
 const needs=snapshot.nodes.filter(n=>n.needsWork),setBad= snapshot.nodes.filter(n=>!n.setOk).length,primaryBad=snapshot.nodes.filter(n=>!n.primaryOk).length;
 const peopleSummary=[...needs.reduce((map,node)=>{const item=map.get(node.owner)||{name:node.name,slots:0,sets:0,primaries:0};item.slots++;if(!node.setOk)item.sets++;if(!node.primaryOk)item.primaries++;map.set(node.owner,item);return map;},new Map()).values()].sort((a,b)=>b.slots-a.slots||a.name.localeCompare(b.name,'fr'));
 const peopleHtml=peopleSummary.length?'<div class="ss-people">'+peopleSummary.map(person=>'<div><b>'+ssEsc(person.name)+'</b><span>'+person.slots+' slot(s) à revoir</span><small>'+person.sets+' set(s) · '+person.primaries+' primaire(s)</small></div>').join('')+'</div>':'<div class="ss-empty">Aucun emplacement équipé hors critères Set / primaire parmi les personnages disposant d’une référence Kyber.</div>';
 const rows=(result.cycles||[]).map((cycle,i)=>{
  const impacts=ssCycleImpactMap(cycle);
  const moves=cycle.items.map(e=>{
   const donor=impacts.get(e.source.owner),recipient=impacts.get(e.target.owner);
   const delta=Number(modTotalSpeed(e.source.mod)||0);
   return '<article class="ss-move"><div class="ss-transfer"><div class="ss-person"><small>DONNEUR</small><b>'+ssEsc(e.source.name)+'</b><span>'+ssImpactLabel(donor)+'</span></div><div class="ss-arrow">MOD TRANSFÉRÉ <b>→</b></div><div class="ss-person ss-recipient"><small>RECEVEUR</small><b>'+ssEsc(e.target.name)+'</b><span>'+ssImpactLabel(recipient)+'</span></div></div><div class="ss-modline"><b>'+ssEsc(e.source.mod.set_name||'Set inconnu')+'</b><span>'+ssEsc(e.source.mod.primary_stat||'Primaire inconnue')+'</span><strong>'+num(delta)+' vitesse sur le mod</strong></div>'+ssKyberAuditHtml(e)+'</article>';
  }).join('');
  const deltas=[...impacts.values()].map(x=>x.delta),net=deltas.reduce((sum,x)=>sum+x,0);
  return '<article class="ss-cycle"><header><b>SCÉNARIO '+String(i+1).padStart(2,'0')+'</b><span>'+cycle.length+' transfert(s)</span><strong>Écart vitesse roster : '+(net>0?'+':'')+num(net)+'</strong></header>'+moves+'<footer>Référence secondaire Kyber : '+Math.round(cycle.kyberFit*100)+'% · Couverture des priorités secondaires : '+Math.round(cycle.secondary*100)+'%</footer></article>';
 }).join('');
 const phase=sithariStepState?.phase||'profiles',busy=sithariStrategyBusy;
 const label=phase==='done'?'RECOMMENCER':phase==='profiles'?'CHARGER LE LOT DE RÉFÉRENCES':phase==='sets'?'EXÉCUTER LE FILTRE SETS':phase==='primaries'?'EXÉCUTER LE FILTRE PRIMAIRES':phase==='secondaries'?'EXÉCUTER LE FILTRE SECONDAIRES':'LANCER LA RECHERCHE DES PERMUTATIONS';
 root.innerHTML='<header class="ss-head"><div><small>SITH’ARI // STRATÈGE ULTIME</small><h3>ANALYSE CUMULATIVE DU ROSTER</h3><p>Chaque étape s’exécute séparément. La suivante attend ta commande.</p></div><button id="ss-run" type="button" '+(busy?'disabled':'')+'>'+ (busy?'ÉTAPE EN COURS…':label)+'</button></header>'+
 '<div class="ss-kpis"><div><b>'+snapshot.rosterCount+'</b><span>PERSONNAGES</span></div><div><b>'+(sithariStepState?.profileStats?.found??snapshot.profiledCount??0)+'</b><span>RÉFÉRENCES KYBER</span></div><div><b>'+snapshot.inventory.length+'</b><span>MODS</span></div><div><b>'+needs.length+'</b><span>SLOTS À AMÉLIORER</span></div><div><b>'+(result.cycles||[]).length+'</b><span>PERMUTATIONS</span></div></div>'+
 '<div class="ss-pipeline"><div><b>01 · SETS</b><strong>'+setBad+'</strong><small>'+(result.setCandidates||0)+' donneurs compatibles</small></div><i>→</i><div><b>02 · PRIMAIRES</b><strong>'+primaryBad+'</strong><small>'+(result.primaryCandidates||0)+' donneurs retenus</small></div><i>→</i><div><b>03 · SECONDAIRES</b><strong>'+(result.secondaryCandidates||0)+'</strong><small>meilleure couverture conservée</small></div><i>→</i><div><b>04 · KYBER</b><strong>'+(result.cycles||[]).length+'</strong><small>scénarios validés</small></div></div>'+
 '<div class="ss-status"><b>'+ssStepLabel(phase)+'</b><br>'+ssEsc(message)+'</div><h4>PERSONNAGES HORS CRITÈRES KYBER</h4>'+peopleHtml+'<h4>INCIDENCES DES PERMUTATIONS</h4><p class="ss-results-help">Lis chaque ligne de gauche à droite : personnage donneur, mod déplacé, personnage receveur. Les vitesses indiquent le total avant et après l’ensemble du scénario.</p>'+(rows||'<div class="ss-empty">Les permutations apparaîtront après l’exécution de la cinquième étape.</div>')+
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
   await Promise.all(Array.from({length:2},async()=>{while(cursor<items.length){const c=items[cursor++];let profile=sithariProfileForCharacter(c);if(!profile){try{profile=await fetchKyberProfile(c);}catch(_){profile=null;}}if(profile)found++;else missing++;done++;const status=document.querySelector('#sithariStrategy .ss-status');if(status)status.innerHTML='<b>'+ssStepLabel('profiles')+'</b><br>Références traitées dans ce lot : '+done+' / '+items.length;}}));
   state.profileCursor=end;state.profileStats=state.profileStats||{found:0,missing:0};state.profileStats.found+=found;state.profileStats.missing+=missing;
   if(end>=state.people.length){
    if(state.profileStats.found>0)state.phase='sets';
    else{state.profileCursor=0;state.phase='profiles';}
   }
   state.message='Lot terminé : '+end+' / '+state.people.length+' personnages examinés. '+found+' références disponibles dans ce lot, '+missing+' sans référence exploitable. Total chargé : '+state.profileStats.found+'. '+(state.phase==='sets'?'Les références sont prêtes. Lance le filtre des sets.':'Aucune référence Kyber exploitable récupérée. Le moteur s’arrête ici : vérifie le relais Cloudflare et relance la récupération.');
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



/* V4.1.30 — ciblage Sith'ari : 50 receveurs, donneurs GAC faibles et peu utilisés.
   Les propositions sont des échanges 1-pour-1 : le donneur reçoit le mod remplacé.
   Aucun profil Kyber n'est téléchargé pour les donneurs. */
const SS_RECIPIENT_POOL_LIMIT=50;
function ssGacEvidence(character){
 try{
  const fn=window.holocronGacPriorityForCharacter;
  const result=typeof fn==='function'?fn(character):null;
  return result&&result.known&&Number.isFinite(Number(result.uses))?{known:true,uses:Number(result.uses),label:result.label||'GAC observé'}:{known:false,uses:null,label:'Usage GAC inconnu'};
 }catch(_){return {known:false,uses:null,label:'Usage GAC inconnu'};}
}
function ssRosterPower(character){
 const raw=character?.raw?.data||character?.raw||character||{};
 const power=Number(character?.power??raw?.power??raw?.power_rating??raw?.powerRating??0);
 if(power>0)return power;
 const relic=Number(character?.relic_tier??character?.relicTier??raw?.relic_tier??raw?.relicTier??0);
 const gear=Number(character?.gear??character?.gear_level??raw?.gear_level??raw?.gearLevel??0);
 return relic*10000+gear*1000+Number(character?.stars??character?.rarity??0)*100;
}
function ssRecipientPool(people){
 return people.slice().sort((a,b)=>{
  const ag=ssIsProtectedLegend(a)?1:0,bg=ssIsProtectedLegend(b)?1:0;
  if(ag!==bg)return bg-ag;
  const au=ssGacEvidence(a),bu=ssGacEvidence(b);
  if(au.known&&bu.known&&au.uses!==bu.uses)return bu.uses-au.uses;
  if(au.known!==bu.known)return au.known?-1:1;
  return ssRosterPower(b)-ssRosterPower(a)||String(a.name||'').localeCompare(String(b.name||''),'fr');
 }).slice(0,SS_RECIPIENT_POOL_LIMIT);
}
function ssPercentile(values,p){
 if(!values.length)return 0;
 const sorted=values.slice().sort((a,b)=>a-b);
 return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(p*sorted.length)-1))];
}
function ssDonorPool(people,recipientPeople){
 const recipientKeys=new Set(recipientPeople.map(characterKey));
 const known=people.map(c=>({c,gac:ssGacEvidence(c),power:ssRosterPower(c)})).filter(x=>x.gac.known);
 if(!known.length)return {people:[],lowUseThreshold:null,weakPowerThreshold:null,knownCount:0};
 const lowUseThreshold=ssPercentile(known.map(x=>x.gac.uses),0.35);
 const weakPowerThreshold=ssPercentile(people.map(ssRosterPower).filter(x=>x>0),0.65);
 const donors=known.filter(x=>
  !recipientKeys.has(characterKey(x.c))&&!ssIsProtectedLegend(x.c)&&
  x.gac.uses<=lowUseThreshold&&x.power>0&&x.power<=weakPowerThreshold&&
  sithariCharacterMods(x.c).length===6
 ).sort((a,b)=>a.gac.uses-b.gac.uses||a.power-b.power);
 return {people:donors.map(x=>x.c),lowUseThreshold,weakPowerThreshold,knownCount:known.length};
}
function ssBuildSnapshot(state){
 const sources=[],nodes=[];
 for(const donor of state.donorPeople||[]){
  const owner=characterKey(donor),equipped=sithariCharacterMods(donor);
  for(const slot of SITHARI_SLOT_ORDER){
   const mod=equipped.find(m=>ssSlot(m)===slot);if(!mod)continue;
   sources.push({key:owner+'::'+slot,owner,name:donor.name||donor.baseId||owner,character:donor,slot,mod});
  }
 }
 for(const character of state.recipientPeople||[]){
  const profile=sithariProfileForCharacter(character);
  if(!profile||!sithariKyberSetChoices(profile).length)continue;
  const owner=characterKey(character),equipped=sithariCharacterMods(character);
  if(equipped.length!==6)continue;
  for(const slot of SITHARI_SLOT_ORDER){
   const mod=equipped.find(m=>ssSlot(m)===slot);if(!mod||sithariSetMatch(mod,profile,character))continue;
   nodes.push({key:owner+'::'+slot,owner,name:character.name||character.baseId||owner,character,slot,mod,profile,setOk:false,primaryOk:sithariPrimaryMatch(mod,profile,slot),needsWork:true});
  }
 }
 return {nodes,sources,inventory:sithariEnsureModCache().items,rosterCount:state.people.length,recipientCount:state.recipientPeople.length,donorCount:state.donorPeople.length,profiledCount:new Set(nodes.map(n=>n.owner)).size};
}
function ssSwapSafe(target,source){
 const targetBefore=sithariCharacterMods(target.character).slice(),donorBefore=sithariCharacterMods(source.character).slice();
 if(targetBefore.length!==6||donorBefore.length!==6)return null;
 const targetOld=targetBefore.find(m=>ssSlot(m)===target.slot);
 const donorOld=donorBefore.find(m=>ssSlot(m)===source.slot);
 if(!targetOld||!donorOld||ssSlot(targetOld)!==ssSlot(donorOld))return null;
 const targetAfter=targetBefore.filter(m=>ssSlot(m)!==target.slot).concat([donorOld]);
 const donorAfter=donorBefore.filter(m=>ssSlot(m)!==source.slot).concat([targetOld]);
 if(targetAfter.length!==6||donorAfter.length!==6)return null;
 if(!sithariSetMatch(donorOld,target.profile,target.character))return null;
 if(!sithariPrimaryMatch(donorOld,target.profile,target.slot))return null;
 if(!ssPreservesSetBonuses(targetBefore,targetAfter)||!ssPreservesSetBonuses(donorBefore,donorAfter))return null;
 const targetSpeedBefore=sithariProjectedSpeed(target.character,targetBefore),targetSpeedAfter=sithariProjectedSpeed(target.character,targetAfter);
 const donorSpeedBefore=sithariProjectedSpeed(source.character,donorBefore),donorSpeedAfter=sithariProjectedSpeed(source.character,donorAfter);
 if(targetSpeedAfter.total+1e-9<targetSpeedBefore.total||donorSpeedAfter.total+1e-9<donorSpeedBefore.total)return null;
 const donorProfile=sithariProfileForCharacter(source.character);
 if(donorProfile&&sithariKyberSetChoices(donorProfile).length){
  if(!sithariSetMatch(targetOld,donorProfile,source.character)||!sithariPrimaryMatch(targetOld,donorProfile,source.slot))return null;
 }else if(compactKey(targetOld.primary_stat)!==compactKey(donorOld.primary_stat))return null;
 return {targetBefore,targetAfter,donorBefore,donorAfter,targetOld,donorOld,targetSpeedBefore,targetSpeedAfter,donorSpeedBefore,donorSpeedAfter};
}
function ssFindCycles(snapshot){
 const candidates=[];
 for(const target of snapshot.nodes){
  for(const source of snapshot.sources){
   if(source.owner===target.owner||source.slot!==target.slot)continue;
   const audit=ssSwapSafe(target,source);if(!audit)continue;
   const edge={target,source,secondary:ssSecondaryCoverage(source.mod,target.profile),kyber:ssKyberSecondaryFit(source.mod,target.profile),speed:modTotalSpeed(source.mod),returnMod:audit.targetOld};
   candidates.push({items:[edge],length:1,kyberFit:edge.kyber,secondary:edge.secondary,speed:edge.speed,returnMod:audit.targetOld,audit});
  }
 }
 candidates.sort((a,b)=>b.kyberFit-a.kyberFit||b.secondary-a.secondary||b.speed-a.speed);
 const selected=[],usedTargets=new Set(),usedDonors=new Set();
 for(const candidate of candidates){
  const edge=candidate.items[0];
  if(usedTargets.has(edge.target.owner)||usedDonors.has(edge.source.owner))continue;
  selected.push(candidate);usedTargets.add(edge.target.owner);usedDonors.add(edge.source.owner);
  if(selected.length>=30)break;
 }
 return {cycles:selected,expansions:candidates.length,closedCycles:selected.length,exhausted:false,candidateCount:candidates.length};
}
function ssStepLabel(phase){
 return ({profiles:'ÉTAPE 1/4 · PROFILS DES 50 PRIORITAIRES',sets:'ÉTAPE 2/4 · PERSONNAGES AU MAUVAIS SET',donors:'ÉTAPE 3/4 · POOL DES DONNEURS',permutations:'ÉTAPE 4/4 · ÉCHANGES SÉCURISÉS',done:'ANALYSE TERMINÉE'})[phase]||'PRÉPARATION';
}
function ssCycleImpactMap(cycle){
 const edge=cycle.items[0],affected=new Map();
 const add=(character,owner,name,beforeMods,afterMods)=>{
  const before=sithariProjectedSpeed(character,beforeMods),after=sithariProjectedSpeed(character,afterMods);
  affected.set(owner,{character,name,beforeMods,afterMods,before,after,delta:Number(after.total||after.modSpeed||0)-Number(before.total||before.modSpeed||0)});
 };
 const targetBefore=sithariCharacterMods(edge.target.character).slice(),donorBefore=sithariCharacterMods(edge.source.character).slice();
 const targetAfter=targetBefore.filter(m=>ssSlot(m)!==edge.target.slot).concat([edge.source.mod]);
 const donorAfter=donorBefore.filter(m=>ssSlot(m)!==edge.source.slot).concat([edge.source.returnMod||cycle.returnMod]);
 add(edge.target.character,edge.target.owner,edge.target.name,targetBefore,targetAfter);
 add(edge.source.character,edge.source.owner,edge.source.name,donorBefore,donorAfter);
 return affected;
}
function ssRender(snapshot,result,message){
 const root=document.getElementById('sithariStrategy');if(!root)return;
 const needs=snapshot.nodes||[],cycles=result.cycles||[];
 const peopleHtml=needs.length?'<div class="ss-people">'+[...new Map(needs.map(n=>[n.owner,n])).values()].map(n=>'<div><b>'+ssEsc(n.name)+'</b><span>Set actuel : '+ssEsc(n.mod.set_name||'inconnu')+'</span><small>Set(s) Kyber : '+ssEsc(sithariKyberSetChoices(n.profile).join(' / ')||'non documenté')+'</small></div>').join('')+'</div>':'<div class="ss-empty">Aucun mauvais set détecté parmi les 50 personnages prioritaires disposant d’une référence exploitable.</div>';
 const rows=cycles.map((cycle,i)=>{
  const edge=cycle.items[0],impacts=ssCycleImpactMap(cycle),donor=impacts.get(edge.source.owner),recipient=impacts.get(edge.target.owner);
  return '<article class="ss-cycle"><header><b>ÉCHANGE '+String(i+1).padStart(2,'0')+'</b><span>'+ssEsc(edge.target.slot)+'</span><strong>Deux personnages protégés contre toute perte de vitesse</strong></header><article class="ss-move"><div class="ss-transfer"><div class="ss-person"><small>DONNEUR · FAIBLE / PEU UTILISÉ</small><b>'+ssEsc(edge.source.name)+'</b><span>'+ssImpactLabel(donor)+'</span></div><div class="ss-arrow">MOD CÉDÉ <b>→</b></div><div class="ss-person ss-recipient"><small>RECEVEUR PRIORITAIRE</small><b>'+ssEsc(edge.target.name)+'</b><span>'+ssImpactLabel(recipient)+'</span></div></div><div class="ss-modline"><b>'+ssEsc(edge.source.mod.set_name||'Set inconnu')+'</b><span>'+ssEsc(edge.source.mod.primary_stat||'Primaire inconnue')+'</span><strong>'+num(edge.speed)+' vitesse sur le mod</strong></div><p>Retour au donneur : '+ssEsc(edge.returnMod?.set_name||'Set inconnu')+' · '+ssEsc(edge.returnMod?.primary_stat||'Primaire inconnue')+'</p>'+ssKyberAuditHtml(edge)+'</article></article>';
 }).join('');
 const phase=sithariStepState?.phase||'profiles',busy=sithariStrategyBusy;
 const label=phase==='done'?'RECOMMENCER':phase==='profiles'?'CHARGER LES 50 PRIORITAIRES':phase==='sets'?'IDENTIFIER LES MAUVAIS SETS':phase==='donors'?'CONSTITUER LE POOL DES DONNEURS':'CALCULER LES ÉCHANGES';
 root.innerHTML='<header class="ss-head"><div><small>SITH’ARI // STRATÈGE ULTIME</small><h3>OPTIMISATION CIBLÉE · 50 PERSONNAGES</h3><p>Les receveurs prioritaires sont séparés des donneurs faibles et peu utilisés.</p></div><button id="ss-run" type="button" '+(busy?'disabled':'')+'>'+(busy?'ÉTAPE EN COURS…':label)+'</button></header>'+
 '<div class="ss-kpis"><div><b>'+snapshot.rosterCount+'</b><span>ROSTER</span></div><div><b>'+ (sithariStepState?.recipientPeople?.length||0)+'</b><span>POOL PRIORITAIRE</span></div><div><b>'+needs.length+'</b><span>MAUVAIS SETS</span></div><div><b>'+ (sithariStepState?.donorPeople?.length||0)+'</b><span>DONNEURS VALIDÉS</span></div><div><b>'+cycles.length+'</b><span>ÉCHANGES VALIDÉS</span></div></div>'+
 '<div class="ss-pipeline"><div><b>01 · PRIORITAIRES</b><strong>'+ (sithariStepState?.recipientPeople?.length||0)+'/50</strong><small>GL + usage GAC + puissance</small></div><i>→</i><div><b>02 · SETS</b><strong>'+needs.length+'</strong><small>mauvais sets uniquement</small></div><i>→</i><div><b>03 · DONNEURS</b><strong>'+ (sithariStepState?.donorPeople?.length||0)+'</strong><small>faibles + faible usage observé</small></div><i>→</i><div><b>04 · ÉCHANGES</b><strong>'+cycles.length+'</strong><small>échanges 1 pour 1 validés</small></div></div>'+
 '<div class="ss-status"><b>'+ssStepLabel(phase)+'</b><br>'+ssEsc(message)+'</div><h4>PERSONNAGES PRIORITAIRES À CORRIGER</h4>'+peopleHtml+'<h4>ÉCHANGES PROPOSÉS</h4><p class="ss-results-help">Chaque proposition est un échange : le receveur obtient le mod conforme au set Kyber ; le donneur récupère le mod remplacé. Aucun des deux ne perd de vitesse ni de bonus de set.</p>'+(rows||'<div class="ss-empty">Aucun échange validé à ce stade.</div>')+'<p class="ss-note">Analyse en lecture seule. Aucun mod n’est déplacé automatiquement. Les usages absents des données GAC restent inconnus, jamais assimilés à zéro.</p>';
 document.getElementById('ss-run')?.addEventListener('click',ssAdvance);
}
async function ssAdvance(){
 if(sithariStrategyBusy)return;
 if(!sithariStepState||sithariStepState.phase==='done'){
  const people=(rosterCharacters||[]).filter(c=>rosterUnitType(c)!=='ship');
  const recipientPeople=ssRecipientPool(people);
  sithariStepState={phase:'profiles',people,recipientPeople,donorPeople:[],profileCursor:0,snapshot:null,result:{cycles:[]},profileStats:{found:0,missing:0}};
 }
 const state=sithariStepState;sithariStrategyBusy=true;
 const show=message=>{state.message=message;ssRender(state.snapshot||{nodes:[],inventory:sithariEnsureModCache().items,rosterCount:state.people.length},state.result,message);};
 try{
  if(state.phase==='profiles'){
   let done=0,found=0,missing=0;
   for(const character of state.recipientPeople){
    let profile=sithariProfileForCharacter(character);
    if(!profile||!sithariKyberSetChoices(profile).length){try{profile=await fetchKyberProfile(character);}catch(_){profile=null;}}
    if(profile&&sithariKyberSetChoices(profile).length)found++;else missing++;
    done++;
    const status=document.querySelector('#sithariStrategy .ss-status');
    if(status)status.innerHTML='<b>'+ssStepLabel('profiles')+'</b><br>Références examinées : '+done+' / '+state.recipientPeople.length;
   }
   state.profileStats={found,missing};
   state.phase='sets';
   show('50 personnages maximum examinés : '+found+' références avec recommandations de sets exploitables, '+missing+' sans référence. Lance l’identification des mauvais sets.');
  }else if(state.phase==='sets'){
   state.snapshot=ssBuildSnapshot(state);
   state.phase='donors';
   show(state.snapshot.nodes.length+' personnages prioritaires présentent au moins un mauvais set. Le pool donneur sera limité aux personnages faibles avec un usage GAC bas et observé.');
  }else if(state.phase==='donors'){
   const selection=ssDonorPool(state.people,state.recipientPeople);
   state.donorPeople=selection.people;
   state.donorStats=selection;
   state.snapshot=ssBuildSnapshot(state);
   state.phase='permutations';
   show(state.donorPeople.length+' donneurs validés parmi '+selection.knownCount+' personnages avec usage GAC observé. Seuil faible utilisation : '+(selection.lowUseThreshold??'indisponible')+'.');
  }else if(state.phase==='permutations'){
   const search=ssFindCycles(state.snapshot);
   state.result.cycles=search.cycles;
   state.result.candidateCount=search.candidateCount;
   state.phase='done';
   show(search.cycles.length+' échanges validés parmi '+search.candidateCount+' possibilités examinées. Chaque échange respecte les sets, les slots et le plancher de vitesse des deux personnages.');
  }
 }catch(error){show('Étape interrompue : '+String(error?.message||error));console.error('Sith’ari strategy:',error);}
 finally{sithariStrategyBusy=false;ssRender(state.snapshot||{nodes:[],inventory:sithariEnsureModCache().items,rosterCount:state.people.length},state.result,state.message||'Étape terminée.');}
}
function renderSithariStrategy(){
 const people=(rosterCharacters||[]).filter(c=>rosterUnitType(c)!=='ship');
 if(!sithariStepState||sithariStepState.people.length!==people.length){
  sithariStepState={phase:'profiles',people,recipientPeople:ssRecipientPool(people),donorPeople:[],snapshot:null,result:{cycles:[]},profileStats:{found:0,missing:0}};
 }
 ssRender(sithariStepState.snapshot||{nodes:[],inventory:sithariEnsureModCache().items,rosterCount:people.length},sithariStepState.result,'Le moteur attend la première commande. Il commencera par 50 personnages prioritaires maximum.');
}


/* V4.1.31 — permutations atomiques de sets complets.
   Un groupe de 2 ou 4 mods est transféré ensemble ; le donneur reçoit tous les mods remplacés. */
function ssCombinations(items,size,start=0,prefix=[],out=[]){
 if(prefix.length===size){out.push(prefix.slice());return out;}
 for(let i=start;i<=items.length-(size-prefix.length);i++){
  prefix.push(items[i]);ssCombinations(items,size,i+1,prefix,out);prefix.pop();
 }
 return out;
}
function ssAtomicSetSwap(target,donor,slots){
 const targetBefore=sithariCharacterMods(target.character).slice();
 const donorBefore=sithariCharacterMods(donor.character).slice();
 if(targetBefore.length!==6||donorBefore.length!==6||ssIsProtectedLegend(target.character)||ssIsProtectedLegend(donor.character))return null;
 const targetBySlot=new Map(targetBefore.map(m=>[ssSlot(m),m]));
 const donorBySlot=new Map(donorBefore.map(m=>[ssSlot(m),m]));
 const incoming=slots.map(slot=>donorBySlot.get(slot));
 const returned=slots.map(slot=>targetBySlot.get(slot));
 if(incoming.some(m=>!m)||returned.some(m=>!m))return null;
 const incomingSet=String(incoming[0]?.set_name||incoming[0]?.set||'').trim();
 const incomingKey=compactKey(incomingSet);
 if(!incomingKey||incoming.some(m=>compactKey(m.set_name||m.set)!==incomingKey))return null;
 for(let i=0;i<slots.length;i++){
  if(!sithariSetMatch(incoming[i],target.profile,target.character))return null;
  if(!sithariPrimaryMatch(incoming[i],target.profile,slots[i]))return null;
 }
 const targetAfter=targetBefore.filter(m=>!slots.includes(ssSlot(m))).concat(incoming);
 const donorAfter=donorBefore.filter(m=>!slots.includes(ssSlot(m))).concat(returned);
 if(targetAfter.length!==6||donorAfter.length!==6)return null;
 const targetCounts=ssSetBonusCounts(targetAfter);
 const required=slots.length===4?4:2;
 if((targetCounts.get(incomingKey)||0)<required)return null;
 // Le donneur doit conserver tous ses bonus actifs ; le receveur peut remplacer
 // précisément son ancien set défectueux par le set Kyber complet.
 if(!ssPreservesSetBonuses(donorBefore,donorAfter))return null;
 const targetSpeedBefore=sithariProjectedSpeed(target.character,targetBefore);
 const targetSpeedAfter=sithariProjectedSpeed(target.character,targetAfter);
 const donorSpeedBefore=sithariProjectedSpeed(donor.character,donorBefore);
 const donorSpeedAfter=sithariProjectedSpeed(donor.character,donorAfter);
 if(targetSpeedAfter.total+1e-9<targetSpeedBefore.total)return null;
 if(donorSpeedAfter.total+1e-9<donorSpeedBefore.total)return null;
 return {targetBefore,targetAfter,donorBefore,donorAfter,incoming,returned,targetSpeedBefore,targetSpeedAfter,donorSpeedBefore,donorSpeedAfter,incomingSet,required};
}
function ssFindCycles(snapshot){
 const candidates=[];
 const diagnostics={targets:0,donors:0,groupsTested:0,rejectedSet:0,rejectedPrimary:0,rejectedDonorSet:0,rejectedSpeed:0,validated:0};
 const donors=[...new Map((snapshot.sources||[]).map(source=>[source.owner,source])).values()];
 for(const target of snapshot.nodes||[]){
  diagnostics.targets++;
  const targetSlots=SITHARI_SLOT_ORDER.filter(slot=>(snapshot.nodes||[]).some(n=>n.owner===target.owner&&n.slot===slot));
  if(!targetSlots.length)continue;
  for(const donor of donors){
   if(donor.owner===target.owner||ssIsProtectedLegend(donor.character))continue;
   const donorMods=sithariCharacterMods(donor.character);
   if(donorMods.length!==6)continue;
   diagnostics.donors++;
   const donorBySlot=new Map(donorMods.map(m=>[ssSlot(m),m]));
   for(const size of [2,4]){
    for(const slots of ssCombinations(SITHARI_SLOT_ORDER,size)){
     diagnostics.groupsTested++;
     const incoming=slots.map(slot=>donorBySlot.get(slot));
     if(incoming.some(m=>!m))continue;
     const firstSet=compactKey(incoming[0]?.set_name||incoming[0]?.set);
     if(!firstSet||incoming.some(m=>compactKey(m.set_name||m.set)!==firstSet))continue;
     const targetProfile=target.profile;
     if(incoming.some(m=>!sithariSetMatch(m,targetProfile,target.character))){diagnostics.rejectedSet++;continue;}
     if(incoming.some((m,i)=>!sithariPrimaryMatch(m,targetProfile,slots[i]))){diagnostics.rejectedPrimary++;continue;}
     const audit=ssAtomicSetSwap(target,donor,slots);
     if(!audit){
      // Classer le motif principal du rejet pour rendre le bilan exploitable.
      const beforeT=audit?.targetSpeedBefore,afterT=audit?.targetSpeedAfter;
      if(beforeT&&afterT&&afterT.total<beforeT.total)diagnostics.rejectedSpeed++;
      else diagnostics.rejectedDonorSet++;
      continue;
     }
     diagnostics.validated++;
     const items=slots.map((slot,i)=>({
      target:{...target,key:target.owner+'::'+slot,slot},
      source:{key:donor.owner+'::'+slot,owner:donor.owner,name:donor.name||donor.character?.name||donor.owner,character:donor.character,slot,mod:audit.incoming[i]},
      returnMod:audit.returned[i],
      secondary:ssSecondaryCoverage(audit.incoming[i],target.profile),
      kyber:ssKyberSecondaryFit(audit.incoming[i],target.profile),
      speed:modTotalSpeed(audit.incoming[i])
     }));
     candidates.push({items,length:size,kyberFit:items.reduce((s,e)=>s+e.kyber,0)/size,secondary:items.reduce((s,e)=>s+e.secondary,0)/size,speed:items.reduce((s,e)=>s+e.speed,0),audit,atomic:true});
    }
   }
  }
 }
 candidates.sort((a,b)=>b.kyberFit-a.kyberFit||b.secondary-a.secondary||b.speed-a.speed);
 const selected=[],usedTargets=new Set(),usedDonors=new Set();
 for(const candidate of candidates){
  const edge=candidate.items[0],target=edge.target.owner,donor=edge.source.owner;
  if(usedTargets.has(target)||usedDonors.has(donor))continue;
  selected.push(candidate);usedTargets.add(target);usedDonors.add(donor);
  if(selected.length>=30)break;
 }
 return {cycles:selected,expansions:diagnostics.groupsTested,closedCycles:selected.length,exhausted:false,candidateCount:candidates.length,diagnostics};
}
function ssCycleImpactMap(cycle){
 const edge=cycle.items[0],audit=cycle.audit,affected=new Map();
 const make=(character,owner,name,beforeMods,afterMods)=>{
  const before=sithariProjectedSpeed(character,beforeMods),after=sithariProjectedSpeed(character,afterMods);
  affected.set(owner,{character,name,beforeMods,afterMods,before,after,delta:Number(after.total||after.modSpeed||0)-Number(before.total||before.modSpeed||0)});
 };
 make(edge.target.character,edge.target.owner,edge.target.name,audit.targetBefore,audit.targetAfter);
 make(edge.source.character,edge.source.owner,edge.source.name,audit.donorBefore,audit.donorAfter);
 return affected;
}
function ssRender(snapshot,result,message){
 const root=document.getElementById('sithariStrategy');if(!root)return;
 const needs=snapshot.nodes||[],cycles=result.cycles||[],diag=result.diagnostics||{};
 const people=[...new Map(needs.map(n=>[n.owner,n])).values()];
 const peopleHtml=people.length?'<div class="ss-people">'+people.map(n=>'<div><b>'+ssEsc(n.name)+'</b><span>Set actuel : '+ssEsc(n.mod.set_name||'inconnu')+'</span><small>Attendu : '+ssEsc(sithariKyberSetChoices(n.profile).join(' / ')||'non documenté')+'</small></div>').join('')+'</div>':'<div class="ss-empty">Aucun mauvais set détecté parmi les personnages prioritaires disposant d’une référence exploitable.</div>';
 const rows=cycles.map((cycle,i)=>{
  const impacts=ssCycleImpactMap(cycle),edge=cycle.items[0],donor=impacts.get(edge.source.owner),recipient=impacts.get(edge.target.owner);
  const moves=cycle.items.map(item=>'<div class="ss-modline"><b>'+ssEsc(item.source.mod.set_name||'Set inconnu')+'</b><span>'+ssEsc(item.source.slot)+' · '+ssEsc(item.source.mod.primary_stat||'Primaire inconnue')+'</span><strong>'+num(item.speed)+' vitesse</strong><small>Retour : '+ssEsc(item.returnMod?.set_name||'Set inconnu')+' · '+ssEsc(item.returnMod?.primary_stat||'Primaire inconnue')+'</small></div>'+ssKyberAuditHtml({...item,target:{...item.target,profile:edge.target.profile}})).join('');
  return '<article class="ss-cycle"><header><b>SCÉNARIO '+String(i+1).padStart(2,'0')+'</b><span>'+cycle.length+' mods échangés en bloc</span><strong>Sets complets · aucune perte de vitesse</strong></header><div class="ss-transfer"><div class="ss-person"><small>DONNEUR · FAIBLE / PEU UTILISÉ</small><b>'+ssEsc(edge.source.name)+'</b><span>'+ssImpactLabel(donor)+'</span></div><div class="ss-arrow">ÉCHANGE ATOMIQUE <b>⇄</b></div><div class="ss-person ss-recipient"><small>RECEVEUR PRIORITAIRE</small><b>'+ssEsc(edge.target.name)+'</b><span>'+ssImpactLabel(recipient)+'</span></div></div>'+moves+'<footer>Référence Kyber : '+Math.round(cycle.kyberFit*100)+'% · Couverture secondaire : '+Math.round(cycle.secondary*100)+'%</footer></article>';
 }).join('');
 const phase=sithariStepState?.phase||'profiles',busy=sithariStrategyBusy;
 const label=phase==='done'?'RECOMMENCER':phase==='profiles'?'CHARGER LES 50 PRIORITAIRES':phase==='sets'?'IDENTIFIER LES MAUVAIS SETS':phase==='donors'?'CONSTITUER LE POOL DES DONNEURS':'CALCULER LES ÉCHANGES';
 const diagnostic=phase==='done'?'<h4>BILAN DE RECHERCHE</h4><div class="ss-status">Groupes testés : '+(diag.groupsTested||result.expansions||0)+' · Candidats validés : '+(diag.validated||result.candidateCount||0)+'<br>Rejets : set incompatible '+(diag.rejectedSet||0)+' · primaire '+(diag.rejectedPrimary||0)+' · protection du donneur / vitesse '+((diag.rejectedDonorSet||0)+(diag.rejectedSpeed||0))+'</div>':'';
 root.innerHTML='<header class="ss-head"><div><small>SITH’ARI // STRATÈGE ULTIME</small><h3>OPTIMISATION CIBLÉE · 50 PERSONNAGES</h3><p>Les sets de 2 ou 4 pièces sont échangés en bloc ; le donneur récupère tous les mods remplacés.</p></div><button id="ss-run" type="button" '+(busy?'disabled':'')+'>'+(busy?'ÉTAPE EN COURS…':label)+'</button></header>'+
 '<div class="ss-kpis"><div><b>'+snapshot.rosterCount+'</b><span>ROSTER</span></div><div><b>'+(sithariStepState?.recipientPeople?.length||0)+'</b><span>POOL PRIORITAIRE</span></div><div><b>'+needs.length+'</b><span>MAUVAIS SETS</span></div><div><b>'+(sithariStepState?.donorPeople?.length||0)+'</b><span>DONNEURS VALIDÉS</span></div><div><b>'+cycles.length+'</b><span>ÉCHANGES VALIDÉS</span></div></div>'+
 '<div class="ss-status"><b>'+ssStepLabel(phase)+'</b><br>'+ssEsc(message)+'</div>'+diagnostic+'<h4>PERSONNAGES PRIORITAIRES À CORRIGER</h4>'+peopleHtml+'<h4>ÉCHANGES PROPOSÉS</h4><p class="ss-results-help">Les mods sont transférés par groupes complets de 2 ou 4. Les vitesses totales sont contrôlées avant/après pour les deux personnages. Aucun bonus de set du donneur n’est sacrifié.</p>'+(rows||'<div class="ss-empty">'+(phase==='done'?'Aucune permutation ne passe encore tous les contrôles. Le bilan ci-dessus détaille les filtres bloquants.':'Les permutations apparaîtront après le calcul des échanges.')+'</div>')+'<p class="ss-note">Analyse en lecture seule. Aucun mod n’est déplacé automatiquement. Les usages GAC absents restent inconnus.</p>';
 document.getElementById('ss-run')?.addEventListener('click',ssAdvance);
}



/* V4.1.32 — audit des compositions complètes de sets Kyber.
   Une liste de sets autorisés par mod n'est pas une composition valide :
   on compare les six pièces aux combinaisons exactes publiées par SWGOH.GG. */
function ssSetCompositionCounts(mods){
 const counts=new Map();
 for(const mod of mods||[]){
  const set=sithariCanonicalSet(mod?.set_name||mod?.set||mod?.setId||mod?.set_id||'');
  if(set)counts.set(set,(counts.get(set)||0)+1);
 }
 return counts;
}
function ssSameSetComposition(actual,expected){
 const keys=new Set([...actual.keys(),...expected.keys()]);
 for(const key of keys)if((actual.get(key)||0)!==(expected.get(key)||0))return false;
 return true;
}
function ssCharacterSetAudit(mods,profile){
 const equipped=Array.isArray(mods)?mods:[];
 if(equipped.length!==6||new Set(equipped.map(ssSlot)).size!==6)return {status:'INCOMPLETE',exact:false,expected:[]};
 const actual=ssSetCompositionCounts(equipped);
 const configs=(Array.isArray(profile?.specific_sets)?profile.specific_sets:[])
  .map(config=>{
   const expected=new Map();
   for(const [name,count] of Object.entries(config?.counts||{})){
    const key=sithariCanonicalSet(name),value=Number(count)||0;
    if(key&&value>0)expected.set(key,(expected.get(key)||0)+value);
   }
   const total=[...expected.values()].reduce((sum,value)=>sum+value,0);
   return {name:String(config?.name||'Composition Kyber'),weight:Number(config?.weight)||0,expected,total};
  })
  .filter(config=>config.total===6)
  .sort((a,b)=>b.weight-a.weight);
 if(configs.length){
  const match=configs.find(config=>ssSameSetComposition(actual,config.expected));
  return {status:match?'MATCH':'MISMATCH',exact:true,expected:configs,matched:match||null,actual};
 }
 const choices=new Set(sithariKyberSetChoices(profile).map(sithariCanonicalSet));
 const allAllowed=choices.size&&[...actual.keys()].every(set=>choices.has(set));
 return {status:allAllowed?'UNVERIFIABLE':'MISMATCH',exact:false,expected:[...choices],actual};
}
function ssBuildSnapshot(state){
 const sources=[],nodes=[],unverifiable=[];
 const donorPeople=state?.donorPeople||[];
 const recipientPeople=state?.recipientPeople||[];
 for(const donor of donorPeople){
  const equipped=sithariCharacterMods(donor),owner=characterKey(donor);
  if(equipped.length!==6||ssIsProtectedLegend(donor))continue;
  for(const slot of SITHARI_SLOT_ORDER){
   const mod=equipped.find(item=>ssSlot(item)===slot);if(!mod)continue;
   sources.push({key:owner+'::'+slot,owner,name:donor.name||donor.baseId||owner,character:donor,slot,mod});
  }
 }
 for(const character of recipientPeople){
  if(ssIsProtectedLegend(character))continue;
  const profile=sithariProfileForCharacter(character);
  if(!profile||!sithariKyberSetChoices(profile).length)continue;
  const equipped=sithariCharacterMods(character);
  const audit=ssCharacterSetAudit(equipped,profile);
  if(audit.status==='UNVERIFIABLE'){
   unverifiable.push({character,name:character.name||character.baseId||characterKey(character),audit});
   continue;
  }
  if(audit.status!=='MISMATCH')continue;
  const owner=characterKey(character);
  nodes.push({key:owner,owner,name:character.name||character.baseId||owner,character,profile,mods:equipped.slice(),setAudit:audit,needsWork:true});
 }
 return {
  nodes,sources,unverifiable,inventory:sithariEnsureModCache().items,
  rosterCount:state?.people?.length||0,recipientCount:recipientPeople.length,
  donorCount:donorPeople.length,profiledCount:recipientPeople.filter(c=>!!sithariProfileForCharacter(c)).length,
  exactReferenceCount:recipientPeople.filter(c=>{const p=sithariProfileForCharacter(c);return Array.isArray(p?.specific_sets)&&p.specific_sets.some(x=>Object.values(x?.counts||{}).reduce((sum,n)=>sum+(Number(n)||0),0)===6);}).length
 };
}
function ssAtomicSetSwap(target,donor,slots){
 const targetBefore=sithariCharacterMods(target.character).slice();
 const donorBefore=sithariCharacterMods(donor.character).slice();
 if(targetBefore.length!==6||donorBefore.length!==6||ssIsProtectedLegend(target.character)||ssIsProtectedLegend(donor.character))return null;
 if(!Array.isArray(target.profile?.specific_sets)||!target.profile.specific_sets.length)return null;
 const targetBySlot=new Map(targetBefore.map(mod=>[ssSlot(mod),mod]));
 const donorBySlot=new Map(donorBefore.map(mod=>[ssSlot(mod),mod]));
 const incoming=slots.map(slot=>donorBySlot.get(slot));
 const returned=slots.map(slot=>targetBySlot.get(slot));
 if(incoming.some(mod=>!mod)||returned.some(mod=>!mod))return null;
 if(new Set(slots).size!==slots.length)return null;
 for(let i=0;i<slots.length;i++){
  if(!sithariSetMatch(incoming[i],target.profile,target.character))return null;
  if(!sithariPrimaryMatch(incoming[i],target.profile,slots[i]))return null;
 }
 const targetAfter=targetBefore.filter(mod=>!slots.includes(ssSlot(mod))).concat(incoming);
 const donorAfter=donorBefore.filter(mod=>!slots.includes(ssSlot(mod))).concat(returned);
 if(targetAfter.length!==6||donorAfter.length!==6)return null;
 const composition=ssCharacterSetAudit(targetAfter,target.profile);
 if(composition.status!=='MATCH'||!composition.exact)return null;
 if(!ssPreservesSetBonuses(donorBefore,donorAfter))return null;
 const targetSpeedBefore=sithariProjectedSpeed(target.character,targetBefore);
 const targetSpeedAfter=sithariProjectedSpeed(target.character,targetAfter);
 const donorSpeedBefore=sithariProjectedSpeed(donor.character,donorBefore);
 const donorSpeedAfter=sithariProjectedSpeed(donor.character,donorAfter);
 if(targetSpeedAfter.total+1e-9<targetSpeedBefore.total)return null;
 if(donorSpeedAfter.total+1e-9<donorSpeedBefore.total)return null;
 return {targetBefore,targetAfter,donorBefore,donorAfter,incoming,returned,targetSpeedBefore,targetSpeedAfter,donorSpeedBefore,donorSpeedAfter,composition,required:slots.length};
}
function ssFindCycles(snapshot){
 const candidates=[];
 const diagnostics={targets:0,donors:0,groupsTested:0,rejectedSet:0,rejectedPrimary:0,rejectedDonorSet:0,rejectedSpeed:0,validated:0};
 const donors=[...new Map((snapshot.sources||[]).map(source=>[source.owner,source])).values()];
 for(const target of snapshot.nodes||[]){
  diagnostics.targets++;
  for(const donor of donors){
   if(donor.owner===target.owner||ssIsProtectedLegend(donor.character))continue;
   const donorMods=sithariCharacterMods(donor.character);
   if(donorMods.length!==6)continue;
   diagnostics.donors++;
   const donorBySlot=new Map(donorMods.map(mod=>[ssSlot(mod),mod]));
   for(const size of [2,4]){
    for(const slots of ssCombinations(SITHARI_SLOT_ORDER,size)){
     diagnostics.groupsTested++;
     const incoming=slots.map(slot=>donorBySlot.get(slot));
     if(incoming.some(mod=>!mod))continue;
     if(incoming.some(mod=>!sithariSetMatch(mod,target.profile,target.character))){diagnostics.rejectedSet++;continue;}
     if(incoming.some((mod,index)=>!sithariPrimaryMatch(mod,target.profile,slots[index]))){diagnostics.rejectedPrimary++;continue;}
     const audit=ssAtomicSetSwap(target,donor,slots);
     if(!audit){diagnostics.rejectedDonorSet++;continue;}
     diagnostics.validated++;
     const items=slots.map((slot,index)=>({
      target:{...target,key:target.owner+'::'+slot,slot},
      source:{key:donor.owner+'::'+slot,owner:donor.owner,name:donor.name||donor.character?.name||donor.owner,character:donor.character,slot,mod:audit.incoming[index]},
      returnMod:audit.returned[index],
      secondary:ssSecondaryCoverage(audit.incoming[index],target.profile),
      kyber:ssKyberSecondaryFit(audit.incoming[index],target.profile),
      speed:modTotalSpeed(audit.incoming[index])
     }));
     candidates.push({items,length:size,kyberFit:items.reduce((sum,item)=>sum+item.kyber,0)/size,secondary:items.reduce((sum,item)=>sum+item.secondary,0)/size,speed:items.reduce((sum,item)=>sum+item.speed,0),audit,atomic:true});
    }
   }
  }
 }
 candidates.sort((a,b)=>b.kyberFit-a.kyberFit||b.secondary-a.secondary||b.speed-a.speed);
 const selected=[],usedTargets=new Set(),usedDonors=new Set();
 for(const candidate of candidates){
  const edge=candidate.items[0],target=edge.target.owner,donor=edge.source.owner;
  if(usedTargets.has(target)||usedDonors.has(donor))continue;
  selected.push(candidate);usedTargets.add(target);usedDonors.add(donor);
  if(selected.length>=30)break;
 }
 return {cycles:selected,expansions:diagnostics.groupsTested,closedCycles:selected.length,exhausted:false,candidateCount:candidates.length,diagnostics};
}
function ssRender(snapshot,result,message){
 const root=document.getElementById('sithariStrategy');if(!root)return;
 const needs=snapshot.nodes||[],cycles=result.cycles||[],diag=result.diagnostics||{};
 const peopleHtml=needs.length
  ?'<div class="ss-people">'+needs.map(node=>'<div><b>'+ssEsc(node.name)+'</b><span>Composition actuelle : '+ssEsc([...node.setAudit.actual.entries()].map(([name,count])=>count+' '+name).join(' · '))+'</span><small>Compositions Kyber examinées : '+ssEsc(node.setAudit.expected.map(config=>typeof config==='string'?config:config.name+' ('+Math.round(config.weight*100)+'%)').join(' / '))+'</small></div>').join('')+'</div>'
  :'<div class="ss-empty">Aucune composition incorrecte confirmée par les combinaisons exactes publiées.</div>';
 const rows=cycles.map((cycle,index)=>{
  const impacts=ssCycleImpactMap(cycle),edge=cycle.items[0],donor=impacts.get(edge.source.owner),recipient=impacts.get(edge.target.owner);
  const moves=cycle.items.map(item=>'<div class="ss-modline"><b>'+ssEsc(item.source.mod.set_name||'Set inconnu')+'</b><span>'+ssEsc(item.source.slot)+' · '+ssEsc(item.source.mod.primary_stat||'Primaire inconnue')+'</span><strong>'+num(item.speed)+' vitesse</strong><small>Retour : '+ssEsc(item.returnMod?.set_name||'Set inconnu')+' · '+ssEsc(item.returnMod?.primary_stat||'Primaire inconnue')+'</small></div>'+ssKyberAuditHtml({...item,target:{...item.target,profile:edge.target.profile}})).join('');
  return '<article class="ss-cycle"><header><b>SCÉNARIO '+String(index+1).padStart(2,'0')+'</b><span>'+cycle.length+' mods échangés en bloc</span><strong>Composition Kyber exacte · aucune perte de vitesse</strong></header><div class="ss-transfer"><div class="ss-person"><small>DONNEUR · FAIBLE / PEU UTILISÉ</small><b>'+ssEsc(edge.source.name)+'</b><span>'+ssImpactLabel(donor)+'</span></div><div class="ss-arrow">ÉCHANGE ATOMIQUE <b>⇄</b></div><div class="ss-person ss-recipient"><small>RECEVEUR PRIORITAIRE</small><b>'+ssEsc(edge.target.name)+'</b><span>'+ssImpactLabel(recipient)+'</span></div></div>'+moves+'<footer>Référence Kyber : '+Math.round(cycle.kyberFit*100)+'% · Couverture secondaire : '+Math.round(cycle.secondary*100)+'%</footer></article>';
 }).join('');
 const unverifiable=snapshot.unverifiable||[];
 const phase=sithariStepState?.phase||'profiles',busy=sithariStrategyBusy;
 const label=phase==='done'?'RECOMMENCER':phase==='profiles'?'CHARGER LES 50 PRIORITAIRES':phase==='sets'?'IDENTIFIER LES MAUVAIS SETS':phase==='donors'?'CONSTITUER LE POOL DES DONNEURS':'CALCULER LES ÉCHANGES';
 const diagnostic=phase==='done'?'<h4>BILAN DE RECHERCHE</h4><div class="ss-status">Groupes testés : '+(diag.groupsTested||result.expansions||0)+' · Candidats validés : '+(diag.validated||result.candidateCount||0)+'<br>Rejets : set incompatible '+(diag.rejectedSet||0)+' · primaire '+(diag.rejectedPrimary||0)+' · sécurité donneur '+(diag.rejectedDonorSet||0)+'</div>':'';
 const referenceNote='<div class="ss-status"><b>FIABILITÉ DES RÉFÉRENCES DE SETS</b><br>Compositions Kyber exactes : '+(snapshot.exactReferenceCount||0)+' / '+(snapshot.recipientCount||0)+' receveurs prioritaires. Compositions non vérifiables : '+unverifiable.length+'. Elles ne sont jamais déclarées conformes par défaut.</div>';
 root.innerHTML='<header class="ss-head"><div><small>SITH’ARI // STRATÈGE ULTIME</small><h3>OPTIMISATION CIBLÉE · 50 PERSONNAGES</h3><p>Audit des six mods équipés contre les compositions complètes publiées par Kyber.</p></div><button id="ss-run" type="button" '+(busy?'disabled':'')+'>'+(busy?'ÉTAPE EN COURS…':label)+'</button></header>'+
 '<div class="ss-kpis"><div><b>'+snapshot.rosterCount+'</b><span>ROSTER</span></div><div><b>'+(sithariStepState?.recipientPeople?.length||0)+'</b><span>POOL PRIORITAIRE</span></div><div><b>'+needs.length+'</b><span>COMPOSITIONS À CORRIGER</span></div><div><b>'+unverifiable.length+'</b><span>NON VÉRIFIABLES</span></div><div><b>'+cycles.length+'</b><span>ÉCHANGES VALIDÉS</span></div></div>'+
 '<div class="ss-status"><b>'+ssStepLabel(phase)+'</b><br>'+ssEsc(message)+'</div>'+referenceNote+diagnostic+'<h4>PERSONNAGES PRIORITAIRES À CORRIGER</h4>'+peopleHtml+
 (unverifiable.length?'<h4>RÉFÉRENCES INSUFFISANTES</h4><div class="ss-people">'+unverifiable.map(item=>'<div><b>'+ssEsc(item.name)+'</b><span>Sets individuels disponibles, composition exacte absente</span><small>Conformité non conclue · aucune permutation automatique</small></div>').join('')+'</div>':'')+
 '<h4>ÉCHANGES PROPOSÉS</h4><p class="ss-results-help">Les groupes de 2 ou 4 mods doivent produire exactement une composition Kyber publiée. Le donneur récupère les mods remplacés ; ses bonus de set et sa vitesse sont protégés.</p>'+(rows||'<div class="ss-empty">'+(phase==='done'?'Aucune permutation ne passe encore tous les contrôles. Le bilan ci-dessus détaille les filtres bloquants.':'Les permutations apparaîtront après le calcul des échanges.')+'</div>')+
 '<p class="ss-note">Analyse en lecture seule. Aucun mod n’est déplacé automatiquement. Les usages GAC absents restent inconnus.</p>';
 document.getElementById('ss-run')?.addEventListener('click',ssAdvance);
}



/* V4.1.33 — pipeline réel : attendre le signal GAC, auditer les 50 cibles,
   puis calculer les échanges. La cible ne perd jamais de vitesse ; le donneur
   peut en céder, mais conserve ses bonus de set. */
function ssCharacterSetAudit(mods,profile){
 const equipped=Array.isArray(mods)?mods:[];
 if(equipped.length!==6||new Set(equipped.map(ssSlot)).size!==6)return {status:'INCOMPLETE',exact:false,expected:[],actual:ssSetCompositionCounts(equipped)};
 const actual=ssSetCompositionCounts(equipped),unique=new Map();
 for(const config of (Array.isArray(profile?.specific_sets)?profile.specific_sets:[])){
  const expected=new Map();
  for(const [name,count] of Object.entries(config?.counts||{})){
   const key=sithariCanonicalSet(name),value=Number(count)||0;
   if(key&&value>0)expected.set(key,(expected.get(key)||0)+value);
  }
  const total=[...expected.values()].reduce((sum,value)=>sum+value,0);
  if(total!==6)continue;
  const signature=[...expected.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>k+':'+v).join('|');
  const item={name:String(config?.name||'Composition Kyber'),weight:Number(config?.weight)||0,expected,total};
  if(!unique.has(signature)||unique.get(signature).weight<item.weight)unique.set(signature,item);
 }
 const configs=[...unique.values()].sort((a,b)=>b.weight-a.weight);
 if(configs.length){
  const match=configs.find(config=>ssSameSetComposition(actual,config.expected));
  return {status:match?'MATCH':'MISMATCH',exact:true,expected:configs,matched:match||null,actual};
 }
 const choices=new Set(sithariKyberSetChoices(profile).map(sithariCanonicalSet));
 const allAllowed=choices.size&&[...actual.keys()].every(set=>choices.has(set));
 return {status:allAllowed?'UNVERIFIABLE':'MISMATCH',exact:false,expected:[...choices],actual};
}
function ssBuildSnapshot(state){
 const sources=[],nodes=[],unverifiable=[];
 const donorPeople=state?.donorPeople||[],recipientPeople=state?.recipientPeople||[];
 for(const donor of donorPeople){
  if(ssIsProtectedLegend(donor))continue;
  const equipped=sithariCharacterMods(donor),owner=characterKey(donor);
  if(equipped.length!==6)continue;
  for(const slot of SITHARI_SLOT_ORDER){
   const mod=equipped.find(item=>ssSlot(item)===slot);if(!mod)continue;
   sources.push({key:owner+'::'+slot,owner,name:donor.name||donor.baseId||owner,character:donor,slot,mod});
  }
 }
 for(const character of recipientPeople){
  const name=character.name||character.baseId||characterKey(character);
  const profile=sithariProfileForCharacter(character);
  if(!profile||!sithariKyberSetChoices(profile).length){
   unverifiable.push({character,name,reason:'Aucune référence Kyber exploitable pour ce personnage.'});
   continue;
  }
  const equipped=sithariCharacterMods(character);
  const audit=ssCharacterSetAudit(equipped,profile);
  if(audit.status==='UNVERIFIABLE'||audit.status==='INCOMPLETE'){
   unverifiable.push({character,name,reason:audit.status==='INCOMPLETE'?'Six mods équipés distincts non disponibles.':'Les compositions exactes de sets ne sont pas publiées.',audit});
   continue;
  }
  if(audit.status!=='MISMATCH')continue;
  const owner=characterKey(character);
  nodes.push({key:owner,owner,name,character,profile,mods:equipped.slice(),setAudit:audit,needsWork:true});
 }
 const exactReferenceCount=recipientPeople.filter(character=>{
  const p=sithariProfileForCharacter(character);
  return Array.isArray(p?.specific_sets)&&p.specific_sets.some(config=>Object.values(config?.counts||{}).reduce((sum,n)=>sum+(Number(n)||0),0)===6);
 }).length;
 return {
  nodes,sources,unverifiable,inventory:sithariEnsureModCache().items,
  rosterCount:state?.people?.length||0,recipientCount:recipientPeople.length,
  donorCount:donorPeople.length,profiledCount:recipientPeople.filter(c=>!!sithariProfileForCharacter(c)).length,
  exactReferenceCount,donorStats:state?.donorStats||null
 };
}
function ssAtomicSetSwap(target,donor,slots){
 const targetBefore=sithariCharacterMods(target.character).slice(),donorBefore=sithariCharacterMods(donor.character).slice();
 if(targetBefore.length!==6||donorBefore.length!==6||ssIsProtectedLegend(donor.character))return null;
 if(!Array.isArray(target.profile?.specific_sets)||!target.profile.specific_sets.length)return null;
 const targetBySlot=new Map(targetBefore.map(mod=>[ssSlot(mod),mod]));
 const donorBySlot=new Map(donorBefore.map(mod=>[ssSlot(mod),mod]));
 const incoming=slots.map(slot=>donorBySlot.get(slot)),returned=slots.map(slot=>targetBySlot.get(slot));
 if(incoming.some(mod=>!mod)||returned.some(mod=>!mod)||new Set(slots).size!==slots.length)return null;
 for(let i=0;i<slots.length;i++){
  if(!sithariSetMatch(incoming[i],target.profile,target.character)||!sithariPrimaryMatch(incoming[i],target.profile,slots[i]))return null;
 }
 const targetAfter=targetBefore.filter(mod=>!slots.includes(ssSlot(mod))).concat(incoming);
 const donorAfter=donorBefore.filter(mod=>!slots.includes(ssSlot(mod))).concat(returned);
 if(targetAfter.length!==6||donorAfter.length!==6)return null;
 const composition=ssCharacterSetAudit(targetAfter,target.profile);
 if(composition.status!=='MATCH'||!composition.exact)return null;
 if(!ssPreservesSetBonuses(donorBefore,donorAfter))return null;
 const targetSpeedBefore=sithariProjectedSpeed(target.character,targetBefore),targetSpeedAfter=sithariProjectedSpeed(target.character,targetAfter);
 const donorSpeedBefore=sithariProjectedSpeed(donor.character,donorBefore),donorSpeedAfter=sithariProjectedSpeed(donor.character,donorAfter);
 if(targetSpeedAfter.total+1e-9<targetSpeedBefore.total)return null;
 // La vitesse peut baisser chez le donneur : seule la cible prioritaire a un plancher absolu.
 return {targetBefore,targetAfter,donorBefore,donorAfter,incoming,returned,targetSpeedBefore,targetSpeedAfter,donorSpeedBefore,donorSpeedAfter,composition,required:slots.length};
}
async function ssAdvance(){
 if(sithariStrategyBusy)return;
 if(!sithariStepState||sithariStepState.phase==='done'){
  const people=(rosterCharacters||[]).filter(c=>rosterUnitType(c)!=='ship');
  sithariStepState={phase:'profiles',people,recipientPeople:[],donorPeople:[],profileCursor:0,snapshot:null,result:{cycles:[]},profileStats:{found:0,missing:0}};
 }
 const state=sithariStepState;sithariStrategyBusy=true;
 const show=message=>{
  state.message=message;
  ssRender(state.snapshot||{nodes:[],unverifiable:[],inventory:sithariEnsureModCache().items,rosterCount:state.people.length,recipientCount:state.recipientPeople.length,exactReferenceCount:0},state.result,message);
 };
 try{
  if(state.phase==='profiles'){
   if(window.__SWGOH_GAC_USAGE_READY__&&typeof window.__SWGOH_GAC_USAGE_READY__.then==='function'){
    try{await window.__SWGOH_GAC_USAGE_READY__;}catch(_){}
   }
   state.recipientPeople=ssRecipientPool(state.people);
   let done=0,found=0,missing=0;
   for(const character of state.recipientPeople){
    let profile=sithariProfileForCharacter(character);
    if(!profile||!sithariKyberSetChoices(profile).length){try{profile=await fetchKyberProfile(character);}catch(_){profile=null;}}
    if(profile&&sithariKyberSetChoices(profile).length)found++;else missing++;
    done++;
    const status=document.querySelector('#sithariStrategy .ss-status');
    if(status)status.innerHTML='<b>'+ssStepLabel('profiles')+'</b><br>Références examinées : '+done+' / '+state.recipientPeople.length;
   }
   state.profileStats={found,missing};
   state.phase='sets';
   show('50 personnages prioritaires examinés après chargement des données GAC : '+found+' références avec recommandations de sets exploitables, '+missing+' sans référence. Lance l’identification des sets.');
  }else if(state.phase==='sets'){
   state.snapshot=ssBuildSnapshot(state);
   state.phase='donors';
   show(state.snapshot.nodes.length+' personnages présentent une composition de sets différente des compositions Kyber exactes. '+state.snapshot.unverifiable.length+' restent non vérifiables.');
  }else if(state.phase==='donors'){
   if(window.__SWGOH_GAC_USAGE_READY__&&typeof window.__SWGOH_GAC_USAGE_READY__.then==='function'){
    try{await window.__SWGOH_GAC_USAGE_READY__;}catch(_){}
   }
   const selection=ssDonorPool(state.people,state.recipientPeople);
   state.donorPeople=selection.people;state.donorStats=selection;
   state.snapshot=ssBuildSnapshot(state);
   state.phase='permutations';
   show(selection.people.length+' donneurs validés parmi '+selection.knownCount+' personnages avec usage GAC réellement observé. Seuil faible utilisation : '+(selection.lowUseThreshold??'indisponible')+'.');
  }else if(state.phase==='permutations'){
   if(!state.donorPeople?.length){
    state.result={cycles:[],candidateCount:0,diagnostics:{targets:state.snapshot?.nodes?.length||0,donors:0,groupsTested:0,validated:0}};
    state.phase='done';
    show('Calcul arrêté : aucun donneur ne possède actuellement une observation GAC exploitable et un profil de puissance compatible. Aucune absence de données n’est assimilée à zéro utilisation.');
   }else{
    const search=ssFindCycles(state.snapshot);
    state.result.cycles=search.cycles;state.result.candidateCount=search.candidateCount;state.result.diagnostics=search.diagnostics;
    state.phase='done';
    show(search.cycles.length+' échanges validés après examen de '+search.expansions+' groupes de mods. La cible ne perd jamais de vitesse ; le donneur peut en céder sans perdre ses bonus de set.');
   }
  }
 }catch(error){
  show('Étape interrompue : '+String(error?.message||error));
  console.error('Sith’ari strategy:',error);
 }finally{
  sithariStrategyBusy=false;
  ssRender(state.snapshot||{nodes:[],unverifiable:[],inventory:sithariEnsureModCache().items,rosterCount:state.people.length,recipientCount:state.recipientPeople.length,exactReferenceCount:0},state.result,state.message||'Étape terminée.');
 }
}
function ssRender(snapshot,result,message){
 const root=document.getElementById('sithariStrategy');if(!root)return;
 const needs=snapshot.nodes||[],cycles=result.cycles||[],diag=result.diagnostics||{},unverifiable=snapshot.unverifiable||[];
 const uniqueConfigs=configs=>{
  const seen=new Set();return (configs||[]).filter(config=>{
   const signature=typeof config==='string'?config:JSON.stringify([...config.expected.entries()].sort((a,b)=>a[0].localeCompare(b[0])));
   if(seen.has(signature))return false;seen.add(signature);return true;
  });
 };
 const peopleHtml=needs.length
  ?'<div class="ss-people">'+needs.map(node=>'<div><b>'+ssEsc(node.name)+'</b><span>Composition actuelle : '+ssEsc([...node.setAudit.actual.entries()].map(([name,count])=>count+' '+name).join(' · '))+'</span><small>Compositions Kyber examinées : '+ssEsc(uniqueConfigs(node.setAudit.expected).map(config=>typeof config==='string'?config:config.name+' ('+Math.round(config.weight*100)+'%)').join(' / '))+'</small></div>').join('')+'</div>'
  :'<div class="ss-empty">Aucune composition incorrecte confirmée par une référence Kyber complète.</div>';
 const rows=cycles.map((cycle,index)=>{
  const impacts=ssCycleImpactMap(cycle),edge=cycle.items[0],donor=impacts.get(edge.source.owner),recipient=impacts.get(edge.target.owner);
  const moves=cycle.items.map(item=>'<div class="ss-modline"><b>'+ssEsc(item.source.mod.set_name||'Set inconnu')+'</b><span>'+ssEsc(item.source.slot)+' · '+ssEsc(item.source.mod.primary_stat||'Primaire inconnue')+'</span><strong>'+num(item.speed)+' vitesse</strong><small>Retour : '+ssEsc(item.returnMod?.set_name||'Set inconnu')+' · '+ssEsc(item.returnMod?.primary_stat||'Primaire inconnue')+'</small></div>'+ssKyberAuditHtml({...item,target:{...item.target,profile:edge.target.profile}})).join('');
  return '<article class="ss-cycle"><header><b>SCÉNARIO '+String(index+1).padStart(2,'0')+'</b><span>'+cycle.length+' mods échangés en bloc</span><strong>Cible : aucune perte de vitesse</strong></header><div class="ss-transfer"><div class="ss-person"><small>DONNEUR · FAIBLE / PEU UTILISÉ</small><b>'+ssEsc(edge.source.name)+'</b><span>'+ssImpactLabel(donor)+'</span></div><div class="ss-arrow">ÉCHANGE ATOMIQUE <b>⇄</b></div><div class="ss-person ss-recipient"><small>RECEVEUR PRIORITAIRE</small><b>'+ssEsc(edge.target.name)+'</b><span>'+ssImpactLabel(recipient)+'</span></div></div>'+moves+'<footer>Référence Kyber : '+Math.round(cycle.kyberFit*100)+'% · Couverture secondaire : '+Math.round(cycle.secondary*100)+'%</footer></article>';
 }).join('');
 const phase=sithariStepState?.phase||'profiles',busy=sithariStrategyBusy;
 const label=phase==='done'?'RECOMMENCER':phase==='profiles'?'CHARGER LES 50 PRIORITAIRES':phase==='sets'?'IDENTIFIER LES MAUVAIS SETS':phase==='donors'?'CONSTITUER LE POOL DES DONNEURS':'CALCULER LES ÉCHANGES';
 const diagnostic=phase==='done'?'<h4>BILAN DE RECHERCHE</h4><div class="ss-status">Groupes testés : '+(diag.groupsTested??result.expansions??0)+' · Candidats validés : '+(diag.validated??result.candidateCount??0)+'<br>Rejets : set incompatible '+(diag.rejectedSet||0)+' · primaire '+(diag.rejectedPrimary||0)+' · protection des bonus du donneur '+(diag.rejectedDonorSet||0)+'</div>':'';
 const referenceNote='<div class="ss-status"><b>FIABILITÉ DES RÉFÉRENCES DE SETS</b><br>Compositions Kyber exactes : '+(snapshot.exactReferenceCount||0)+' / '+(snapshot.recipientCount||0)+' receveurs prioritaires. Personnages non vérifiables : '+unverifiable.length+'.';
 const donorNote=snapshot.donorStats?'<br>Usage GAC observé : '+snapshot.donorStats.knownCount+' personnages · seuil bas : '+(snapshot.donorStats.lowUseThreshold??'indisponible')+' · donneurs retenus : '+snapshot.donorStats.people.length+'.':'';
 root.innerHTML='<header class="ss-head"><div><small>SITH’ARI // STRATÈGE ULTIME</small><h3>OPTIMISATION CIBLÉE · 50 PERSONNAGES</h3><p>Audit des six mods équipés contre les compositions complètes publiées par Kyber.</p></div><button id="ss-run" type="button" '+(busy?'disabled':'')+'>'+(busy?'ÉTAPE EN COURS…':label)+'</button></header>'+
 '<div class="ss-kpis"><div><b>'+snapshot.rosterCount+'</b><span>ROSTER</span></div><div><b>'+snapshot.recipientCount+'</b><span>POOL PRIORITAIRE</span></div><div><b>'+needs.length+'</b><span>COMPOSITIONS À CORRIGER</span></div><div><b>'+unverifiable.length+'</b><span>NON VÉRIFIABLES</span></div><div><b>'+cycles.length+'</b><span>ÉCHANGES VALIDÉS</span></div></div>'+
 '<div class="ss-status"><b>'+ssStepLabel(phase)+'</b><br>'+ssEsc(message)+'</div>'+referenceNote+donorNote+'</div>'+diagnostic+'<h4>PERSONNAGES PRIORITAIRES À CORRIGER</h4>'+peopleHtml+
 (unverifiable.length?'<h4>RÉFÉRENCES INSUFFISANTES</h4><div class="ss-people">'+unverifiable.map(item=>'<div><b>'+ssEsc(item.name)+'</b><span>'+ssEsc(item.reason||'Référence incomplète')+'</span><small>Conformité non conclue · aucune permutation automatique</small></div>').join('')+'</div>':'')+
 '<h4>ÉCHANGES PROPOSÉS</h4><p class="ss-results-help">Les groupes de 2 ou 4 mods doivent produire exactement une composition Kyber publiée. Le donneur récupère les mods remplacés et conserve ses bonus de set. La cible ne perd jamais de vitesse ; le donneur peut en céder.</p>'+(rows||'<div class="ss-empty">'+(phase==='done'?'Aucune permutation validée avec les donneurs actuellement identifiés. Consulte le bilan GAC et les filtres ci-dessus.':'Les permutations apparaîtront après le calcul des échanges.')+'</div>')+
 '<p class="ss-note">Analyse en lecture seule. Aucun mod n’est déplacé automatiquement. Les usages GAC absents restent inconnus, jamais assimilés à zéro.</p>';
 document.getElementById('ss-run')?.addEventListener('click',ssAdvance);
}


/* V4.1.34 — recherche multi-donneurs et diagnostic par filtre.
   Un receveur peut obtenir les pièces d'un set depuis plusieurs donneurs.
   Chaque donneur rend le mod remplacé sur le même slot et conserve ses bonus.
   La vitesse du receveur est un plancher absolu ; celle du donneur peut baisser. */
function ssFindCycles(snapshot){
 const diagnostics={
  targets:0,donors:new Set((snapshot.sources||[]).map(x=>x.owner)).size,
  groupsTested:0,rawBySlot:{},setCandidates:0,primaryCandidates:0,
  donorSetCandidates:0,targetCappedCount:0,rejectedSet:0,rejectedPrimary:0,
  rejectedDonorSet:0,rejectedComposition:0,rejectedSpeed:0,validated:0,
  capped:false
 };
 const candidates=[];
 const MAX_GROUPS=200000,MAX_GROUPS_PER_TARGET=4000,MAX_PER_SLOT=16;
 for(const target of snapshot.nodes||[]){
  diagnostics.targets++;
  let targetGroups=0,targetCapped=false;
  const targetBefore=sithariCharacterMods(target.character).slice();
  if(targetBefore.length!==6)continue;
  const targetBySlot=new Map(targetBefore.map(mod=>[ssSlot(mod),mod]));
  const eligibleBySlot=new Map();
  for(const slot of SITHARI_SLOT_ORDER){
   const old=targetBySlot.get(slot),pool=[];
   if(!old){eligibleBySlot.set(slot,pool);continue;}
   for(const source of snapshot.sources||[]){
    if(source.owner===target.owner||source.slot!==slot||ssIsProtectedLegend(source.character))continue;
    if(!sithariSetMatch(source.mod,target.profile,target.character)){diagnostics.rejectedSet++;continue;}
    diagnostics.setCandidates++;
    if(!sithariPrimaryMatch(source.mod,target.profile,slot)){diagnostics.rejectedPrimary++;continue;}
    diagnostics.primaryCandidates++;
    const donorBefore=sithariCharacterMods(source.character).slice();
    if(donorBefore.length!==6)continue;
    const donorAfter=donorBefore.filter(mod=>ssSlot(mod)!==slot).concat([old]);
    if(donorAfter.length!==6||!ssPreservesSetBonuses(donorBefore,donorAfter)){diagnostics.rejectedDonorSet++;continue;}
    diagnostics.donorSetCandidates++;
    pool.push({
     target:{...target,slot},source,returnMod:old,
     secondary:ssSecondaryCoverage(source.mod,target.profile),
     kyber:ssKyberSecondaryFit(source.mod,target.profile),
     speed:modTotalSpeed(source.mod)
    });
   }
   pool.sort((a,b)=>b.kyber-a.kyber||b.secondary-a.secondary||b.speed-a.speed);
   eligibleBySlot.set(slot,pool.slice(0,MAX_PER_SLOT));
   diagnostics.rawBySlot[slot]={compatibleSet:diagnostics.rawBySlot[slot]?.compatibleSet||0,compatiblePrimary:diagnostics.rawBySlot[slot]?.compatiblePrimary||0,donorSafe:diagnostics.rawBySlot[slot]?.donorSafe||0};
   diagnostics.rawBySlot[slot].compatibleSet+=pool.length;
   diagnostics.rawBySlot[slot].compatiblePrimary+=pool.length;
   diagnostics.rawBySlot[slot].donorSafe+=pool.length;
  }
  for(const size of [2,4]){
   for(const slots of ssCombinations(SITHARI_SLOT_ORDER,size)){
    if(slots.some(slot=>!(eligibleBySlot.get(slot)||[]).length))continue;
    const chosen=[],usedDonors=new Set();
    const walk=(index)=>{
     if(diagnostics.groupsTested>=MAX_GROUPS){diagnostics.capped=true;return;}
     if(targetGroups>=MAX_GROUPS_PER_TARGET){targetCapped=true;return;}
     if(index===slots.length){
      diagnostics.groupsTested++;targetGroups++;
      const incoming=chosen.map(item=>item.source.mod);
      const targetAfter=targetBefore.filter(mod=>!slots.includes(ssSlot(mod))).concat(incoming);
      if(targetAfter.length!==6||new Set(targetAfter.map(ssSlot)).size!==6){diagnostics.rejectedComposition++;return;}
      const composition=ssCharacterSetAudit(targetAfter,target.profile);
      if(composition.status!=='MATCH'||!composition.exact){diagnostics.rejectedComposition++;return;}
      const beforeSpeed=sithariProjectedSpeed(target.character,targetBefore);
      const afterSpeed=sithariProjectedSpeed(target.character,targetAfter);
      if(afterSpeed.total+1e-9<beforeSpeed.total){diagnostics.rejectedSpeed++;return;}
      diagnostics.validated++;
      const items=chosen.map(item=>({...item,target:{...target,slot:item.source.slot}}));
      candidates.push({
       items,length:items.length,kyberFit:items.reduce((sum,item)=>sum+item.kyber,0)/items.length,
       secondary:items.reduce((sum,item)=>sum+item.secondary,0)/items.length,
       speed:items.reduce((sum,item)=>sum+item.speed,0),
       audit:{targetBefore,targetAfter,composition},atomic:true
      });
      return;
     }
     for(const item of eligibleBySlot.get(slots[index])||[]){
      const owner=item.source.owner;
      if(usedDonors.has(owner))continue;
      usedDonors.add(owner);chosen.push(item);walk(index+1);chosen.pop();usedDonors.delete(owner);
      if(diagnostics.capped||targetCapped)return;
     }
    };
    walk(0);
    if(diagnostics.capped)break;
   }
   if(diagnostics.capped)break;
  }
  if(diagnostics.capped)break;
 }
 candidates.sort((a,b)=>b.kyberFit-a.kyberFit||b.secondary-a.secondary||b.speed-a.speed);
 const selected=[],usedTargets=new Set(),usedDonors=new Set();
 for(const candidate of candidates){
  const target=candidate.items[0].target.owner;
  const donors=candidate.items.map(item=>item.source.owner);
  if(usedTargets.has(target)||donors.some(owner=>usedDonors.has(owner)))continue;
  selected.push(candidate);usedTargets.add(target);donors.forEach(owner=>usedDonors.add(owner));
  if(selected.length>=30)break;
 }
 diagnostics.donors=[...new Set((snapshot.sources||[]).map(x=>x.owner))].length;
 return {cycles:selected,expansions:diagnostics.groupsTested,closedCycles:selected.length,exhausted:diagnostics.capped,candidateCount:candidates.length,diagnostics};
}
function ssCycleImpactMap(cycle){
 const affected=new Map();
 const ensure=(character,owner,name)=>{
  if(!affected.has(owner)){
   const beforeMods=sithariCharacterMods(character).slice();
   affected.set(owner,{character,name,beforeMods,afterMods:beforeMods.slice()});
  }
  return affected.get(owner);
 };
 for(const item of cycle.items||[]){
  const target=ensure(item.target.character,item.target.owner,item.target.name);
  target.afterMods=target.afterMods.filter(mod=>ssSlot(mod)!==item.target.slot);
  target.afterMods.push(item.source.mod);
  const donor=ensure(item.source.character,item.source.owner,item.source.name);
  donor.afterMods=donor.afterMods.filter(mod=>ssSlot(mod)!==item.source.slot);
  donor.afterMods.push(item.returnMod);
 }
 for(const item of affected.values()){
  item.before=sithariProjectedSpeed(item.character,item.beforeMods);
  item.after=sithariProjectedSpeed(item.character,item.afterMods);
  item.delta=Number(item.after.total||item.after.modSpeed||0)-Number(item.before.total||item.before.modSpeed||0);
 }
 return affected;
}
function ssRender(snapshot,result,message){
 const root=document.getElementById('sithariStrategy');if(!root)return;
 const needs=snapshot.nodes||[],cycles=result.cycles||[],diag=result.diagnostics||{},unverifiable=snapshot.unverifiable||[];
 const uniqueConfigs=configs=>{
  const seen=new Set();return (configs||[]).filter(config=>{
   const signature=typeof config==='string'?config:JSON.stringify([...config.expected.entries()].sort((a,b)=>a[0].localeCompare(b[0])));
   if(seen.has(signature))return false;seen.add(signature);return true;
  });
 };
 const peopleHtml=needs.length
  ?'<div class="ss-people">'+needs.map(node=>'<div><b>'+ssEsc(node.name)+'</b><span>Composition actuelle : '+ssEsc([...node.setAudit.actual.entries()].map(([name,count])=>count+' '+name).join(' · '))+'</span><small>Compositions Kyber examinées : '+ssEsc(uniqueConfigs(node.setAudit.expected).map(config=>typeof config==='string'?config:config.name+' ('+Math.round(config.weight*100)+'%)').join(' / '))+'</small></div>').join('')+'</div>'
  :'<div class="ss-empty">Aucune composition incorrecte confirmée par une référence Kyber complète.</div>';
 const rows=cycles.map((cycle,index)=>{
  const impacts=ssCycleImpactMap(cycle),edge=cycle.items[0],recipient=impacts.get(edge.target.owner);
  const donorNames=[...new Set(cycle.items.map(item=>item.source.name))];
  const donorImpact=cycle.items.map(item=>impacts.get(item.source.owner)).filter(Boolean);
  const donorHtml=donorImpact.map(impact=>'<div class="ss-person"><small>DONNEUR · FAIBLE / PEU UTILISÉ</small><b>'+ssEsc(impact.name)+'</b><span>'+ssImpactLabel(impact)+'</span></div>').join('');
  const moves=cycle.items.map(item=>'<div class="ss-modline"><b>'+ssEsc(item.source.mod.set_name||'Set inconnu')+'</b><span>'+ssEsc(item.source.slot)+' · '+ssEsc(item.source.mod.primary_stat||'Primaire inconnue')+'</span><strong>'+num(item.speed)+' vitesse</strong><small>Retour chez le donneur : '+ssEsc(item.returnMod?.set_name||'Set inconnu')+' · '+ssEsc(item.returnMod?.primary_stat||'Primaire inconnue')+'</small></div>'+ssKyberAuditHtml({...item,target:{...item.target,profile:edge.target.profile}})).join('');
  return '<article class="ss-cycle"><header><b>SCÉNARIO '+String(index+1).padStart(2,'0')+'</b><span>'+cycle.length+' mods · '+donorNames.length+' donneur(s)</span><strong>Cible : aucune perte de vitesse</strong></header><div class="ss-transfer">'+donorHtml+'<div class="ss-arrow">TRANSFERTS COORDONNÉS <b>⇄</b></div><div class="ss-person ss-recipient"><small>RECEVEUR PRIORITAIRE</small><b>'+ssEsc(edge.target.name)+'</b><span>'+ssImpactLabel(recipient)+'</span></div></div>'+moves+'<footer>Référence Kyber : '+Math.round(cycle.kyberFit*100)+'% · Couverture secondaire : '+Math.round(cycle.secondary*100)+'%</footer></article>';
 }).join('');
 const phase=sithariStepState?.phase||'profiles',busy=sithariStrategyBusy;
 const label=phase==='done'?'RECOMMENCER':phase==='profiles'?'CHARGER LES 50 PRIORITAIRES':phase==='sets'?'IDENTIFIER LES MAUVAIS SETS':phase==='donors'?'CONSTITUER LE POOL DES DONNEURS':'CALCULER LES ÉCHANGES';
 const diagnostic=phase==='done'?'<h4>BILAN DE RECHERCHE</h4><div class="ss-status">Groupes testés : '+(diag.groupsTested??result.expansions??0)+' · Combinaisons validées : '+(diag.validated??result.candidateCount??0)+' · Scénarios retenus : '+cycles.length+'<br>Donneurs examinés : '+(diag.donors||0)+' · Candidats après set/primaire/sécurité donneur : '+(diag.donorSetCandidates||0)+'<br>Rejets : set '+(diag.rejectedSet||0)+' · primaire '+(diag.rejectedPrimary||0)+' · bonus donneur '+(diag.rejectedDonorSet||0)+' · composition Kyber '+(diag.rejectedComposition||0)+' · vitesse cible '+(diag.rejectedSpeed||0)+' · receveurs plafonnés '+(diag.targetCappedCount||0)+(diag.capped?' · plafond global atteint':'')+'</div>':'';
 const referenceNote='<div class="ss-status"><b>FIABILITÉ DES RÉFÉRENCES DE SETS</b><br>Compositions Kyber exactes : '+(snapshot.exactReferenceCount||0)+' / '+(snapshot.recipientCount||0)+' receveurs prioritaires. Personnages non vérifiables : '+unverifiable.length+'.';
 const donorNote=snapshot.donorStats?'<br>Usage GAC observé : '+snapshot.donorStats.knownCount+' personnages · seuil bas : '+(snapshot.donorStats.lowUseThreshold??'indisponible')+' · donneurs retenus : '+snapshot.donorStats.people.length+'.':'';
 root.innerHTML='<header class="ss-head"><div><small>SITH’ARI // STRATÈGE ULTIME</small><h3>OPTIMISATION CIBLÉE · 50 PERSONNAGES</h3><p>Recherche multi-donneurs : plusieurs personnages faibles peuvent céder des mods au même receveur. Chaque donneur récupère le mod remplacé sur le même emplacement.</p></div><button id="ss-run" type="button" '+(busy?'disabled':'')+'>'+(busy?'ÉTAPE EN COURS…':label)+'</button></header>'+
 '<div class="ss-kpis"><div><b>'+snapshot.rosterCount+'</b><span>ROSTER</span></div><div><b>'+snapshot.recipientCount+'</b><span>POOL PRIORITAIRE</span></div><div><b>'+needs.length+'</b><span>COMPOSITIONS À CORRIGER</span></div><div><b>'+unverifiable.length+'</b><span>NON VÉRIFIABLES</span></div><div><b>'+cycles.length+'</b><span>ÉCHANGES VALIDÉS</span></div></div>'+
 '<div class="ss-status"><b>'+ssStepLabel(phase)+'</b><br>'+ssEsc(message)+'</div>'+referenceNote+donorNote+'</div>'+diagnostic+'<h4>PERSONNAGES PRIORITAIRES À CORRIGER</h4>'+peopleHtml+
 (unverifiable.length?'<h4>RÉFÉRENCES INSUFFISANTES</h4><div class="ss-people">'+unverifiable.map(item=>'<div><b>'+ssEsc(item.name)+'</b><span>'+ssEsc(item.reason||'Référence incomplète')+'</span><small>Conformité non conclue · aucune permutation automatique</small></div>').join('')+'</div>':'')+
 '<h4>ÉCHANGES PROPOSÉS</h4><p class="ss-results-help">Les mods peuvent venir de plusieurs donneurs, mais chaque emplacement est échangé en retour. La composition finale doit correspondre exactement à une référence Kyber, les bonus de set des donneurs sont préservés et la cible ne perd jamais de vitesse.</p>'+(rows||'<div class="ss-empty">'+(phase==='done'?'Aucune permutation validée. Le bilan sépare désormais les rejets de chaque filtre et indique si la recherche a atteint son plafond.':'Les permutations apparaîtront après le calcul des échanges.')+'</div>')+
 '<p class="ss-note">Analyse en lecture seule. Aucun mod n’est déplacé automatiquement. Les usages GAC absents restent inconnus, jamais assimilés à zéro.</p>';
 document.getElementById('ss-run')?.addEventListener('click',ssAdvance);
}
