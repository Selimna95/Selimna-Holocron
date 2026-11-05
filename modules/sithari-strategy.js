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
function ssIsProtectedLegend(character){
 const base=String(character?.baseId||character?.base_id||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 return typeof HOLOCRON_GALACTIC_LEGENDS!=='undefined'&&HOLOCRON_GALACTIC_LEGENDS instanceof Set&&HOLOCRON_GALACTIC_LEGENDS.has(base);
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
  // Preserve every existing active 2- or 4-piece set bonus.
  if(!ssPreservesSetBonuses(beforeMods,entry.mods))return false;
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
 '<div class="ss-kpis"><div><b>'+snapshot.rosterCount+'</b><span>PERSONNAGES</span></div><div><b>'+(sithariStepState?.profileStats?.found??snapshot.profiledCount??0)+'</b><span>PROFILS KYBER</span></div><div><b>'+snapshot.inventory.length+'</b><span>MODS</span></div><div><b>'+needs.length+'</b><span>SLOTS À AMÉLIORER</span></div><div><b>'+(result.cycles||[]).length+'</b><span>PERMUTATIONS</span></div></div>'+
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
   await Promise.all(Array.from({length:4},async()=>{while(cursor<items.length){const c=items[cursor++];let profile=sithariProfileForCharacter(c);if(!profile){try{profile=await fetchKyberProfile(c);}catch(_){profile=null;}}if(profile)found++;else missing++;done++;const status=document.querySelector('#sithariStrategy .ss-status');if(status)status.innerHTML='<b>'+ssStepLabel('profiles')+'</b><br>Profils traités dans ce lot : '+done+' / '+items.length;}}));
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

