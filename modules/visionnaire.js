/* Le Visionnaire — audit Kyber guidé, sans permutation automatique. */
(() => {
  'use strict';
  const SLOTS = ['Square','Arrow','Diamond','Triangle','Circle','Cross'];
  const LABELS = {Square:'Carré',Arrow:'Flèche',Diamond:'Losange',Triangle:'Triangle',Circle:'Cercle',Cross:'Croix'};
  const FIXED = {Square:'Offense',Diamond:'Defense'};
  const state = {mode:'sets',rows:[],selected:null,slots:new Set(),loading:false,faction:'ALL'};
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
  const expectedSetCounts = profile => {
    const specific=(Array.isArray(profile?.specific_sets)?profile.specific_sets:[])
      .filter(item=>item?.counts&&Object.keys(item.counts).length)
      .sort((a,b)=>Number(b.weight||0)-Number(a.weight||0));
    if(specific.length){
      return Object.fromEntries(Object.entries(specific[0].counts)
        .map(([name,count])=>[labelSet(name),Number(count)||0]).filter(([name,count])=>name&&count>0));
    }
    const entries=(Array.isArray(profile?.sets)?profile.sets:[])
      .map(item=>typeof item==='string'?{name:item}:item)
      .filter(item=>item?.name&&Number(item.count)>0)
      .sort((a,b)=>Number(b.weight||0)-Number(a.weight||0));
    const byCount=new Map();
    entries.forEach(item=>{
      const count=Number(item.count),weight=Number(item.weight||0);
      if(weight<0.20)return;
      const previous=byCount.get(count);
      if(!previous||weight>previous.weight)byCount.set(count,{name:labelSet(item.name),weight});
    });
    return Object.fromEntries([...byCount.entries()].map(([count,item])=>[item.name,count]).filter(([name,count])=>name&&count>0));
  };
  const profileSets = profile => Object.entries(expectedSetCounts(profile)||{}).map(([name,count])=>`${name} ×${count}`);
  const dominantPrimary = (profile,slot) => {
    if(FIXED[slot])return null;
    const entries=Object.entries(profile?.slots?.[slot]?.primaries||{})
      .map(([name,weight])=>({name,weight:Number(weight)||0}))
      .sort((a,b)=>b.weight-a.weight);
    if(!entries.length||entries[0].weight<0.5)return null;
    return entries[0];
  };
  const inspectCharacter = (character,profile) => {
    const expected=expectedSetCounts(profile);
    const equipped=modsOf(character);
    const equippedMods=equipped.filter(x=>x.mod);
    const currentCounts={};
    equippedMods.forEach(({mod})=>{
      const name=labelSet(mod.set_name??mod.set??'');
      if(name)currentCounts[name]=(currentCounts[name]||0)+1;
    });
    const setVerifiable=!!expected&&equippedMods.length===6;
    const differingSets=setVerifiable
      ? [...new Set([...Object.keys(expected),...Object.keys(currentCounts)])]
          .filter(name=>(Number(expected[name])||0)!==(Number(currentCounts[name])||0))
      : [];
    const slotRows=equipped.map(({slot,mod})=>{
      const setName=labelSet(mod?.set_name??mod?.set??'');
      const primary=dominantPrimary(profile,slot);
      const primaryOk=!primary||!!mod&&key(primary.name)===key(mod.primary_stat);
      return {slot,mod,setOk:setVerifiable&&!differingSets.includes(setName),primaryOk,primaryReference:primary,hasSetReference:setVerifiable,hasPrimaryReference:!!primary};
    });
    const setSlots=setVerifiable&&differingSets.length
      ? slotRows.filter(x=>x.mod&&differingSets.includes(labelSet(x.mod.set_name??x.mod.set??'')))
      : [];
    const primarySlots=slotRows.filter(x=>x.hasPrimaryReference&&x.mod&&!x.primaryOk);
    const setMismatch=setVerifiable&&differingSets.length>0;
    const primaryVerifiable=slotRows.some(x=>x.hasPrimaryReference);
    const primaryMismatch=primarySlots.length>0;
    return {character,profile,slotRows,setSlots,primarySlots,setMismatch,primaryMismatch,setVerifiable,primaryVerifiable,expectedSetCounts:expected};
  };
  const characters = () => (Array.isArray(rosterCharacters)?rosterCharacters:[]).filter(c=>typeof rosterUnitType!=='function'||rosterUnitType(c)!=='ship');
  async function buildAudit(){
    if(state.loading)return;
    const roster=characters();
    if(!roster.length){state.rows=[];render();return;}
    state.loading=true;render();
    const rows=[];
    let cursor=0;
    const worker=async()=>{
      while(cursor<roster.length){
        const character=roster[cursor++];
        try{
          let profile=typeof profileForCharacter==='function'?profileForCharacter(character):null;
          if(typeof kyberProfileValid==='function'&&!kyberProfileValid(profile)) profile=null;
          if(!profile && typeof fetchKyberProfile==='function') profile=await fetchKyberProfile(character);
          if(profile && (typeof kyberProfileValid!=='function'||kyberProfileValid(profile))) rows.push(inspectCharacter(character,profile));
          else rows.push({character,profile:null,slotRows:modsOf(character),setVerifiable:false,primaryVerifiable:false,setMismatch:false,primaryMismatch:false,setSlots:[],primarySlots:[]});
        }catch(error){
          rows.push({character,profile:null,slotRows:modsOf(character),setVerifiable:false,primaryVerifiable:false,setMismatch:false,primaryMismatch:false,setSlots:[],primarySlots:[],error:String(error?.message||error)});
        }
      }
    };
    await Promise.all(Array.from({length:Math.min(4,roster.length)},worker));
    rows.sort((a,b)=>String(a.character?.name||'').localeCompare(String(b.character?.name||''),'fr'));
    state.rows=rows;state.loading=false;state.selected=null;state.slots.clear();render();
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
    const rows=visibleRows();
    const knownSets=state.rows.filter(r=>r.setVerifiable).length;
    const knownPrimaries=state.rows.filter(r=>r.primaryVerifiable).length;
    const knownAny=state.rows.filter(r=>r.setVerifiable||r.primaryVerifiable).length;
    const nonverifiable=state.rows.length-knownAny;
    root.innerHTML=`
      <header class="visionnaire-header">
        <div><small>HOLOCRON // LE VISIONNAIRE</small><h2>LE VISIONNAIRE</h2><p>Repère les écarts avec Kyber, choisis les slots à travailler et décide des échanges en connaissance de cause.</p></div>
        <div class="visionnaire-state">${state.loading?'ANALYSE KYBER EN COURS':'AUDIT '+state.rows.length+' PERSONNAGES'}</div>
      </header>
      <section class="visionnaire-domain">
        <div class="visionnaire-section-kicker">ÉTAPE 1 · FILTRER LES ÉCARTS KYBER</div>
        <div class="visionnaire-filters" role="group" aria-label="Filtrer les personnages selon les écarts Kyber">
          <button type="button" data-mode="sets" class="${state.mode==='sets'?'active':''}"><b>SETS</b><span>${modeCount('sets')}</span></button>
          <button type="button" data-mode="primaries" class="${state.mode==='primaries'?'active':''}"><b>PRIMAIRES</b><span>${modeCount('primaries')}</span></button>
          <button type="button" data-mode="both" class="${state.mode==='both'?'active':''}"><b>SETS + PRIMAIRES</b><span>${modeCount('both')}</span></button>
        </div>
        <div class="visionnaire-kpis"><span><b>${state.rows.length}</b> personnages analysés</span><span><b>${knownSets}</b> références de sets</span><span><b>${knownPrimaries}</b> références de primaires</span><span><b>${nonverifiable}</b> non vérifiables</span><span><b>${rows.length}</b> à examiner</span></div>
      </section>
      <section class="visionnaire-list">
        <div class="visionnaire-list-head"><div><div class="visionnaire-section-kicker">ÉTAPE 2 · FILTRER PAR FACTION</div><h3>${modeLabel()} · ${rows.length} résultat(s)</h3></div><label class="visionnaire-faction-filter" for="visionnaireFaction"><span>FACTION</span><select id="visionnaireFaction"><option value="ALL">Toutes les factions</option>${factionOptions().map(f=>`<option value="${esc(f)}" ${state.faction===f?'selected':''}>${esc(f)}</option>`).join('')}</select></label></div>
        ${state.loading?'<p class="visionnaire-empty">Lecture des références Kyber sur l’ensemble du roster…</p>':rows.length?rows.map(row=>{
          const c=row.character;const selected=state.selected?.character===c;
          const mismatch=activeIssues(row);
          const reference=state.mode==='sets'?profileSets(row.profile).join(' · '):state.mode==='primaries'?'Primaires Kyber dominantes':'Sets et primaires Kyber';
          return `<button type="button" class="visionnaire-character ${selected?'active':''}" data-character="${esc(characterKey(c))}">
            <span class="visionnaire-avatar">${esc(String(c.name||c.baseId||'?').slice(0,1))}</span>
            <span class="visionnaire-character-main"><b>${esc(c.name||c.baseId||'Personnage')}</b><small>${mismatch.length} slot(s) concernés · ${esc(slotSummary(row))} · ${esc(factionsOf(row).join(' / ')||'Faction non identifiée')}</small></span>
            <span class="visionnaire-character-reference"><small>RÉFÉRENCE KYBER</small><b>${esc(reference||'Référence partielle')}</b></span><i>↗</i>
          </button>`;
        }).join(''):'<p class="visionnaire-empty">Aucun personnage non conforme vérifiable dans ce domaine. Les profils absents ou incomplets sont comptés séparément et ne sont pas considérés comme incorrects.</p>'}
      </section>
      ${state.selected?renderSelected():''}
    `;
    root.querySelectorAll('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{state.mode=btn.dataset.mode;state.selected=null;state.slots.clear();render();}));
    $('visionnaireFaction')?.addEventListener('change',e=>{state.faction=e.target.value||'ALL';state.selected=null;state.slots.clear();render();});
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
        const primaryRef=item.primaryReference;
        const issueLabel=state.mode==='both' ? [setIssue?'Set incorrect':'',primaryIssue?'Primaire incorrecte':''].filter(Boolean).join(' · ') : state.mode==='sets'?'Set incorrect':'Primaire incorrecte';
        return `<button type="button" data-slot="${item.slot}" class="${state.slots.has(item.slot)?'selected':''} ${mismatch?'mismatch':''}">
          <span>${LABELS[item.slot]}</span><b>${esc(m?.set_name||'Slot vide')}</b><small>${esc(m?.primary_stat||'—')} ${m?.primary_value??''}</small><em>${mismatch?esc(issueLabel):primaryRef?`Kyber : ${esc(primaryRef.name)} · ${Math.round(primaryRef.weight*100)} %`:'Référence respectée / non signalée'}</em>
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
