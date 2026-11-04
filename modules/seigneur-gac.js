/* GAC evidence bridge for Seigneur Sith.
 * Prefers the full unit/fleet usage feed. If it is empty, derives a clearly
 * labelled defense-only signal from the real, partial blue-GAC catalog.
 * Absence is always unknown; only positive observations are counted.
 */
(function(){
  const keyOf = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const usageData = () => window.__SWGOH_GAC_USAGE__ || {seasons:[]};
  const hasPrimaryUsage = data => Array.isArray(data?.seasons) && data.seasons.some(s =>
    (s?.characters && Object.keys(s.characters).length) ||
    (s?.ships && Object.keys(s.ships).length) ||
    (Array.isArray(s?.fleets) && s.fleets.length)
  );

  function buildDefenseUsage(catalog){
    if(!catalog || !Array.isArray(catalog.teams)) return null;
    const current = catalog.currentSeasons || {};
    const latest = {};
    for(const format of ['5v5','3v3']){
      const seasons = catalog.teams.filter(t => t?.format===format && Number(t.season)>0)
        .map(t=>Number(t.season));
      latest[format] = Number(current[format]) || Math.max(0,...seasons);
    }
    const records = new Map();
    const coverage = new Map();
    for(const team of catalog.teams){
      const format=String(team?.format||'');
      const season=Number(team?.season);
      const league=String(team?.league||'');
      const battles=Number(team?.battles);
      const members=Array.isArray(team?.members)?team.members:[];
      if(!['5v5','3v3'].includes(format) || !season || season>latest[format] ||
         !league || !Number.isFinite(battles) || battles<=0 ||
         members.length!==(format==='5v5'?5:3)) continue;
      const seasonMap=records.get(season)||new Map();
      records.set(season,seasonMap);
      for(const rawName of members){
        const name=String(rawName||'').trim();
        if(!name) continue;
        const record=seasonMap.get(name)||{uses:0,byFormat:{},bySide:{},leagues:[],evidence:'defense-composition'};
        record.uses+=battles;
        record.byFormat[format]=(record.byFormat[format]||0)+battles;
        record.bySide.defense=(record.bySide.defense||0)+battles;
        if(!record.leagues.includes(league))record.leagues.push(league);
        seasonMap.set(name,record);
      }
      const coverageKey=format+'|'+league+'|'+season;
      const view=coverage.get(coverageKey)||{format,league,season,teams:0,battles:0};
      view.teams++; view.battles+=battles; coverage.set(coverageKey,view);
    }
    if(!records.size) return null;
    return {
      schemaVersion:1,
      source:'SWGOH.GG GAC defense catalog',
      sourceStatus:catalog.collectionStatus==='complete'?'complete':'partial',
      evidenceType:'defense-composition',
      updatedAt:catalog.updatedAt||null,
      currentSeasons:latest,
      note:'Signal défensif pondéré par les combats des compositions publiées. Le catalogue est partiel : une absence n’est jamais assimilée à zéro.',
      coverage:[...coverage.values()],
      seasons:[...records.entries()].map(([season,chars])=>({
        season,
        characters:Object.fromEntries(chars),
        ships:{},
        fleets:[],
        coverage:[...coverage.values()].filter(x=>x.season===season)
      })).sort((a,b)=>b.season-a.season)
    };
  }

  function priorityForCharacter(character){
    const data=usageData(), seasons=Array.isArray(data.seasons)?data.seasons:[];
    if(!seasons.length) return {known:false,uses:null,sourceStatus:'unavailable',label:'GAC non documenté'};
    const aliases=[character?.baseId,character?.base_id,character?.characterId,character?.character_id,
      character?.id,character?.name,character?.character].map(keyOf).filter(Boolean);
    const formats=['5v5','3v3'];
    const latestByFormat={};
    for(const format of formats){
      const eligible=seasons.filter(s=>{
        const hasFormat=(s?.coverage||[]).some(c=>c?.format===format) ||
          Object.values(s?.characters||{}).some(r=>Number(r?.byFormat?.[format])>0);
        return hasFormat;
      }).map(s=>Number(s.season)).filter(Boolean);
      latestByFormat[format]=Number(data.currentSeasons?.[format]) || Math.max(0,...eligible);
    }
    let uses=0,observedFormats=0;
    const evidence=[];
    for(const format of formats){
      const ceiling=latestByFormat[format];
      if(!ceiling) continue;
      const ordered=seasons.filter(s=>Number(s.season)<=ceiling)
        .sort((a,b)=>Number(b.season)-Number(a.season));
      let found=null;
      for(const season of ordered){
        const entry=Object.entries(season?.characters||{}).find(([name,record]) =>
          aliases.includes(keyOf(name)) || aliases.some(alias=>alias===keyOf(record?.baseId||record?.base_id||record?.name))
        );
        if(!entry) continue;
        const record=entry[1]||{};
        const count=Number(record.byFormat?.[format]);
        if(Number.isFinite(count)&&count>0){found={count,season:Number(season.season)};break;}
      }
      if(found){
        uses+=found.count; observedFormats++;
        evidence.push(format+' S'+found.season);
      }
    }
    // Legacy usage snapshots may contain only one season and no byFormat map.
    if(!observedFormats && seasons.length===1){
      const match=Object.entries(seasons[0]?.characters||{}).find(([name])=>aliases.includes(keyOf(name)));
      const count=Number(match?.[1]?.uses);
      if(Number.isFinite(count)&&count>0){
        return {known:true,uses:count,sourceStatus:data.sourceStatus||'observed',
          evidence:['S'+seasons[0].season],label:'GAC observé · '+count.toLocaleString('fr-FR')};
      }
    }
    if(!observedFormats) return {known:false,uses:null,sourceStatus:data.sourceStatus||'partial',label:'Aucune observation GAC'};
    const defenseOnly=data.evidenceType==='defense-composition' || data.source==='SWGOH.GG GAC defense catalog';
    return {
      known:true,uses,sourceStatus:data.sourceStatus||'observed',evidence,
      defenseOnly,label:(defenseOnly?'Défense · ':'GAC · ')+uses.toLocaleString('fr-FR')+' combats'
    };
  }

  window.holocronBuildDefenseGacUsage=buildDefenseUsage;
  window.holocronGacPriorityForCharacter=priorityForCharacter;
  window.__SWGOH_GAC_USAGE_READY__ = (async()=>{
    const existing=usageData();
    if(hasPrimaryUsage(existing)){
      existing.sourceStatus=existing.sourceStatus||'observed';
      return existing;
    }
    try{
      const url=new URL('./blue-gac/gac-catalog.json',document.baseURI);
      url.searchParams.set('v','4.1.2');
      const response=await fetch(url.href,{cache:'no-store'});
      if(!response.ok) throw new Error('Catalogue GAC HTTP '+response.status);
      const catalog=await response.json();
      const fallback=buildDefenseUsage(catalog);
      if(fallback){
        window.__SWGOH_GAC_USAGE__=fallback;
        return fallback;
      }
    }catch(error){
      window.__SWGOH_GAC_USAGE_ERROR__=String(error?.message||error);
    }
    return usageData();
  })().then(data=>{
    if(typeof window.dispatchEvent==='function' && typeof CustomEvent==='function'){
      window.dispatchEvent(new CustomEvent('holocron:gac-usage-ready',{detail:{sourceStatus:data?.sourceStatus||'unavailable'}}));
    }
    return data;
  });
})();