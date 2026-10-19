function holocronIsGalacticLegend(c){
  const key=characterKey(c);
  return c?.isGalacticLegend===true || c?.is_galactic_legend===true || HOLOCRON_GALACTIC_LEGENDS.has(key);
}
function holocronLatestGacSeason(){
  const seasons=window.__SWGOH_GAC_USAGE__?.seasons;
  if(!Array.isArray(seasons))return null;
  return seasons.filter(s=>s && s.season!=null && s.characters && Object.keys(s.characters).length)
    .sort((a,b)=>Number(b.season)-Number(a.season))[0]||null;
}
function holocronGacUsage(c, season=holocronLatestGacSeason()){
  if(!season)return null;
  const key=characterKey(c); const record=season.characters?.[key];
  if(!record)return 0;
  return Math.max(0,Number(record.uses ?? record.usage ?? 0)||0);
}
function holocronTopChangeCandidates(){
  const donors=[],recipients=[];
  const gacSeason=holocronLatestGacSeason();
  for(const c of rosterCharacters){
    if(rosterUnitType(c)==='ship')continue;
    const cm=getCharacterMods(c); const st=v176ModStatus(cm);
    if(!holocronIsGalacticLegend(c) && ['INCOMPLETS','TRÈS FAIBLES','FAIBLES'].includes(st.status) && cm.length) donors.push({c,mods:cm,status:st.status,totalSpeed:st.totalSpeed});
    if((holocronIsGalacticLegend(c) || ['MOYENS','BONS'].includes(st.status)) && cm.length===6) recipients.push({c,mods:cm,status:st.status,totalSpeed:st.totalSpeed,isGL:holocronIsGalacticLegend(c),gacUses:holocronGacUsage(c,gacSeason)});
  }
  const donorPriority={'INCOMPLETS':3,'TRÈS FAIBLES':2,'FAIBLES':1},recipientPriority={'BONS':2,'MOYENS':1},out=[];
  for(const r of recipients)for(const currentMod of r.mods){
    const before=holocronModScoreForCharacter(currentMod,r.c),kyberBefore=holocronKyberFit(currentMod,r.c);
    for(const d of donors){
      if(characterKey(d.c)===characterKey(r.c))continue;
      for(const donorMod of d.mods){
        if(donorMod.slot!==currentMod.slot||compactKey(donorMod.set_name)!==compactKey(currentMod.set_name)||compactKey(donorMod.primary_stat)!==compactKey(currentMod.primary_stat))continue;
        const oldSpeed=num(modTotalSpeed(currentMod),0),newSpeed=num(modTotalSpeed(donorMod),0);
        // Règle absolue : une proposition ne peut jamais faire baisser la vitesse totale de la cible.
        if(newSpeed<oldSpeed)continue;
        const after=holocronModScoreForCharacter(donorMod,r.c),gain=after-before,kyberGain=holocronKyberFit(donorMod,r.c)-kyberBefore;
        const gainPct=(gain/Math.max(Math.abs(before),1))*100;
        if(gainPct<1&&kyberGain<1)continue;
        // Le donneur récupère le mod actuel de la cible : comparer les variations relatives des deux côtés.
        const donorBefore=holocronModScoreForCharacter(donorMod,d.c),donorAfter=holocronModScoreForCharacter(currentMod,d.c),donorGain=donorAfter-donorBefore;
        const donorGainPct=(donorGain/Math.max(Math.abs(donorBefore),1))*100;
        const netGain=gain+donorGain,netGainPct=gainPct+donorGainPct;
        if(netGainPct<0.5)continue;
        const recipientProfile=profileForCharacter(r.c),donorProfile=profileForCharacter(d.c),hasReference=!!recipientProfile,hasGac=!!gacSeason&&r.gacUses!==null;
        let confidence=55+(hasReference?15:0)+(donorProfile?8:0)+(hasGac?10:0);
        if(r.mods.length===6&&d.mods.length>0)confidence+=5;
        confidence=Math.max(35,Math.min(93,confidence));
        const confidenceLabel=confidence>=80?'ÉLEVÉE':confidence>=65?'CORRECTE':'INDICATIVE';
        const gacPriority=hasGac?Math.log1p(Math.max(0,r.gacUses))*2:0;
        const priority=netGainPct*10+Math.max(0,gainPct)*2.5+Math.max(0,kyberGain)*4+(r.isGL?24:0)+(recipientPriority[r.status]||0)*3+(donorPriority[d.status]||0)*1.5+gacPriority;
        out.push({donor:d.c,recipient:r.c,oldMod:currentMod,newMod:donorMod,gain,donorGain,donorLoss:Math.max(0,-donorGain),netGain,netGainPct,gainPct,donorGainPct,oldSpeed,newSpeed,speedGain:newSpeed-oldSpeed,kyberGain,status:d.status,priority,recipientStatus:r.status,isGL:r.isGL,gacUses:r.gacUses,gacSeason:gacSeason?.season??null,confidence,confidenceLabel,hasReference,hasGac,recipientBefore:before,recipientAfter:after,donorBefore,donorAfter});
      }
    }
  }
  out.sort((a,b)=>b.priority-a.priority||b.netGainPct-a.netGainPct||b.gainPct-a.gainPct||b.kyberGain-a.kyberGain);
  const seenSlots=new Set(),seenDonorMods=new Set();
  return out.filter(x=>{
    const slotKey=[characterKey(x.recipient),x.oldMod.slot].join('|'),donorModKey=String(x.newMod?._index??x.newMod.id??(characterKey(x.donor)+'|'+x.newMod.slot));
    if(seenSlots.has(slotKey)||seenDonorMods.has(donorModKey))return false;
    seenSlots.add(slotKey);seenDonorMods.add(donorModKey);return true;
  }).slice(0,10);
}
function topChangeStatDelta(fromMod,toMod){
 const stats=new Map();
 for(const m of [fromMod,toMod]) for(let i=1;i<=4;i++){
  const name=String(m?.[`secondary_${i}_stat`]||'').trim();
  if(!name)continue;
  const key=name.toLowerCase();
  if(!stats.has(key))stats.set(key,{name,from:0,to:0});
  stats.get(key)[m===fromMod?'from':'to']+=Number(m[`secondary_${i}_value`]||0);
 }
 return [...stats.values()].map(x=>({...x,delta:x.to-x.from})).filter(x=>Math.abs(x.delta)>0.00001).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
}
function topChangeStatValue(value,name){
 const percent=/%|potency|tenacity|critical|chance|avoidance/i.test(name);
 return `${num(value,percent?2:1)}${percent&&!String(name).includes('%')?' pt':''}${String(name).includes('%')?'%':''}`;
}
function essentialPortraitCandidates(character){
 const name=String(character?.name||'').trim().toLowerCase();
 const base=String(character?.baseId||character?.base_id||'').trim().toLowerCase();
 const slug=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'');
 const candidates=[];
 const add=(id)=>{if(id&&!candidates.includes(id))candidates.push(id);};

 // SWGOH.GG / game-assets.swgoh.gg texture keys.
 // Exact keys are used first; generic aliases remain as fallback.
 const exact={
   'jedi knight luke skywalker':['luke_jediknight'],
   'grand master yoda':['yodagrandmaster'],
   'jedi knight anakin':['anakinknight'],
   'sith eternal emperor':['espalpatine_post'],
   'sith eternal emperor (restored)':['espalpatine_post'],
   'rey (scavenger)':['reyjakku'],
   'rey scavenger':['reyjakku'],
   'starkiller':['starkiller'],
   'poe dameron':['poe'],
   'resistance trooper':['resistancetrooper'],
   'tusken warrior':['tuskenwarrior']
 };
 for(const [label,ids] of Object.entries(exact)){
   if(name===label || name.includes(label)) ids.forEach(add);
 }

 // Common SWGOH.GG convention: the texture key often differs from the
 // display-name slug, so keep both the baseId and normalized name as fallbacks.
 add(base);
 add(slug);

 const gameUrls=candidates.map(id=>`https://game-assets.swgoh.gg/textures/tex.charui_${id}.png`);
 const mirrorName=String(character?.name||character?.baseId||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,'_');
 const mirror=mirrorName?`https://raw.githubusercontent.com/tools4swgoh/swgoh-icons/main/65px-Unit-Character-${encodeURIComponent(mirrorName)}-portrait.png`:'';
 const legacyName=mirrorName.replace(/[^A-Za-z0-9_-]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2,'0')}`);
 const legacyMirror=mirrorName?`https://raw.githubusercontent.com/tools4swgoh/swgoh-icons/main/65px-Unit-Character-${encodeURIComponent(legacyName)}-portrait.png`:'';
 return [...gameUrls,...(mirror?[mirror]:[]),...(legacyMirror?[legacyMirror]:[])];
}

function essentialPortraitHtml(character){
 const urls=essentialPortraitCandidates(character);
 if(!urls.length)return `<div class="topchange-portrait topchange-portrait-fallback"><span>${esc(String(character?.name||character?.baseId||'?').slice(0,1))}</span></div>`;
 const encoded=urls.map(u=>u.replace(/'/g,"\\'"));
 const first=encoded[0];
 const rest=JSON.stringify(encoded.slice(1)).replace(/"/g,'&quot;');
 return `<div class="topchange-portrait" data-essential-portrait-list="${rest}"><img src="${first}" alt="${esc(character?.name||'')}" loading="lazy" data-essential-portrait-index="0"></div>`;
}
function renderHolocronVerdict(rowsOverride){
 const title=$('holocronVerdictTitle'), action=$('holocronVerdictAction'), state=$('holocronVerdictState');
 const count=$('holocronVerdictCount'), urgent=$('holocronUrgentCount'), opp=$('holocronOpportunityCount');
 if(!title||!action||!state||!count||!urgent||!opp)return;
 const rows=Array.isArray(rowsOverride)?rowsOverride:(Array.isArray(rosterCharacters)&&rosterCharacters.length?holocronTopChangeCandidates():[]);
 if(!rows.length){
   state.textContent=Array.isArray(rosterCharacters)&&rosterCharacters.length?'SCAN COMPLET':'EN ATTENTE';
   title.textContent=Array.isArray(rosterCharacters)&&rosterCharacters.length?'Aucune modification prioritaire détectée.':'Le Holocron attend le scan du roster.';
   action.textContent=Array.isArray(rosterCharacters)&&rosterCharacters.length?'Les données sont chargées ; aucun transfert ne franchit actuellement le seuil de décision.':'Charge le profil pour faire émerger les décisions.';
   count.textContent='0'; urgent.textContent='0'; opp.textContent='0';
   return;
 }
 const urgentCount=Math.min(3,rows.filter(r=>r.isGL || r.netGainPct>=10 || r.kyberGain>=2).length);
 const opportunityCount=Math.max(0,Math.min(9,rows.length-urgentCount));
 state.textContent='VERDICT ACTIF';
 title.textContent=`${rows.length} modification${rows.length>1?'s':''} détectée${rows.length>1?'s':''}.`;
 const lead=rows[0];
 const recipient=String(lead?.recipient?.name||lead?.recipient?.baseId||'personnage cible');
 const donor=String(lead?.donor?.name||lead?.donor?.baseId||'donneur');
 const netGainPct=Number(lead?.netGainPct||0);
 action.textContent=`Priorité : ${recipient} ↔ ${donor}${netGainPct>0?` · bilan relatif estimé +${num(netGainPct,1)} %`:''}.`;
 count.textContent=String(rows.length);
 urgent.textContent=String(urgentCount);
 opp.textContent=String(opportunityCount);
}
function bindEssentialPortraits(){
 document.querySelectorAll('.topchange-portrait[data-essential-portrait-list] img').forEach(img=>{
   if(img.dataset.bound==='1')return;
   img.dataset.bound='1';
   img.addEventListener('error',()=>{
     const holder=img.closest('.topchange-portrait');
     if(!holder)return;
     let list=[];
     try{list=JSON.parse(holder.dataset.essentialPortraitList||'[]');}catch(_){}
     const next=Number(img.dataset.essentialPortraitIndex||0)+1;
     if(next<list.length){
       img.dataset.essentialPortraitIndex=String(next);
       img.src=list[next];
       return;
     }
     img.remove();
     holder.classList.add('topchange-portrait-fallback');
     holder.innerHTML='<span>✦</span>';
   },{once:false});
 });
}

function renderHolocronTopChanges(){
 const box=$('holocronTopChanges');if(!box)return;
 if(!Array.isArray(rosterCharacters)||!rosterCharacters.length){box.className='topchanges-empty';box.innerHTML='<strong>Profil requis</strong><span>Charge ton profil SWGOH pour analyser les mods réels.</span>';return;}
 const rows=holocronTopChangeCandidates();
 if(!rows.length){box.className='topchanges-empty';box.innerHTML='<strong>Aucun échange positif suffisamment pertinent</strong><span>Le moteur n’a trouvé aucun échange réciproque dont le bilan estimé soit positif, avec les contraintes de slot, set et primaire actuelles.</span>';return;}
 box.className='topchanges-results essential-results-grid';
 const gacSeason=holocronLatestGacSeason();
 const note=gacSeason?'Saison GAC '+esc(gacSeason.season)+' · usages de référence intégrés · bilan net des deux personnages.':'Bilan net des deux personnages · données GAC de référence indisponibles, aucun usage GAC n’est supposé.';
 const topTen=rows.slice(0,10);renderHolocronVerdict(topTen);
 box.innerHTML='<div class="essential-inline-note">'+note+' <span>Indice Holocron = comparaison de mods, pas une simulation de combat.</span> · '+topTen.length+' RECOMMANDATION(S) MAXIMUM</div>'+topTen.map((r,i)=>{
   const delta=topChangeStatDelta(r.oldMod,r.newMod),shownDelta=delta.filter(x=>Math.abs(x.delta)>0.00001).slice(0,4);
   const stats=shownDelta.length?shownDelta.map(x=>'<span class="topchange-stat '+(x.delta>=0?'impact-positive':'impact-negative')+'"><b>'+esc(x.name)+'</b><strong>'+(x.delta>0?'+':'')+topChangeStatValue(x.delta,x.name)+'</strong></span>').join(''):'<span class="topchange-no-stats">Aucun écart secondaire détecté</span>';
   const portraitHtml=essentialPortraitHtml(r.recipient),recipient=esc(r.recipient.name||r.recipient.baseId),donor=esc(r.donor.name||r.donor.baseId);
   const oldSpeed=num(modTotalSpeed(r.oldMod),1),newSpeed=num(modTotalSpeed(r.newMod),1),sign=v=>v>0?'+':'',usage=r.hasGac?' · '+num(r.gacUses)+' usages GAC':'';
   return '<article class="topchange-result"><div class="topchange-rank">'+String(i+1).padStart(2,'0')+'</div>'+portraitHtml+
   '<div class="topchange-main"><header class="topchange-heading"><div><span class="topchange-kicker">'+(r.isGL?'CIBLE GL PRIORITAIRE':'ÉCHANGE À BILAN POSITIF')+'</span><strong>'+recipient+'</strong></div><small>'+esc(r.oldMod.slot||'—')+' · Donneur <b>'+donor+'</b>'+usage+'</small></header>'+
   '<div class="topchange-mods"><span><b>MOD ACTUEL</b><div class="topchange-mod-visual">'+modIconHtml(r.oldMod,'42')+'</div><strong>'+esc(r.oldMod.set_name||'—')+'</strong><small>'+esc(r.oldMod.primary_stat||'—')+' · '+oldSpeed+' vit.</small></span><span class="is-received"><b>MOD REÇU</b><div class="topchange-mod-visual">'+modIconHtml(r.newMod,'42')+'</div><strong>'+esc(r.newMod.set_name||'—')+'</strong><small>'+esc(r.newMod.primary_stat||'—')+' · '+newSpeed+' vit.</small></span></div>'+
   '<section class="topchange-stat-panel"><div class="topchange-stat-title"><strong>ÉCART DES SECONDAIRES</strong><span>mod actuel → mod reçu</span></div><div class="topchange-stat-grid">'+stats+'</div></section>'+
   '<section class="topchange-impact-grid" aria-label="Gains de secondaires et bilan de l’échange"><div class="topchange-secondary-gains"><span>GAINS SECONDAIRES</span>'+(delta.filter(x=>x.delta>0.00001).sort((a,b)=>b.delta-a.delta).slice(0,3).map(x=>'<strong class="impact-positive">'+esc(x.name)+' +'+topChangeStatValue(x.delta,x.name)+'</strong>').join('')||'<small>Aucun secondaire en hausse</small>')+'<small>écarts positifs du mod reçu</small></div><div><span>IMPACT DONNEUR</span><strong class="'+(r.donorGainPct>=0?'impact-positive':'impact-negative')+'">'+sign(r.donorGainPct)+num(r.donorGainPct,1)+' %</strong><small>'+(r.donorGainPct<0?'perte relative donneur':r.donorGainPct>0?'gain relatif donneur':'neutre')+'</small></div><div><span>BILAN NET</span><strong class="impact-net">'+sign(r.netGainPct)+num(r.netGainPct,1)+' %</strong><small>cumul des variations relatives</small></div><div><span>FIABILITÉ</span><strong class="impact-confidence">'+r.confidenceLabel+'</strong><small>'+(r.hasReference?'référence Kyber disponible':'référence Kyber partielle')+(r.hasGac?' · GAC inclus':'')+'</small></div></section></div>'+
   '<aside class="topchange-action"><span>ÉCHANGE RÉCIPROQUE</span><strong>'+donor+' ↔ '+recipient+'</strong><small>Vitesse cible : '+oldSpeed+' → '+newSpeed+' (+'+num(newSpeed-oldSpeed,1)+'). Le donneur reçoit le mod actuel de la cible.</small><i>↗</i></aside></article>';
 }).join('');
 bindEssentialPortraits();
}


/* SITH’ARI — équipe Kyber. Ne lit que les données déjà chargées par le moteur existant. */
