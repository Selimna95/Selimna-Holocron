/* Global impact and hard speed-safety gates for Seigneur Sith.
 * Loaded after modules/seigneur.js; dependencies are resolved at call time.
 */
function forgeBuildPreservesSpeed(character,profile,equipped,build){
  if(!Array.isArray(build)||build.length!==6)return false;
  const slots=new Set(build.map(m=>optimizerSlotKey(m?.slot)));
  if(slots.size!==6||slots.has(''))return false;
  const before=forgeProjectedModSpeed(character,profile,equipped);
  const after=forgeProjectedModSpeed(character,profile,build);
  if(!before.complete||!after.complete)return false;
  if(before.baseSpeed<=0&&before.hasFourPieceSpeedSet&&!after.hasFourPieceSpeedSet)return false;
  return after.total+1e-9>=before.total;
}

function forgeBuildGlobalImpact(character,profile,build){
  const targetKey=characterKey(character),resolver=buildRosterOwnerResolver(rosterCharacters);
  const targetBefore=forgeProjectedModSpeed(character,profile,getCharacterMods(character));
  const targetAfter=forgeProjectedModSpeed(character,profile,build);
  const targetPriority=seigneurDonorPriority(character);
  const groups=new Map();
  for(const mod of Array.isArray(build)?build:[]){
    const ownerKey=mod?._sourceOwnerKey||resolveModOwnerKey(mod,resolver);
    if(!ownerKey||ownerKey===targetKey)continue;
    const owner=rosterCharacters.find(c=>characterKey(c)===ownerKey);
    if(!owner)continue;
    if(!groups.has(ownerKey))groups.set(ownerKey,{owner,mods:[]});
    groups.get(ownerKey).mods.push(mod);
  }
  const statusRank={'BONS':0,'MOYENS':1,'FAIBLES':2,'TRÈS FAIBLES':3,'INCOMPLETS':4,'SANS MODS':5,'SANS MOD':5,'DONNÉES INCOMPLÈTES':6};
  const donors=[...groups.values()].map(({owner,mods:removed})=>{
    const beforeMods=getCharacterMods(owner);
    const removedIds=new Set(removed.map(m=>String(m?.game_id||m?.id||'')).filter(Boolean));
    const removedSlots=new Set(removed.map(m=>optimizerSlotKey(m?.slot)).filter(Boolean));
    const afterMods=beforeMods.filter(m=>{
      const id=String(m?.game_id||m?.id||'');
      return !(id&&removedIds.has(id))&&!removedSlots.has(optimizerSlotKey(m?.slot));
    });
    const donorProfile=optimizerProfileForCharacter(owner)||{};
    const before=forgeProjectedModSpeed(owner,donorProfile,beforeMods);
    const after=forgeProjectedModSpeed(owner,donorProfile,afterMods);
    const beforeStatus=v176ModStatus(beforeMods).status;
    const afterStatus=v176ModStatus(afterMods).status;
    const priority=seigneurDonorPriority(owner);
    return {
      name:owner?.name||owner?.baseId||'Donneur',modsTaken:removed.length,
      beforeCount:beforeMods.length,afterCount:afterMods.length,
      beforeSpeed:before.complete?before.total:null,afterSpeed:after.complete?after.total:null,
      speedLoss:before.complete&&after.complete?before.total-after.total:null,
      beforeStatus,afterStatus,
      statusWorsened:(statusRank[afterStatus]??6)>(statusRank[beforeStatus]??6),
      uses:priority.known?priority.uses:null,priorityKnown:priority.known
    };
  }).sort((a,b)=>Number(b.speedLoss??-Infinity)-Number(a.speedLoss??-Infinity));
  const priorityGapKnown=targetPriority.known&&donors.every(d=>d.priorityKnown);
  const priorityGap=priorityGapKnown?donors.reduce((sum,d)=>sum+(targetPriority.uses-d.uses)*d.modsTaken,0):null;
  const usage=seigneurLatestGacUsageSeason();
  return {
    targetBefore:targetBefore.complete?targetBefore.total:null,targetAfter:targetAfter.complete?targetAfter.total:null,
    targetSpeedGain:targetBefore.complete&&targetAfter.complete?targetAfter.total-targetBefore.total:null,
    targetUses:targetPriority.known?targetPriority.uses:null,
    donorSpeedLoss:donors.every(d=>d.speedLoss!=null)?donors.reduce((sum,d)=>sum+d.speedLoss,0):null,
    donors,priorityGap,priorityGapKnown,
    donorStatusWorsened:donors.some(d=>d.statusWorsened),
    evidenceType:usage?.evidenceType||'unit-usage',
    sourceStatus:usage?.sourceStatus||'unavailable'
  };
}

function forgeBuildGlobalImpactMarkup(impact){
  if(!impact)return '';
  const signed=value=>value==null?'non calculable':(value>0?'+':'')+num(value,1);
  const impactPartial=impact.targetSpeedGain==null||impact.donorSpeedLoss==null||impact.donors.some(d=>d.speedLoss==null);
  const impactLabel=impact.donorStatusWorsened?'DONNEUR(S) FRAGILISÉ(S)':impactPartial?'IMPACT PARTIEL':'IMPACT CONTRÔLÉ';
  const donorRows=impact.donors.map(d=>`<div class="forge-global-impact-donor ${d.statusWorsened?'is-warning':''}">
    <b>${esc(d.name)}</b><span>${d.modsTaken} mod(s) prélevé(s) · ${d.beforeCount} → ${d.afterCount} mods</span>
    <em>${d.speedLoss==null?'Vitesse non calculable':`Vitesse ${num(d.beforeSpeed,1)} → ${num(d.afterSpeed,1)} · ${signed(-d.speedLoss)}`}</em>
    <small>${esc(d.beforeStatus)} → ${esc(d.afterStatus)} · GAC ${d.priorityKnown?num(d.uses):'non mesuré'}</small>
  </div>`).join('')||'<div class="forge-global-impact-empty">Aucun mod équipé n’est prélevé sur un autre personnage : la configuration utilise les mods de la cible et/ou l’inventaire libre.</div>';
  const strategic=impact.priorityGapKnown?signed(impact.priorityGap)+' combats pondérés':'non calculable';
  const sourceNote=impact.evidenceType==='defense-composition'?'Signal GAC issu des compositions défensives publiées, catalogue partiel.':'Signal issu des observations GAC disponibles.';
  return `<section class="forge-global-impact">
    <div class="forge-section-title"><span>BILAN GLOBAL DU TRANSFERT</span><small>${impactLabel}</small></div>
    <div class="forge-global-impact-metrics">
      <div><span>BÉNÉFICIAIRE · VITESSE</span><b class="${impact.targetSpeedGain>0?'gain':'neutral'}">${signed(impact.targetSpeedGain)}</b><small>${impact.targetSpeedGain==null?'Vitesse non calculable':`${num(impact.targetBefore,1)} → ${num(impact.targetAfter,1)}`}</small></div>
      <div><span>DONNEURS · VITESSE CÉDÉE</span><b>${impact.donorSpeedLoss==null?'NON CALCULABLE':num(impact.donorSpeedLoss,1)}</b><small>${impact.donors.length} donneur(s) · ${impact.donors.reduce((sum,d)=>sum+d.modsTaken,0)} mod(s)</small></div>
      <div><span>ÉCART DE PRIORITÉ GAC</span><b>${strategic}</b><small>positif = bénéficiaire plus utilisé que les donneurs</small></div>
    </div>
    <div class="forge-global-impact-donors">${donorRows}</div>
    <small class="forge-global-impact-note">${sourceNote} Le bilan mesure la vitesse retirée aux donneurs et l’écart d’usage GAC ; il ne prétend pas calculer une puissance totale, les secondaires perdues, les datacrons ni les synergies d’équipe. ${impact.donorStatusWorsened?'Attention : au moins un donneur descend d’un niveau de statut ou devient incomplet.':''}</small>
  </section>`;
}