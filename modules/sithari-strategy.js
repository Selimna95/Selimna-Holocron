/* Sith'ari: analyse cumulative du roster, en lecture seule.
   Pipeline unique: set -> primaire -> secondaires -> références Kyber. */
let sithariStrategyBusy=false;
let sithariStrategySnapshot=null;
const ssEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ssId=m=>String(m?.game_id??m?.id??m?._index??'');
const ssSlot=m=>modSlotLabel(m?.slot??m?.slot_id??m?.slotId??m?.modSlot);
function ssBuildSnapshot(){
 const nodes=[],people=(rosterCharacters||[]).filter(c=>rosterUnitType(c)!=='ship');
 for(const c of people){
  const p=sithariProfileForCharacter(c);if(!p)continue;
  const key=characterKey(c),equipped=sithariCharacterMods(c);
  for(const slot of SITHARI_SLOT_ORDER){
   const mod=equipped.find(m=>ssSlot(m)===slot);if(!mod)continue;
   const setOk=sithariSetMatch(mod,p,c),primaryOk=sithariPrimaryMatch(mod,p,slot);
   nodes.push({key:key+'::'+slot,owner:key,name:c.name||c.baseId||key,character:c,profile:p,slot,mod,setOk,primaryOk,needsWork:!setOk||!primaryOk});
  }
 }
 return {nodes,inventory:sithariEnsureModCache().items,rosterCount:people.length,profiledCount:new Set(nodes.map(n=>n.owner)).size};
}
function ssBuildEdges(snapshot){
 const bySlot=new Map();for(const n of snapshot.nodes){if(!bySlot.has(n.slot))bySlot.set(n.slot,[]);bySlot.get(n.slot).push(n);}
 const edges=new Map();let setCandidates=0,primaryCandidates=0;
 for(const target of snapshot.nodes){
  // Keep already-conforming slots in the graph: they may receive a safe replacement in a closed cycle.
  const setPool=(bySlot.get(target.slot)||[]).filter(source=>source.owner!==target.owner&&sithariSetMatch(source.mod,target.profile,target.character));
  setCandidates+=setPool.length;
  const primaryPool=setPool.filter(source=>sithariPrimaryMatch(source.mod,target.profile,target.slot));
  primaryCandidates+=primaryPool.length;
  const ranked=primaryPool.map(source=>({target,source,secondary:sithariSecondaryScore(source.mod,target.profile),speed:modTotalSpeed(source.mod)}))
   .sort((a,b)=>b.secondary-a.secondary||b.speed-a.speed).slice(0,8);
  edges.set(target.key,ranked);
 }
 return {edges,setCandidates,primaryCandidates};
}
function ssFindCycles(edges){
 const found=new Map(),starts=[...edges.keys()].sort(),maxLength=4;
 for(const start of starts){
  const walk=(at,path,used)=>{
   if(path.length>=maxLength)return;
   for(const edge of edges.get(at)||[]){
    const next=edge.source.key;
    if(next===start&&path.length>=1){
     const cycle=[...path,edge],sig=cycle.map(x=>x.target.key).sort().join('|');
     if(!found.has(sig))found.set(sig,cycle);continue;
    }
    if(used.has(next)||next<start)continue;
    const nextUsed=new Set(used);nextUsed.add(next);walk(next,[...path,edge],nextUsed);
   }
  };walk(start,[],new Set([start]));
 }
 return [...found.values()].map(items=>({items,length:items.length,
  secondary:items.reduce((s,x)=>s+x.secondary,0)/items.length,
  kyberFit:items.reduce((s,x)=>s+sithariSecondaryScore(x.source.mod,x.target.profile),0)/items.length,
  speed:items.reduce((s,x)=>s+x.speed,0)
 })).sort((a,b)=>b.kyberFit-a.kyberFit||b.secondary-a.secondary||b.speed-a.speed).slice(0,30);
}
function ssRender(snapshot,result,message){
 const root=document.getElementById('sithariStrategy');if(!root)return;
 const needs=snapshot.nodes.filter(n=>n.needsWork),setBad=needs.filter(n=>!n.setOk).length,primaryBad=needs.filter(n=>!n.primaryOk).length;
 const rows=result.cycles.map((cycle,i)=>{
  const moves=cycle.items.map(e=>'<div class="ss-move"><span>'+ssEsc(e.source.name)+'</span><i>→</i><b>'+ssEsc(e.target.name)+'</b><small>'+ssEsc(e.source.mod.set_name||'Set ?')+' · '+ssEsc(e.source.mod.primary_stat||'Primaire ?')+' · '+num(modTotalSpeed(e.source.mod))+' vit.</small></div>').join('');
  return '<article class="ss-cycle"><header><b>SCÉNARIO '+String(i+1).padStart(2,'0')+'</b><span>'+cycle.length+' personnages</span><strong>Kyber '+Math.round(cycle.kyberFit*100)+'%</strong></header>'+moves+'<footer>Secondaires : '+Math.round(cycle.secondary*100)+'% · Vitesse des mods transférés : '+num(cycle.speed)+'</footer></article>';
 }).join('');
 root.innerHTML='<header class="ss-head"><div><small>SITH’ARI // STRATÈGE ULTIME</small><h3>ANALYSE CUMULATIVE DU ROSTER</h3><p>Un inventaire unique. Chaque filtre affine les possibilités conservées par le précédent.</p></div><button id="ss-run" type="button" '+(sithariStrategyBusy?'disabled':'')+'>'+(sithariStrategyBusy?'ANALYSE EN COURS…':'LANCER L’ANALYSE')+'</button></header>'+
 '<div class="ss-kpis"><div><b>'+snapshot.rosterCount+'</b><span>PERSONNAGES</span></div><div><b>'+snapshot.inventory.length+'</b><span>MODS</span></div><div><b>'+needs.length+'</b><span>SLOTS À AMÉLIORER</span></div><div><b>'+result.cycles.length+'</b><span>PERMUTATIONS</span></div></div>'+
 '<div class="ss-pipeline"><div><b>01 · SETS</b><strong>'+setBad+'</strong><small>'+result.setCandidates+' correspondances</small></div><i>→</i><div><b>02 · PRIMAIRES</b><strong>'+primaryBad+'</strong><small>'+result.primaryCandidates+' conservées</small></div><i>→</i><div><b>03 · SECONDAIRES</b><strong>'+result.secondaryCandidates+'</strong><small>classées sans filtre arbitraire</small></div><i>→</i><div><b>04 · KYBER</b><strong>'+result.cycles.length+'</strong><small>scénarios comparés</small></div></div>'+
 '<div class="ss-status">'+ssEsc(message)+'</div><h4>PERMUTATIONS EN CHAÎNE</h4>'+(rows||'<div class="ss-empty">Aucune permutation circulaire complète trouvée. Les mods restent inchangés ; aucune proposition partielle n’est présentée comme réalisable.</div>')+
 '<p class="ss-note">Prototype en lecture seule. Chaque cycle présenté attribue à chaque personnage un mod compatible avec son slot, son set et sa primaire. Aucune modification n’est appliquée.</p>';
 document.getElementById('ss-run')?.addEventListener('click',ssRun);
}
async function ssRun(){
 if(sithariStrategyBusy)return;sithariStrategyBusy=true;
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
 const snapshot=ssBuildSnapshot(),built=ssBuildEdges(snapshot),cycles=ssFindCycles(built.edges);
 const secondaryCandidates=[...built.edges.values()].reduce((n,a)=>n+a.length,0);
 sithariStrategySnapshot=snapshot;sithariStrategyBusy=false;
 ssRender(snapshot,{...built,secondaryCandidates,cycles},'Analyse terminée : '+snapshot.profiledCount+' personnages avec référence Kyber exploitable sur '+snapshot.rosterCount+'.');
}
function renderSithariStrategy(){
 const people=(rosterCharacters||[]).filter(c=>rosterUnitType(c)!=='ship');
 ssRender({nodes:[],inventory:sithariEnsureModCache().items,rosterCount:people.length,profiledCount:0},
  {setCandidates:0,primaryCandidates:0,secondaryCandidates:0,cycles:[]},
  people.length?'Inventaire prêt. Lance l’analyse pour récupérer les références Kyber.':'Charge ton Ally Code pour analyser le roster.');
}
