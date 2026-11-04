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
   const p=sithariProfileForCharacter(c);if(!p)continue;
   const setOk=sithariSetMatch(mod,p,c),primaryOk=sithariPrimaryMatch(mod,p,slot);
   nodes.push({...source,profile:p,setOk,primaryOk,needsWork:!setOk||!primaryOk});
  }
 }
 return {nodes,sources,inventory:sithariEnsureModCache().items,rosterCount:people.length,profiledCount:new Set(nodes.map(n=>n.owner)).size};
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
 const MAX_EDGES_PER_SLOT=16,MAX_EXPANSIONS=48000,MAX_CLOSED_CYCLES=2400,YIELD_EVERY=160;
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
function ssRender(snapshot,result,message){
 const root=document.getElementById('sithariStrategy');if(!root)return;
 const needs=snapshot.nodes.filter(n=>n.needsWork),setBad=needs.filter(n=>!n.setOk).length,primaryBad=needs.filter(n=>!n.primaryOk).length;
 const peopleSummary=[...needs.reduce((map,node)=>{const item=map.get(node.owner)||{name:node.name,slots:0,sets:0,primaries:0};item.slots++;if(!node.setOk)item.sets++;if(!node.primaryOk)item.primaries++;map.set(node.owner,item);return map;},new Map()).values()].sort((a,b)=>b.slots-a.slots||a.name.localeCompare(b.name,'fr'));
 const peopleHtml=peopleSummary.length?'<div class="ss-people">'+peopleSummary.map(person=>'<div><b>'+ssEsc(person.name)+'</b><span>'+person.slots+' slot(s) à revoir</span><small>'+person.sets+' set(s) · '+person.primaries+' primaire(s)</small></div>').join('')+'</div>':'<div class="ss-empty">Aucun emplacement équipé hors critères Set / primaire parmi les personnages disposant d’une référence Kyber.</div>';
 const rows=result.cycles.map((cycle,i)=>{
  const moves=cycle.items.map(e=>'<div class="ss-move"><span>'+ssEsc(e.source.name)+'</span><i>→</i><b>'+ssEsc(e.target.name)+'</b><small>'+ssEsc(e.source.mod.set_name||'Set ?')+' · '+ssEsc(e.source.mod.primary_stat||'Primaire ?')+' · '+num(modTotalSpeed(e.source.mod))+' vit.</small></div>').join('');
  return '<article class="ss-cycle"><header><b>SCÉNARIO '+String(i+1).padStart(2,'0')+'</b><span>'+cycle.length+' personnages</span><strong>Kyber '+Math.round(cycle.kyberFit*100)+'%</strong></header>'+moves+'<footer>Couverture secondaires : '+Math.round(cycle.secondary*100)+'% · Référence Kyber : '+Math.round(cycle.kyberFit*100)+'% · Vitesse mods : '+num(cycle.speed)+'</footer></article>';
 }).join('');
 root.innerHTML='<header class="ss-head"><div><small>SITH’ARI // STRATÈGE ULTIME</small><h3>ANALYSE CUMULATIVE DU ROSTER</h3><p>Un inventaire unique. Chaque filtre affine les possibilités conservées par le précédent.</p></div><button id="ss-run" type="button" '+(sithariStrategyBusy?'disabled':'')+'>'+(sithariStrategyBusy?'ANALYSE EN COURS…':'LANCER L’ANALYSE')+'</button></header>'+
 '<div class="ss-kpis"><div><b>'+snapshot.rosterCount+'</b><span>PERSONNAGES</span></div><div><b>'+snapshot.inventory.length+'</b><span>MODS</span></div><div><b>'+needs.length+'</b><span>SLOTS À AMÉLIORER</span></div><div><b>'+result.cycles.length+'</b><span>PERMUTATIONS</span></div></div>'+
 '<div class="ss-pipeline"><div><b>01 · SETS</b><strong>'+setBad+'</strong><small>'+result.setCandidates+' correspondances</small></div><i>→</i><div><b>02 · PRIMAIRES</b><strong>'+primaryBad+'</strong><small>'+result.primaryCandidates+' conservées</small></div><i>→</i><div><b>03 · SECONDAIRES</b><strong>'+result.secondaryCandidates+'</strong><small>classées sans filtre arbitraire</small></div><i>→</i><div><b>04 · KYBER</b><strong>'+result.cycles.length+'</strong><small>scénarios comparés</small></div></div>'+
 '<div class="ss-status">'+ssEsc(message)+'</div><h4>PERSONNAGES HORS CRITÈRES KYBER</h4>'+peopleHtml+'<h4>PERMUTATIONS EN CHAÎNE</h4>'+(rows||'<div class="ss-empty">Aucune permutation circulaire complète trouvée. Les mods restent inchangés ; aucune proposition partielle n’est présentée comme réalisable.</div>')+
 '<p class="ss-note">Prototype en lecture seule. Chaque cycle présenté attribue à chaque personnage un mod compatible avec son slot, son set et sa primaire. Aucune modification n’est appliquée.</p>';
 document.getElementById('ss-run')?.addEventListener('click',ssRun);
}
async function ssRun(){
 if(sithariStrategyBusy)return;sithariStrategyBusy=true;
 try{
 const people=(rosterCharacters||[]).filter(c=>rosterUnitType(c)!=='ship');
 const empty={nodes:[],inventory:sithariEnsureModCache().items,rosterCount:people.length,profiledCount:0};
 ssRender(empty,{setCandidates:0,primaryCandidates:0,secondaryCandidates:0,cycles:[]},'Récupération des références Kyber…');
 let cursor=0,done=0;
 await Promise.all(Array.from({length:4},async()=>{
  while(cursor<people.length){
   const c=people[cursor++];if(!sithariProfileForCharacter(c)){try{await fetchKyberProfile(c);}catch(_){}}
   done++;const status=document.querySelector('#sithariStrategy .ss-status');if(status)status.textContent='Références examinées : '+done+' / '+people.length;
  }
 }));
 const snapshot=ssBuildSnapshot(),built=ssBuildEdges(snapshot),search=await ssFindCycles(built.edges),cycles=search.cycles;
 const secondaryCandidates=built.secondaryCandidates;
 sithariStrategySnapshot=snapshot;sithariStrategyBusy=false;
 ssRender(snapshot,{...built,secondaryCandidates,cycles},'Analyse terminée : '+snapshot.profiledCount+' personnages avec référence Kyber exploitable sur '+snapshot.rosterCount+'. '+(search.exhausted?'Exploration plafonnée pour préserver le navigateur. ':'')+search.expansions+' étapes examinées.');
 }catch(error){
  sithariStrategyBusy=false;
  const root=document.getElementById('sithariStrategy');
  if(root){const status=root.querySelector('.ss-status');if(status)status.textContent='Analyse interrompue : '+String(error?.message||error);}
  console.error('Sith’ari strategy:',error);
 }
}
function renderSithariStrategy(){
 const people=(rosterCharacters||[]).filter(c=>rosterUnitType(c)!=='ship');
 ssRender({nodes:[],inventory:sithariEnsureModCache().items,rosterCount:people.length,profiledCount:0},
  {setCandidates:0,primaryCandidates:0,secondaryCandidates:0,cycles:[]},
  people.length?'Inventaire prêt. Lance l’analyse pour récupérer les références Kyber.':'Charge ton Ally Code pour analyser le roster.');
}
