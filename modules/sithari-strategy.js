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
