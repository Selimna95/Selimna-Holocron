/* Le Visionnaire — audit Kyber guidé, sans permutation automatique. */
(() => {
  'use strict';
  const SLOTS = ['Square','Arrow','Diamond','Triangle','Circle','Cross'];
  const LABELS = {Square:'Carré',Arrow:'Flèche',Diamond:'Losange',Triangle:'Triangle',Circle:'Cercle',Cross:'Croix'};
  const FIXED = {Square:'Offense',Diamond:'Defense'};
  const state = {mode:'sets',rows:[],selected:null,slots:new Set(),proposals:[],searching:false,searchError:'',loading:false,faction:'ALL',factionOpen:false,progress:{done:0,total:0,profiles:0,failures:0,lastError:''}};
  const $ = id => document.getElementById(id);
  const key = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labelSet = value => {
    const k=key(value).replace(/^(double|triple)/,'');
    const aliases={critchance:'criticalchance',critdamage:'criticaldamage'};
    return aliases[k]||k;
  };
  const slotOf = mod => {
    const raw=mod?.slot ?? mod?.slot_id ?? mod?.slotId ?? mod?.modSlot ?? '';
    if(SLOTS.includes(raw)) return raw;
    const n=Number(raw);
    return SLOTS[n-1] || SLOTS[n] || '';
  };
  const modsOf = character => {
    const list=typeof getCharacterMods==='function' ? (getCharacterMods(character)||[]) : [];
    const bySlot=new Map();
    list.forEach(raw=>{
      const mod=typeof normalizeModForDisplay==='function'?normalizeModForDisplay(raw):raw;
      const slot=slotOf(mod);
      if(slot&&!bySlot.has(slot))bySlot.set(slot,mod);
    });
    return SLOTS.map(slot=>({slot,mod:bySlot.get(slot)||null}));
  };
  const statKey = value => key(String(value??'').replace(/%/g,'').replace(/^Crit Damage$/i,'Critical Damage').replace(/^Crit Chance$/i,'Critical Chance'));
  const normalizeCounts = counts => Object.fromEntries(Object.entries(counts||{})
    .map(([name,count])=>[labelSet(name),Number(count)||0]).filter(([name,count])=>name&&count>0));
  const rankedSetConfigurations = profile => {
    const specific=(Array.isArray(profile?.specific_sets)?profile.specific_sets:[])
      .map(item=>({name:String(item?.name||''),counts:normalizeCounts(item?.counts||(typeof kyberSetComposition==='function'?kyberSetComposition(item?.name):{})),weight:Number(item?.weight)||0,exact:true,source:item?.source||'SWGOH.GG'}))
      .filter(item=>Object.keys(item.counts).length&&item.weight>0);
    if(specific.length)return specific.sort((a,b)=>b.weight-a.weight);
    const primary=Array.isArray(profile?.sets)?profile.sets:[];
    const secondary=Array.isArray(profile?.secondary_sets)?profile.secondary_sets:[];
    const inferred=[];
    primary.forEach(p=>{
      const base=normalizeCounts(p.counts||(typeof kyberSetComposition==='function'?kyberSetComposition(p.name):{}));
      const baseCount=Object.values(base).reduce((a,b)=>a+b,0);
      if(baseCount===6){inferred.push({name:p.name,counts:base,weight:Number(p.weight)||0,exact:false,source:'inféré'});return;}
      if(baseCount!==4||!secondary.length)return;
      secondary.forEach(s=>{
        const counts={...base},name=labelSet(s.name);
        if(name)counts[name]=(counts[name]||0)+2;
        inferred.push({name:String(p.name||'')+' + '+String(s.name||''),counts,weight:(Number(p.weight)||0)*(Number(s.weight)||0),exact:false,source:'inféré'});
      });
    });
    const unique=new Map();
    inferred.forEach(item=>{
      const signature=Object.entries(item.counts).sort(([a],[b])=>a.localeCompare(b)).map(([name,count])=>name+':'+count).join('|');
      if(!unique.has(signature))unique.set(signature,item);
    });
    return [...unique.values()].sort((a,b)=>b.weight-a.weight);
  };
  const profileSets = profile => {
    const configurations=rankedSetConfigurations(profile);
    return configurations.slice(0,3).map(item=>item.name+' '+Math.round(item.weight*100)+' %')
      .concat(configurations.length>3?['+'+(configurations.length-3)+' variantes']:[]);
  };
  const primaryDistribution = (profile,slot) => Object.entries(profile?.slots?.[slot]?.primaries||{})
    .map(([name,weight])=>({name,weight:Number(weight)||0}))
    .sort((a,b)=>b.weight-a.weight);
  const inspectCharacter = (character,profile) => {
    const configurations=rankedSetConfigurations(profile);
    const equipped=modsOf(character);
    const equippedMods=equipped.filter(x=>x.mod);
    const currentCounts={};
    equippedMods.forEach(({mod})=>{
      const name=labelSet(mod.set_name??mod.set??'');
      if(name)currentCounts[name]=(currentCounts[name]||0)+1;
    });
    // A singleton set has no active bonus and must not invalidate a Kyber build.
    Object.keys(currentCounts).forEach(name=>{if(currentCounts[name]<2)delete currentCounts[name];});
    const complete=equippedMods.length===6;
    const configDistance=config=>{
      const names=new Set([...Object.keys(config.counts),...Object.keys(currentCounts)]);
      return [...names].reduce((sum,name)=>sum+Math.abs((config.counts[name]||0)-(currentCounts[name]||0)),0)/2;
    };
    const ranked=configurations.map(config=>({...config,distance:configDistance(config)}))
      .sort((a,b)=>a.distance-b.distance||b.weight-a.weight);
    const best=ranked[0]||null;
    const exactMatch=!!best&&best.distance===0;
    const coverage=configurations.filter(x=>x.exact).reduce((sum,x)=>sum+x.weight,0);
    const setVerifiable=complete&&configurations.length>0&&(ranked.some(config=>config.exact&&config.distance===0)||coverage>=0.5);
    const expected=best?.counts||{};
    const differingSets=setVerifiable&&!exactMatch
      ? [...new Set([...Object.keys(expected),...Object.keys(currentCounts)])]
          .filter(name=>(Number(expected[name])||0)!==(Number(currentCounts[name])||0))
      : [];
    const slotRows=equipped.map(({slot,mod})=>{
      const setName=labelSet(mod?.set_name??mod?.set??'');
      const distribution=primaryDistribution(profile,slot);
      const hasPrimaryReference=distribution.length>0;
      const currentPrimary=distribution.find(x=>statKey(x.name)===statKey(mod?.primary_stat));
      const primaryShare=currentPrimary?.weight||0;
      const primaryOk=!hasPrimaryReference||primaryShare>0;
      return {slot,mod,setOk:setVerifiable&&!differingSets.includes(setName),primaryOk,
        primaryReference:currentPrimary||null,primaryShare,primaryDistribution:distribution,
        hasSetReference:setVerifiable,hasPrimaryReference};
    });
    const setSlots=setVerifiable&&differingSets.length
      ?slotRows.filter(x=>x.mod&&differingSets.includes(labelSet(x.mod.set_name??x.mod.set??''))):[];
    const primarySlots=slotRows.filter(x=>x.hasPrimaryReference&&x.mod&&!x.primaryOk);
    const setMismatch=setVerifiable&&!exactMatch;
    const primaryVerifiable=slotRows.some(x=>x.hasPrimaryReference);
    const primaryMismatch=primarySlots.length>0;
    return {character,profile,slotRows,setSlots,primarySlots,setMismatch,primaryMismatch,
      setVerifiable,primaryVerifiable,expectedSetCounts:expected,setConfigurations:ranked,
      setCoverage:coverage,bestSetConfiguration:best};
  };
  const characters = () => (Array.isArray(rosterCharacters)?rosterCharacters:[]).filter(c=>typeof rosterUnitType!=='function'||rosterUnitType(c)!=='ship');
  async function buildAudit(){
    if(state.loading)return;
    const roster=characters();
    if(!roster.length){state.rows=[];state.progress={done:0,total:0,profiles:0,failures:0,lastError:''};render();return;}
    state.loading=true;
    state.rows=[];
    state.progress={done:0,total:roster.length,profiles:0,failures:0,lastError:''};
    render();
    const rows=[];
    let cursor=0;
    const publishProgress=()=>{
      state.rows=rows.slice().sort((a,b)=>String(a.character?.name||'').localeCompare(String(b.character?.name||''),'fr'));
      render();
    };
    const worker=async()=>{
      while(cursor<roster.length){
        const character=roster[cursor++];
        let row;
        try{
          let profile=typeof profileForCharacter==='function'?profileForCharacter(character):null;
          if(typeof kyberProfileValid==='function'&&!kyberProfileValid(profile)) profile=null;
          if(!profile || (typeof kyberProfileHasFullDistribution==='function'&&!kyberProfileHasFullDistribution(profile))){
            const fetched=typeof fetchKyberProfile==='function'?await fetchKyberProfile(character):null;
            if(fetched)profile=fetched;
          }
          if(profile && (typeof kyberProfileValid!=='function'||kyberProfileValid(profile))) {
            row=inspectCharacter(character,profile);
            state.progress.profiles++;
          } else {
            if(window.__kyberLastFetchError)state.progress.lastError=String(window.__kyberLastFetchError);
            row={character,profile:null,slotRows:modsOf(character),setVerifiable:false,primaryVerifiable:false,setMismatch:false,primaryMismatch:false,setSlots:[],primarySlots:[]};
          }
        }catch(error){
          const message=String(error?.message||error);
          state.progress.failures++;
          state.progress.lastError=message;
          row={character,profile:null,slotRows:modsOf(character),setVerifiable:false,primaryVerifiable:false,setMismatch:false,primaryMismatch:false,setSlots:[],primarySlots:[],error:message};
        }
        rows.push(row);
        state.progress.done++;
        if(state.progress.done%6===0||state.progress.done===state.progress.total)publishProgress();
      }
    };
    await Promise.all(Array.from({length:Math.min(4,roster.length)},worker));
    state.rows=rows.sort((a,b)=>String(a.character?.name||'').localeCompare(String(b.character?.name||''),'fr'));
    state.loading=false;state.selected=null;state.slots.clear();state.proposals=[];state.searchError='';render();
  }
  const factionsOf = row => {
    const id=typeof characterKey==='function'?characterKey(row.character):key(row.character?.baseId||row.character?.name);
    if(typeof factionMap==='object'&&factionMap&&Array.isArray(factionMap[id]))return factionMap[id];
    return typeof factionsForCharacter==='function'?factionsForCharacter(row.character):[];
  };
  const factionOptions = () => typeof allFactions==='function'?allFactions():[...new Set(state.rows.flatMap(factionsOf))].sort((a,b)=>a.localeCompare(b,'fr'));
  const visibleRows = () => state.rows.filter(row=>{
    if(state.faction!=='ALL'&&!factionsOf(row).includes(state.faction))return false;
    if(state.mode==='sets') return row.setVerifiable&&row.setMismatch;
    if(state.mode==='primaries') return row.primaryVerifiable&&row.primaryMismatch;
    return row.setVerifiable&&row.setMismatch&&row.primaryVerifiable&&row.primaryMismatch;
  });
  const activeIssues = row => state.mode==='sets' ? row.setSlots :
    state.mode==='primaries' ? row.primarySlots :
    [...new Map([...row.setSlots,...row.primarySlots].map(item=>[item.slot,item])).values()];
  const slotSummary = row => activeIssues(row).map(x=>LABELS[x.slot]).join(', ')||'—';
  const modeLabel = () => state.mode==='sets' ? 'Mauvais sets' : state.mode==='primaries' ? 'Mauvaises primaires' : 'Sets + primaires';
  const modeCount = mode => state.rows.filter(row => mode==='sets' ? row.setVerifiable&&row.setMismatch :
    mode==='primaries' ? row.primaryVerifiable&&row.primaryMismatch :
    row.setVerifiable&&row.setMismatch&&row.primaryVerifiable&&row.primaryMismatch).length;
  const exchangeSetCounts = list => {
    const counts={};
    (Array.isArray(list)?list:[]).forEach(mod=>{
      const name=labelSet(mod?.set_name??mod?.set??'');
      if(name)counts[name]=(counts[name]||0)+1;
    });
    return counts;
  };
  const exchangeSetDistance = (list,profile) => {
    const configs=rankedSetConfigurations(profile).filter(x=>x.exact);
    if(!configs.length)return null;
    const actual=exchangeSetCounts(list);
    Object.keys(actual).forEach(name=>{if(actual[name]<2)delete actual[name];});
    return Math.min(...configs.map(config=>{
      const names=new Set([...Object.keys(config.counts),...Object.keys(actual)]);
      return [...names].reduce((sum,name)=>sum+Math.abs((config.counts[name]||0)-(actual[name]||0)),0)/2;
    }));
  };
  const exchangeSetBonusesPreserved = (before,after) => {
    const a=exchangeSetCounts(before),b=exchangeSetCounts(after);
    return Object.entries(a).every(([name,count])=>{
      const tiers=Math.min(2,Math.floor(count/2));
      return Math.min(2,Math.floor((b[name]||0)/2))>=tiers;
    });
  };
  const exchangeModId = mod => String(mod?.game_id??mod?.id??mod?.uid??'');
  const exchangeModSummary = mod => {
    if(!mod)return 'Aucun mod';
    const secondary=[];
    for(let i=1;i<=4;i++){
      const stat=mod[`secondary_${i}_stat`],value=mod[`secondary_${i}_value`];
      if(stat)secondary.push(stat+(value==null?'':' '+value));
    }
    return [mod.set_name||mod.set||'Set inconnu',mod.primary_stat||'Primaire inconnue',
      mod.primary_value==null?'':String(mod.primary_value),modTotalSpeed(mod)+' V',
      secondary.join(' · ')].filter(Boolean).join(' · ');
  };
  const exchangeStatName = value => {
    const raw=String(value??'').trim().replace(/%$/,'').trim();
    const aliases={critdamage:'Critical Damage',criticaldamage:'Critical Damage',critchance:'Critical Chance',criticalchance:'Critical Chance',critavoidance:'Critical Avoidance',criticalavoidance:'Critical Avoidance'};
    return aliases[key(raw)]||raw;
  };
  function exchangeFinalStats(character,build){
    const profile=typeof optimizerProfileForCharacter==='function'?(optimizerProfileForCharacter(character)||{}):{};
    const base=typeof baseStatsForCharacter==='function'?baseStatsForCharacter(character):profile.base_stats;
    if(!base||typeof base!=='object'||!Object.keys(base).length)return null;
    const result=Object.fromEntries(Object.entries(base).map(([name,value])=>[exchangeStatName(name),Number(value)||0]));
    const flat={},percent={};
    for(const mod of Array.isArray(build)?build:[]){
      let raw=mod?.stats;
      if(typeof raw==='string'){try{raw=JSON.parse(raw);}catch{raw=null;}}
      const entries=raw&&typeof raw==='object'&&!Array.isArray(raw)?Object.entries(raw):
        [[mod?.primary_stat,mod?.primary_value],...Array.from({length:4},(_,i)=>[mod?.[`secondary_${i+1}_stat`],mod?.[`secondary_${i+1}_value`]])];
      for(const [label,value] of entries){
        if(!label||value==null)continue;
        const text=String(label).trim(),name=exchangeStatName(text),amount=Number(value)||0;
        if(text.endsWith('%'))percent[name]=(percent[name]||0)+amount/100;
        else flat[name]=(flat[name]||0)+amount;
      }
    }
    const counts=exchangeSetCounts(build);
    const display={health:'Health',protection:'Protection',offense:'Offense',speed:'Speed',defense:'Defense',
      criticaldamage:'Critical Damage',criticalchance:'Critical Chance',potency:'Potency',tenacity:'Tenacity',criticalavoidance:'Critical Avoidance'};
    const relative={health:[2,.10],protection:[2,.10],offense:[4,.15],speed:[4,.10],defense:[2,.25]};
    const additive={criticaldamage:[4,.30],criticalchance:[2,.08],potency:[2,.15],tenacity:[2,.20],criticalavoidance:[2,.20]};
    for(const [name,[required,bonus]] of Object.entries(relative)){
      const count=counts[name]||0;if(count>=required)percent[display[name]]=(percent[display[name]]||0)+bonus*Math.floor(count/required);
    }
    for(const [name,[required,bonus]] of Object.entries(additive)){
      const count=counts[name]||0;if(count>=required)percent[display[name]]=(percent[display[name]]||0)+bonus*Math.floor(count/required);
    }
    for(const [name,value] of Object.entries(flat))result[name]=(Number(result[name])||0)+value;
    for(const [name,ratio] of Object.entries(percent)){
      if(['Potency','Tenacity','Critical Chance','Critical Damage','Critical Avoidance'].includes(name))result[name]=(Number(result[name])||0)+ratio;
      else result[name]=(Number(result[name])||0)+(Number(base[name])||0)*ratio;
    }
    return result;
  }
  const exchangeStatsDelta = (before,after) => {
    if(!before||!after)return null;
    const names=[...new Set([...Object.keys(before),...Object.keys(after)])];
    return names.map(name=>({name,before:Number(before[name])||0,after:Number(after[name])||0,
      delta:(Number(after[name])||0)-(Number(before[name])||0),
      relative:Number(before[name])?((Number(after[name])||0)-(Number(before[name])||0))/Math.abs(Number(before[name])):null}))
      .filter(row=>Math.abs(row.delta)>1e-8).sort((a,b)=>Math.abs(b.relative??0)-Math.abs(a.relative??0)||Math.abs(b.delta)-Math.abs(a.delta));
  };
  const exchangeStatBalance = (before,after) => {
    const rows=exchangeStatsDelta(before,after);
    if(!rows?.length)return null;
    const measurable=rows.filter(row=>row.relative!==null);
    return measurable.length?measurable.reduce((sum,row)=>sum+row.relative,0)/measurable.length:null;
  };
  const exchangeClamp = value => Math.max(0,Math.min(100,Number(value)||0));
  function exchangeScenarioScore({mode,beforeSetDistance,afterSetDistance,primaryShare,targetBalance,donors}){
    const hasSet=Number.isFinite(beforeSetDistance)&&Number.isFinite(afterSetDistance);
    const setFit=hasSet?exchangeClamp(50+50*(beforeSetDistance-afterSetDistance)/Math.max(1,beforeSetDistance)):50;
    const primaryFit=Number.isFinite(primaryShare)?exchangeClamp(primaryShare*100):50;
    const reference=mode==='primaries'?primaryFit:mode==='both'?(setFit+primaryFit)/2:hasSet?setFit:50;
    const targetStats=targetBalance===null?50:exchangeClamp(50+targetBalance*250);
    const donorUsage=donors.length?donors.reduce((sum,d)=>sum+100/(1+Math.max(0,Number(d.uses)||0)/50),0)/donors.length:100;
    const donorStats=donors.length?donors.reduce((sum,d)=>sum+(d.statBalance===null?50:exchangeClamp(50+d.statBalance*250)),0)/donors.length:100;
    const donorStatus=donors.length?100-donors.filter(d=>d.statusWorsened).length/donors.length*100:100;
    const donorCost=donorUsage*.45+donorStats*.35+donorStatus*.20;
    const score=Math.round(reference*.45+targetStats*.25+donorCost*.30);
    const complete=targetBalance!==null&&donors.every(d=>d.statBalance!==null);
    const statusSafe=donors.every(d=>!d.statusWorsened);
    const verdict=score>=75&&complete&&statusSafe?'RECOMMANDÉ':score>=55?'À EXAMINER':'PRUDENCE';
    return {score,verdict,reference:Math.round(reference),targetStats:Math.round(targetStats),donorCost:Math.round(donorCost),complete};
  }
  const exchangeFormatStat = value => Number(value).toLocaleString('fr-FR',{maximumFractionDigits:1});
  function exchangeStatsMarkup(before,after){
    const rows=exchangeStatsDelta(before,after);
    if(!rows)return '<p class="visionnaire-stats-unavailable">Calcul non vérifiable : statistiques de base indisponibles pour ce personnage.</p>';
    if(!rows.length)return '<p class="visionnaire-stats-unavailable">Aucune variation de statistique calculée.</p>';
    return '<div class="visionnaire-stat-table">'+rows.map(row=>'<div><span>'+esc(row.name)+'</span><b>'+exchangeFormatStat(row.before)+' → '+exchangeFormatStat(row.after)+'</b><em class="'+(row.delta>0?'gain':row.delta<0?'loss':'neutral')+'">'+(row.delta>0?'+':'')+exchangeFormatStat(row.delta)+(row.relative===null?'':' · '+(row.relative>0?'+':'')+(row.relative*100).toFixed(1)+'%')+'</em></div>').join('')+'</div>';
  }
  function buildExchangeProposals(row,selectedSlots){
    const character=row.character,profile=row.profile;
    const current=getCharacterMods(character);
    if(current.length!==6||new Set(current.map(slotOf)).size!==6)return {proposals:[],reason:'Le personnage cible doit disposer de ses six mods équipés avant tout échange.'};
    const currentBySlot=new Map(current.map(mod=>[slotOf(mod),mod]));
    const slots=SLOTS.filter(slot=>selectedSlots.includes(slot));
    if(!slots.length)return {proposals:[],reason:'Sélectionne au moins un slot.'};
    if(slots.some(slot=>!currentBySlot.has(slot)))return {proposals:[],reason:'Un slot sélectionné ne contient pas de mod à remplacer.'};
    if(typeof forgeAllSourceMods!=='function'||typeof forgeSourceAllowedForSearch!=='function'||
       typeof forgeProjectedModSpeed!=='function'||typeof isGalacticLegendCharacter!=='function')
      return {proposals:[],reason:'Les services partagés de donneurs ou de calcul de vitesse ne sont pas disponibles.'};
    const targetKey=characterKey(character);
    const source=forgeAllSourceMods(character).filter(mod=>{
      const ownerKey=mod?._sourceOwnerKey;
      const isFree=!ownerKey&&(!mod?._sourceOwner||mod._sourceOwner==='Libre')&&mod?._sourcePriorityKnown===true;
      if(!forgeSourceAllowedForSearch(mod,character)||(!isFree&&!ownerKey)||ownerKey===targetKey)return false;
      const owner=isFree?null:rosterCharacters.find(c=>characterKey(c)===ownerKey);
      if(!isFree&&(!owner||isGalacticLegendCharacter(owner)))return false;
      if(!isFree&&(mod._sourcePriorityKnown!==true||!Number.isFinite(Number(mod._sourceUsage))))return false;
      return true;
    });
    const optionsBySlot=new Map();
    for(const slot of slots){
      const options=source.filter(mod=>slotOf(mod)===slot&&exchangeModId(mod)!==exchangeModId(currentBySlot.get(slot)))
        .map(mod=>({...mod,_visionnaireDonor:mod._sourceOwnerKey?rosterCharacters.find(c=>characterKey(c)===mod._sourceOwnerKey):null}))
        .filter(mod=>!mod._sourceOwnerKey||mod._visionnaireDonor)
        .sort((a,b)=>Number(a._sourceUsage)-Number(b._sourceUsage)||
          modTotalSpeed(b)-modTotalSpeed(a));
      optionsBySlot.set(slot,options.slice(0,6));
    }
    const empty=slots.filter(slot=>!(optionsBySlot.get(slot)||[]).length);
    if(empty.length)return {proposals:[],reason:'Aucun donneur vérifié pour : '+empty.map(slot=>LABELS[slot]).join(', ')+'. Les GL et les usages GAC inconnus sont exclus.'};
    const beforeSetDistance=exchangeSetDistance(current,profile);
    const beforeSpeed=forgeProjectedModSpeed(character,profile,current).total;
    const targetPrimarySafe=chosen=>slots.every(slot=>{
      const mod=chosen.find(x=>slotOf(x)===slot);
      return primaryDistribution(profile,slot).some(entry=>statKey(entry.name)===statKey(mod?.primary_stat));
    });
    const proposals=[];
    let tested=0;
    const chosen=[];
    const walk=index=>{
      if(proposals.length>=30||tested>=15000)return;
      if(index===slots.length){
        tested++;
        const finalTarget=current.filter(mod=>!slots.includes(slotOf(mod))).concat(chosen);
        const beforeProjection=forgeProjectedModSpeed(character,profile,current);
        const afterProjection=forgeProjectedModSpeed(character,profile,finalTarget);
        const afterSpeed=afterProjection.total;
        if(beforeProjection.baseSpeed<=0&&beforeProjection.hasFourPieceSpeedSet&&!afterProjection.hasFourPieceSpeedSet)return;
        if(afterSpeed+1e-9<beforeSpeed)return;
        const afterSetDistance=exchangeSetDistance(finalTarget,profile);
        if(state.mode!=='primaries'){
          if(beforeSetDistance===null||afterSetDistance===null||afterSetDistance>=beforeSetDistance)return;
        } else if(beforeSetDistance!==null&&afterSetDistance!==null&&afterSetDistance>beforeSetDistance)return;
        if(state.mode==='both'&&!targetPrimarySafe(chosen))return;
        if(state.mode==='primaries'&&!targetPrimarySafe(chosen))return;
        const donorGroups=new Map();
        for(const candidate of chosen){
          const owner=candidate._visionnaireDonor;
          if(!owner)continue;
          const ownerId=characterKey(owner);
          if(!donorGroups.has(ownerId))donorGroups.set(ownerId,{owner,transfers:[]});
          donorGroups.get(ownerId).transfers.push(candidate);
        }
        const donors=[];
        for(const {owner,transfers} of donorGroups.values()){
          const before=getCharacterMods(owner);
          const after=before.slice();
          for(const candidate of transfers){
            const slot=slotOf(candidate),donorIndex=after.findIndex(mod=>slotOf(mod)===slot);
            const returned=currentBySlot.get(slot);
            if(donorIndex<0||!returned){return;}
            after[donorIndex]=returned;
          }
          if(before.length!==6||after.length!==6||new Set(after.map(slotOf)).size!==6||!exchangeSetBonusesPreserved(before,after))return;
          const donorProfile=optimizerProfileForCharacter(owner)||{};
          const beforeStats=exchangeFinalStats(owner,before),afterStats=exchangeFinalStats(owner,after);
          const donorImpact=exchangeStatsDelta(beforeStats,afterStats);
          const beforeStatus=typeof v176ModStatus==='function'?v176ModStatus(before).status:'INCONNU';
          const afterStatus=typeof v176ModStatus==='function'?v176ModStatus(after).status:'INCONNU';
          const statusRank={'BONS':0,'MOYENS':1,'FAIBLES':2,'TRÈS FAIBLES':3,'INCOMPLETS':4,'SANS MODS':5,'SANS MOD':5};
          donors.push({owner,transfers,beforeSpeed:forgeProjectedModSpeed(owner,donorProfile,before).total,
            afterSpeed:forgeProjectedModSpeed(owner,donorProfile,after).total,
            beforeSets:exchangeSetCounts(before),afterSets:exchangeSetCounts(after),
            beforeStats,afterStats,statDeltas:donorImpact,statBalance:exchangeStatBalance(beforeStats,afterStats),
            uses:Number(transfers[0]._sourceUsage)||0,beforeStatus,afterStatus,
            statusWorsened:(statusRank[afterStatus]??0)>(statusRank[beforeStatus]??0)});
        }
        const targetStatsBefore=exchangeFinalStats(character,current),targetStatsAfter=exchangeFinalStats(character,finalTarget);
        const targetStatDeltas=exchangeStatsDelta(targetStatsBefore,targetStatsAfter);
        const primaryShares=slots.map(slot=>{
          const mod=chosen.find(item=>slotOf(item)===slot);
          return primaryDistribution(profile,slot).find(entry=>statKey(entry.name)===statKey(mod?.primary_stat))?.weight??null;
        });
        const knownPrimaryShares=primaryShares.filter(value=>Number.isFinite(value));
        const primaryShare=knownPrimaryShares.length?knownPrimaryShares.reduce((sum,value)=>sum+value,0)/knownPrimaryShares.length:null;
        const score=exchangeScenarioScore({mode:state.mode,beforeSetDistance,afterSetDistance,primaryShare,
          targetBalance:exchangeStatBalance(targetStatsBefore,targetStatsAfter),donors});
        const ids=chosen.map(exchangeModId).join('|');
        if(proposals.some(item=>item.signature===ids))return;
        proposals.push({signature:ids,transfers:chosen.slice(),donors,beforeSpeed,afterSpeed,
          speedGain:afterSpeed-beforeSpeed,beforeSetDistance,afterSetDistance,
          targetStatsBefore,targetStatsAfter,targetStatDeltas,primaryShare,score,
          freeMods:chosen.filter(item=>!item._visionnaireDonor).length,
          usage:chosen.reduce((sum,m)=>sum+Number(m._sourceUsage||0),0)});
        return;
      }
      const slot=slots[index];
      for(const candidate of optionsBySlot.get(slot)||[]){
        if(chosen.some(item=>exchangeModId(item)===exchangeModId(candidate)))continue;
        chosen.push(candidate);walk(index+1);chosen.pop();
        if(proposals.length>=30||tested>=15000)return;
      }
    };
    walk(0);
    proposals.sort((a,b)=>b.score.score-a.score.score||a.usage-b.usage||
      (a.afterSetDistance??99)-(b.afterSetDistance??99));
    return {proposals:proposals.slice(0,5),tested,sourceCount:source.length,
      reason:proposals.length?'':tested>=15000?'La recherche a atteint sa limite de sécurité sans scénario validé.':'Aucun scénario ne respecte simultanément la vitesse cible, les références Kyber et les bonus de sets des donneurs.'};
  }
  function renderExchangeProposals(){
    if(state.searching)return '<div class="visionnaire-empty">Recherche des scénarios coordonnés en cours…</div>';
    if(!state.proposals.length)return state.searchError?'<div class="visionnaire-empty">'+esc(state.searchError)+'</div>':'';
    return '<div class="visionnaire-proposals"><div class="visionnaire-section-kicker">ÉTAPE 4 · SCÉNARIOS CLASSÉS PAR QUALITÉ STRATÉGIQUE</div>'+
      state.proposals.map((proposal,index)=>'<article class="visionnaire-proposal"><header><b>SCÉNARIO '+(index+1)+' · '+proposal.score.verdict+'</b><span class="visionnaire-score">'+proposal.score.score+'/100</span></header>'+
      '<div class="visionnaire-score-breakdown"><span>Référence Kyber <b>'+proposal.score.reference+'/100</b></span><span>Stats cible <b>'+proposal.score.targetStats+'/100</b></span><span>Coût donneurs <b>'+proposal.score.donorCost+'/100</b></span></div>'+
      '<div class="visionnaire-proposal-speed"><span>VITESSE CIBLE · PLANCHER RESPECTÉ</span><b>'+proposal.beforeSpeed.toFixed(1)+' → '+proposal.afterSpeed.toFixed(1)+' ('+(proposal.speedGain>=0?'+':'')+proposal.speedGain.toFixed(1)+')</b></div>'+
      '<div class="visionnaire-stat-section"><b>IMPACT COMPLET · PERSONNAGE CIBLE</b>'+exchangeStatsMarkup(proposal.targetStatsBefore,proposal.targetStatsAfter)+'</div>'+
      '<div class="visionnaire-proposal-transfers">'+proposal.transfers.map(mod=>{
        const slot=slotOf(mod),current=state.selected.slotRows.find(x=>x.slot===slot)?.mod;
        const sourceName=mod._visionnaireDonor?.name||mod._sourceOwner||'Inventaire libre';
        return '<div><b>'+LABELS[slot]+'</b><span>ACTUEL · '+esc(exchangeModSummary(current))+'</span><span>REÇU · '+esc(exchangeModSummary(mod))+'</span><small>Source : '+esc(sourceName)+(mod._visionnaireDonor?' · GAC '+Number(mod._sourceUsage||0)+' utilisation(s)':' · mod libre, aucun donneur dépouillé')+'</small></div>';
      }).join('')+'</div>'+
      '<div class="visionnaire-proposal-donors">'+proposal.donors.map(d=>'<div><b>'+esc(d.owner.name||d.owner.baseId)+'</b><span>'+d.transfers.length+' mod(s) cédé(s) · vitesse '+d.beforeSpeed.toFixed(1)+' → '+d.afterSpeed.toFixed(1)+' · '+esc(d.beforeStatus)+' → '+esc(d.afterStatus)+'</span><small>GAC '+d.uses+' · bonus de sets conservés · retour des mods remplacés</small><details><summary>Voir les statistiques complètes du donneur</summary>'+exchangeStatsMarkup(d.beforeStats,d.afterStats)+'</details></div>').join('')+'</div>'+
      '<p class="visionnaire-score-note">'+(proposal.score.complete?'Calcul statistique complet disponible.':'Attention : une ou plusieurs bases de statistiques manquent ; le score reste provisoire.')+' Aucun déplacement n’est effectué : application manuelle uniquement.</p></article>').join('')+'</div>';
  }
  async function runExchangeSearch(){
    if(state.searching||!state.selected||!state.slots.size)return;
    state.searching=true;state.searchError='';state.proposals=[];render();
    try{
      const result=buildExchangeProposals(state.selected,[...state.slots]);
      state.proposals=result.proposals||[];
      state.searchError=result.reason||'';
    }catch(error){state.searchError='Recherche interrompue : '+String(error?.message||error);}
    finally{state.searching=false;render();}
  }
  function render(){
    const root=$('visionnaireRoot');if(!root)return;
    if(root.dataset.factionFilterBound!=='true'){
      root.dataset.factionFilterBound='true';
      root.addEventListener('click',event=>{
        const toggle=event.target?.closest?.('[data-faction-toggle]');
        if(toggle){event.preventDefault();event.stopPropagation();state.factionOpen=!state.factionOpen;render();return;}
        const option=event.target?.closest?.('[data-faction-option]');
        if(option){event.preventDefault();event.stopPropagation();state.faction=option.dataset.factionOption||'ALL';state.factionOpen=false;state.selected=null;state.slots.clear();render();}
      },true);
      document.addEventListener('click',event=>{if(state.factionOpen&&!root.contains(event.target)){state.factionOpen=false;render();}});
    }
    const rows=visibleRows();
    const knownSets=state.rows.filter(r=>r.setVerifiable).length;
    const knownPrimaries=state.rows.filter(r=>r.primaryVerifiable).length;
    const knownAny=state.rows.filter(r=>r.setVerifiable||r.primaryVerifiable).length;
    const nonverifiable=state.rows.length-knownAny;
    root.innerHTML=`
      <header class="visionnaire-header">
        <div><small>HOLOCRON // LE VISIONNAIRE</small><h2>LE VISIONNAIRE</h2><p>Repère les écarts avec Kyber, choisis les slots à travailler et décide des échanges en connaissance de cause.</p></div>
        <div class="visionnaire-state">${state.loading?'ANALYSE '+state.progress.done+'/'+state.progress.total:'AUDIT '+state.rows.length+' PERSONNAGES'}</div>
      </header>
      <section class="visionnaire-domain">
        <div class="visionnaire-section-kicker">ÉTAPE 1 · FILTRER LES ÉCARTS KYBER</div>
        <div class="visionnaire-filters" role="group" aria-label="Filtrer les personnages selon les écarts Kyber">
          <button type="button" data-mode="sets" class="${state.mode==='sets'?'active':''}"><b>SETS</b><span>${modeCount('sets')}</span></button>
          <button type="button" data-mode="primaries" class="${state.mode==='primaries'?'active':''}"><b>PRIMAIRES</b><span>${modeCount('primaries')}</span></button>
          <button type="button" data-mode="both" class="${state.mode==='both'?'active':''}"><b>SETS + PRIMAIRES</b><span>${modeCount('both')}</span></button>
        </div>
        <div class="visionnaire-kpis"><span><b>${state.loading?state.progress.done:state.rows.length}${state.loading?' / '+state.progress.total:''}</b> personnages analysés</span><span><b>${state.progress.profiles}</b> profils Kyber exploitables</span><span><b>${knownSets}</b> références de sets</span><span><b>${knownPrimaries}</b> références de primaires</span><span><b>${nonverifiable}</b> non vérifiables</span><span><b>${rows.length}</b> à examiner</span></div>
      </section>
      <section class="visionnaire-list">
        <div class="visionnaire-list-head"><div><div class="visionnaire-section-kicker">ÉTAPE 2 · FILTRER PAR FACTION</div><h3>${modeLabel()} · ${rows.length} résultat(s)</h3></div><div class="visionnaire-faction-filter">
            <span class="visionnaire-faction-label">FACTION</span>
            <button type="button" class="visionnaire-faction-toggle" data-faction-toggle aria-expanded="${state.factionOpen?'true':'false'}" aria-haspopup="listbox">
              <span>${esc(state.faction==='ALL'?'Toutes les factions':state.faction)}</span><b aria-hidden="true">${state.factionOpen?'⌃':'⌄'}</b>
            </button>
            ${state.factionOpen?'<div class="visionnaire-faction-menu" role="listbox" aria-label="Choisir une faction"><button type="button" role="option" aria-selected="'+(state.faction==='ALL')+'" data-faction-option="ALL" class="'+(state.faction==='ALL'?'active':'')+'">Toutes les factions</button>'+factionOptions().map(f=>'<button type="button" role="option" aria-selected="'+(state.faction===f)+'" data-faction-option="'+esc(f)+'" class="'+(state.faction===f?'active':'')+'">'+esc(f)+'</button>').join('')+'</div>':''}
          </div></div>
        ${state.loading?'<p class="visionnaire-empty">Lecture des références Kyber : '+state.progress.done+' / '+state.progress.total+' personnages traités · '+state.progress.profiles+' profils complets · '+state.progress.failures+' erreurs'+(state.progress.lastError?' · Dernier signal : '+esc(state.progress.lastError):'')+'. Les résultats apparaissent progressivement.</p>':rows.length?rows.map(row=>{
          const c=row.character;const selected=state.selected?.character===c;
          const mismatch=activeIssues(row);
          const reference=state.mode==='sets'?profileSets(row.profile).join(' · '):state.mode==='primaries'?'Répartition Kyber par slot':'Sets et primaires Kyber';
          const sample=(row.profile?.sample_size?' · '+row.profile.sample_size+' unités':'')+(row.profile?.updated_label?' · '+row.profile.updated_label:'');
          const referenceMeta=state.mode==='sets'?(row.setConfigurations?.length||0)+' configurations · couverture '+Math.round(Math.min(1,row.setCoverage||0)*100)+'%'+sample:sample;
          return `<button type="button" class="visionnaire-character ${selected?'active':''}" data-character="${esc(characterKey(c))}">
            <span class="visionnaire-avatar">${esc(String(c.name||c.baseId||'?').slice(0,1))}</span>
            <span class="visionnaire-character-main"><b>${esc(c.name||c.baseId||'Personnage')}</b><small>${mismatch.length} slot(s) concernés · ${esc(slotSummary(row))} · ${esc(factionsOf(row).join(' / ')||'Faction non identifiée')}</small></span>
            <span class="visionnaire-character-reference"><small>RÉFÉRENCE KYBER</small><b>${esc(reference||'Référence partielle')}</b><small>${esc(referenceMeta)}</small></span><i>↗</i>
          </button>`;
        }).join(''):'<p class="visionnaire-empty">Aucun personnage non conforme vérifiable dans ce domaine. Les profils absents ou incomplets sont comptés séparément et ne sont pas considérés comme incorrects.</p>'}
      </section>
      ${state.selected?renderSelected():''}
    `;
    root.querySelectorAll('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{state.mode=btn.dataset.mode;state.selected=null;state.slots.clear();state.proposals=[];state.searchError='';render();}));
    root.querySelectorAll('[data-character]').forEach(btn=>btn.addEventListener('click',()=>{
      const row=state.rows.find(r=>String(characterKey(r.character))===btn.dataset.character);
      if(!row)return;state.selected=row;state.slots.clear();state.proposals=[];state.searchError='';render();
    }));
    root.querySelectorAll('[data-slot]').forEach(btn=>btn.addEventListener('click',()=>{
      const slot=btn.dataset.slot;if(state.slots.has(slot))state.slots.delete(slot);else state.slots.add(slot);state.proposals=[];state.searchError='';render();
    }));
    root.querySelector('[data-search-exchanges]')?.addEventListener('click',runExchangeSearch);
  }
  function renderSelected(){
    const row=state.selected;if(!row)return '';
    const criteria=activeIssues(row);
    return `<section class="visionnaire-selected">
      <div class="visionnaire-section-kicker">ÉTAPE 3 · CHOISIR LES SLOTS</div><h3>${esc(row.character.name||row.character.baseId)}</h3>
      <p>Sélectionne explicitement les emplacements que tu souhaites travailler. Aucun mod ne sera déplacé automatiquement.</p>
      <div class="visionnaire-slots">${row.slotRows.map(item=>{
        const m=item.mod;
        const setIssue=row.setSlots.some(x=>x.slot===item.slot);
        const primaryIssue=row.primarySlots.some(x=>x.slot===item.slot);
        const mismatch=criteria.some(x=>x.slot===item.slot);
        const alternatives=item.primaryDistribution.slice(0,3).map(x=>x.name+' '+(x.weight*100).toFixed(1)+'%').join(' · ');
        const setLabel=setIssue?'Set hors de la configuration Kyber la plus proche':item.hasSetReference?'Composition comparée à toutes les configurations Kyber':'Set non vérifiable';
        const primaryLabel=!item.hasPrimaryReference?'Primaire non vérifiable':primaryIssue?'Primaire non observée en Kyber':('Primaire observée '+(item.primaryShare*100).toFixed(1)+'%');
        const detail=[setLabel,primaryLabel,alternatives].filter(Boolean).join(' · ');
        return `<button type="button" data-slot="${item.slot}" class="${state.slots.has(item.slot)?'selected':''} ${mismatch?'mismatch':''}">
          <span>${LABELS[item.slot]}</span><b>${esc(m?.set_name||'Slot vide')}</b><small>${esc(m?.primary_stat||'—')} ${m?.primary_value??''}</small><em>${esc(detail)}</em>
        </button>`;
      }).join('')}</div>
      <div class="visionnaire-next"><span>${state.slots.size} slot(s) sélectionné(s)</span><button type="button" data-search-exchanges ${state.slots.size?'':'disabled'} ${state.searching?'disabled':''}> ${state.searching?'RECHERCHE…':'RECHERCHER DES ÉCHANGES'} </button></div>
      <p class="visionnaire-note">Les donneurs sont classés par usage GAC connu croissant. Les GL et les usages inconnus sont exclus. Chaque donneur doit conserver ses bonus de sets après restitution des mods remplacés ; la vitesse totale de la cible ne peut pas diminuer.</p>
      ${renderExchangeProposals()}
    </section>`;
  }
  window.renderVisionnaire=()=>{
    if(document.body.dataset.page==='visionnaire'&&!state.rows.length&&!state.loading&&characters().length)buildAudit();
    else render();
  };
  window.addEventListener('holocron:data-updated',()=>{state.rows=[];state.selected=null;state.slots.clear();state.proposals=[];state.searchError='';if(document.body.dataset.page==='visionnaire')buildAudit();});
  window.addEventListener('holocron:gac-usage-ready',()=>{});
})();
