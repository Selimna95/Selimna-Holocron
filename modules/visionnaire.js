/* Le Visionnaire — audit Kyber guidé, sans permutation automatique. */
(() => {
  'use strict';
  const SLOTS = ['Square','Arrow','Diamond','Triangle','Circle','Cross'];
  const LABELS = {Square:'Carré',Arrow:'Flèche',Diamond:'Losange',Triangle:'Triangle',Circle:'Cercle',Cross:'Croix'};
  const FIXED = {Square:'Offense',Diamond:'Defense'};
  const state = {mode:'sets',rows:[],selected:null,slots:new Set(),loading:false,faction:'ALL',factionOpen:false,progress:{done:0,total:0,profiles:0,failures:0,lastError:''}};
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
    state.loading=false;state.selected=null;state.slots.clear();render();
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
    root.querySelectorAll('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{state.mode=btn.dataset.mode;state.selected=null;state.slots.clear();render();}));
    root.querySelectorAll('[data-character]').forEach(btn=>btn.addEventListener('click',()=>{
      const row=state.rows.find(r=>String(characterKey(r.character))===btn.dataset.character);
      if(!row)return;state.selected=row;state.slots.clear();render();
    }));
    root.querySelectorAll('[data-slot]').forEach(btn=>btn.addEventListener('click',()=>{
      const slot=btn.dataset.slot;if(state.slots.has(slot))state.slots.delete(slot);else state.slots.add(slot);render();
    }));
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
      <div class="visionnaire-next"><span>${state.slots.size} slot(s) sélectionné(s)</span><button type="button" disabled>RECHERCHER DES ÉCHANGES — PROCHAINE ÉTAPE</button></div>
      <p class="visionnaire-note">Cette première version installe l’audit complet et la sélection des slots. La recherche d’échanges et le bilan des statistiques seront ajoutés dans l’incrément suivant ; aucune proposition non vérifiée n’est affichée.</p>
    </section>`;
  }
  window.renderVisionnaire=()=>{
    if(document.body.dataset.page==='visionnaire'&&!state.rows.length&&!state.loading&&characters().length)buildAudit();
    else render();
  };
  window.addEventListener('holocron:data-updated',()=>{state.rows=[];state.selected=null;state.slots.clear();if(document.body.dataset.page==='visionnaire')buildAudit();});
  window.addEventListener('holocron:gac-usage-ready',()=>{});
})();
