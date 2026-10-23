/* Selimna's Holocron V100.3
   VISUAL ADAPTER ONLY.
   The V90 technical/data engine is intentionally untouched. */
(function(){
  'use strict';

  const DEFAULT_RELAY='https://swgoh-optimizer-relay.lorg75017.workers.dev';
  function el(id){ return document.getElementById(id); }
  function text(id,v){ const n=el(id); if(n) n.textContent=String(v ?? ''); }
  function nfmt(v){ return Number(v||0).toLocaleString('fr-FR'); }

  function isSpeedStat(stat){
    const value=String(stat||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return value.includes('speed') || value.includes('vitesse');
  }

  function primarySpeedOf(mod){
    return isSpeedStat(mod?.primary_stat ?? mod?.primaryStat ?? mod?.primary);
  }

  function speedOf(mod){
    if(!mod) return 0;
    const vals=[];
    for(let i=1;i<=4;i++){
      const stat=mod['secondary_'+i+'_stat'];
      const value=Number(mod['secondary_'+i+'_value']||0);
      if(isSpeedStat(stat) && Number.isFinite(value)) vals.push(value);
    }
    return vals.reduce((a,b)=>a+b,0);
  }

  function relicOf(c){
    if(!c) return 0;
    const raw=c.relic_tier ?? c.relicTier ?? c.relic_level ?? c.relicLevel ?? c.raw?.relic_tier ?? c.raw?.relicTier ?? 0;
    const n=Number(raw);
    if(!Number.isFinite(n) || n<=2) return 0;
    return Math.max(0,Math.min(10,Math.floor(n)-2));
  }
  function gearOf(c){ return Number(c?.gear ?? c?.gear_level ?? c?.gearLevel ?? c?.raw?.gear_level ?? c?.raw?.gearLevel ?? 0) || 0; }

  function renderBars(containerId, rows){
    const root=el(containerId); if(!root) return;
    const total=rows.reduce((a,r)=>a+Math.max(0,Number(r.value)||0),0);
    root.innerHTML=rows.map((r,i)=>{
      const value=Math.max(0,Number(r.value)||0);
      const pct=total ? (value/total*100) : 0;
      return `<span class="decision-segment seg-${i}" style="width:${pct.toFixed(2)}%" title="${r.label} : ${nfmt(value)}" aria-label="${r.label} : ${nfmt(value)}"></span>`;
    }).join('');
    root.setAttribute('aria-label',rows.map(r=>`${r.label} ${nfmt(r.value)}`).join(', '));
  }

  function renderLegend(id, rows){
    const root=el(id); if(!root) return;
    root.innerHTML=rows.map(r=>`<span><i></i><b>${r.label}</b><strong>${nfmt(r.value)}</strong></span>`).join('');
  }

  function renderDecision(){
    const chars=(typeof rosterCharacters!=='undefined' && Array.isArray(rosterCharacters))?rosterCharacters:[];
    const ships=(typeof rosterShips!=='undefined' && Array.isArray(rosterShips))?rosterShips:[];
    const allMods=(typeof mods!=='undefined' && Array.isArray(mods))?mods:[];
    const gp=(typeof accountGalacticPower!=='undefined' && accountGalacticPower)||{total:0,characters:0,ships:0};
    const hasRoster=chars.length>0 || ships.length>0 || allMods.length>0;

    // Une absence de profil n'est pas un compte à zéro : afficher un état explicite.
    const emptyLabel=hasRoster ? '0' : '—';

    // Player name is deliberately kept in the header, never over the Holocron.
    const accountName=(el('topAccountName')?.textContent||'').trim();
    const displayName=accountName && accountName!=='—' ? accountName : 'COMPTE';
    text('decisionProfileName',displayName);
    text('essentialProfileName',displayName.toUpperCase());
    text('essentialGpTotal',gp.total ? nfmt(gp.total) : '—');
    text('charsCount',hasRoster ? nfmt(chars.length) : emptyLabel);
    text('modsCount',hasRoster ? nfmt(allMods.length) : emptyLabel);
    text('gpTotal',hasRoster ? (gp.total ? nfmt(gp.total) : '0') : '—');
    text('gpCharacters',hasRoster ? (gp.characters ? nfmt(gp.characters) : '0') : '—');
    text('gpShips',hasRoster ? (gp.ships ? nfmt(gp.ships) : '0') : '—');
    text('topUnitsCount',hasRoster ? nfmt(chars.length+ships.length) : '—');
    text('topProfileState',hasRoster ? 'CONNECTÉ' : 'EN ATTENTE');

    const gpt=Number(gp.characters||0)+Number(gp.ships||0);
    const cp=gpt ? Math.round(Number(gp.characters||0)/gpt*100) : 0;
    const sp=gpt ? 100-cp : 0;
    text('gpCharPct',hasRoster ? cp+'%' : '—'); text('gpShipPct',hasRoster ? sp+'%' : '—');
    const cb=el('gpCharBar'), sb=el('gpShipBar');
    if(cb) cb.style.width=cp+'%'; if(sb) sb.style.width=sp+'%';

    // IMPORTANT: use the actual V90-normalized relic_tier / gear fields.
    // The previous visual adapter looked for "relic" and therefore put almost
    // every character in "Autres", even though the technical engine had the data.
    const groups=[
      {label:'R9', value:chars.filter(c=>relicOf(c)>=9).length},
      {label:'R7–R8', value:chars.filter(c=>{const r=relicOf(c);return r>=7&&r<9;}).length},
      {label:'R5–R6', value:chars.filter(c=>{const r=relicOf(c);return r>=5&&r<7;}).length},
      {label:'R0–R4', value:chars.filter(c=>{const r=relicOf(c);return r<5&&(r>=1||gearOf(c)>=13);}).length},
      {label:'G12 ou moins', value:chars.filter(c=>relicOf(c)===0&&gearOf(c)<13).length}
    ];
    if(hasRoster){
      renderBars('unitVentilation',groups);
      renderLegend('unitLegend',groups);
    }else{
      const unitBars=el('unitVentilation'), unitLegend=el('unitLegend');
      if(unitBars) unitBars.innerHTML='<div class="dashboard-empty-state">Synchronise ton profil pour afficher la répartition du roster.</div>';
      if(unitLegend) unitLegend.textContent='';
    }

    // Les flèches à primaire Speed ont leur propre catégorie :
    // elles ne doivent pas gonfler artificiellement la catégorie « 0 secondaire ».
    const secondarySpeedMods=allMods.filter(m=>!primarySpeedOf(m));
    const speedGroups=[
      {label:'Primaire Speed', value:allMods.filter(primarySpeedOf).length},
      {label:'25+', value:secondarySpeedMods.filter(m=>speedOf(m)>=25).length},
      {label:'20–24', value:secondarySpeedMods.filter(m=>{const s=speedOf(m);return s>=20&&s<25;}).length},
      {label:'15–19', value:secondarySpeedMods.filter(m=>{const s=speedOf(m);return s>=15&&s<20;}).length},
      {label:'10–14', value:secondarySpeedMods.filter(m=>{const s=speedOf(m);return s>=10&&s<15;}).length},
      {label:'1–9', value:secondarySpeedMods.filter(m=>{const s=speedOf(m);return s>=1&&s<10;}).length},
      {label:'0 secondaire', value:secondarySpeedMods.filter(m=>speedOf(m)<1).length}
    ];
    if(hasRoster){
      renderBars('modVentilation',speedGroups);
      renderLegend('modLegend',speedGroups);
    }else{
      const modBars=el('modVentilation'), modLegend=el('modLegend');
      if(modBars) modBars.innerHTML='<div class="dashboard-empty-state">La ventilation des mods apparaîtra après synchronisation.</div>';
      if(modLegend) modLegend.textContent='';
    }

    // No meaningless "+70 V" badge in the character card.
    text('unitsDelta',hasRoster ? 'OK' : 'À FAIRE');
    text('modsDelta',hasRoster ? (allMods.length ? 'SYNC' : '0 MOD') : 'À FAIRE');
    const statusLabel=document.getElementById('decisionRosterStatus');
    if(statusLabel) statusLabel.textContent=hasRoster ? 'ROSTER SYNCHRONISÉ' : 'PROFIL NON CHARGÉ';
    text('decisionLastUpdate',hasRoster
      ? 'Dernière actualisation : '+new Date().toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})
      : 'Synchronise ton profil pour révéler les données de ton compte.');
    if(!hasRoster){
      text('holocronVerdictState','EN ATTENTE');
      text('holocronVerdictTitle','Le Gardien attend le scan du roster.');
      text('holocronVerdictAction','Active ton profil depuis l’écran d’accueil pour révéler les premières pistes.');
      text('holocronVerdictCount','—');
      text('holocronUrgentCount','—');
      text('holocronOpportunityCount','—');
    }
  }

  function showApp(){
    const gate=el('holocronGate'), shell=el('appShell'), chambers=el('holocronChambers');
    if(shell) shell.hidden=false; if(chambers) chambers.hidden=true; if(gate) gate.hidden=true;
    const back=el('returnToHolocrons'); if(back) back.hidden=false;
    renderDecision();
    try{sessionStorage.setItem('holocronSessionEstablished','1');const ally=String(el('allyCode')?.value||'').replace(/\\D/g,'').slice(0,9);if(ally.length===9)sessionStorage.setItem('holocronLastAllyCode',ally);}catch(_){}
  }
  function showChambers(){
    const gate=el('holocronGate'),temple=el('templeScene'),chambers=el('holocronChambers'),shell=el('appShell');
    if(shell)shell.hidden=true;if(gate)gate.hidden=false;if(temple)temple.hidden=true;if(chambers){chambers.hidden=false;chambers.scrollTop=0;}
    if(gate){gate.classList.remove('is-success','is-loading');gate.classList.add('intro-seen');}
    const back=el('returnToHolocrons');if(back)back.hidden=true;const msg=el('greenPathMessage');if(msg)msg.hidden=true;
    try{sessionStorage.setItem('holocronIntroPlayed','1');}catch(_){}
  }

  function setGate(msg,kind){
    const n=el('gateMessage');
    if(n){n.textContent=msg;n.dataset.state=kind||'';n.classList.toggle('error',kind==='error');n.classList.toggle('loading',kind==='loading');n.classList.toggle('success',kind==='ok');}
    const code=el('gateAllyCode');
    if(code){
      if(kind==='error') code.setAttribute('aria-invalid','true');
      else code.removeAttribute('aria-invalid');
    }
    const button=el('gateActivate');
    if(button) button.setAttribute('aria-busy',String(kind==='loading'));
  }

  function safeStorageGet(key){
    try{return localStorage.getItem(key)||'';}catch(_){return '';}
  }
  function safeStorageSet(key,value){
    try{localStorage.setItem(key,value);return true;}catch(_){return false;}
  }
  function validRelayUrl(value){
    try{const u=new URL(String(value||'').trim());return (u.protocol==='https:'||u.protocol==='http:') && !!u.host;}catch(_){return false;}
  }

  async function startLegacyLoad(){
    const input=el('gateAllyCode');
    const ally=String(input?.value||'').replace(/\D/g,'').slice(0,9);
    if(ally.length!==9){setGate('CODE ALLIÉ INVALIDE · 9 CHIFFRES ATTENDUS','error');return;}
    const relayInput=el('gateRelayUrl');
    const relay=String(relayInput?.value||safeStorageGet('swgohRelayUrl')||DEFAULT_RELAY).trim().replace(/\/+$/,'');
    if(relay && !validRelayUrl(relay)){setGate('URL DU RELAIS INVALIDE · UTILISEZ HTTP(S)','error');return;}
    if(relay) safeStorageSet('swgohRelayUrl',relay);
    const legacy=el('allyCode'); if(legacy) legacy.value=ally;
    setGate('IDENTIFICATION DU ROSTER · CHARGEMENT DES DONNÉES','loading');
    const btn=el('gateActivate'); if(btn) btn.disabled=true;
    if(typeof window.loadRemotePlayer!=='function'){
      setGate('MOTEUR DE SYNCHRONISATION INDISPONIBLE','error');
      if(btn) btn.disabled=false; return;
    }
    try{
      const loaded=await window.loadRemotePlayer();
      if(loaded===false) throw new Error('Le chargement du compte a échoué. Consultez le journal.');
      const data=(typeof currentData!=='undefined')?currentData:null;
      const chars=(typeof rosterCharacters!=='undefined' && Array.isArray(rosterCharacters))?rosterCharacters:[];
      const ships=(typeof rosterShips!=='undefined' && Array.isArray(rosterShips))?rosterShips:[];
      const modsNow=(typeof mods!=='undefined' && Array.isArray(mods))?mods:[];
      if(data && (chars.length || ships.length || modsNow.length)){
        setGate('ROSTER SYNCHRONISÉ · CHOISIS TON HOLOCRON','ok'); showChambers();
      }else{
        setGate('SYNCHRONISATION INCOMPLÈTE · Consultez le journal de chargement.','error');
      }
    }catch(e){
      setGate('ÉCHEC DE SYNCHRONISATION · '+(e?.message||String(e)),'error');
    }finally{
      if(btn) btn.disabled=false;
    }
  }

  function init(){
    const gateBtn=el('gateActivate');if(gateBtn)gateBtn.addEventListener('click',startLegacyLoad);
    const code=el('gateAllyCode');if(code)code.addEventListener('keydown',e=>{if(e.key==='Enter')startLegacyLoad();});
    const relayInput=el('gateRelayUrl');if(relayInput)relayInput.value=safeStorageGet('swgohRelayUrl')||DEFAULT_RELAY;
    const red=el('redHolocron');if(red)red.addEventListener('click',showApp);
    const green=el('greenHolocron');if(green)green.addEventListener('click',()=>{const m=el('greenPathMessage');if(m){m.hidden=false;m.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest');}});
    const back=el('returnToHolocrons');if(back)back.addEventListener('click',showChambers);
    window.addEventListener('holocron:data-updated',renderDecision);
    window.addEventListener('storage',event=>{if(event.key==='swgohRelayUrl'&&relayInput)relayInput.value=event.newValue||DEFAULT_RELAY;});
    try{const introPlayed=sessionStorage.getItem('holocronIntroPlayed')==='1';if(introPlayed&&el('holocronGate'))el('holocronGate').classList.add('intro-seen');if(!introPlayed)window.setTimeout(()=>{try{sessionStorage.setItem('holocronIntroPlayed','1');}catch(_){}},10000);}catch(_){}
    try{
      const savedAlly=sessionStorage.getItem('holocronLastAllyCode')||'';
      if(sessionStorage.getItem('holocronSessionEstablished')==='1' && /^\\d{9}$/.test(savedAlly)){
        const legacy=el('allyCode');if(legacy)legacy.value=savedAlly;if(el('gateAllyCode'))el('gateAllyCode').value=savedAlly;
        if(el('appShell'))el('appShell').hidden=false;if(el('holocronGate'))el('holocronGate').hidden=true;if(back)back.hidden=false;
        if(typeof window.loadRemotePlayer==='function')window.loadRemotePlayer().then(ok=>{if(ok===false){if(el('holocronGate'))el('holocronGate').hidden=false;if(el('templeScene'))el('templeScene').hidden=true;if(el('holocronChambers'))el('holocronChambers').hidden=false;if(el('appShell'))el('appShell').hidden=true;if(back)back.hidden=true;}renderDecision();}).catch(()=>{if(el('holocronGate'))el('holocronGate').hidden=false;if(el('templeScene'))el('templeScene').hidden=true;if(el('holocronChambers'))el('holocronChambers').hidden=false;if(el('appShell'))el('appShell').hidden=true;if(back)back.hidden=true;});
      }
    }catch(_){}
    renderDecision();
  }

  window.addEventListener('DOMContentLoaded',init);
})();
