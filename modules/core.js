
let pyodide = null;
let optimizerReady = false;
let optimizerWorker = null;
let optimizerRequestId = 0;
let optimizerTimer = null;
let reallocationSelectedModIndex = null;
let reallocationSpeedTier = null;
let reallocationCharacterKey = '';
let reallocationMediumUnlocked = false;
let currentData = null;
let mods = [];
let profiles = {};
let optimizerProfiles = {};
// Resolved by modules/seigneur.js from the single JSON profile dataset.
let optimizerProfilesReady = Promise.resolve(optimizerProfiles);
let currentDataset = 'characters';
let modFiltersReady = false;
let rosterCharacters = [];
let rosterShips = [];
let factionMap = {};
let analysisSelectedCharacter = '';
let analysisFaction = '';
let analysisMode = 'character';
let analysisInventoryRows = [];
let analysisSide = 'ALL';
let analysisStatus = 'TOUS';
let analysisAuditSpeed = 'TOUS';
let analysisAuditSort = 'priority';
let accountGalacticPower = {total:0, characters:0, ships:0};

const $ = (id) => document.getElementById(id);
function log(msg) { $('log').textContent += `\n${msg}`; $('log').scrollTop = $('log').scrollHeight; }
function setRuntime(text, ok=false) { $('runtime').textContent = text; $('runtime').classList.toggle('ok', ok); }
function cleanAllyCode(value) { return String(value || '').replace(/\D/g, '').slice(0, 9); }
function formatAlly(code) { const x=cleanAllyCode(code); return x.length===9 ? `${x.slice(0,3)}-${x.slice(3,6)}-${x.slice(6)}` : x; }
function slug(s) { return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function num(value, digits=0) { const n=Number(value); return Number.isFinite(n) ? n.toLocaleString('fr-FR',{maximumFractionDigits:digits}) : '0'; }
function parseLabeledNumber(text,label){const escaped=String(label).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const m=String(text||'').match(new RegExp(escaped+'\\s*([0-9][0-9,]*)','i'));return m?Number(String(m[1]).replace(/,/g,'')):0;}
function extractGalacticPowerFromProfile(text){const body=String(text||'');let total=parseLabeledNumber(body,'Galactic Power');const characters=parseLabeledNumber(body,'Galactic Power (Characters)');const ships=parseLabeledNumber(body,'Galactic Power (Ships)');if(!total)total=characters+ships;return {total,characters,ships};}
function renderGalacticPower(){const gp=accountGalacticPower||{total:0,characters:0,ships:0};setText('gpTotal',gp.total?num(gp.total):'0');setText('gpCharacters',gp.characters?num(gp.characters):'0');setText('gpShips',gp.ships?num(gp.ships):'0');setText('gpBreakdown',gp.total?`${num(gp.characters)} terrestre · ${num(gp.ships)} spatial`:'En attente de synchronisation');}

function statNameFromAny(value) {
  const rawNames = {1:'Health',5:'Speed',17:'Potency',18:'Tenacity',28:'Protection',41:'Offense',42:'Defense',45:'Critical Chance',48:'Offense',49:'Defense',53:'Critical Chance',55:'Health',56:'Protection',57:'Speed'};
  if (value == null) return '';
  if (typeof value === 'number') return rawNames[value] || String(value);
  if (typeof value === 'string' || typeof value === 'number') {
    const text=String(value).trim();
    if (/^\d+$/.test(text) && rawNames[Number(text)]) return rawNames[Number(text)];
    return text;
  }
  if (typeof value !== 'object') return '';
  let raw=value.name ?? value.stat ?? value.unitStat ?? value.unitStatId ?? value.statId ?? value.type ?? '';
  if (raw && typeof raw === 'object') raw=raw.name ?? raw.unitStat ?? raw.unitStatId ?? raw.statId ?? '';
  if (/^\d+$/.test(String(raw)) && rawNames[Number(raw)]) return rawNames[Number(raw)];
  return String(raw).trim();
}
function statValueFromAny(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const text=value.trim();
    const m=text.match(/[-+]?\d+(?:[.,]\d+)?/);
    return m ? Number(m[0].replace(',','.')) : 0;
  }
  if (typeof value === 'object') {
    if (value.display_value != null) return statValueFromAny(value.display_value);
    if (value.displayValue != null) return statValueFromAny(value.displayValue);
    if (value.value != null && typeof value.value !== 'object') return statValueFromAny(value.value);
    if (value.amount != null) return statValueFromAny(value.amount);
    if (value.unscaledDecimalValue != null) return Number(value.unscaledDecimalValue) / 100000000;
    if (value.unscaled_decimal_value != null) return Number(value.unscaled_decimal_value) / 100000000;
  }
  return 0;
}
function statObjectFromAny(value) {
  if (value == null) return {stat:'', value:0};
  if (typeof value === 'object') {
    const nested = value.stat && typeof value.stat === 'object' ? value.stat : value;
    const display = nested.display_value ?? nested.displayValue ?? value.display_value ?? value.displayValue;
    let stat = statNameFromAny(nested.name ?? nested.stat ?? nested.unitStat ?? nested.unitStatId ?? value.name ?? value.stat ?? value.unitStat ?? value.unitStatId);
    if (display != null && /%/.test(String(display)) && stat && !/%$/.test(stat)) stat += ' %';
    const val = display != null ? statValueFromAny(display) : statValueFromAny(nested.value ?? nested.amount ?? nested.unscaledDecimalValue ?? nested.unscaled_decimal_value ?? value.value ?? value.amount);
    return {stat, value:val, display_value:display ?? ''};
  }
  return {stat:String(value).trim(), value:0, display_value:''};
}
function normalizeMod(m, index=0) {
  if (!m || typeof m !== 'object') return null;
  const out = {...m};
  out.game_id = out.game_id ?? out.id ?? out.modId ?? out.uid ?? `web-${index}`;
  out.slot = out.slot ?? out.slot_id ?? out.slotId ?? out.mod_slot ?? out.modSlot ?? out.shape;
  out.set_name = out.set_name ?? out.set ?? out.setName ?? out.setId ?? out.modSetId ?? out.mod_set_id;
  if (out.set_name && typeof out.set_name === 'object') out.set_name = out.set_name.name ?? out.set_name.id ?? out.set_name.setId ?? out.set_name.modSetId;

  const primaryRaw = out.primary_stat ?? out.primaryStat ?? out.primary ?? out.primaryStatValue;
  const primary = statObjectFromAny(primaryRaw);
  out.primary_stat = primary.stat || (typeof out.primary_stat === 'string' ? out.primary_stat : '');
  out.primary_value = primary.display_value ? primary.value : statValueFromAny(out.primary_value ?? out.primaryValue ?? primaryRaw?.value ?? primaryRaw?.amount ?? 0);

  const secs = out.secondary_stats ?? out.secondaryStats ?? out.secondaryStat ?? out.secondary ?? [];
  if (Array.isArray(secs)) secs.slice(0,4).forEach((raw,i)=>{
    const s=statObjectFromAny(raw);
    out[`secondary_${i+1}_stat`] = s.stat;
    out[`secondary_${i+1}_value`] = s.display_value ? s.value : statValueFromAny(raw?.value ?? raw?.amount ?? raw?.unscaledDecimalValue ?? raw?.unscaled_decimal_value ?? s.value);
  });

  out.level = Number(out.level ?? 0);
  // Keep the real tier supplied by the player API. It is independent from dots and level.
  out.tier = out.tier ?? out.quality ?? out.grade ?? out.modTier ?? out.mod_tier ?? out.rarityTier ?? out.rarity_tier ?? '';
  out.pips = Number(out.pips ?? out.dotCount ?? out.dot_count ?? 0) || 0;
  out.rarity = Number(out.rarity ?? out.pips ?? 0);
  out.character = out.character ?? out.characterName ?? out.equippedTo ?? out.equipped_to ?? out.unit_equiped ?? out.unitEquiped ?? out.location ?? out.usingIn ?? '';
  return out;
}
function extractMods(data) {
  if (Array.isArray(data)) return data.map(normalizeMod).filter(Boolean);
  if (Array.isArray(data?.mods)) return data.mods.map(normalizeMod).filter(Boolean);
  return [];
}
function extractCharacters(data) {
  const chars = data?.characters || data?.roster || data?.units || [];
  return Array.isArray(chars) ? chars.map(x => typeof x === 'string' ? {name:x} : x).filter(Boolean) : [];
}
function rosterUnitType(u) { return Number(u?.combatType ?? u?.combat_type ?? 1) === 2 ? 'ship' : 'character'; }
function splitRosterUnits(units) {
  const characters=[], ships=[];
  for(const u of Array.isArray(units)?units:[]) (rosterUnitType(u)==='ship'?ships:characters).push(u);
  return {characters,ships};
}
function setText(id, value) { const el=$(id); if(el) el.textContent=String(value); }
function updateRosterCounts(characters, ships) {
  const c=Array.isArray(characters)?characters.length:0, s=Array.isArray(ships)?ships.length:0, m=Array.isArray(mods)?mods.length:0;
  setText('charsCount',c); setText('shipsCount',s); setText('unitsCount',c+s); setText('modsCount',m);
  setText('tabCharsCount',c); setText('tabShipsCount',s); setText('tabModsCount',m);
  setText('topUnitsCount',c+s); setText('unitsCountSecondary',c+s);
  const pct=(c+s+m)>0?100:0; setText('healthPercent',pct+'%'); setText('healthText',pct?'Synchronisé':'En attente');
  window.dispatchEvent(new CustomEvent('holocron:data-updated'));
}
function optimizerProfileForCharacter(character) {
  if (!character || !optimizerProfiles || typeof optimizerProfiles !== 'object') return null;
  const base=String(character?.baseId||character?.base_id||'').toUpperCase();
  const name=slug(character?.name||character?.character||'');
  if (base && optimizerProfiles[base]) return optimizerProfiles[base];
  for (const p of Object.values(optimizerProfiles)) {
    if (base && String(p?.base_id||'').toUpperCase()===base) return p;
    if (name && slug(p?.name||p?.character)===name) return p;
  }
  return null;
}
function baseStatsForCharacter(character) {
  const direct=character?.base_stats || character?.baseStats;
  if (direct && typeof direct === 'object') return direct;
  const p=optimizerProfileForCharacter(character);
  if (p?.base_stats && typeof p.base_stats === 'object') return p.base_stats;
  const stats=character?.stats;
  if (stats && typeof stats === 'object') return stats;
  return {};
}

function profileForCharacter(character) {
  const base=String(character?.baseId||character?.base_id||'').toLowerCase();
  const name=slug(character?.name||character?.character||'');
  for(const p of Object.values(profiles)) {
    if(base && String(p.base_id||'').toLowerCase()===base) return p;
    if(name && slug(p.character||p.name)===name) return p;
  }
  return null;
}

function normalizeKyberKey(value){return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'');}
function kyberProfileValid(p){if(!p||typeof p!=='object')return false;const a=p.averages||{};return Number(a.Speed||0)>=100&&Number(a.Health||0)>=10000&&Number(a.Protection||0)>=10000;}
function cleanLinesFromDoc(doc){const body=doc?.body;if(!body)return[];const clone=body.cloneNode(true);clone.querySelectorAll('script,style,noscript').forEach(n=>n.remove());clone.querySelectorAll('br').forEach(n=>n.replaceWith(document.createTextNode('\n')));clone.querySelectorAll('div,p,li,tr,h1,h2,h3,h4,h5,h6,section,article,table,thead,tbody,th,td').forEach(n=>n.insertBefore(document.createTextNode('\n'),n.firstChild));return String(clone.textContent||'').split(/\n+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);}
function numberFromText(value){const m=String(value??'').replace(/,/g,'').match(/[-+]?[0-9]+(?:\.[0-9]+)?/);return m?Number(m[0]):0;}
function parseKyberProfileHTML(text,character,kyberSlug){
  // V47: SWGOH.GG changes its DOM fairly often. Parse the visible text blocks
  // instead of depending on one exact CSS structure. Keep the six-slot model
  // explicit: Square/Transmitter and Diamond/Processor are fixed primaries.
  const doc=parseHTML(text);
  const lines=cleanLinesFromDoc(doc);
  const normalized=lines.map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const profile={character:String(character||''),source:'SWGOH.GG Kyber / Top 1000 GAC',url:`https://swgoh.gg/units/${kyberSlug}/best-mods/`,sets:[],specific_sets:[],slots:{},averages:{},secondary_focus:{}};
  const pct=/^(.+?)\s+([0-9]+(?:[.,][0-9]+)?)%$/;
  const pctLine=(line)=>line.match(pct);
  const nextIndex=(pred,start)=>{for(let i=start;i<normalized.length;i++)if(pred(normalized[i]))return i;return -1;};
  const idx=(needle)=>normalized.findIndex(x=>x===needle||x.startsWith(needle));
  const number=(v)=>Number(String(v??'').replace(/,/g,''));
  const canonicalSet=(v)=>String(v||'').replace(/^Triple\s+/,'').replace(/^Double\s+/,'').trim().replace(/^Crit Chance$/,'Critical Chance').replace(/^Crit Damage$/,'Critical Damage');
  const addSet=(name,weight)=>{name=String(name||'').trim();if(!name||!Number.isFinite(weight))return;const base=canonicalSet(name);let count=4;if(/^Triple\s+/i.test(name))count=6;else if(/^Double\s+/i.test(name))count=4;profile.sets.push({name:base,count,weight});};

  // Primary-set distribution.
  let i=idx('Primary Set');
  if(i>=0){
    const j=nextIndex(x=>x==='Secondary Set'||x.startsWith('Secondary Set'),i+1);
    for(const line of normalized.slice(i+1,j>=0?j:normalized.length)){
      const m=pctLine(line); if(!m)continue;
      addSet(m[1],number(m[2])/100);
    }
  }

  // Exact grouped set combinations, e.g. "Offense + Health 42.4%".
  i=idx('Specific Mod Sets');
  if(i>=0){
    const j=nextIndex(x=>/^Arrow\b/i.test(x),i+1);
    for(const line of normalized.slice(i+1,j>=0?j:normalized.length)){
      const m=pctLine(line); if(!m)continue;
      const name=m[1].trim();
      if(!/[+]|^Triple\s|^Double\s/i.test(name))continue;
      const parts=name.replace(/^Triple\s+/i,'').replace(/^Double\s+/i,'').split(/\s*\+\s*/).map(x=>canonicalSet(x)).filter(Boolean);
      if(!parts.length)continue;
      const counts={};
      if(parts.length===1){counts[parts[0]]=/^Triple\s/i.test(name)?6:4;}
      else {counts[parts[0]]=4;counts[parts[1]]=2;}
      profile.specific_sets.push({name,weight:number(m[2])/100,counts});
    }
  }

  // Some versions of the page expose the grouped sets in the prose rather than
  // as a clean line. Recover the most common "X + Y 42.4%" forms as a fallback.
  if(!profile.specific_sets.length){
    const joined=normalized.join(' ');
    const re=/([A-Za-z%][A-Za-z% ]+\+\s*[A-Za-z%][A-Za-z% ]+)\s+([0-9]+(?:[.,][0-9]+)?)%/g;
    let m; while((m=re.exec(joined))){
      const name=m[1].trim(); if(!/^(Offense|Health|Speed|Defense|Tenacity|Potency|Critical Chance|Critical Damage|Critical Avoidance)/i.test(name))continue;
      const parts=name.split(/\s*\+\s*/).map(canonicalSet); if(parts.length!==2)continue;
      const counts={};counts[parts[0]]=4;counts[parts[1]]=2;
      profile.specific_sets.push({name,weight:number(m[2])/100,counts});
      if(profile.specific_sets.length>=8)break;
    }
  }

  // Average stats.
  i=nextIndex(x=>/^Average Stats for /i.test(x),0);
  if(i>=0){
    const j=nextIndex(x=>/^Best Mod Set for /i.test(x),i+1);
    const block=normalized.slice(i+1,j>=0?j:normalized.length);
    for(const stat of ['Health','Protection','Speed','Physical Damage','Special Damage','Armor','Potency','Tenacity']){
      const k=block.findIndex(x=>x===stat); if(k>=0&&block[k+1])profile.averages[stat]=number(block[k+1]);
    }
  }

  // Primary distributions for all variable slots. Square and Diamond are fixed
  // in SWGOH and are always shown in the recommendation header.
  const sections=[['Arrow','Best Arrow Mod '],['Triangle','Best Triangle Mod '],['Circle','Best Circle Mod '],['Cross','Best Cross Mod ']];
  for(const pair of sections){ const slot=pair[0], prefix=pair[1];
    const k=nextIndex(x=>x.startsWith(prefix),0); if(k<0)continue;
    const end=nextIndex(x=>x.startsWith('Best ') && !x.startsWith(prefix),k+1);
    const prim={};
    const block=normalized.slice(k+1,end>=0?end:normalized.length);
    // Current SWGOH.GG renders the primary distribution as a real table:
    // Primary Stat / Count / Percentage, with the three values on separate
    // lines after cleanLinesFromDoc(). Keep the compact parser first, then
    // parse the table-shaped triplets when necessary.
    for(const line of block){
      const m=pctLine(line); if(m&&m[1]!=='Primary Stat')prim[m[1].trim()]=number(m[2])/100;
    }
    if(!Object.keys(prim).length){
      for(let n=0;n<block.length;n++){
        const stat=String(block[n]||'').trim();
        if(!stat || /^(Primary Stat|Count|Percentage|---)$/i.test(stat)) continue;
        const count=String(block[n+1]||'').trim();
        const percentage=String(block[n+2]||'').trim();
        if(/^\d[\d,]*$/.test(count) && /^[0-9]+(?:[.,][0-9]+)?%$/.test(percentage)){
          prim[stat]=number(percentage.replace('%','').replace(',','.'))/100;
          n+=2;
        }
      }
    }
    if(Object.keys(prim).length)profile.slots[slot]={primaries:prim};
  }
  profile.slots.Square={primaries:{Offense:1}};
  profile.slots.Diamond={primaries:{Defense:1}};

  // Secondary-stat focus.
  i=idx('Secondary Stat Focus');
  if(i>=0){
    const j=nextIndex(x=>/^Relic\b/i.test(x),i+1);
    const labels=new Set(['Speed','Health','Protection','Offense','Defense','Potency','Tenacity','Critical Chance %','Critical Damage','Critical Chance','Offense %','Health %','Protection %','Defense %','Armor','Resistance','Physical Damage','Special Damage']);
    for(let k=i+1;k<(j>=0?j:normalized.length)-1;k++){
      if(!labels.has(normalized[k]))continue;
      const next=normalized[k+1]||''; if(/avg/i.test(next)){profile.secondary_focus[normalized[k]]=number(next);k++;}
    }
  }

  // Last-resort averages from the page text.
  if(!Object.keys(profile.averages).length){
    const joined=normalized.join('\n');
    for(const stat of ['Health','Protection','Speed']){const m=joined.match(new RegExp('\\b'+stat+'\\s+([0-9][0-9,]*(?:\\.[0-9]+)?)','i'));if(m)profile.averages[stat]=number(m[1]);}
  }
  profile.specific_sets.sort((a,b)=>b.weight-a.weight);
  return kyberProfileValid(profile)?profile:null;
}
async function fetchKyberProfile(character){
  if(!character)return null;
  const existing=profileForCharacter(character); if(kyberProfileValid(existing))return existing;
  const display=character.name||character.character||character.baseId||character.base_id||'';
  const candidates=[]; const add=v=>{const s=slug(v);if(s&&!candidates.includes(s))candidates.push(s);};
  add(display); add(character.baseId||character.base_id);
  const tryCandidate=async candidate=>{try{const r=await fetch(`${workerUrl()}/?path=best-mods&slug=${encodeURIComponent(candidate)}`,{headers:{'Accept':'text/html,application/xhtml+xml'}});if(!r.ok)return null;const html=await r.text();if(!/Best Mods|Data Slice:\s*Kyber/i.test(html))return null;return parseKyberProfileHTML(html,display,candidate);}catch(e){log(`Référence Kyber ${candidate}: ${e?.message||e}`);return null;}};
  for(const candidate of candidates){const parsed=await tryCandidate(candidate);if(parsed){profiles[candidate]=parsed;return parsed;}}
  try{
    const r=await fetch(`${workerUrl()}/?path=characters-index`,{headers:{'Accept':'text/html,application/xhtml+xml'}});
    if(r.ok){const doc=parseHTML(await r.text());const wanted=normalizeKyberKey(display);for(const a of Array.from(doc.querySelectorAll('a[href*="/units/"]')||[])){const label=normalizeKyberKey(a.textContent);const href=a.getAttribute('href')||'';const m=href.match(/\/units\/([^/]+)/);if(label===wanted&&m){const candidate=m[1];const parsed=await tryCandidate(candidate);if(parsed){profiles[candidate]=parsed;return parsed;}}}}
  }catch(e){log(`Index personnages Kyber indisponible : ${e?.message||e}`);}
  return null;
}
let kyberRequestSeq=0;
function buildLocalOptimizerReference(character){
  const p=optimizerProfileForCharacter(character)||{};
  const current=p.current_stats||{};
  return {
    character:String(character?.name||character?.baseId||''),
    source:'Profil Optimizer local — référence de secours',
    sets:{}, slots:{}, secondary_focus:{},
    averages:{
      Speed:Number(current.Speed||p.base_stats?.Speed||0),
      Health:Number(current.Health||p.base_stats?.Health||0),
      Protection:Number(current.Protection||p.base_stats?.Protection||0),
      'Physical Damage':Number(current['Physical Damage']||p.base_stats?.['Physical Damage']||0),
      'Special Damage':Number(current['Special Damage']||p.base_stats?.['Special Damage']||0)
    }
  };
}
async function ensureSelectedKyberProfile(){
  await optimizerProfilesReady;
  const c=selectedCharacter();if(!c)return null;
  const seq=++kyberRequestSeq;
  $('characterInfo').innerHTML=`<span class="tag">${esc(c.baseId||c.base_id||'')}</span> <strong>${esc(c.name||c.character||c.baseId||'')}</strong> · récupération de la référence d’optimisation…`;
  const p=await fetchKyberProfile(c);
  const fallback=p||buildLocalOptimizerReference(c);
  if(seq===kyberRequestSeq)updateCharacterInfo();
  if(p) log(`Référence Kyber récupérée : ${c.name||c.baseId}.`);
  else log(`SWGOH.GG indisponible pour ${c.name||c.baseId} : utilisation du profil Optimizer local comme référence de secours.`);
  return fallback;
}
function fillCharacters(names) {
  rosterCharacters = Array.isArray(names) ? names : [];
  const select=$('character'); select.innerHTML='';
  const sorted=[...rosterCharacters].sort((a,b)=>String(a.name||a.baseId||'').localeCompare(String(b.name||b.baseId||''),'fr'));
  for(const c of sorted) {
    const name=c.name||c.character||c.baseId||'Inconnu';
    const p=profileForCharacter(c);
    const o=document.createElement('option'); o.value=name; o.dataset.baseId=c.baseId||c.base_id||''; o.textContent=p ? `${name}  ★ Profil Kyber` : name; select.appendChild(o);
  }
  if(!sorted.length){const o=document.createElement('option');o.textContent='Aucun personnage chargé';o.disabled=true;o.selected=true;select.appendChild(o);}
  updateCharacterInfo();
}
function selectedCharacter() {
  const value=String($('character')?.value||'');
  return rosterCharacters.find(c=>String(c.name||c.character||c.baseId||'')===value) || null;
}
function optimizerRecommendationSummary(profile){
  const out={sets:[],primaries:[],secondaries:[],source:'Référence Kyber détaillée indisponible'};
  if(!profile || typeof profile!=='object') return out;
  out.source=profile.source||'SWGOH.GG Kyber / Top 1000 GAC';
  const specific=Array.isArray(profile.specific_sets)?profile.specific_sets:[];
  const generic=Array.isArray(profile.sets)?profile.sets:[];
  const rawSets=(specific.length?specific:generic.slice().sort((a,b)=>Number(b.weight||0)-Number(a.weight||0)));
  const uniqueSets=[]; const seenSets=new Set();
  for(const s of rawSets){
    const counts=s.counts||{};
    const label=s.name||Object.entries(counts).map(([name,n])=>`${name} ×${n}`).join(' + ')||'Set non renseigné';
    const key=String(label).toLowerCase().replace(/\s+/g,' ').trim();
    if(seenSets.has(key))continue;
    seenSets.add(key);
    const weight=Number(s.weight);
    uniqueSets.push({label,weight:Number.isFinite(weight)?weight:null});
  }
  out.sets=uniqueSets.slice(0,5);
  const slots=profile.slots||{};
  const slotLabels={Square:'Carré',Arrow:'Flèche',Diamond:'Diamant',Triangle:'Triangle',Circle:'Cercle',Cross:'Croix'};
  const order=['Square','Arrow','Diamond','Triangle','Circle','Cross'];
  out.primaries=order.map(slot=>{
    const data=slots?.[slot]?.primaries||{};
    const entries=Object.entries(data).sort((a,b)=>Number(b[1]||0)-Number(a[1]||0)).map(([name,weight])=>({name,weight:Number(weight||0)}));
    if(!entries.length)return null;
    return {slot,label:slotLabels[slot]||slot,entries,fixed:slot==='Square'||slot==='Diamond'};
  }).filter(Boolean);
  const focus=profile.secondary_focus||{};
  out.secondaries=Object.entries(focus).sort((a,b)=>Number(b[1]||0)-Number(a[1]||0)).slice(0,6).map(([name,avg])=>({name,avg:Number(avg)}));
  return out;
}
function optimizerSlotKey(slot){
  const k=String(slot||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/g,'');
  const map={square:'Square',carre:'Square',arrow:'Arrow',fleche:'Arrow',diamond:'Diamond',diamant:'Diamond',triangle:'Triangle',circle:'Circle',cercle:'Circle',cross:'Cross',croix:'Cross'};
  return map[k]||String(slot||'');
}
function optimizerPrimaryReference(profile, slot){
  const key=optimizerSlotKey(slot);
  return profile?.slots?.[key]?.primaries||{};
}
function optimizerPrimaryConformity(build, profile){
  let known=0,hits=0,details=[];
  const slots=['Square','Arrow','Diamond','Triangle','Circle','Cross'];
  for(const slot of slots){
    const expected=optimizerPrimaryReference(profile,slot);
    const entries=Object.entries(expected).sort((a,b)=>Number(b[1]||0)-Number(a[1]||0));
    if(!entries.length)continue;
    const mod=build.find(m=>optimizerSlotKey(m?.slot)===slot);
    if(!mod)continue;
    known++;
    const actual=String(mod.primary_stat||'').trim().toLowerCase();
    const match=entries.some(([name])=>actual===String(name).trim().toLowerCase());
    if(match)hits++;
    details.push({slot,actual,expected:entries[0][0],match,weight:Number(entries[0][1]||0)});
  }
  return {known,hits,details};
}

function optimizerReferenceMarkup(profile, character){
  const rec=optimizerRecommendationSummary(profile);
  const name=character?.name||character?.character||character?.baseId||'Personnage';
  const valid=!!profile && typeof profile==='object';
  const source=profile?.source||'SWGOH.GG Kyber / Top 1000 GAC';
  const url=profile?.url||'';
  const sets=rec.sets.length?rec.sets.map((x,i)=>`<div class="forge-ref-row"><span>${String(i+1).padStart(2,'0')}</span><b>${esc(x.label)}</b>${x.weight!=null?`<em>${(x.weight*100).toFixed(1)} %</em>`:''}</div>`).join(''):'<div class="forge-ref-empty">Référence de sets non disponible.</div>';
  const primaryMap=new Map(Array.isArray(rec.primaries)?rec.primaries.map(x=>[x.slot,x]):[]);
  const sixSlots=[['Square','Carré'],['Arrow','Flèche'],['Diamond','Diamant'],['Triangle','Triangle'],['Circle','Cercle'],['Cross','Croix']];
  const primaries=sixSlots.map(([slot,label])=>{
    const x=primaryMap.get(slot);
    const entries=Array.isArray(x?.entries)?x.entries:[];
    if(slot==='Square' || slot==='Diamond'){
      const fixed=entries[0]?.name||(slot==='Square'?'Offense':'Defense');
      return `<div class="forge-primary-slot ${entries.length?'is-live':'is-fixed-fallback'}"><span>${label}</span><b>${esc(fixed)}</b><em>${entries.length?'FIXE':'FIXE · JEU'}</em></div>`;
    }
    const top=entries.slice(0,4).map(entry=>`<span class="forge-primary-option"><b>${esc(entry?.name||'—')}</b><em>${(Number(entry?.weight||0)*100).toFixed(1)} %</em></span>`).join('');
    return `<div class="forge-primary-slot ${entries.length?'is-live':'is-missing'}"><span>${label}</span><div class="forge-primary-options">${top||'<span class="forge-primary-option"><b>Référence indisponible</b></span>'}</div></div>`;
  }).join('');
  const secondaries=rec.secondaries.length?rec.secondaries.map((x,i)=>`<div class="forge-ref-row"><span>${String(i+1).padStart(2,'0')}</span><b>${esc(x.name)}</b>${Number.isFinite(x.avg)&&x.avg>0?`<em>moy. ${num(x.avg,1)}</em>`:''}</div>`).join(''):'<div class="forge-ref-empty">Référence des secondaires non disponible.</div>';
  return `<div class="forge-reference-panel ${valid?'is-live':'is-fallback'}">
    <div class="forge-reference-head">
      <div class="forge-reference-identity">
        <span class="forge-kicker">RÉFÉRENCE DE FORGE</span>
        <strong>${esc(name)}</strong>
        <small>${esc(source)}</small>
      </div>
      <div class="forge-reference-status"><i></i><span>${valid?'RÉFÉRENCE CHARGÉE':'RÉFÉRENCE EN ATTENTE'}</span>${url?`<a href="${esc(url)}" target="_blank" rel="noopener">SWGOH.GG ↗</a>`:''}</div>
    </div>
    <div class="forge-reference-columns">
      <section class="forge-reference-column"><header><span>SETS</span><small>distribution Kyber</small></header>${sets}</section>
      <section class="forge-reference-column"><header><span>PRIMAIRES PAR SLOT</span><small>Kyber · 6 emplacements</small></header>${primaries}</section>
      <section class="forge-reference-column"><header><span>SECONDAIRES PRIORITAIRES</span><small>focus Kyber</small></header>${secondaries}</section>
      <section class="forge-reference-column forge-reference-scope"><header><span>CRITÈRES ACTIFS</span><small>recherche Seigneur Sith</small></header>
        <div class="forge-scope-badges"><b class="active">✓ INCOMPLETS</b><b class="active">✓ TRÈS FAIBLES</b><b class="active">✓ FAIBLES</b><b class="optional">□ MOYENS</b><b class="optional">□ TOUT LE ROSTER</b></div>
        <div class="forge-reference-note"><strong>GL</strong><span>Exclues à ce niveau · elles appartiennent au choix SITH’ARI.</span></div>
      </section>
    </div>
    <div class="forge-reference-doctrine"><span>DOCTRINE ACTIVE</span><b>La Forge cherche les mods disponibles qui s'approchent le plus des distributions Kyber, sans remplacer la référence.</b></div>
  </div>`;
}

function renderOptimizerPrimaryControls(profile){
  const slots={Arrow:'optimizerPrimaryArrow',Triangle:'optimizerPrimaryTriangle',Circle:'optimizerPrimaryCircle',Cross:'optimizerPrimaryCross'};
  for(const [slot,id] of Object.entries(slots)){
    const el=$(id); if(!el) continue;
    const data=profile?.slots?.[slot]?.primaries||{};
    const entries=Object.entries(data).sort((a,b)=>Number(b[1]||0)-Number(a[1]||0));
    el.innerHTML=entries.length
      ? entries.map(([name,weight],index)=>`<option value="${esc(name)}">${index===0?'Recommandée · ':''}${esc(name)} · ${(Number(weight||0)*100).toFixed(1)}%</option>`).join('')+'<option value="">Toutes les primaires</option>'
      : '<option value="">Toutes les primaires · référence indisponible</option>';
    el.disabled=!entries.length;
    if(entries.length) el.value=entries[0][0];
  }
}
function optimizerSourceScopeSummary(){
  if($('optimizerAllRoster')?.checked===true)return ['TOUT LE ROSTER','GL exclues'];
  const out=[];
  if($('optimizerIncomplete')?.checked!==false)out.push('INCOMPLETS');
  if($('optimizerVeryLow')?.checked!==false)out.push('TRÈS FAIBLES');
  if($('optimizerLow')?.checked!==false)out.push('FAIBLES');
  if($('optimizerMedium')?.checked===true)out.push('MOYENS');
  return [out.join(' + ')||'AUCUNE SOURCE','GL exclues'];
}
function updateCharacterInfo() {
  const c=selectedCharacter();
  if(!c){$('characterInfo').textContent='Aucun personnage sélectionné.';return;}
  const p=profileForCharacter(c);
  const local=optimizerProfileForCharacter(c);
  const ref=p || null;
  const fallback=local&&!p;
  $('characterInfo').innerHTML=optimizerReferenceMarkup(ref,c)+`<div class="forge-active-rulebar"><span><b>PERSONNAGE</b> ${esc(c.name||c.character||c.baseId||'—')}</span><span><b>SOURCE MODS</b> ${esc(optimizerSourceScopeSummary()[0])}</span><span><b>GL</b> EXCLUES</span><span><b>LOGIQUE</b> KYBER → FILTRE → ARSENAL → BUILDS</span></div>`;
  if(fallback) log(`Profil local disponible pour ${c.name||c.baseId}, mais les critères Kyber détaillés restent à récupérer.`);
}

const DEFAULT_WORKER_URL = 'https://swgoh-optimizer-relay.lorg75017.workers.dev';
function workerUrl() { return String(localStorage.getItem('swgohRelayUrl') || $('relayUrl')?.value || DEFAULT_WORKER_URL).trim().replace(/\/$/,''); }
function saveWorkerUrl() { const v=String($('relayUrl').value||'').trim().replace(/\/$/,''); if(v)localStorage.setItem('swgohRelayUrl',v);else localStorage.removeItem('swgohRelayUrl'); $('relayState').textContent=v?'RELAIS CONFIGURÉ':'RELAIS NON CONFIGURÉ'; log(v?`Relais Cloudflare enregistré : ${v}`:'Relais Cloudflare effacé.'); }
async function fetchTextWithTimeout(url,options={},timeoutMs=20000){
  const controller=typeof AbortController==='function'?new AbortController():null;
  const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
  try{
    const response=await fetch(url,{...options,...(controller?{signal:controller.signal}:{})});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    return await response.text();
  }catch(error){
    if(error?.name==='AbortError')throw new Error(`Délai dépassé après ${Math.round(timeoutMs/1000)} s : ${new URL(url).host}`);
    throw error;
  }finally{if(timer)clearTimeout(timer);}
}
async function fetchJSON(url){
  const raw=await fetchTextWithTimeout(url,{headers:{'Accept':'application/json,text/plain,*/*'}});
  try{return JSON.parse(raw);}catch(_){throw new Error('Réponse JSON invalide reçue du relais.');}
}
async function fetchText(url) {
  const candidates=[], relay=workerUrl();
  if(relay){const m=url.match(/\/p\/(\d{9})\/(characters|mods)?\/?(?:\?page=(\d+))?/);if(m){const ally=m[1],path=m[2]||'profile',page=m[3]||'1';candidates.push(`${relay}/?ally=${ally}&path=${path}&page=${page}`);}}
  candidates.push(url); let last='';
  for(const u of candidates){try{const text=await fetchTextWithTimeout(u,{headers:{'Accept':'text/html,application/xhtml+xml,application/json'}});if(text&&text.length>200)return text;last=`Réponse vide via ${new URL(u).host}`;}catch(e){last=e.message||String(e);}}
  throw new Error(last||'Impossible de lire la page SWGOH.GG.');
}
function parseHTML(text){return new DOMParser().parseFromString(text,'text/html');}
function firstText(root,selectors){for(const sel of selectors){const n=root.querySelector(sel);if(n){const t=n.textContent?.trim();if(t)return t;}}return '';}
function firstAttr(root,selectors,attr){for(const sel of selectors){const n=root.querySelector(sel);const v=n?.getAttribute(attr);if(v)return v;}return '';}
function parseNumberValue(v){const m=String(v??'').replace(/\s/g,'').match(/[+-]?[0-9]+(?:[.,][0-9]+)?/);return m?Number(m[0].replace(',','.')):0;}
function slotFromShape(shape){const s=String(shape||'').toLowerCase();return ({'1':'Square','2':'Square','3':'Arrow','4':'Diamond','5':'Triangle','6':'Circle','7':'Cross',transmitter:'Square',receiver:'Arrow',processor:'Diamond','holo-array':'Triangle','data-bus':'Circle',multiplexer:'Cross'})[s]||shape;}
function parseStatGeneric(node){if(!node)return{stat:'',value:0};const label=firstText(node,['.statmod-stat-label','[class*="statmod-stat-label"]','[data-stat-name]'])||node.getAttribute?.('data-stat-name')||'';const raw=firstText(node,['.statmod-stat-value','[class*="statmod-stat-value"]','[data-stat-value]'])||node.getAttribute?.('data-stat-value')||node.textContent||'';return{stat:label.trim(),value:parseNumberValue(raw)};}
function parseModsPage(doc,page){
  const nodes=[...doc.querySelectorAll('.collection-mod, [class*=\"collection-mod\"], [data-mod-id], [data-id].mod')],result=[];
  nodes.forEach((node,idx)=>{
    const img=node.querySelector('.statmod-img, img[class*=\"statmod-img\"]');
    const alt=img?.getAttribute('alt')||'';
    const src=img?.getAttribute('src')||img?.getAttribute('data-src')||'';
    const words=alt.trim().split(/\s+/).filter(Boolean);
    const shape=words.at(-1)||'';
    const set=words.length>=5?words.slice(2,-1).join(' '):(words.length>=4?words[2]:'');
    const primary=parseStatGeneric(node.querySelector('.statmod-stats-1 .statmod-stat, [class*=\"statmod-stats-1\"] [class*=\"statmod-stat\"]'));
    const secondary=[...node.querySelectorAll('.statmod-stats-2 .statmod-stat, [class*=\"statmod-stats-2\"] [class*=\"statmod-stat\"]')].map(parseStatGeneric).filter(x=>x.stat);
    const char=firstAttr(node,['img.char-portrait-img','img[class*=\"char-portrait-img\"]'],'alt');
    const level=parseNumberValue(firstText(node,['.statmod-level','[class*=\"statmod-level\"]']));
    const rarity=node.querySelectorAll('.statmod-pip, [class*=\"statmod-pip\"]').length;
    const id=node.getAttribute('data-id')||node.getAttribute('data-mod-id')||`gg-${page}-${idx}`;
    if(shape||set||primary.stat||secondary.length){
      result.push(normalizeMod({game_id:id,slot:slotFromShape(shape),set_name:set,rarity,dots:rarity,level,primary_stat:primary.stat,primary_value:primary.value,secondary_stats:secondary,character:char,asset_src:src,raw_alt:alt},page*1000+idx));
    }
  });
  return result.filter(Boolean);
}
function parseCharacters(doc){const result=[],nodes=[...doc.querySelectorAll('.collection-char-list .collection-char, .collection-char, [class*="collection-char"]')],seen=new Set();for(const node of nodes){const name=firstText(node,['.collection-char-name-link','[class*="collection-char-name"]','a[href*="/character/"]']);if(!name||seen.has(name))continue;seen.add(name);const level=parseNumberValue(firstText(node,['.char-portrait-full-level','[class*="char-portrait-full-level"]']));let gear=0;const portrait=node.querySelector('.player-char-portrait,[class*="player-char-portrait"]');for(let i=1;i<=13;i++)if(portrait?.classList.contains(`char-portrait-full-gear-t${i}`))gear=i;const stars=[...node.querySelectorAll('.star, [class*="star"]')].filter(x=>!String(x.className).includes('inactive')).length;result.push({name,level,gear,stars});}return result;}
function looksLikeMod(o){
  if(!o||typeof o!=='object')return false;
  const keys=Object.keys(o).map(k=>k.toLowerCase());
  return (keys.includes('slot')||keys.includes('slot_id')||keys.includes('modslot')||keys.includes('shape')) &&
         (keys.includes('level')||keys.includes('pips')||keys.includes('rarity')) &&
         (keys.includes('set')||keys.includes('set_id')||keys.includes('setname')||keys.includes('setid')||keys.includes('primary')||keys.includes('primary_stat')||keys.includes('primarystat'));
}
function extractApiMods(json){
  const out=[]; let i=0;
  const visit=(o)=>{ if(!o||typeof o!=='object')return; if(looksLikeMod(o)) out.push(normalizeMod({...o,game_id:o.id||o.uid||o.modId||`api-${i}`},i++)); };
  // Prefer known mod arrays/containers when present, then fall back to a recursive walk.
  const known=[];
  for(const key of ['mods','Mods','data']) if(Array.isArray(json?.[key])) known.push(...json[key]);
  if(Array.isArray(json?.mods)) known.push(...json.mods);
  if(known.length) known.forEach(visit);
  if(!out.length) walkObjects(json,visit);
  const seen=new Set();
  return out.filter(m=>m&&!seen.has(m.game_id)&&seen.add(m.game_id));
}
function unitToCharacter(u,index=0){const o=u?.data&&typeof u.data==='object'?u.data:u;if(!o||typeof o!=='object')return null;const baseId=o.base_id??o.baseId??o.definitionId;const name=o.name??o.character??o.characterName??o.unitName;const hasRosterFields=baseId&&Number.isFinite(Number(o.level))&&Number.isFinite(Number(o.rarity))&&(Object.prototype.hasOwnProperty.call(o,'gear_level')||Object.prototype.hasOwnProperty.call(o,'gearLevel')||Object.prototype.hasOwnProperty.call(o,'gear')||Object.prototype.hasOwnProperty.call(o,'power')||Object.prototype.hasOwnProperty.call(o,'combat_type'));if(!hasRosterFields)return null;const relicTierRaw=o.relic_tier??o.relicTier??o.relic_level??o.relicLevel??o.relic?.tier??o.relic?.relicTier??0;const thumbnailName=o.thumbnail_name??o.thumbnailName??o.thumbnail??o.icon??o.image??'';const portraitUrl=o.portrait_url??o.portraitUrl??o.image_url??o.imageUrl??'';return{name:name||baseId,baseId,level:Number(o.level||0),gear:Number(o.gear_level??o.gearLevel??o.gear??0),stars:Number(o.rarity??o.starLevel??o.stars??0),power:Number(o.power||0),combatType:Number(o.combat_type??o.combatType??1),relic_tier:Number(relicTierRaw)||0,thumbnailName,portraitUrl,raw:u};}
function extractApiCharacters(json){const direct=Array.isArray(json?.units)?json.units:[];let out=direct.map(unitToCharacter).filter(Boolean);if(!out.length){const candidates=[];walkObjects(json,o=>{const unit=unitToCharacter(o);if(unit)candidates.push(unit);});out=candidates;}const seen=new Set();return out.filter(x=>{const key=`${x.baseId||''}|${x.name||''}`;if(seen.has(key))return false;seen.add(key);return true;});}
async function fetchJSON(url){const r=await fetch(url,{headers:{'Accept':'application/json,text/plain,*/*'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return JSON.parse(await r.text());}

async function loadRemotePlayer(){
  const allyCode=cleanAllyCode($('allyCode').value);if(allyCode.length!==9){log('Ally Code invalide : 9 chiffres attendus.');return;}
  $('loadPlayer').disabled=true;$('loadPlayer').textContent='CHARGEMENT…';$('log').textContent='';const fmt=formatAlly(allyCode);log(`Recherche du joueur ${fmt}…`);
  try{
    if(workerUrl())log('Relais Cloudflare actif : récupération via relais sécurisé.');else log('Aucun relais configuré : tentative directe depuis le navigateur.');
    const base=`https://swgoh.gg/p/${allyCode}`,relay=workerUrl();let apiChars=[],apiMods=[];
    if(relay){log('Tentative API JSON SWGOH.GG via le Worker…');try{const api=await fetchJSON(`${relay}/?ally=${allyCode}&path=api-profile`);apiChars=extractApiCharacters(api);apiMods=extractApiMods(api);log(`API : ${apiChars.length} unités candidates, ${apiMods.length} mods candidats.`);}catch(e){log(`API profil indisponible : ${e.message}`);}if(!apiMods.length){try{const apiModsJson=await fetchJSON(`${relay}/?ally=${allyCode}&path=api-mods`);apiMods=extractApiMods(apiModsJson);log(`API mods : ${apiMods.length} mods candidats.`);}catch(e){log(`API mods indisponible : ${e.message}`);}}}
    const profileText=await fetchText(`${base}/`),profileDoc=parseHTML(profileText),title=profileDoc.querySelector('h1')?.textContent?.trim()||'Joueur',bodyText=profileDoc.body.textContent||'';accountGalacticPower=extractGalacticPowerFromProfile(bodyText);renderGalacticPower();const rosterMatch=bodyText.match(/Roster\s+([0-9,]+)\s+units/i);const modsMatch=bodyText.match(/([0-9,]+)\s+Mods/i);log(`Profil SWGOH.GG trouvé : ${title}.`);if(rosterMatch)log(`Roster annoncé : ${rosterMatch[1]} unités.`);if(modsMatch)log(`Mods annoncés : ${modsMatch[1]}.`);log('Lecture du roster…');
    if(apiChars.length)log(`Unités directes API retenues : ${apiChars.length}.`);
    const ownedApi=apiChars.filter(c=>Number(c.level||0)>0||Number(c.gear||0)>0||Number(c.stars||0)>0);
    let chars=[],ships=[];
    if(ownedApi.length){const split=splitRosterUnits(ownedApi);chars=split.characters;ships=split.ships;log(`Unités possédées : ${chars.length} personnages + ${ships.length} vaisseaux.`);}else{chars=parseCharacters(parseHTML(await fetchText(`${base}/characters/`)));log(`Fallback HTML : ${chars.length} personnages détectés.`);}
    rosterCharacters=chars;rosterShips=ships;log(`${chars.length} personnages récupérés (${apiChars.length} unités candidates API, filtrées sur les unités possédées).`);
    log('Lecture des mods publics pour décoder les statistiques affichées…');
    const htmlMods=[];
    for(let page=1;page<=100;page++){
      const pageMods=parseModsPage(parseHTML(await fetchText(`${base}/mods/?page=${page}`)),page);
      if(!pageMods.length)break;
      htmlMods.push(...pageMods);
      log(`Page mods ${page}: ${pageMods.length} mods.`);
      if(pageMods.length<30)break;
    }
    // Les pages publiques donnent les valeurs réellement affichées (ex. 8 Speed, 5.88%).
    // L'API reste un filet de sécurité pour les éventuels mods non présents dans les pages.
    const apiById=new Map(apiMods.map(m=>[String(m.game_id||''),m]));
    const apiByShape=new Map();
    for(const m of apiMods){
      const key=[compactKey(m.character||m.location||m.unit_equiped||''),modSlotLabel(m.slot),modSetLabel(m.set_name||m.set||m.setId||m.set_id),Number(m.level||0),String(m.primary_stat||'')].join('|');
      if(key!=='||||')apiByShape.set(key,m);
    }
    const merged=htmlMods.map(h=>{
      const direct=apiById.get(String(h.game_id||''));
      const key=[compactKey(h.character||''),modSlotLabel(h.slot),modSetLabel(h.set_name||''),Number(h.level||0),String(h.primary_stat||'')].join('|');
      const api=direct||apiByShape.get(key);
      return api ? normalizeMod({...h,...api,game_id:h.game_id||api.game_id,slot:h.slot||api.slot,set_name:h.set_name||api.set_name,primary_stat:h.primary_stat||api.primary_stat,primary_value:h.primary_value||api.primary_value,character:h.character||api.character||api.location||api.unit_equiped}) : h;
    });
    const seenIds=new Set(merged.map(m=>m.game_id));
    for(const m of apiMods){ if(!seenIds.has(m.game_id)){ merged.push(m); seenIds.add(m.game_id); } }
    const seen=new Set();mods=merged.filter(m=>m&&!seen.has(m.game_id)&&seen.add(m.game_id));
    log(`Mods décodés : ${htmlMods.length} via pages publiques + ${Math.max(0,mods.length-htmlMods.length)} compléments API = ${mods.length}.`);
    currentData={allyCode,name:title,characters:chars,ships,mods,galacticPower:accountGalacticPower};updateRosterCounts(chars,ships);renderGalacticPower();buildFactionMap();fillCharacters(chars);updateAccountSummary(title,fmt);renderV18SpeedRecap('v18DashboardSpeed');renderModsAnalysis();renderDataTable();renderHolocronVerdict(holocronTopChangeCandidates().slice(0,10));renderSithariNexus();
    $('dataInfo').textContent=`Source: SWGOH.GG public pages${workerUrl()?' + Cloudflare Worker relay':''}\nJoueur: ${title}\nAlly Code: ${fmt}\nPersonnages: ${chars.length}\nVaisseaux: ${ships.length}\nUnités totales: ${chars.length+ships.length}\nMods: ${mods.length}\nProfils Kyber disponibles dans cette version: ${Object.keys(profiles).length}`;
    log(`TERMINÉ : ${chars.length} personnages, ${ships.length} vaisseaux, ${mods.length} mods exploitables.`);if(!mods.length)log('Aucun mod lisible.');showPage('dashboard');
    window.dispatchEvent(new CustomEvent('holocron:data-updated'));
    return true;
  }catch(e){log(`Échec du chargement : ${e.message||e}`);log('Si le relais est configuré et renvoie une erreur HTTP, utilise l’import JSON.');return false;}
  finally{$('loadPlayer').disabled=false;$('loadPlayer').textContent='CHARGER MON PROFIL';}
}
function updateAccountSummary(title,fmt){if($('playerName'))$('playerName').textContent=title||'Profil';if($('playerAlly'))$('playerAlly').textContent=fmt||'—';if($('heroPlayerName'))$('heroPlayerName').textContent=title||'Profil';if($('heroPlayerAlly'))$('heroPlayerAlly').textContent=fmt||'—';setText('topAccountName',title||'—');setText('topProfileState','CONNECTÉ');setText('heroProfileState','CONNECTÉ');}
function modSetLabel(value){
  const raw=String(value??'').trim();
  if(!raw)return '';
  const key=raw.toLowerCase().replace(/[_-]+/g,' ');
  const map={'1':'Health','2':'Offense','3':'Defense','4':'Speed','5':'Crit Chance','6':'Crit Damage','7':'Potency','8':'Tenacity','health':'Health','offense':'Offense','defense':'Defense','speed':'Speed','crit chance':'Crit Chance','crit damage':'Crit Damage','potency':'Potency','tenacity':'Tenacity'};
  return map[raw]||map[key]||raw;
}
function modSlotLabel(value){
  const raw=String(value??'').trim();
  const key=raw.toLowerCase().replace(/[_-]+/g,' ');
  const map={'1':'Square','2':'Square','3':'Arrow','4':'Diamond','5':'Triangle','6':'Circle','7':'Cross','square':'Square','arrow':'Arrow','diamond':'Diamond','triangle':'Triangle','circle':'Circle','cross':'Cross','transmitter':'Square','receiver':'Arrow','processor':'Diamond','holo array':'Triangle','data bus':'Circle','multiplexer':'Cross'};
  return map[raw]||map[key]||raw;
}
function modIconTier(m){
  const rawValue=m?.tier??m?.quality??m?.grade??m?.modTier??m?.mod_tier??m?.rarityTier??m?.rarity_tier??'';
  const raw=String(rawValue).trim().toUpperCase();
  if(/^[A-E]$/.test(raw))return raw;
  // SWGOH player data exposes the mod tier as a number in equippedStatMod.
  // 1=E, 2=D, 3=C, 4=B, 5=A. Never fall back to E when a numeric tier exists.
  const numericTier=Number(rawValue);
  if(Number.isInteger(numericTier) && numericTier>=1 && numericTier<=5){
    return ({1:'E',2:'D',3:'C',4:'B',5:'A'})[numericTier];
  }
  const assetText=String(m?.asset_src??m?.icon_url??m?.iconUrl??m?.image_url??m?.imageUrl??m?.icon??m?.image??'');
  const assetHit=assetText.match(/[-_]([A-E])\.(?:png|webp)(?:$|[?#])/i);
  if(assetHit)return assetHit[1].toUpperCase();
  const text=String(m?.name??m?.displayName??m?.raw_alt??m?.alt??'');
  const hit=text.match(/(?:^|[\s_-])([A-E])(?:$|[\s_-])/i);
  return hit?hit[1].toUpperCase():'E';
}
function modDots(m){
  const candidates=[
    m?.pips,m?.dots,m?.dotCount,m?.dot_count,m?.pipCount,m?.rarity_dots,m?.dot_rarity,m?.rarity
  ];
  for(const v of candidates){
    const n=Number(v);
    if(Number.isInteger(n)&&n>=1&&n<=6)return n;
  }
  const text=String(m?.name??m?.displayName??m?.raw_alt??m?.alt??'');
  const mk=text.match(/(?:MK|Mk)\s*([1-6])\b/i);
  if(mk)return Number(mk[1]);
  const roman=text.match(/(?:^|[\s_-])(VI|V|IV|III|II|I)(?:[-\s]|$)/i);
  if(roman){
    return ({I:1,II:2,III:3,IV:4,V:5,VI:6}[roman[1].toUpperCase()]||5);
  }
  return 5;
}
function modDotsClass(m){
  return modDots(m)===6?'dots-6':'dots-1-5';
}
function modAssetName(m){
  const set=modSetLabel(m?.set_name??m?.set??m?.setId??m?.set_id).trim();
  const slot=modSlotLabel(m?.slot??m?.slot_id??m?.slotId??m?.modSlot).trim();
  const shape={Square:'Transmitter',Arrow:'Receiver',Diamond:'Processor',Triangle:'Holo-Array',Circle:'Data-Bus',Cross:'Multiplexer'}[slot]||'Transmitter';
  const assetSet={
    'Crit Chance':'Critical Chance',
    'Crit Damage':'Critical Damage',
    'Critical Chance':'Critical Chance',
    'Critical Damage':'Critical Damage'
  }[set]||set;
  const safeSet=assetSet.replace(/\s+/g,'-');
  return `Mod-${safeSet}-${shape}-${modIconTier(m)}.png`;
}
function modIconUrl(m){ return ''; }
function modDotsUrl(m){ return ''; }
function modIconHtml(m, size='56'){
  const name=esc(`${m?.set_name||'Mod'} · ${m?.slot||''}`.trim());
  const dots=modDots(m);
  const tier=modIconTier(m);
  const slot=modSlotLabel(m?.slot??m?.slot_id??m?.slotId??m?.modSlot);
  const slotClass=slot.toLowerCase().replace(/[^a-z]+/g,'-');
  const dotsColor=dots===6?'gold':'white';
  const tierClass={A:'tier-a',B:'tier-b',C:'tier-c',D:'tier-d',E:'tier-e'}[tier]||'tier-e';
  return `<span class="mod-visual slot-${slotClass}" data-dots="${dots}" data-tier="${tier}" data-slot="${esc(slot)}" title="${name} — ${dots} dots · Tier ${tier} · Niveau ${num(m?.level)}"><span class="mod-visual-grade"><span class="mod-visual-dots-number dots-${dotsColor}">${dots}</span><span class="mod-visual-tier ${tierClass}">${tier}</span></span><span class="mod-visual-level">Niv. ${num(m?.level)}</span></span>`;
}
function normalizeModForDisplay(m){
  if(!m)return m;
  const out={...m};
  out.set_name=modSetLabel(out.set_name??out.set??out.setId??out.set_id);
  out.slot=modSlotLabel(out.slot??out.slot_id??out.slotId??out.modSlot);
  // Normalize the equipped owner once. Comlink/export variants can expose
  // the owner as a name, baseId, characterId, equippedTo, or an object.
  const ownerCandidates=[out.characterName,out.equippedTo,out.equipped_to,out.character,
    out.characterId,out.character_id,out.equippedToId,out.equipped_to_id,out.ownerId,out.owner_id];
  let owner='';
  for(const value of ownerCandidates){
    if(value==null)continue;
    if(typeof value==='object'){
      owner=String(value.baseId??value.base_id??value.characterId??value.character_id??value.name??value.id??'').trim();
    }else owner=String(value).trim();
    if(owner && owner!=='[object Object]')break;
  }
  out.character=owner;
  out.ownerKey=compactKey(owner);
  out.ownerBaseId=compactKey(out.characterId??out.character_id??'');
  out.level=Number(out.level??0);
  out.rarity=Number(out.rarity??out.pips??0);
  out.dots=Number(out.dots??out.dotCount??out.pips??out.rarity??0);
  out.tier=out.tier??out.quality??out.grade??out.modTier??out.mod_tier??out.rarityTier??'';
  out.raw_alt=out.raw_alt??out.alt??out.imageAlt??out.name??'';
  out.asset_src=out.asset_src??out.icon_url??out.iconUrl??out.image_url??out.imageUrl??out.icon??out.image??'';
  out.tier=modIconTier(out);
  out.dots=modDots(out);
  return out;
}
function prepareModFilters(){
  const setSel=$('modSetFilter'),slotSel=$('modSlotFilter');
  if(!setSel||!slotSel)return;
  const sets=[...new Set(mods.map(m=>normalizeModForDisplay(m).set_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  const slots=[...new Set(mods.map(m=>normalizeModForDisplay(m).slot).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  setSel.innerHTML='<option value="">Tous les sets</option>'+sets.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  slotSel.innerHTML='<option value="">Tous les slots</option>'+slots.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  modFiltersReady=true;
}
function renderModSummary(rows){
  const box=$('modSummary'); if(!box)return;
  if(currentDataset!=='mods'){box.hidden=true;return;}
  const equipped=rows.filter(m=>String(m.character||'').trim()).length;
  const free=rows.length-equipped;
  const six=rows.filter(m=>Number(m.level)>=15).length;
  box.hidden=false;
  box.innerHTML=`<div><span>MODS FILTRÉS</span><strong>${num(rows.length)}</strong></div><div><span>ÉQUIPÉS</span><strong>${num(equipped)}</strong></div><div><span>LIBRES</span><strong>${num(free)}</strong></div><div><span>NIVEAU 15</span><strong>${num(six)}</strong></div>`;
}
function getFilteredMods(){
  const q=String($('dataSearch')?.value||'').trim().toLowerCase();
  const set=String($('modSetFilter')?.value||'');
  const slot=String($('modSlotFilter')?.value||'');
  const owner=String($('modOwnerFilter')?.value||'');
  const minLevel=Number($('modLevelFilter')?.value||0);
  return mods.map((raw,i)=>({...normalizeModForDisplay(raw),_index:i})).filter(m=>{
    const text=JSON.stringify(m).toLowerCase();
    if(q&&!text.includes(q))return false;
    if(set&&m.set_name!==set)return false;
    if(slot&&m.slot!==slot)return false;
    const equipped=String(m.character||'').trim().length>0;
    if(owner==='equipped'&&!equipped)return false;
    if(owner==='free'&&equipped)return false;
    if(Number(m.level||0)<minLevel)return false;
    return true;
  });
}
function displayModStat(name,value){const n=String(name||'');return `${n} ${num(value,1)}${n.endsWith(' %')?'%':''}`;}
function modSecondaries(m){const arr=[];for(let i=1;i<=4;i++){const s=m[`secondary_${i}_stat`],v=m[`secondary_${i}_value`];if(s)arr.push(displayModStat(s,v));}return arr.join(' · ');}
function renderDataCharacterFilters(){
  const fs=$('dataFactionFilter'), side=$('dataSideFilter'), box=$('dataCharacterFilters');
  if(!fs||!side||!box)return;
  box.hidden=currentDataset!=='characters';
  const current=fs.value||'';
  const factions=allFactions();
  fs.innerHTML='<option value="">Toutes les factions</option>'+factions.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('');
  if(factions.includes(current)) fs.value=current;
}
function openCharacterModsAnalysis(key){
  analysisSelectedCharacter=key;
  const c=rosterCharacters.find(x=>characterKey(x)===key);
  if(c){ analysisFaction='Toutes les factions'; analysisMode='character'; }
  showPage('mods-analysis');
  setAnalysisTab('report');
}
function renderDataTable(){
  const q=String($('dataSearch').value||'').trim().toLowerCase();let rows=[];
  if(currentDataset==='characters'){
    renderDataCharacterFilters();
    const faction=$('dataFactionFilter')?.value||'';
    const side=$('dataSideFilter')?.value||'ALL';
    rows=rosterCharacters.filter(c=>{
      if(faction && !(factionMap[characterKey(c)]||[]).includes(faction)) return false;
      if(side!=='ALL' && characterAlignmentFromFactions(c)!==side) return false;
      return JSON.stringify(c).toLowerCase().includes(q);
    }).sort((a,b)=>String(a.name||a.baseId).localeCompare(String(b.name||b.baseId),'fr'));
    $('dataTableMeta').textContent=`${rows.length} personnage(s) affiché(s) sur ${rosterCharacters.length}`;
    $('dataTable').innerHTML=rows.length?`<table><thead><tr><th>Personnage</th><th>Niveau</th><th>Gear</th><th>Relic</th><th>Étoiles</th><th>Puissance</th><th>Analyse mods</th></tr></thead><tbody>${rows.map(c=>{const relic=relicLevelFromTier(c.relic_tier??c.relicTier??0);return `<tr><td><strong>${esc(c.name||c.character||c.baseId)}</strong></td><td>${num(c.level)}</td><td>${num(c.gear||c.gear_level)}</td><td>${'R'+num(relic)}</td><td>${num(c.stars||c.rarity)}★</td><td>${num(c.power||c.power_rating||c.powerRating)}</td><td><button type="button" class="detail-mods-btn data-action-btn" data-data-analysis="${esc(characterKey(c))}">VOIR L’ANALYSE</button></td></tr>`}).join('')}</tbody></table>`:'<div class="empty">Aucun personnage ne correspond aux filtres.</div>';
    $('dataTable').querySelectorAll('[data-data-analysis]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();openCharacterModsAnalysis(btn.dataset.dataAnalysis);}));
  } else if(currentDataset==='ships'){
    rows=rosterShips.filter(c=>JSON.stringify(c).toLowerCase().includes(q)).sort((a,b)=>String(a.name||a.baseId).localeCompare(String(b.name||b.baseId),'fr'));
    $('dataTableMeta').textContent=`${rows.length} vaisseau(x) affiché(s) sur ${rosterShips.length}`;
    $('dataTable').innerHTML=rows.length?`<table><thead><tr><th>Vaisseau</th><th>Niveau</th><th>Gear</th><th>Étoiles</th><th>Puissance</th></tr></thead><tbody>${rows.map(c=>`<tr><td><strong>${esc(c.name||c.character||c.baseId)}</strong></td><td>${num(c.level)}</td><td>${num(c.gear)}</td><td>${num(c.stars)}★</td><td>${num(c.power)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Aucun vaisseau ne correspond à la recherche.</div>';
  } else {
    const filterBox=$('modFilters'); if(filterBox)filterBox.hidden=false;
    if(!modFiltersReady)prepareModFilters();
    rows=getFilteredMods();
    rows.sort((a,b)=>{const sa=String(a.set_name||''),sb=String(b.set_name||'');return sa.localeCompare(sb,'fr')||Number(b.level||0)-Number(a.level||0)||String(a.slot||'').localeCompare(String(b.slot||''),'fr');});
    $('dataTableMeta').textContent=`${rows.length} mod(s) affiché(s) sur ${mods.length}`;
    renderModSummary(rows);
    $('dataTable').innerHTML=rows.length?`<table><thead><tr><th>Slot</th><th>Mod</th><th>Set</th><th>Primaire</th><th>Secondaires</th><th>Niv.</th><th>Équipé</th></tr></thead><tbody>${rows.map(m=>`<tr><td><strong>${esc(m.slot||'—')}</strong></td><td><div class="inventory-mod-icon">${modIconHtml(m,'52')}</div></td><td>${esc(m.set_name||'—')}</td><td><strong>${esc(m.primary_stat||'—')}</strong> ${num(m.primary_value,1)}${String(m.primary_stat||'').endsWith(' %')?'%':''}</td><td>${esc(modSecondaries(m)||'—')}</td><td>${num(m.level)}</td><td>${esc(m.character||'Libre')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Aucun mod ne correspond aux filtres.</div>';
  }
}

$('loadPlayer').addEventListener('click',loadRemotePlayer);$('allyCode').addEventListener('keydown',e=>{if(e.key==='Enter')loadRemotePlayer();});$('saveRelay').addEventListener('click',saveWorkerUrl);$('relayUrl').value=localStorage.getItem('swgohRelayUrl')||'';$('relayState').textContent=workerUrl()?'RELAIS CONFIGURÉ':'RELAIS NON CONFIGURÉ';$('character').addEventListener('change',()=>{updateCharacterInfo();ensureSelectedKyberProfile();});
['optimizerPrimaryArrow','optimizerPrimaryTriangle','optimizerPrimaryCircle','optimizerPrimaryCross'].forEach(id=>$(id)?.addEventListener('change',()=>{}));$('dataSearch').addEventListener('input',renderDataTable);['dataFactionFilter','dataSideFilter','modSetFilter','modSlotFilter','modOwnerFilter','modLevelFilter'].forEach(id=>$(id)?.addEventListener('input',renderDataTable));
document.querySelectorAll('.data-tab').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.data-tab').forEach(x=>x.classList.remove('active'));btn.classList.add('active');currentDataset=btn.dataset.dataset;const mf=$('modFilters'),ms=$('modSummary');if(mf)mf.hidden=currentDataset!=='mods';if(ms)ms.hidden=currentDataset!=='mods';renderDataCharacterFilters();renderDataTable();}));


function getOptimizerWorker() {
  if (optimizerWorker) return optimizerWorker;
  optimizerWorker = new Worker('./optimizer-worker.mjs?v=3.0.0', { type: 'module' });
  optimizerWorker.addEventListener('error', (event) => {
    log('Erreur du Worker Python : ' + (event.message || 'erreur inconnue'));
  });
  return optimizerWorker;
}

function runOptimizationInWorker(character, profile, nBuilds, limitSlot, context, scopedMods) {
  const worker = getOptimizerWorker();
  const id = ++optimizerRequestId;
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const onMessage = (event) => {
      const data = event.data || {};
      if (data.id !== id) return;
      if (data.type === 'status') {
        $('results').innerHTML = `<div class="calculating">${esc(data.message || 'Calcul en cours…')}<br><small>Temps écoulé : ${Math.round((performance.now()-started)/1000)} s</small></div>`;
        return;
      }
      worker.removeEventListener('message', onMessage);
      if (data.type === 'done') {
        resolve(JSON.parse(data.result));
      } else {
        reject(new Error(data.error || 'Erreur inconnue du Worker Python.'));
      }
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage({ id, mods: scopedMods, profile, base_stats: baseStatsForCharacter(character), n_builds: nBuilds, limit_slot: limitSlot, character_name: character.name || character.baseId || '', character_base_id: character.baseId || character.base_id || '', context });
  });
}


/* ========================= V18 — ANALYSE MODS / INVENTAIRE / FACTIONS ========================= */

const V176_FACTION_RULES = {
  "Jedi":["JEDI","YODA","KITFISTO","PLOKOON","AAYLASECURA","BARRISSOFFEE","MACEWINDU","QUIGON","KELLERAN","JARJARBINKS","KENOBI"],
  "Sith":["SITH","DARTH","PALPATINE","SIDIOUS","VADER","MAUL","TALON","TRAYA","NIHILUS","SION","SAKURA","KYLOREN"],
  "Empire":["VADER","PALPATINE","EMPEROR","TARKIN","THRAWN","PIETT","VEERS","STARCK","GIDEON","SHORETROOPER","DEATHTROOPER","STORMTROOPER","ROYALGUARD","DARKTROOPER","EMPIRE"],
  "Imperial Trooper":["VEERS","PIETT","STARCK","GIDEON","RANGETROOPER","DEATHTROOPER","SNOWTROOPER","SHORETROOPER","MAGMATROOPER","DARKTROOPER","MORTAR","SCOUTTROOPER"],
  "Clone Trooper":["CLONE","REX","CODY","FIVES","ECHO","WOLFFE","ARC","SHAAKTI","BATCHER"],
  "501st":["501ST","REX","FIVES","ARC","ECHO","GENERALSKYWALKER"],
  "Bad Batch":["BADBATCH","BATCHERS","OMEGA","TECH","WRECKER","CROSSHAIR"],
  "Galactic Republic":["PADME","JEDIMASTERKENOBI","GENERALKENOBI","ANAKIN","AHSOKA","CLONE","REX","CODY","MACEWINDU","PLOKOON","KITFISTO","REPUBLIC"],
  "Separatist":["SEPARATIST","DOOKU","GRIEVOUS","ASAJJ","NUTEGUNRAY","WAT","GEONOSIAN","B2SUPERBATTLE","B1BATTLE","DROIDEKA","MAGNAGUARD","SEPARATIST"],
  "Geonosian":["GEONOSIAN","BROODALPHA","SUNFAC","POGGLE","GEONOSIANSPY","GEO"],
  "Rebel":["REBEL","LUKE","LEIA","HAN","CHEWBACCA","ACKBAR","LANDO","WEDGE","BIGGS","HERA","EZRA","KANAN","SABINE","CHOPPER","ZEB","SAWGERRERA","JYNERSO","CASSIANANDOR","K2SO","RADDUS","MONMOTHMA"],
  "Rebel Fighter":["MONMOTHMA","SAWGERRERA","CASSIANANDOR","JYNERSO","CARADUNE","KYLEKATARN","BISTAN","PAO","HOTHREBELSOLDIER","BIGGSDARKLIGHTER"],
  "Rogue One":["JYNERSO","CASSIANANDOR","K2SO","RADDUS","BISTAN","CHIRRUTIMWE","BAZEMALBUS","PAO"],
  "Resistance":["RESISTANCE","REY","FINN","POE","BB8","ROSE","HOLDO","AMILYNHOLDO","ZORII"],
  "First Order":["FIRSTORDER","KYLO","HUX","PHASMA","SITHTROOPER","FOEXECUTIONER","FOSITHTROOPER","FOE","FOSTORM"],
  "Mandalorian":["MANDALOR","MANDO","BOKATAN","ARMORER","SABINE","GARSAAXON","PREVIZSLA","MAULS7","JANGO"],
  "Bounty Hunter":["BOBA","BOSSK","DENGAR","IG88","CADBANE","AURRA","FENNEC","JANGO","EMBO","ZAM","GREEDO","GREEF","MANDO","BOUNTY"],
  "Scoundrel":["SCOUT","SMUGGLER","HONDO","QIRA","ENFYS","ZALBAR","MISSION","SMUGGLERHAN","L3","VANDOR","SOLO","CHEWBACCA"],
  "Hutt Cartel":["HUTT","JABBA","BOUNTY","BOBA","CADBANE","GREEDO","KRRSANTAN","EMBO"],
  "Droid":["DROID","R2D2","C3PO","BB8","K2SO","T3M4","HK47","IG88","DROIDEKA","B1BATTLE","B2SUPERBATTLE","L3"],
  "Ewok":["EWOK","WICKET","PAPLOO","LOGRAY","ELDER","CHIEFCHIRPA","SCOUT"],
  "Nightsister":["NIGHTSISTER","ASAJJ","TALZIN","DAKA","ZOMBIE","NIGHTSISTERACOLYTE","NIGHTSISTERSPIRIT"],
  "Tusken":["TUSKEN","URRURRURR","CHIEFNEBIT","TUSKENRAIDER","TUSKENSHAMAN"],
  "Phoenix":["PHOENIX","HERA","EZRA","KANAN","SABINE","ZEB","CHOPPER","GARAZEB"],
  "Old Republic":["REVAN","BASTILA","JOLEE","JUHANI","CANDEROUS","T3M4","MISSIONVAO"],
  "Sith Empire":["DARKREVAN","DARTHREVAN","BASTILASHANDARK","SITHTROOPER","SITHMARAUDER","HK47","MALAK"],
  "Inquisitorius":["INQUISITOR","FIFTHBROTHER","SEVENTHSISTER","EIGHTHBROTHER","NINTHSISTER","THIRDBROTHER","MARROK"]
};

function compactKey(v){ return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
function characterKey(c){ return compactKey(c?.baseId??c?.base_id??c?.name??c?.character??''); }
function modOwnerKey(m){
  if(!m)return '';
  const candidates=[m.ownerKey,m.character,m.characterName,m.equippedTo,m.equipped_to,m.baseId,m.base_id,m.characterId,m.character_id];
  for(const value of candidates){
    if(value==null)continue;
    if(typeof value==='object'){
      const k=compactKey(value.baseId??value.base_id??value.characterId??value.character_id??value.name??value.id??'');
      if(k)return k;
    }else{
      const k=compactKey(value);
      if(k && k!=='OBJECTOBJECT')return k;
    }
  }
  return '';
}
function getCharacterMods(c){
  if(!c) return [];
  const targets=new Set([characterKey(c),compactKey(c.name),compactKey(c.baseId),compactKey(c.base_id),compactKey(c.characterId),compactKey(c.character_id)].filter(Boolean));
  return mods.map((raw,i)=>({...normalizeModForDisplay(raw),_index:i})).filter(m=>{
    const owner=modOwnerKey(m);
    return owner && [...targets].some(t=>owner===t || owner.includes(t) || t.includes(owner));
  }).sort((a,b)=>({Square:0,Arrow:1,Diamond:2,Triangle:3,Circle:4,Cross:5}[a.slot]??99)-({Square:0,Arrow:1,Diamond:2,Triangle:3,Circle:4,Cross:5}[b.slot]??99));
}
function modSpeedMetrics(m){
  const primary=compactKey(m.primary_stat)==='SPEED';
  let secondary=null;
  for(let i=1;i<=4;i++){
    if(compactKey(m[`secondary_${i}_stat`])==='SPEED'){ secondary=Number(m[`secondary_${i}_value`]); break; }
  }
  return {secondary:Number.isFinite(secondary)?secondary:null,primary};
}
function modPrimarySpeed(m){ return modSpeedMetrics(m).primary ? Number(m.primary_value||0) : 0; }
function modTotalSpeed(m){ const x=modSpeedMetrics(m); return (x.secondary||0)+modPrimarySpeed(m); }
function speedCategory(v){
  const n=Number(v||0);
  if(n<=0)return 'no_speed';
  if(n<=10)return '1_10';
  if(n<=15)return '11_15';
  if(n<=21)return '16_21';
  return '22plus';
}
function speedCategoryLabel(k){ return ({'1_10':'1 – 10','11_15':'11 – 15','16_21':'16 – 21','22plus':'> 21','no_speed':'Sans Speed','primary_speed':'Primaire Speed'})[k]||k; }
function v176ModStatus(modsForCharacter){
  const list=Array.isArray(modsForCharacter)?modsForCharacter:[];
  const count=Math.min(6,list.length);
  const totalSpeed=list.reduce((s,m)=>s+modTotalSpeed(m),0);
  if(count===0)return {status:'SANS MODS',class:'critical',totalSpeed};
  if(count<6)return {status:'INCOMPLETS',class:'incomplete',totalSpeed};
  if(totalSpeed<30)return {status:'TRÈS FAIBLES',class:'verylow',totalSpeed};
  if(totalSpeed<50)return {status:'FAIBLES',class:'low',totalSpeed};
  if(totalSpeed<70)return {status:'MOYENS',class:'medium',totalSpeed};
  return {status:'BONS',class:'good',totalSpeed};
}
function factionsForCharacter(c){
  const out=[];
  const raw=c?.raw||c?.data||{};
  const candidates=[];
  const add=(v)=>{if(v==null)return;if(Array.isArray(v))v.forEach(add);else if(typeof v==='object'){['name','displayName','nameKey','id','categoryId','faction'].forEach(k=>add(v[k]));}else candidates.push(String(v));};
  ['factions','faction','categories','category','categoryIdList','categoryIds'].forEach(k=>add(raw?.[k]));
  const rawText=compactKey(candidates.join(' '));
  const key=compactKey(`${c?.baseId||''} ${c?.name||''} ${c?.character||''} ${candidates.join(' ')}`);
  for(const [faction,needles] of Object.entries(V176_FACTION_RULES)){
    const fk=compactKey(faction);
    if(candidates.some(v=>compactKey(v)===fk || compactKey(v).includes(fk) || fk.includes(compactKey(v))) ||
       needles.some(n=>key.includes(compactKey(n))) || (rawText && rawText.includes(fk))) out.push(faction);
  }
  return [...new Set(out)];
}
function buildFactionMap(){
  factionMap={};
  for(const c of rosterCharacters){
    if(rosterUnitType(c)==='ship')continue;
    factionMap[characterKey(c)] = factionsForCharacter(c);
  }
  return factionMap;
}
function charactersInFaction(faction){
  if(!faction || faction==='Toutes les factions') return [...rosterCharacters];
  return rosterCharacters.filter(c=>(factionMap[characterKey(c)]||[]).includes(faction));
}
function allFactions(){
  const set=new Set();
  for(const c of rosterCharacters) for(const f of (factionMap[characterKey(c)]||[])) set.add(f);
  return [...set].sort((a,b)=>a.localeCompare(b,'fr'));
}
function speedBreakdown(list=mods){
  const out={'1_10':0,'11_15':0,'16_21':0,'22plus':0,'no_speed':0,'primary_speed':0,total:0};
  for(const raw of list){
    const m=normalizeModForDisplay(raw); out.total++;
    const x=modSpeedMetrics(m);
    if(x.primary) out.primary_speed++;
    else out[speedCategory(x.secondary)]++;
  }
  return out;
}
function inventoryRows(){
  return mods.map((raw,i)=>{
    const m=normalizeModForDisplay(raw);
    const x=modSpeedMetrics(m);
    return {...m,_index:i,_speed:x.secondary||0,_primarySpeed:x.primary,_totalSpeed:modTotalSpeed(m),_speedCategory:x.primary?'primary_speed':speedCategory(x.secondary)};
  });
}
function renderV18SpeedRecap(containerId='v18SpeedRecap'){
  const box=$(containerId); if(!box)return;
  const b=speedBreakdown(mods);
  const cards=[
    ['1_10','1 – 10','secondary'],['11_15','11 – 15','secondary'],['16_21','16 – 21','secondary'],['22plus','> 21','secondary'],
    ['primary_speed','Primaire Speed','primary'],['no_speed','Sans Speed','secondary']
  ];
  box.innerHTML=cards.map(([k,label])=>`<button class="speed-recap-card speed-${k}" data-speed-category="${k}"><span>${label}</span><strong>${num(b[k])}</strong><small>${b.total?((b[k]/b.total)*100).toFixed(1):'0.0'} %</small></button>`).join('');
  box.querySelectorAll('[data-speed-category]').forEach(el=>el.addEventListener('click',()=>{
    const k=el.dataset.speedCategory;
    showPage('mods-analysis');
    setTimeout(()=>{setAnalysisTab('inventory'); $('analysisSpeedFilter').value=k; renderInventory();},0);
  }));
}
function holocronModScore(m){
  // Score de comparaison indicatif : vitesse prioritaire, puis valeur des secondaires.
  // Les valeurs sont normalisées pour éviter de comparer directement des unités différentes.
  const weights={SPEED:1,OFFENSE:0.32,OFFENSEPERCENT:0.42,HEALTH:0.12,HEALTHPERCENT:0.22,PROTECTION:0.10,PROTECTIONPERCENT:0.18,POTENCY:0.24,TENACITY:0.20,CRITICALCHANCE:0.20,CRITICALDAMAGE:0.22,CRITICALAVOIDANCE:0.18};
  let score=modTotalSpeed(m)*1.8;
  for(let i=1;i<=4;i++){
    const key=compactKey(m[`secondary_${i}_stat`]); const val=Number(m[`secondary_${i}_value`]||0);
    if(!key||!Number.isFinite(val))continue;
    let v=val;
    if(key.endsWith('PERCENT')||['POTENCY','TENACITY','CRITICALCHANCE','CRITICALDAMAGE','CRITICALAVOIDANCE'].includes(key))v*=100;
    score+=v*(weights[key]||0.08);
  }
  const level=Number(m.level||0); score+=Math.max(0,level-12)*0.25;
  return score;
}
function holocronKyberFit(mod, character){
  // Ajuste indicatif selon les préférences Kyber du personnage (sets, primaires et secondaires).
  // Il ne représente pas une simulation de combat ni des stats adverses observées.
  const p=profileForCharacter(character); if(!p)return 0;
  const set=String(mod?.set_name||'').trim().toLowerCase();
  const primary=String(mod?.primary_stat||'').trim().toLowerCase();
  const slot=String(mod?.slot||'');
  let fit=0;
  const sets=Array.isArray(p.sets)?p.sets:[];
  const sw=sets.find(x=>String(x.name||'').toLowerCase()===set);
  if(sw)fit+=Math.min(5,Number(sw.weight||0)*5);
  const slotData=p.slots?.[slot];
  const primaries=slotData?.primaries||{};
  const pw=Object.entries(primaries).find(([k])=>String(k).toLowerCase()===primary)?.[1];
  if(Number.isFinite(Number(pw)))fit+=Math.min(4,Number(pw)*4);
  const focus=p.secondary_focus||{};
  for(let i=1;i<=4;i++){
    const stat=String(mod?.[`secondary_${i}_stat`]||'').toLowerCase();
    if(!stat)continue;
    const entry=Object.entries(focus).find(([k])=>k.toLowerCase().replace(/[^a-z%]/g,'')===stat.replace(/[^a-z%]/g,''));
    if(entry)fit+=Math.min(1.5,Math.max(0,Number(entry[1]||0)/20));
  }
  return fit;
}
function holocronModScoreForCharacter(mod, character){return holocronModScore(mod)+holocronKyberFit(mod,character);}
// Priorités GAC : la dernière saison comportant des données est la référence.
// Le jeu de données est volontairement séparé du profil joueur (gac-usage.js).
const HOLOCRON_GALACTIC_LEGENDS = new Set([
  'GRANDMASTERYODA','JEDIMASTERKENOBI','JEDIMASTERLUKE','SITHPALPATINE',
  'JABBA','JABBATHEHUTT','LORDVADER','EXECUTOR','SUPREMELEADERKYLOREN',
  'REY','STARKILLER','LEIAORGANA','GLLEIA','GLAHSOKA','AHSOKATANOGL',
  'JEDIKNIGHTLUKE','JML','SLKR','SEE','JMK','LV','JABBA'
]);
