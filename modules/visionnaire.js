/* Le Visionnaire — audit Kyber guidé, sans permutation automatique. */
(() => {
  'use strict';
  const SLOTS = ['Square','Arrow','Diamond','Triangle','Circle','Cross'];
  const LABELS = {Square:'Carré',Arrow:'Flèche',Diamond:'Losange',Triangle:'Triangle',Circle:'Cercle',Cross:'Croix'};
  const FIXED = {Square:'Offense',Diamond:'Defense'};
  const state = {mode:'sets',both:false,rows:[],selected:null,slots:new Set(),loading:false,filter:''};
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
  const profileSets = profile => {
    const names=[];
    (Array.isArray(profile?.sets)?profile.sets:[]).forEach(item=>{
      const name=typeof item==='string'?item:item?.name;
      if(name) names.push(name);
    });
    (Array.isArray(profile?.specific_sets)?profile.specific_sets:[]).forEach(item=>{
      Object.keys(item?.counts||{}).forEach(name=>names.push(name));
    });
    return [...new Set(names.map(labelSet).filter(Boolean))];
  };
  const primaryOptions = (profile,slot) => {
    if(FIXED[slot]) return [FIXED[slot]];
    const entries=Object.entries(profile?.slots?.[slot]?.primaries||{});
    return entries.sort((a,b)=>Number(b[1]||0)-Number(a[1]||0)).map(([name])=>name);
  };
  const inspectCharacter = (character,profile) => {
    const allowedSets=profileSets(profile);
    const slotRows=modsOf(character).map(({slot,mod})=>{
      const setOk=!!mod && allowedSets.includes(labelSet(mod.set_name??mod.set??''));
      const primaries=primaryOptions(profile,slot);
      const primaryOk=!!mod && primaries.length>0 && primaries.some(name=>key(name)===key(mod.primary_stat));
      return {slot,mod,setOk,primaryOk,hasSetReference:allowedSets.length>0,hasPrimaryReference:primaries.length>0};
    });
    const setSlots=slotRows.filter(x=>!x.hasSetReference || (x.mod&&!x.setOk));
    const primarySlots=slotRows.filter(x=>!x.hasPrimaryReference || (x.mod&&!x.primaryOk));
    const setMismatch=slotRows.some(x=>x.hasSetReference&&x.mod&&!x.setOk);
    const primaryMismatch=slotRows.some(x=>x.hasPrimaryReference&&x.mod&&!x.primaryOk);
    const setVerifiable=allowedSets.length>0;
    const primaryVerifiable=slotRows.some(x=>x.hasPrimaryReference);
    return {character,profile,slotRows,setSlots,primarySlots,setMismatch,primaryMismatch,setVerifiable,primaryVerifiable};
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
  const visibleRows = () => state.rows.filter(row=>{
    if(state.filter&&!key(row.character?.name||row.character?.baseId).includes(key(state.filter)))return false;
    if(state.mode==='sets'){
      if(!row.setVerifiable)return false;
      return state.both ? row.setMismatch&&row.primaryVerifiable&&row.primaryMismatch : row.setMismatch;
    }
    return row.primaryVerifiable&&row.primaryMismatch;
  });
  const slotSummary = row => {
    const list=state.mode==='sets'?row.setSlots:row.primarySlots;
    return list.map(x=>LABELS[x.slot]).join(', ')||'—';
  };
  function render(){
    const root=$('visionnaireRoot');if(!root)return;
    const rows=visibleRows();
    const known=state.rows.filter(r=>r.profile).length;
    const nonverifiable=state.rows.length-known;
    root.innerHTML=`
      <header class="visionnaire-header">
        <div><small>HOLOCRON // LE VISIONNAIRE</small><h2>LE VISIONNAIRE</h2><p>Repère les écarts avec Kyber, choisis les slots à travailler et décide des échanges en connaissance de cause.</p></div>
        <div class="visionnaire-state">${state.loading?'ANALYSE KYBER EN COURS':'AUDIT '+state.rows.length+' PERSONNAGES'}</div>
      </header>
      <section class="visionnaire-domain">
        <div class="visionnaire-section-kicker">ÉTAPE 1 · CHOISIR LE DOMAINE</div>
        <div class="visionnaire-domain-options">
          <button type="button" data-mode="sets" class="${state.mode==='sets'?'active':''}"><b>SETS</b><span>Identifier les sets qui s'écartent des références Kyber</span></button>
          <button type="button" data-mode="primaries" class="${state.mode==='primaries'?'active':''}"><b>PRIMAIRES</b><span>Identifier les primaires qui s'écartent des références Kyber</span></button>
        </div>
        ${state.mode==='sets'?'<label class="visionnaire-toggle"><input type="checkbox" id="visionnaireBoth" '+(state.both?'checked':'')+'>Afficher uniquement les personnages dont les sets ET les primaires sont différents de Kyber</label>':''}
        <div class="visionnaire-kpis"><span><b>${state.rows.length}</b> personnages analysés</span><span><b>${known}</b> références Kyber exploitables</span><span><b>${nonverifiable}</b> non vérifiables</span><span><b>${rows.length}</b> à examiner</span></div>
      </section>
      <section class="visionnaire-list">
        <div class="visionnaire-list-head"><div><div class="visionnaire-section-kicker">ÉTAPE 2 · PERSONNAGES À EXAMINER</div><h3>${state.mode==='sets'?'Écarts de sets':'Écarts de primaires'}</h3></div><input id="visionnaireSearch" type="search" placeholder="Rechercher un personnage…" value="${esc(state.filter)}"></div>
        ${state.loading?'<p class="visionnaire-empty">Lecture des références Kyber sur l’ensemble du roster…</p>':rows.length?rows.map(row=>{
          const c=row.character;const selected=state.selected===c;
          const mismatch=state.mode==='sets'?row.setSlots:row.primarySlots;
          const reference=state.mode==='sets'?profileSets(row.profile).join(' · '):'Primaires par slot';
          return `<button type="button" class="visionnaire-character ${selected?'active':''}" data-character="${esc(characterKey(c))}">
            <span class="visionnaire-avatar">${esc(String(c.name||c.baseId||'?').slice(0,1))}</span>
            <span class="visionnaire-character-main"><b>${esc(c.name||c.baseId||'Personnage')}</b><small>${mismatch.length} slot(s) concernés · ${esc(slotSummary(row))}</small></span>
            <span class="visionnaire-character-reference"><small>RÉFÉRENCE KYBER</small><b>${esc(reference||'Référence partielle')}</b></span><i>↗</i>
          </button>`;
        }).join(''):'<p class="visionnaire-empty">Aucun personnage non conforme vérifiable dans ce domaine. Les profils absents ou incomplets sont comptés séparément et ne sont pas considérés comme incorrects.</p>'}
      </section>
      ${state.selected?renderSelected():''}
    `;
    root.querySelectorAll('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{state.mode=btn.dataset.mode;state.selected=null;state.slots.clear();render();}));
    $('visionnaireBoth')?.addEventListener('change',e=>{state.both=e.target.checked;state.selected=null;state.slots.clear();render();});
    $('visionnaireSearch')?.addEventListener('input',e=>{state.filter=e.target.value;const pos=e.target.selectionStart;render();const input=$('visionnaireSearch');input?.focus();input?.setSelectionRange(pos,pos);});
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
    const criteria=state.mode==='sets'?row.setSlots:row.primarySlots;
    return `<section class="visionnaire-selected">
      <div class="visionnaire-section-kicker">ÉTAPE 3 · CHOISIR LES SLOTS</div><h3>${esc(row.character.name||row.character.baseId)}</h3>
      <p>Sélectionne explicitement les emplacements que tu souhaites travailler. Aucun mod ne sera déplacé automatiquement.</p>
      <div class="visionnaire-slots">${row.slotRows.map(item=>{
        const m=item.mod;const mismatch=criteria.some(x=>x.slot===item.slot);
        return `<button type="button" data-slot="${item.slot}" class="${state.slots.has(item.slot)?'selected':''} ${mismatch?'mismatch':''}">
          <span>${LABELS[item.slot]}</span><b>${esc(m?.set_name||'Slot vide')}</b><small>${esc(m?.primary_stat||'—')} ${m?.primary_value??''}</small><em>${mismatch?'Écart Kyber':'Référence respectée / non signalée'}</em>
        </button>`;
      }).join('')}</div>
      <div class="visionnaire-next"><span>${state.slots.size} slot(s) sélectionné(s)</span><button type="button" disabled>RECHERCHER DES ÉCHANGES — PROCHAINE ÉTAPE</button></div>
      <p class="visionnaire-note">Cette première version installe l’audit complet et la sélection des slots. La recherche d’échanges et le bilan des statistiques seront ajoutés dans l’incrément suivant ; aucune proposition non vérifiée n’est affichée.</p>
    </section>`;
  }
  window.renderVisionnaire=()=>{
    if(!state.rows.length&&!state.loading&&characters().length)buildAudit();
    else render();
  };
  window.addEventListener('holocron:data-updated',()=>{state.rows=[];state.selected=null;state.slots.clear();if(document.body.dataset.page==='visionnaire')buildAudit();});
  window.addEventListener('holocron:gac-usage-ready',()=>{});
})();
