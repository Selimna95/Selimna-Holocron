/* Le Visionnaire — audit Kyber guidé, sans permutation automatique. */
(() => {
  'use strict';
  const SLOTS = ['Square','Arrow','Diamond','Triangle','Circle','Cross'];
  const LABELS = {Square:'Carré',Arrow:'Flèche',Diamond:'Losange',Triangle:'Triangle',Circle:'Cercle',Cross:'Croix'};
  const FIXED = {Square:'Offense',Diamond:'Defense'};
  const state = {mode:'sets',rows:[],selected:null,slots:new Set(),proposals:[],searching:false,searchProgress:{tested:0,limit:15000},searchError:'',loading:false,faction:'ALL',factionOpen:false,progress:{done:0,total:0,profiles:0,failures:0,lastError:''}};
  function visionnaireSampleIndex(sample,slotIndex,count,seed=0){
    if(!Number.isInteger(count)||count<=0)return 0;
    let value=(Number(sample)+1)>>>0;
    value^=(Number(seed)>>>0);
    value^=Math.imul(Number(slotIndex)+1,0x9e3779b1);
    value^=value>>>16;value=Math.imul(value,0x7feb352d);
    value^=value>>>15;value=Math.imul(value,0x846ca68b);
    value^=value>>>16;
    return (value>>>0)%count;
  }
  const $ = id => document.getElementById(id);
  const key = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labelSet = value => {
    const raw=key(value).replace(/^(double|triple)/,'');
    return window.HolocronModEngine.canonicalSet(raw)||raw;
  };
  const slotOf = mod => window.HolocronModEngine.canonicalSlot(
    mod?.slot ?? mod?.slot_id ?? mod?.slotId ?? mod?.modSlot ?? ''
  ) || '';
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
  const KYBER_PERCENT_PRIMARY_KEYS=new Set(['OFFENSE','DEFENSE','HEALTH','PROTECTION','CRITICALDAMAGE','POTENCY','TENACITY','CRITICALCHANCE','CRITICALAVOIDANCE','ACCURACY','EVASION']);
  const statKey = (value,slot=null,fromKyber=false) => {
    const raw=String(value??'').trim();
    let canonical=window.HolocronModEngine.canonicalStatKey(raw).toUpperCase();
    if(!canonical)canonical=key(raw).toUpperCase();
    const plain=canonical.replace(/PERCENT$/,'');
    if(raw.includes('%')&&KYBER_PERCENT_PRIMARY_KEYS.has(plain)&&!canonical.endsWith('PERCENT'))canonical+='PERCENT';
    const variableSlot=['Arrow','Triangle','Circle','Cross'].includes(slot);
    // SWGOH.GG omits the percent sign on fixed primaries: Square is always
    // Offense % and Diamond is always Defense %. Normalize that source shorthand
    // to the actual mod primary without changing the shared engine's flat/percent distinction.
    const fixedPrimary=FIXED[slot];
    if(fromKyber&&!canonical.endsWith('PERCENT')&&fixedPrimary&&canonical===window.HolocronModEngine.canonicalStatKey(fixedPrimary).toUpperCase()){
      const percent=window.HolocronModEngine.canonicalStatKey(fixedPrimary+' %').toUpperCase();
      canonical=percent||canonical+'PERCENT';
    }
    if(fromKyber&&variableSlot&&!canonical.endsWith('PERCENT')&&KYBER_PERCENT_PRIMARY_KEYS.has(canonical)){
      const percent=window.HolocronModEngine.canonicalStatKey(raw+' %').toUpperCase();
      canonical=percent||canonical;
      if(!canonical.endsWith('PERCENT'))canonical+='PERCENT';
    }
    return canonical.toLowerCase();
  };
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
      const currentPrimary=distribution.find(x=>statKey(x.name,slot,true)===statKey(mod?.primary_stat,slot,false));
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
  async function buildAudit(options={}){
    const forceRefresh=options?.forceRefresh===true;
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
          // Visionnaire audits the live SWGOH.GG Kyber slice, never a local optimizer snapshot.
          const fetched=typeof fetchKyberProfile==='function'?await fetchKyberProfile(character,{forceRefresh}):null;
          const profile=fetched&&(typeof kyberProfileValid!=='function'||kyberProfileValid(fetched))?fetched:null;
          if(profile && (typeof kyberProfileValid!=='function'||kyberProfileValid(profile))) {
            row=inspectCharacter(character,profile);
            const requestKey=key(character?.name||character?.character||character?.baseId||character?.base_id||'');
            row.referenceStatus=window.__kyberReferenceStatuses?.[requestKey]||{status:'unknown',label:'Référence Kyber non vérifiable'};
            state.progress.profiles++;
          } else {
            if(window.__kyberLastFetchError)state.progress.lastError=String(window.__kyberLastFetchError);
            const requestKey=key(character?.name||character?.character||character?.baseId||character?.base_id||'');
            const referenceStatus=window.__kyberReferenceStatuses?.[requestKey]||{status:'unknown',label:'Référence Kyber non vérifiable'};
            row={character,profile:null,referenceStatus,slotRows:modsOf(character),setVerifiable:false,primaryVerifiable:false,setMismatch:false,primaryMismatch:false,setSlots:[],primarySlots:[]};
          }
        }catch(error){
          const message=String(error?.message||error);
          state.progress.failures++;
          state.progress.lastError=message;
          row={character,profile:null,referenceStatus:{status:'error',label:'Référence Kyber non vérifiable',reason:message},slotRows:modsOf(character),setVerifiable:false,primaryVerifiable:false,setMismatch:false,primaryMismatch:false,setSlots:[],primarySlots:[],error:message};
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
    const normalized=window.HolocronModEngine.normalizeStat(value);
    return normalized?.key ? normalized.name : String(value??'').trim().replace(/%$/,'').trim();
  };
  function exchangeFinalStats(character,build){
    const hasValidatedProfile=typeof optimizerValidatedProfileForCharacter==='function';
    const profile=hasValidatedProfile
      ? (optimizerValidatedProfileForCharacter(character)||{})
      : (typeof optimizerProfileForCharacter==='function'?(optimizerProfileForCharacter(character)||{}):{});
    const base=profile.base_stats || (typeof baseStatsForCharacter==='function'?baseStatsForCharacter(character):null);
    if(!base||typeof base!=='object'||!Object.keys(base).length)return null;
    const metadata=typeof optimizerRosterMetadata==='function'?(optimizerRosterMetadata(character)||{}):{};
    const gearLevel=metadata.gear_level ?? character?.gear_level ?? character?.gear;
    const source=profile.base_stats ? profile : {base_stats:base,gear_level:gearLevel};
    const calculation=window.HolocronModEngine.calculateFinalStats(source,build,character?.level);
    if(!calculation.complete)return null;
    return Object.fromEntries(Object.entries(calculation.stats||{}).map(([name,value])=>[exchangeStatName(name),Number(value)]));
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
    if(!before||!after)return null;
    const measurable=Object.keys(before).filter(name=>Object.prototype.hasOwnProperty.call(after,name)&&Number(before[name])!==0);
    return measurable.length?measurable.reduce((sum,name)=>sum+((Number(after[name])||0)-(Number(before[name])||0))/Math.abs(Number(before[name])),0)/measurable.length:null;
  };
  function exchangeSecondaryFocusScore(profile,build){
    const focus=profile?.secondary_focus||{};
    const entries=Object.entries(focus).filter(([,value])=>Number(value)>0);
    if(!entries.length)return null;
    const totals={};
    for(const mod of Array.isArray(build)?build:[]){
      for(let i=1;i<=4;i++){
        const stat=mod['secondary_'+i+'_stat'],value=Number(mod['secondary_'+i+'_value']);
        if(!stat||!Number.isFinite(value))continue;
        const normalized=key(exchangeStatName(stat));
        totals[normalized]=(totals[normalized]||0)+value;
      }
    }
    const scores=entries.map(([name,expected])=>{
      const actual=totals[key(exchangeStatName(name))]||0;
      return Math.max(0,Math.min(1,actual/Number(expected)));
    });
    return scores.reduce((sum,value)=>sum+value,0)/scores.length*100;
  }
  function exchangeTargetFocusImpact(profile,beforeBuild,afterBuild,beforeStats,afterStats){
    const focus=Object.entries(profile?.secondary_focus||{}).filter(([,expected])=>Number(expected)>0);
    if(!focus.length)return null;
    const totals=build=>{
      const result={};
      for(const mod of Array.isArray(build)?build:[]){
        for(let i=1;i<=4;i++){
          const stat=mod['secondary_'+i+'_stat'],value=Number(mod['secondary_'+i+'_value']);
          if(!stat||!Number.isFinite(value))continue;
          const name=key(exchangeStatName(stat));
          result[name]=(result[name]||0)+value;
        }
      }
      return result;
    };
    const before=totals(beforeBuild),after=totals(afterBuild);
    const rows=focus.map(([name,expected])=>{
      const normalized=key(exchangeStatName(name)),from=before[normalized]||0,to=after[normalized]||0;
      const delta=to-from,reference=Number(expected)||1;
      return {name,before:from,after:to,expected:reference,delta,relative:delta/reference};
    });
    const losses=rows.filter(row=>row.delta < -Math.max(1,row.expected*.25));
    const protectedStats=new Set(['health','protection','offense','defense','physicaldamage','specialdamage','armor','resistance','speed']);
    const coreLosses=beforeStats&&afterStats?Object.keys(beforeStats).filter(name=>protectedStats.has(key(name))).map(name=>{
      const from=Number(beforeStats[name])||0,to=Number(afterStats[name])||0;
      return {name,before:from,after:to,delta:to-from,relative:from?(to-from)/Math.abs(from):null};
    }).filter(row=>row.relative!==null&&row.relative<-.35):[];
    return {balance:rows.reduce((sum,row)=>sum+row.relative,0)/rows.length,rows,losses:[...losses,...coreLosses],coreLosses};
  }
  const exchangeClamp = value => Math.max(0,Math.min(100,Number(value)||0));
  function exchangeScenarioScore({mode,beforeSetDistance,afterSetDistance,primaryShare,secondaryFocus,targetBalance,donors}){
    const hasSet=Number.isFinite(beforeSetDistance)&&Number.isFinite(afterSetDistance);
    const setFit=hasSet?exchangeClamp(50+50*(beforeSetDistance-afterSetDistance)/Math.max(1,beforeSetDistance)):null;
    const primaryFit=Number.isFinite(primaryShare)?exchangeClamp(primaryShare*100):null;
    const secondaryFit=Number.isFinite(secondaryFocus)?exchangeClamp(secondaryFocus):null;
    const parts=mode==='primaries'
      ? [{value:primaryFit,weight:.7},{value:secondaryFit,weight:.3}]
      : mode==='both'
        ? [{value:setFit,weight:.45},{value:primaryFit,weight:.25},{value:secondaryFit,weight:.30}]
        : [{value:setFit,weight:.60},{value:primaryFit,weight:.15},{value:secondaryFit,weight:.25}];
    const availableParts=parts.filter(part=>part.value!==null);
    const reference=availableParts.length?availableParts.reduce((sum,part)=>sum+part.value*part.weight,0)/availableParts.reduce((sum,part)=>sum+part.weight,0):50;
    const targetStats=targetBalance===null?50:exchangeClamp(50+targetBalance*100);
    const donorUsage=donors.length?donors.reduce((sum,d)=>sum+100/(1+Math.max(0,Number(d.uses)||0)/50),0)/donors.length:100;
    const donorStats=donors.length?donors.reduce((sum,d)=>sum+(d.statBalance===null?50:exchangeClamp(50+d.statBalance*250)),0)/donors.length:100;
    const donorStatus=donors.length?100-donors.filter(d=>d.statusWorsened).length/donors.length*100:100;
    const donorCost=donorUsage*.45+donorStats*.35+donorStatus*.20;
    const score=Math.round(reference*.45+targetStats*.25+donorCost*.30);
    const complete=targetBalance!==null&&donors.every(d=>d.statBalance!==null);
    const statusSafe=donors.every(d=>!d.statusWorsened);
    const verdict=score>=75&&complete&&statusSafe?'RECOMMANDÉ':score>=55?'À EXAMINER':'PRUDENCE';
    return {score,verdict,reference:Math.round(reference),secondaryFocus:secondaryFit===null?null:Math.round(secondaryFit),targetStats:Math.round(targetStats),donorCost:Math.round(donorCost),complete};
  }
  const exchangeFormatStat = value => Number(value).toLocaleString('fr-FR',{maximumFractionDigits:1});
  function exchangeStatsMarkup(before,after){
    if(!before||!after)return '<p class="visionnaire-stats-unavailable">Calcul non vérifiable : statistiques de base indisponibles pour ce personnage.</p>';
    const names=[...new Set([...Object.keys(before),...Object.keys(after)])].sort((a,b)=>a.localeCompare(b,'fr'));
    if(!names.length)return '<p class="visionnaire-stats-unavailable">Aucune statistique de base disponible.</p>';
    return '<div class="visionnaire-stat-table">'+names.map(name=>{
      const from=Number(before[name])||0,to=Number(after[name])||0,delta=to-from,relative=from?delta/Math.abs(from):null;
      return '<div><span>'+esc(name)+'</span><b>'+exchangeFormatStat(from)+' → '+exchangeFormatStat(to)+'</b><em class="'+(delta>0?'gain':delta<0?'loss':'neutral')+'">'+(delta>0?'+':'')+exchangeFormatStat(delta)+(relative===null?'':' · '+(relative>0?'+':'')+(relative*100).toFixed(1)+'%')+'</em></div>';
    }).join('')+'</div>';
  }
  function exchangeGacSourceDiagnostic(){
    const usageData=typeof window!=='undefined'?(window.__SWGOH_GAC_USAGE__||{}):{};
    const usageStatus=usageData.sourceStatus||'unavailable';
    if(usageStatus==='stale')return 'Les données GAC datent de plus de 35 jours : elles sont conservées, mais exclues du classement des donneurs. Relance le collecteur navigateur pour actualiser la base.';
    if(usageStatus==='partial')return 'La source GAC disponible est partielle (défenses uniquement). Elle ne suffit pas à classer les donneurs du Visionnaire. Utilise le collecteur navigateur pour obtenir les statistiques complètes.';
    if(usageStatus==='unavailable'||usageStatus==='awaiting-source-access')return 'Aucune collecte GAC complète exploitable. SWGOH.GG bloque actuellement les requêtes serveur ; lance le collecteur navigateur : https://selimna95.github.io/Selimna-Holocron/tools/gac-collector.html';
    return '';
  }
  async function buildExchangeProposals(row,selectedSlots){
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
      if(window.HolocronModEngine.normalizeMod(mod)?.complete!==true)return false;
      const ownerKey=mod?._sourceOwnerKey;
      const isFree=!ownerKey&&(!mod?._sourceOwner||mod._sourceOwner==='Libre')&&mod?._sourcePriorityKnown===true;
      if(!forgeSourceAllowedForSearch(mod,character)||(!isFree&&!ownerKey)||ownerKey===targetKey)return false;
      const owner=isFree?null:rosterCharacters.find(c=>characterKey(c)===ownerKey);
      if(!isFree&&(!owner||isGalacticLegendCharacter(owner)))return false;
      if(!isFree&&(mod._sourcePriorityKnown!==true||!Number.isFinite(Number(mod._sourceUsage))))return false;
      return true;
    });
    const optionsBySlot=new Map(),setFilteredBySlot={},primaryFilteredBySlot={},eligibleBySlot={};
    const beforeSetDistance=exchangeSetDistance(current,profile);
    const exactSetConfigurations=rankedSetConfigurations(profile).filter(config=>config.exact);
    const fixedTargetMods=current.filter(mod=>!slots.includes(slotOf(mod)));
    const fixedTargetSetCounts=exchangeSetCounts(fixedTargetMods);
    const setCandidateCanImprove=mod=>{
      if(!exactSetConfigurations.length||beforeSetDistance===null)return true;
      const candidateSet=labelSet(mod?.set_name??mod?.set??'');
      if(!candidateSet)return true;
      // A candidate set must occur in at least one observed Kyber composition.
      // Consider every composition, not just the most popular one.
      const compatibleConfigurations=exactSetConfigurations.filter(config=>Number(config.counts?.[candidateSet])>0);
      if(!compatibleConfigurations.length)return false;
      // With one selected slot there is no later candidate to complete a
      // singleton set, so compare the exact six-mod result immediately.
      if(slots.length===1)return exchangeSetDistance(fixedTargetMods.concat(mod),profile)<beforeSetDistance;
      const minimumUnavoidableDistance=Math.min(...compatibleConfigurations.map(config=>{
        const names=new Set([...Object.keys(config.counts||{}),...Object.keys(fixedTargetSetCounts),candidateSet]);
        let excess=0;
        for(const name of names){
          const rawCount=(fixedTargetSetCounts[name]||0)+(name===candidateSet?1:0);
          // A singleton set has no active bonus; a second piece can activate it.
          const activeCount=rawCount>=2?rawCount:0;
          excess+=Math.max(0,activeCount-(Number(config.counts?.[name])||0));
        }
        return excess;
      }));
      return minimumUnavoidableDistance<beforeSetDistance;
    };
    for(const slot of slots){
      const ordered=[...new Map(source.filter(mod=>slotOf(mod)===slot&&exchangeModId(mod)!==exchangeModId(currentBySlot.get(slot)))
        .map(mod=>({...mod,_visionnaireDonor:mod._sourceOwnerKey?rosterCharacters.find(c=>characterKey(c)===mod._sourceOwnerKey):null}))
        .filter(mod=>!mod._sourceOwnerKey||mod._visionnaireDonor)
        .map(mod=>[exchangeModId(mod),mod])).values()];
      // 1. Filter sets against every exact Kyber composition, retaining any
      // candidate that can still participate in an improvement with the other
      // selected slots. Missing set references remain unknown, never invalid.
      const setEligible=ordered.filter(setCandidateCanImprove);
      setFilteredBySlot[LABELS[slot]]=ordered.length-setEligible.length;
      // 2. Filter primaries for the target slot only when that criterion is active.
      const reference=primaryDistribution(profile,slot);
      const eligible=!reference.length?setEligible:
        setEligible.filter(mod=>reference.some(entry=>statKey(entry.name,slot,true)===statKey(mod?.primary_stat,slot,false)));
      primaryFilteredBySlot[LABELS[slot]]=setEligible.length-eligible.length;
      eligibleBySlot[LABELS[slot]]=eligible.length;
      // No speed ranking, diversity sampling, or per-slot candidate cap:
      // every mod surviving the selected Kyber filters enters the search.
      optionsBySlot.set(slot,eligible);
    }
    const empty=slots.filter(slot=>!(optionsBySlot.get(slot)||[]).length);
    if(empty.length)return {proposals:[],diagnostics:{
      sourceCount:source.length,eligibleBySlot,setFilteredBySlot,primaryFilteredBySlot,
      optionsBySlot:Object.fromEntries(slots.map(slot=>[LABELS[slot],(optionsBySlot.get(slot)||[]).length])),
      searchSpace:0,fullCandidateSearchSpace:0,tested:0,sampled:0,accepted:0,
      searchStages:[],rejected:{},examples:[],rejectedCandidates:[]
    },reason:exchangeGacSourceDiagnostic()||('Aucun donneur vérifié compatible avec les filtres Kyber pour : '+empty.map(slot=>LABELS[slot]).join(', ')+'. Les GL et les usages GAC inconnus sont exclus.')};
    const beforeProjectionSummary=forgeProjectedModSpeed(character,profile,current);
    if(!beforeProjectionSummary.complete)return {proposals:[],reason:'La vitesse actuelle de la cible est non calculable : données de base ou mods incomplets.'};
    const beforeSpeed=beforeProjectionSummary.total;
    let activeSlots=slots.slice();
    const targetPrimarySafe=chosen=>activeSlots.every(slot=>{
      const mod=chosen.find(x=>slotOf(x)===slot),reference=primaryDistribution(profile,slot);
      // Missing Kyber data is unknown, not evidence that a primary is invalid.
      return !reference.length||reference.some(entry=>statKey(entry.name,slot,true)===statKey(mod?.primary_stat,slot,false));
    });
    const proposals=[];let tested=0,acceptedCount=0,chosen=[],sampled=0,speedPruned=0;
    const baseSpeed=beforeProjectionSummary.baseSpeed;
    const maximumSpeedSetBonus=baseSpeed>0?baseSpeed*.1:0;
    const retainedSpeed=current.filter(mod=>!slots.includes(slotOf(mod))).reduce((sum,mod)=>sum+modTotalSpeed(mod),0);
    const buildSlotSubsets=(size,start=0,prefix=[],out=[])=>{
      if(prefix.length===size){out.push(prefix.slice());return out;}
      for(let index=start;index<=slots.length-(size-prefix.length);index++){
        prefix.push(slots[index]);buildSlotSubsets(size,index+1,prefix,out);prefix.pop();
      }
      return out;
    };
    const slotSubsetGroups=Array.from({length:slots.length},(_,index)=>({
      size:index+1,subsets:buildSlotSubsets(index+1)
    }));
    const candidateSpeedCeiling=baseSpeed+Math.max(0,...slotSubsetGroups.flatMap(group=>group.subsets.map(subset=>
      current.filter(mod=>!subset.includes(slotOf(mod))).reduce((sum,mod)=>sum+modTotalSpeed(mod),0)+
      subset.reduce((sum,slot)=>sum+Math.max(0,...(optionsBySlot.get(slot)||[]).map(modTotalSpeed)),0)
    )))+maximumSpeedSetBonus;
    const subsetProduct=(subset,useEligible=false)=>subset.reduce((product,slot)=>{
      const count=useEligible?(eligibleBySlot[LABELS[slot]]||0):(optionsBySlot.get(slot)||[]).length;
      return product*count;
    },1);
    const searchSpace=slotSubsetGroups.reduce((sum,group)=>sum+group.subsets.reduce((part,subset)=>part+subsetProduct(subset),0),0);
    const fullCandidateSearchSpace=slotSubsetGroups.reduce((sum,group)=>sum+group.subsets.reduce((part,subset)=>part+subsetProduct(subset,true),0),0);
    const candidatePoolCoverage=fullCandidateSearchSpace?Math.min(1,searchSpace/fullCandidateSearchSpace):1;
    const diagnostics={limit:15000,sourceCount:source.length,beforeSpeed:beforeProjectionSummary.total,
      retainedSpeed,candidateSpeedCeiling,searchSpace,fullCandidateSearchSpace,candidatePoolCoverage,
      fullSearchCoverage:0,eligibleBySlot,setFilteredBySlot,primaryFilteredBySlot,
      searchMethod:'Recherche progressive : filtres Kyber sets puis primaires, puis échanges à un slot, paires et groupes plus larges ; aucun plafond par slot',searchStages:[],
      optionsBySlot:Object.fromEntries(slots.map(slot=>[LABELS[slot],(optionsBySlot.get(slot)||[]).length])),
      bestCandidateSpeedBySlot:Object.fromEntries(slots.map(slot=>[LABELS[slot],Math.max(0,...(optionsBySlot.get(slot)||[]).map(modTotalSpeed))])),
      rejected:{},examples:[],rejectedCandidates:[]};
    const reject=(reason,detail='',score=null,metrics={})=>{
      diagnostics.rejected[reason]=(diagnostics.rejected[reason]||0)+1;
      if(detail&&diagnostics.examples.length<8&&!diagnostics.examples.some(item=>item.reason===reason))diagnostics.examples.push({reason,detail});
      if(diagnostics.rejectedCandidates.length<5)diagnostics.rejectedCandidates.push({reason,detail,score:Number.isFinite(score)?score:null,...metrics,
        transfers:chosen.map(mod=>({slot:LABELS[slotOf(mod)],set:mod.set_name||mod.set||'Set inconnu',
          speed:modTotalSpeed(mod),source:mod._visionnaireDonor?.name||mod._sourceOwner||'Libre'}))});
    };
    const evaluateCombination=async combo=>{
      chosen=combo;

        const finalTarget=current.filter(mod=>!activeSlots.includes(slotOf(mod))).concat(chosen);
        // Revalidate the complete Kyber set composition and selected primaries
        // before invoking any speed projection for this combination.
        const afterSetDistance=exchangeSetDistance(finalTarget,profile);
        if(beforeSetDistance!==null&&afterSetDistance!==null&&afterSetDistance>=beforeSetDistance){
          reject('reference_sets','La composition de sets ne se rapproche pas de Kyber');return;
        }
        if(!targetPrimarySafe(chosen)){reject('primaire_cible','Une primaire reçue n’est pas observée dans Kyber');return;}
        const beforeProjection=forgeProjectedModSpeed(character,profile,current);
        const afterProjection=forgeProjectedModSpeed(character,profile,finalTarget);
        if(!beforeProjection.complete||!afterProjection.complete){reject('vitesse_cible_inconnue','Vitesse cible non calculable : données de base ou mods incomplets');return;}
        const afterSpeed=afterProjection.total;
        if(beforeProjection.baseSpeed<=0&&beforeProjection.hasFourPieceSpeedSet&&!afterProjection.hasFourPieceSpeedSet){reject('bonus_vitesse_cible','Perte du bonus de set Vitesse');return;}
        if(afterSpeed+1e-9<beforeSpeed){reject('vitesse_cible','La vitesse totale de la cible diminuerait',null,{targetSpeedBefore:beforeSpeed,targetSpeedAfter:afterSpeed,speedLoss:beforeSpeed-afterSpeed});return;}
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
            if(donorIndex<0||!returned){reject('donneur_incomplet','Le mod de retour du donneur est introuvable');return;}
            after[donorIndex]=returned;
          }
          if(before.length!==6||after.length!==6||new Set(after.map(slotOf)).size!==6||!exchangeSetBonusesPreserved(before,after)){reject('bonus_sets_donneur','Le donneur perdrait un bonus de set ou son build est incomplet',owner.name||owner.baseId);return;}
          const donorProfile=optimizerValidatedProfileForCharacter(owner)||{};
          const beforeStats=exchangeFinalStats(owner,before),afterStats=exchangeFinalStats(owner,after);
          if(!beforeStats||!afterStats){reject('stats_donneur_incompletes','Calcul des statistiques du donneur incomplet : données de base ou formule non disponible',owner.name||owner.baseId);return;}
          const donorBeforeSpeed=forgeProjectedModSpeed(owner,donorProfile,before);
          const donorAfterSpeed=forgeProjectedModSpeed(owner,donorProfile,after);
          if(!donorBeforeSpeed.complete||!donorAfterSpeed.complete){reject('vitesse_donneur_inconnue','Vitesse du donneur non calculable : données de base ou mods incomplets',null,{donor:owner.name||owner.baseId});return;}
          const donorImpact=exchangeStatsDelta(beforeStats,afterStats);
          const beforeStatus=typeof v176ModStatus==='function'?v176ModStatus(before).status:'INCONNU';
          const afterStatus=typeof v176ModStatus==='function'?v176ModStatus(after).status:'INCONNU';
          const statusRank={'BONS':0,'MOYENS':1,'FAIBLES':2,'TRÈS FAIBLES':3,'INCOMPLETS':4,'SANS MODS':5,'SANS MOD':5};
          donors.push({owner,transfers,beforeSpeed:donorBeforeSpeed.total,
            afterSpeed:donorAfterSpeed.total,
            beforeSets:exchangeSetCounts(before),afterSets:exchangeSetCounts(after),
            beforeStats,afterStats,statDeltas:donorImpact,statBalance:exchangeStatBalance(beforeStats,afterStats),
            uses:Number(transfers[0]._sourceUsage)||0,beforeStatus,afterStatus,
            statusWorsened:(statusRank[afterStatus]??0)>(statusRank[beforeStatus]??0)});
        }
        const targetStatsBefore=exchangeFinalStats(character,current),targetStatsAfter=exchangeFinalStats(character,finalTarget);
        if(!targetStatsBefore||!targetStatsAfter){reject('stats_cible_incompletes','Calcul des statistiques de la cible incomplet : données de base ou formule non disponible');return;}
        const targetStatDeltas=exchangeStatsDelta(targetStatsBefore,targetStatsAfter);
        const primaryShares=activeSlots.map(slot=>{
          const mod=chosen.find(item=>slotOf(item)===slot);
          return primaryDistribution(profile,slot).find(entry=>statKey(entry.name,slot,true)===statKey(mod?.primary_stat,slot,false))?.weight??null;
        });
        const knownPrimaryShares=primaryShares.filter(value=>Number.isFinite(value));
        const primaryShare=knownPrimaryShares.length?knownPrimaryShares.reduce((sum,value)=>sum+value,0)/knownPrimaryShares.length:null;
        const secondaryFocus=exchangeSecondaryFocusScore(profile,finalTarget);
        const targetFocusImpact=exchangeTargetFocusImpact(profile,current,finalTarget,targetStatsBefore,targetStatsAfter);
        // Never trade away a major part of a Kyber-prioritized secondary for a cosmetic score gain.
        if(targetFocusImpact?.losses.length){const loss=targetFocusImpact.losses[0];const preview=exchangeScenarioScore({mode:state.mode,beforeSetDistance,afterSetDistance,primaryShare,secondaryFocus,targetBalance:targetFocusImpact?.balance??null,donors});reject('perte_stat_cible',loss.name+' : '+Number(loss.relative*100).toFixed(1)+'%',preview.score);return;}
        const score=exchangeScenarioScore({mode:state.mode,beforeSetDistance,afterSetDistance,primaryShare,secondaryFocus,
          targetBalance:targetFocusImpact?.balance??null,donors});
        const ids=chosen.map(exchangeModId).join('|');
        if(proposals.some(item=>item.signature===ids)){reject('doublon','Combinaison déjà retenue');return;}
        proposals.push({signature:ids,transfers:chosen.slice(),donors,beforeSpeed,afterSpeed,
          speedGain:afterSpeed-beforeSpeed,beforeSetDistance,afterSetDistance,
          targetStatsBefore,targetStatsAfter,targetStatDeltas,targetFocusImpact,primaryShare,secondaryFocus,score,
          freeMods:chosen.filter(item=>!item._visionnaireDonor).length,
          usage:chosen.reduce((sum,m)=>sum+Number(m._sourceUsage||0),0)});
        acceptedCount++;
        if(proposals.length>30){proposals.sort((a,b)=>b.score.score-a.score.score||a.usage-b.usage||(a.afterSetDistance??99)-(b.afterSetDistance??99));proposals.length=30;}
        return;
    };
    // Explore partial exchanges first. Each slot subset is evaluated with
    // every unselected target mod left untouched; this avoids forcing six
    // simultaneous changes when a one- or two-slot correction is sufficient.
    const seed=Array.from(String(targetKey||'visionnaire')).reduce((hash,char)=>(Math.imul(hash^char.charCodeAt(0),16777619)>>>0),2166136261);
    const attemptLimit=Math.min(Math.max(searchSpace*2,30000),1000000);
    let subsetOrdinal=0,remainingSubsets=slotSubsetGroups.reduce((sum,group)=>sum+group.subsets.length,0);
    let stopSearch=false;
    for(const group of slotSubsetGroups){
      const stage={size:group.size,subsets:group.subsets.length,space:group.subsets.reduce((sum,subset)=>sum+subsetProduct(subset),0),sampled:0,tested:0,accepted:0,exhaustive:true};
      for(const subset of group.subsets){
        if(tested>=diagnostics.limit||sampled>=attemptLimit){stopSearch=true;stage.exhaustive=false;break;}
        activeSlots=subset;
        const optionLists=subset.map(slot=>optionsBySlot.get(slot)||[]);
        const lengths=optionLists.map(options=>options.length);
        const combinationSpace=lengths.reduce((product,count)=>product*count,1);
        const remainingAttempts=attemptLimit-sampled;
        const subsetBudget=Math.min(combinationSpace,Math.max(1,Math.floor(remainingAttempts/Math.max(1,remainingSubsets))));
        const exhaustive=combinationSpace<=subsetBudget;
        const targetCount=exhaustive?combinationSpace:subsetBudget;
        const localAttemptLimit=exhaustive?combinationSpace:Math.min(combinationSpace*32,Math.max(targetCount*32,30000));
        const localSeen=new Set();
        let localSample=0;
        while(localSeen.size<targetCount&&localSample<localAttemptLimit&&tested<diagnostics.limit&&sampled<attemptLimit){
          let indexes;
          if(exhaustive){
            let remainder=localSample;
            indexes=new Array(lengths.length);
            for(let index=lengths.length-1;index>=0;index--){
              indexes[index]=remainder%lengths[index];
              remainder=Math.floor(remainder/lengths[index]);
            }
          }else{
            indexes=lengths.map((count,index)=>visionnaireSampleIndex(
              localSample,index,count,seed^Math.imul(subsetOrdinal+1,0x9e3779b1)
            ));
          }
          localSample++;
          const combo=indexes.map((index,position)=>optionLists[position][index]);
          const signature=combo.map(exchangeModId).join('|');
          if(localSeen.has(signature))continue;
          localSeen.add(signature);sampled++;stage.sampled++;
          const retainedForSubset=current.filter(mod=>!activeSlots.includes(slotOf(mod)))
            .reduce((sum,mod)=>sum+modTotalSpeed(mod),0);
          const theoreticalMaximum=baseSpeed+retainedForSubset+
            combo.reduce((sum,mod)=>sum+modTotalSpeed(mod),0)+maximumSpeedSetBonus;
          if(theoreticalMaximum+1e-9<beforeSpeed)speedPruned++;
          else{
            tested++;stage.tested++;chosen=combo;
            const acceptedBefore=acceptedCount;
            if(tested%50===0){state.searchProgress={tested,limit:diagnostics.limit,sampled};render();}
            await evaluateCombination(combo);
            if(acceptedCount>acceptedBefore)stage.accepted++;
          }
          if(sampled%500===0){
            state.searchProgress={tested,limit:diagnostics.limit,sampled};
            render();
            await new Promise(resolve=>setTimeout(resolve,0));
          }
        }
        if(localSeen.size<combinationSpace)stage.exhaustive=false;
        if(localSeen.size<targetCount)stage.exhaustive=false;
        subsetOrdinal++;remainingSubsets--;
        if(tested>=diagnostics.limit||sampled>=attemptLimit){stopSearch=true;stage.exhaustive=false;break;}
      }
      diagnostics.searchStages.push(stage);
      if(stopSearch)break;
    }
    const completedSizes=new Set(diagnostics.searchStages.map(stage=>stage.size));
    for(const group of slotSubsetGroups)if(!completedSizes.has(group.size))diagnostics.searchStages.push({
      size:group.size,subsets:group.subsets.length,
      space:group.subsets.reduce((sum,subset)=>sum+subsetProduct(subset),0),
      sampled:0,tested:0,accepted:0,exhaustive:false,notStarted:true
    });
    diagnostics.searchStages.sort((a,b)=>a.size-b.size);
    state.searchProgress={tested,limit:diagnostics.limit,sampled};
    proposals.sort((a,b)=>b.score.score-a.score.score||a.usage-b.usage||(a.afterSetDistance??99)-(b.afterSetDistance??99));
    diagnostics.tested=tested;diagnostics.sampled=sampled;diagnostics.accepted=acceptedCount;diagnostics.retainedProposals=proposals.length;diagnostics.speedPruned=speedPruned;diagnostics.searchCoverage=searchSpace?Math.min(1,sampled/searchSpace):1;diagnostics.fullSearchCoverage=fullCandidateSearchSpace?Math.min(1,sampled/fullCandidateSearchSpace):1;diagnostics.hitLimit=tested>=diagnostics.limit||(sampled<searchSpace&&sampled>=attemptLimit);diagnostics.attemptLimit=attemptLimit;diagnostics.completedStages=diagnostics.searchStages.filter(stage=>stage.exhaustive).length;
    const noSourceReason=exchangeGacSourceDiagnostic()||'Aucun mod source éligible : aucun mod libre et aucune utilisation GAC vérifiée pour classer les donneurs.';
    const reason=proposals.length?'':!source.length?noSourceReason:diagnostics.hitLimit?'La recherche a atteint sa limite de sécurité sans scénario validé.':'Aucun scénario ne respecte simultanément les filtres Kyber, la vitesse cible et les bonus de sets des donneurs.';
    return {proposals:proposals.slice(0,5),tested,sourceCount:source.length,diagnostics,reason};
  }
  function renderExchangeDiagnostics(diagnostics){
    if(!diagnostics)return '';
    const formatSpace=value=>Number.isFinite(Number(value))?Math.round(Number(value)).toLocaleString('fr-FR'):'très vaste';
    const labels={bonus_vitesse_cible:'Bonus Vitesse cible',vitesse_cible:'Vitesse cible',vitesse_cible_inconnue:'Vitesse cible non calculable',vitesse_donneur_inconnue:'Vitesse donneur non calculable',reference_sets:'Référence des sets',primaire_cible:'Primaires Kyber',donneur_incomplet:'Donneur incomplet',bonus_sets_donneur:'Bonus de sets donneur',perte_stat_cible:'Pertes statistiques cible',doublon:'Doublons'};
    const rejected=Object.entries(diagnostics.rejected||{}).sort((a,b)=>b[1]-a[1]);
    return '<details class="visionnaire-search-diagnostics" open><summary>DIAGNOSTIC DE RECHERCHE · '+diagnostics.tested.toLocaleString('fr-FR')+' combinaisons testées · '+diagnostics.sourceCount+' mods sources</summary>'+
      '<p>Candidats après filtres Kyber : '+Object.entries(diagnostics.eligibleBySlot||{}).map(([slot,count])=>esc(slot)+' '+formatSpace(count)).join(' · ')+' · exclus par sets : '+Object.entries(diagnostics.setFilteredBySlot||{}).map(([slot,count])=>esc(slot)+' '+formatSpace(count)).join(' · ')+' · exclus par primaires : '+Object.entries(diagnostics.primaryFilteredBySlot||{}).map(([slot,count])=>esc(slot)+' '+formatSpace(count)).join(' · ')+'</p>'+
      '<p>'+esc(diagnostics.searchMethod||'')+' · '+Number(diagnostics.tested||0).toLocaleString('fr-FR')+' combinaisons compatibles avec le plafond de vitesse évaluées · '+Number(diagnostics.speedPruned||0).toLocaleString('fr-FR')+' écartées avant calcul car la vitesse était insuffisante · '+Number(diagnostics.sampled||0).toLocaleString('fr-FR')+' combinaisons distinctes parcourues · '+Number(diagnostics.accepted||0).toLocaleString('fr-FR')+' scénarios valides · '+Number((Number(diagnostics.searchCoverage||0)*100).toFixed(3)).toLocaleString('fr-FR')+'% de la recherche progressive</p>'+
      '<p>Étapes : '+(diagnostics.searchStages||[]).map(stage=>stage.size+' slot(s) '+Number(stage.sampled||0).toLocaleString('fr-FR')+'/'+formatSpace(stage.space)+(stage.exhaustive?' · exhaustif':stage.sampled?' · partiel':' · non lancé')+' · '+Number(stage.accepted||0)+' scénario(s)').join(' ; ')+'</p>'+
      '<p>Espace total des mods éligibles : '+formatSpace(diagnostics.fullCandidateSearchSpace)+' combinaisons · vivier retenu : '+Number((Number(diagnostics.candidatePoolCoverage||0)*100).toFixed(3)).toLocaleString('fr-FR')+'% · couverture du total éligible : '+Number((Number(diagnostics.fullSearchCoverage||0)*100).toFixed(3)).toLocaleString('fr-FR')+'%</p>'+
      '<p>Vitesse actuelle cible : '+Number(diagnostics.beforeSpeed||0).toFixed(1)+' · plafond des candidats (hors bonus de set) : '+Number(diagnostics.candidateSpeedCeiling||0).toFixed(1)+'</p>'+
      (diagnostics.rejectedCandidates?.some(item=>item.targetSpeedBefore!=null)?'<p>Premier contrôle vitesse : '+Number(diagnostics.rejectedCandidates.find(item=>item.targetSpeedBefore!=null).targetSpeedBefore).toFixed(1)+' → '+Number(diagnostics.rejectedCandidates.find(item=>item.targetSpeedBefore!=null).targetSpeedAfter).toFixed(1)+' (−'+Number(diagnostics.rejectedCandidates.find(item=>item.targetSpeedBefore!=null).speedLoss).toFixed(1)+')</p>':'')+
      (rejected.length?'<ul>'+rejected.map(([reason,count])=>'<li><b>'+esc(labels[reason]||reason)+'</b> : '+count.toLocaleString('fr-FR')+'</li>').join('')+'</ul>':'<p>Aucun rejet comptabilisé.</p>')+
      (diagnostics.examples?.length?'<div class="visionnaire-search-examples"><b>Exemples de motifs</b>'+diagnostics.examples.map(item=>'<p>'+esc(labels[item.reason]||item.reason)+' : '+esc(item.detail)+'</p>').join('')+'</div>':'')+
      (diagnostics.rejectedCandidates?.length?'<div class="visionnaire-search-examples"><b>Meilleurs échanges écartés</b>'+diagnostics.rejectedCandidates.map(item=>'<p>'+(item.score===null?'Score non calculable':'Score indicatif '+item.score+'/100')+' · '+esc(labels[item.reason]||item.reason)+' — '+esc(item.detail)+' · '+item.transfers.map(t=>esc(t.slot)+': '+esc(t.set)+' ('+t.speed+' V, '+esc(t.source)+')').join(' / ')+'</p>').join('')+'</div>':'')+
      (diagnostics.hitLimit?'<p class="visionnaire-search-limit">Limite atteinte : les résultats sont partiels. Le moteur ne prétend pas avoir exploré toutes les combinaisons du vivier retenu.</p>':'')+
      '</details>';
  }
  function renderExchangeProposals(){
    if(state.searching)return '<div class="visionnaire-empty">Recherche progressive des échanges en cours… '+Number(state.searchProgress.tested||0).toLocaleString('fr-FR')+' / '+Number(state.searchProgress.limit||15000).toLocaleString('fr-FR')+' combinaisons compatibles vitesse évaluées · '+Number(state.searchProgress.sampled||0).toLocaleString('fr-FR')+' combinaisons distinctes parcourues. Tu peux laisser cette page ouverte : le navigateur reste disponible pendant le calcul.</div>';
    if(!state.proposals.length)return (state.searchError?'<div class="visionnaire-empty">'+esc(state.searchError)+'</div>':'')+renderExchangeDiagnostics(state.diagnostics);
    return '<div class="visionnaire-proposals">'+renderExchangeDiagnostics(state.diagnostics)+'<div class="visionnaire-section-kicker">ÉTAPE 4 · SCÉNARIOS CLASSÉS PAR QUALITÉ STRATÉGIQUE</div>'+
      state.proposals.map((proposal,index)=>'<article class="visionnaire-proposal"><header><b>SCÉNARIO '+(index+1)+' · '+proposal.score.verdict+'</b><span class="visionnaire-score">'+proposal.score.score+'/100</span></header>'+
      '<div class="visionnaire-score-breakdown"><span>Référence sets / primaires <b>'+proposal.score.reference+'/100</b></span><span>Secondaires Kyber <b>'+(proposal.score.secondaryFocus===null?'ND':proposal.score.secondaryFocus+'/100')+'</b></span><span>Stats cible <b>'+proposal.score.targetStats+'/100</b></span><span>Coût donneurs <b>'+proposal.score.donorCost+'/100</b></span></div>'+
      '<p class="visionnaire-score-method">Pondération : 45% référence Kyber ('+(state.mode==='primaries'?'primaires 70% · secondaires 30%':state.mode==='both'?'sets 45% · primaires 25% · secondaires 30%':'sets 60% · primaires 15% · secondaires 25%')+') · 25% équilibre statistique cible · 30% coût donneurs (usage GAC 45% · statistiques 35% · statut 20%). La vitesse reste un garde-fou, pas un bonus de score.</p>'+
      '<div class="visionnaire-proposal-speed"><span>VITESSE CIBLE · PLANCHER RESPECTÉ</span><b>'+proposal.beforeSpeed.toFixed(1)+' → '+proposal.afterSpeed.toFixed(1)+' ('+(proposal.speedGain>=0?'+':'')+proposal.speedGain.toFixed(1)+')</b></div>'+
      '<div class="visionnaire-stat-section"><b>IMPACT COMPLET · PERSONNAGE CIBLE</b>'+exchangeStatsMarkup(proposal.targetStatsBefore,proposal.targetStatsAfter)+'</div>'+
      '<p class="visionnaire-focus-note">'+(proposal.targetFocusImpact?'Garde-fou : aucune secondaire Kyber prioritaire ne perd plus de 25%, ni aucune statistique majeure (santé, protection, offense, défense) plus de 35%.':'Référence sans secondaires prioritaires exploitables : score statistique incomplet.')+'</p>'+
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
    state.searchProgress={tested:0,limit:15000};
    try{
      const result=await buildExchangeProposals(state.selected,[...state.slots]);
      state.proposals=result.proposals||[];
      state.diagnostics=result.diagnostics||null;
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
    const noReferenceRows=state.rows.filter(r=>!r.profile&&r.referenceStatus?.status==='unavailable');
    const unverifiableRows=state.rows.filter(r=>!r.profile&&r.referenceStatus?.status!=='unavailable');
    const cachedRows=state.rows.filter(r=>r.profile&&r.referenceStatus?.status==='cached');
    const staleRows=state.rows.filter(r=>r.profile&&r.referenceStatus?.status==='stale');
    root.innerHTML=`
      <header class="visionnaire-header">
        <div><small>HOLOCRON // LE VISIONNAIRE</small><h2>LE VISIONNAIRE</h2><p>Repère les écarts avec Kyber, choisis les slots à travailler et décide des échanges en connaissance de cause.</p></div>
        <div class="visionnaire-header-actions"><div class="visionnaire-state">${state.loading?'ANALYSE '+state.progress.done+'/'+state.progress.total:'AUDIT '+state.rows.length+' PERSONNAGES'}</div><button type="button" class="visionnaire-refresh" data-refresh-kyber ${state.loading?'disabled':''}>${state.loading?'ACTUALISATION EN COURS…':'ACTUALISER LES RÉFÉRENCES KYBER'}</button></div>
      </header>
      <section class="visionnaire-domain">
        <div class="visionnaire-section-kicker">ÉTAPE 1 · FILTRER LES ÉCARTS KYBER</div>
        <div class="visionnaire-filters" role="group" aria-label="Filtrer les personnages selon les écarts Kyber">
          <button type="button" data-mode="sets" class="${state.mode==='sets'?'active':''}"><b>SETS</b><span>${modeCount('sets')}</span></button>
          <button type="button" data-mode="primaries" class="${state.mode==='primaries'?'active':''}"><b>PRIMAIRES</b><span>${modeCount('primaries')}</span></button>
          <button type="button" data-mode="both" class="${state.mode==='both'?'active':''}"><b>SETS + PRIMAIRES</b><span>${modeCount('both')}</span></button>
        </div>
        <div class="visionnaire-kpis"><span><b>${state.loading?state.progress.done:state.rows.length}${state.loading?' / '+state.progress.total:''}</b> personnages analysés</span><span><b>${state.progress.profiles}</b> profils Kyber exploitables</span><span><b>${knownSets}</b> références de sets</span><span><b>${knownPrimaries}</b> références de primaires</span><span><b>${cachedRows.length}</b> profils en cache</span><span><b>${staleRows.length}</b> références anciennes conservées</span><span><b>${noReferenceRows.length}</b> sans référence Kyber</span><span><b>${unverifiableRows.length}</b> non vérifiables</span><span><b>${rows.length}</b> à examiner</span></div>
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
        ${!state.loading&&noReferenceRows.length?`<div class="visionnaire-no-reference"><div class="visionnaire-section-kicker">PAS DE RÉFÉRENCE KYBER DISPONIBLE · ${noReferenceRows.length} PERSONNAGE(S)</div>${noReferenceRows.map(row=>`<div class="visionnaire-character visionnaire-character-unavailable"><span class="visionnaire-avatar">${esc(String(row.character?.name||row.character?.baseId||'?').slice(0,1))}</span><span class="visionnaire-character-main"><b>${esc(row.character?.name||row.character?.baseId||'Personnage')}</b><small>SWGOH.GG ne fournit aucun échantillon dans la tranche Kyber.</small></span><span class="visionnaire-character-reference"><small>STATUT</small><b>Pas de référence Kyber disponible</b><small>${esc(row.referenceStatus?.reason||'Aucune unité entièrement modée ne constitue une référence Kyber.')}</small></span></div>`).join('')}</div>`:''}
        ${!state.loading&&unverifiableRows.length?`<div class="visionnaire-no-reference"><div class="visionnaire-section-kicker">RÉFÉRENCE KYBER NON VÉRIFIABLE · ${unverifiableRows.length} PERSONNAGE(S)</div>${unverifiableRows.map(row=>`<div class="visionnaire-character visionnaire-character-unavailable"><span class="visionnaire-avatar">${esc(String(row.character?.name||row.character?.baseId||'?').slice(0,1))}</span><span class="visionnaire-character-main"><b>${esc(row.character?.name||row.character?.baseId||'Personnage')}</b><small>Comparaison suspendue : récupération SWGOH.GG incomplète.</small></span><span class="visionnaire-character-reference"><small>STATUT</small><b>Référence Kyber non vérifiable</b><small>${esc(row.referenceStatus?.reason||'Le relais ou SWGOH.GG n’a pas permis de confirmer la référence.')}</small></span></div>`).join('')}</div>`:''}
      </section>
      ${state.selected?renderSelected():''}
    `;
    root.querySelector('[data-refresh-kyber]')?.addEventListener('click',()=>buildAudit({forceRefresh:true}));
    root.querySelectorAll('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{state.mode=btn.dataset.mode;state.selected=null;state.slots.clear();state.proposals=[];state.searchError='';render();}));
    root.querySelectorAll('[data-character]').forEach(btn=>btn.addEventListener('click',()=>{
      const row=state.rows.find(r=>String(characterKey(r.character))===btn.dataset.character);
      if(!row)return;state.selected=row;state.slots=new Set(activeIssues(row).map(item=>item.slot));state.proposals=[];state.searchError='';render();
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
      <p>Les slots en écart Kyber sont présélectionnés. Tu peux en ajouter ou en retirer ; les autres mods restent en place. Aucun mod ne sera déplacé automatiquement.</p>
      <div class="visionnaire-slots">${row.slotRows.map(item=>{
        const m=item.mod;
        const setIssue=row.setSlots.some(x=>x.slot===item.slot);
        const primaryIssue=row.primarySlots.some(x=>x.slot===item.slot);
        const mismatch=criteria.some(x=>x.slot===item.slot);
        const alternatives=item.primaryDistribution.slice(0,3).map(x=>x.name+' '+(x.weight*100).toFixed(1)+'%').join(' · ');
        const setLabel=setIssue?'Set hors de la configuration Kyber la plus proche':item.hasSetReference?'Composition comparée à toutes les configurations Kyber':'Set non vérifiable';
        const primaryLabel=!item.hasPrimaryReference?'Primaire non vérifiable':primaryIssue?'Primaire non observée en Kyber':('Primaire observée '+(item.primaryShare*100).toFixed(1)+'%');
        const detail=[setLabel,primaryLabel,alternatives].filter(Boolean).join(' · ');
        return `<button type="button" data-slot="${item.slot}" class="${state.slots.has(item.slot)?'selected':''} ${mismatch?'mismatch':''}" ${state.searching?'disabled':''}>
          <span>${LABELS[item.slot]}</span><b>${esc(m?.set_name||'Slot vide')}</b><small>${esc(m?.primary_stat||'—')} ${m?.primary_value??''}</small><em>${esc(detail)}</em>
        </button>`;
      }).join('')}</div>
      <div class="visionnaire-next"><span>${state.slots.size} slot(s) sélectionné(s)</span><button type="button" data-search-exchanges ${state.slots.size?'':'disabled'} ${state.searching?'disabled':''}> ${state.searching?'RECHERCHE…':'RECHERCHER DES ÉCHANGES'} </button></div>
      <p class="visionnaire-note">Les slots non sélectionnés restent intacts. Les donneurs sont classés par usage GAC connu croissant ; les GL et les usages inconnus sont exclus. Chaque donneur doit conserver ses bonus de sets après restitution des mods remplacés ; la vitesse totale de la cible ne peut pas diminuer.</p>
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
