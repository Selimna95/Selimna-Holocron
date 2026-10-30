
(function(){
'use strict';
var state={mode:'',tier:'',strategy:'Défensive',access:''};
var views={mode:document.getElementById('modeView'),tier:document.getElementById('tierView'),access:document.getElementById('accessView'),padawan:document.getElementById('padawanView'),master:document.getElementById('masterView')};
var order=['mode','tier','access'];

function show(step){
 order.forEach(function(k){views[k].hidden=k!==step;});views.padawan.hidden=step!=='padawan';views.master.hidden=step!=='master';
 var titles={mode:['CHOISIS TON FORMAT','Commence par choisir le format de ta prochaine GAC.','ÉTAPE 01 / 03'],tier:['CHOISIS TA LIGUE','Définis le niveau de compétition auquel tu prépares tes équipes.','ÉTAPE 02 / 03'],access:['CHOISIS TON NIVEAU D’ACCÈS','Padawan prépare exclusivement les équipes défensives pour le format et la ligue choisis.','ÉTAPE 03 / 03'],padawan:['PADAWAN · DÉFENSE','Sélection des équipes défensives complètes à partir du roster synchronisé.','ÉTAPE 03 / 03'],master:['MAÎTRE JEDI','Parcours expert · Configuration GAC conservée.','ÉTAPE 03 / 03']};
 document.getElementById('pageTitle').textContent=titles[step][0];document.getElementById('pageSubtitle').textContent=titles[step][1];document.getElementById('stepLabel').textContent=titles[step][2];
 ['progress1','progress2','progress3'].forEach(function(id,i){document.getElementById(id).classList.toggle('active',i<=order.indexOf(step));});
 window.scrollTo({top:0,behavior:'smooth'});
}
function save(){try{Object.keys(state).forEach(function(k){sessionStorage.setItem('blueGac'+k.charAt(0).toUpperCase()+k.slice(1),state[k]);});}catch(_){}}
function sync(){
 [['mode','data-mode'],['tier','data-tier'],['access','data-access']].forEach(function(p){document.querySelectorAll('['+p[1]+']').forEach(function(b){b.setAttribute('aria-pressed',String(b.getAttribute(p[1])===state[p[0]]));});});
 document.getElementById('chosenMode').textContent='Format : '+(state.mode||'—');document.getElementById('chosenSummary').textContent=(state.mode||'—')+' · '+(state.tier||'—')+' · Défense';
 document.getElementById('settingsSummary').textContent='Format : '+(state.mode||'—')+' · Ligue : '+(state.tier||'—')+' · Orientation : Défense uniquement · Accès : '+(state.access||'à choisir')+'. Les compositions sont issues du classement défensif public. Les flottes sont exclues.';var cfg=document.getElementById('padawanConfig');if(cfg)cfg.textContent='Format : '+(state.mode||'—')+' · Ligue : '+(state.tier||'—')+' · Défense uniquement · Accès : '+(state.access||'—');save();updateSourceLinks();
}
try{order.forEach(function(k){state[k]=sessionStorage.getItem('blueGac'+k.charAt(0).toUpperCase()+k.slice(1))||'';});}catch(_){}
document.querySelectorAll('[data-mode]').forEach(function(b){b.addEventListener('click',function(){if(document.getElementById('modeGrid').classList.contains('is-crossing'))return;state.mode=b.dataset.mode;state.tier='';state.strategy='Défensive';state.access='';sync();var grid=document.getElementById('modeGrid');grid.classList.add('is-crossing');b.classList.add('is-entering');window.setTimeout(function(){grid.classList.remove('is-crossing');b.classList.remove('is-entering');show('tier');},window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:6000);});});
document.querySelectorAll('[data-tier]').forEach(function(b){b.addEventListener('click',function(){state.tier=b.dataset.tier;state.strategy='Défensive';state.access='';sync();show('access');});});

document.querySelectorAll('[data-access]').forEach(function(b){b.addEventListener('click',function(){state.access=b.dataset.access;sync();if(state.access==='Padawan'){show('padawan');initRosterStatus();}else{document.getElementById('masterConfig').textContent='Configuration : '+(state.mode||'—')+' · '+(state.tier||'—');show('master');}});});
document.getElementById('backFromMaster').addEventListener('click',function(){show('access');});
// Catalogue dynamique : snapshot généré automatiquement depuis les classements défensifs SWGOH.GG.
var publicTeams=[];
var catalogMeta=null;
var catalogReady=false;
var catalogError='';
function loadCatalog(){
 return fetch('gac-catalog.json?v=4.1.0',{cache:'no-store'}).then(function(response){
  if(!response.ok)throw new Error('HTTP '+response.status);
  return response.json();
 }).then(function(data){
  if(!data||data.schemaVersion!==1||!Array.isArray(data.teams))throw new Error('Format du catalogue non reconnu');
  publicTeams=data.teams;catalogMeta=data;catalogReady=true;catalogError='';
  if(state.access==='Padawan')renderTeams();
 }).catch(function(error){
  catalogError=error&&error.message?error.message:'erreur inconnue';catalogReady=true;
  if(state.access==='Padawan')renderTeams();
 });
}
function normalizeName(s){return String(s||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');}
var rosterAliases={'supreme leader kylo ren':'supreme leader kylo ren','slkr':'supreme leader kylo ren','kru':'kylo ren unmasked','kylo ren unmasked':'kylo ren unmasked','rey dark side vision':'rey dark side vision','cc 1119 appo':'cc1119 appo','appo':'cc1119 appo','the stranger':'the stranger','inquisitor barriss':'inquisitor barriss','barriss':'inquisitor barriss'};
function canonicalName(s){var n=normalizeName(s);var aliases={slkr:'supremeleaderkyloren',kru:'kylorenunmasked',appo:'cc1119appo',barriss:'inquisitorbarriss'};return aliases[n]||n;}
function parseRoster(){
var raw='';
try{raw=sessionStorage.getItem('holocronRosterNames')||localStorage.getItem('holocronRosterNames')||'';}catch(_){}
try{var data=JSON.parse(raw);if(Array.isArray(data))return data.map(function(x){return canonicalName(typeof x==='string'?x:(x.name||x.character_name||x.characterName||x.base_id||x.baseId||x.defId||x.id||''));}).filter(Boolean);}catch(_){}
return [];
}
function renderTeams(){
var results=document.getElementById('teamResults');results.innerHTML='';
var roster=parseRoster();var status=document.getElementById('padawanStatus');var fmt=state.mode||'5v5';

 if(!catalogReady){status.textContent='Actualisation du catalogue défensif SWGOH.GG…';results.innerHTML='<div class="empty-state">Chargement des données de défense pour les cinq ligues et les deux formats.</div>';return;}
 if(catalogError){status.textContent='Le catalogue défensif ne peut pas être chargé : '+catalogError+'. Aucune ancienne composition ne sera présentée comme actuelle.';results.innerHTML='<div class="empty-state">Source de données momentanément indisponible. Réessaie plus tard.</div>';return;}
 if(!catalogMeta||!publicTeams.length){status.textContent='Le catalogue dynamique est en attente de son premier relevé SWGOH.GG. Aucune composition statique de remplacement ne sera utilisée.';results.innerHTML='<div class="empty-state">Les données seront disponibles après la première actualisation automatique.</div>';return;}
 if(!roster.length){status.textContent='Aucune recommandation affichée : le roster synchronisé n’a pas été reconnu.';results.innerHTML='<div class="empty-state">Roster indisponible ou non reconnu. Charge ton profil dans l’Holocron principal, puis rouvre le Sanctuaire bleu.</div>';return;}
var rosterSet=new Set(roster);
var requiredCounts={'5v5':{Kyber:11,Aurodium:9,Chromium:7,Bronzium:5,Carbonite:3},'3v3':{Kyber:15,Aurodium:13,Chromium:10,Bronzium:7,Carbonite:3}};
var required=(requiredCounts[fmt]&&requiredCounts[fmt][state.tier])||requiredCounts[fmt].Kyber;
var seasons=(catalogMeta.seasons&&catalogMeta.seasons[fmt])||[];var ranked=publicTeams.filter(function(t){return t.format===fmt&&t.league===state.tier&&seasons.indexOf(Number(t.season))>=0&&Number.isFinite(t.rank);}).slice().sort(function(a,b){return Number(b.battles||0)-Number(a.battles||0)||Number(b.hold||0)-Number(a.hold||0)||b.season-a.season||a.rank-b.rank;});
var used=new Set(),candidates=[],skippedMissing=0,skippedUsed=0;
ranked.forEach(function(t){
 if(candidates.length>=required)return;
 var members=t.members.map(canonicalName);
 if(!members.every(function(m){return rosterSet.has(m);})){skippedMissing++;return;}
 if(members.some(function(m){return used.has(m);})){skippedUsed++;return;}
 candidates.push(t);members.forEach(function(m){used.add(m);});
});
function addUnavailableTeamCard(number){
 var card=document.createElement('article');card.className='team-card unavailable';
 var h=document.createElement('h3');h.textContent='Équipe '+number;card.appendChild(h);
 var message=document.createElement('div');message.className='empty-state';message.textContent='Aucune proposition ne répond aux critères pour cette équipe. Les compositions disponibles ne permettent pas de compléter la sélection sans personnage manquant ou doublon.';card.appendChild(message);
 results.appendChild(card);
}
if(!ranked.length){
 status.textContent='Aucune composition défensive vérifiée n’est disponible pour '+state.tier+' en '+fmt+' dans les deux saisons relevées. Le catalogue est actualisé automatiquement depuis SWGOH.GG ; aucune équipe d’une autre ligue ne sera substituée.';
 for(var noSourceIndex=1;noSourceIndex<=required;noSourceIndex++)addUnavailableTeamCard(noSourceIndex);
 return;
}
if(!candidates.length){
 status.textContent='Roster détecté ('+roster.length+' personnages), mais aucune équipe complète du classement actuel ne peut être posée sans doublon.';
 for(var emptyIndex=1;emptyIndex<=required;emptyIndex++)addUnavailableTeamCard(emptyIndex);
 return;
}
status.textContent=candidates.length+' / '+required+' équipes défensives retenues pour '+fmt+' '+state.tier+'. Saisons analysées : '+seasons.map(function(s){return 'S'+s;}).join(' et ')+'. '+skippedMissing+' équipe(s) ignorée(s) faute de personnages ; '+skippedUsed+' ignorée(s) pour éviter les doublons. '+ranked.length+' compositions observées · actualisation : '+new Date(catalogMeta.updatedAt).toLocaleString('fr-FR')+'.';

candidates.forEach(function(t,i){
var card=document.createElement('article');card.className='team-card';
var h=document.createElement('h3');h.textContent='Équipe '+(i+1)+' · '+t.name;card.appendChild(h);
var members=document.createElement('div');members.className='team-members';members.textContent=t.members.join(' · ');card.appendChild(members);
var stats=document.createElement('div');stats.className='team-stats';stats.textContent='Ligue '+t.league+' · Saison S'+t.season+' · Rang source #'+t.rank+' · Tenue observée : '+t.hold.toFixed(1)+' % · Combats : '+t.battles.toLocaleString('fr-FR');card.appendChild(stats);
var reason=document.createElement('div');reason.className='team-reason';reason.textContent=t.note+' Équipe complète vérifiée contre le roster.';card.appendChild(reason);
var link=document.createElement('a');link.href=t.source;link.target='_blank';link.rel='noopener';link.className='back';link.textContent='VÉRIFIER LA SOURCE ↗';link.style.display='inline-block';link.style.marginTop='12px';card.appendChild(link);results.appendChild(card);
});
for(var missingIndex=candidates.length+1;missingIndex<=required;missingIndex++)addUnavailableTeamCard(missingIndex);
}

function updateSourceLinks(){var league={Kyber:'kyber',Aurodium:'aurodium',Chromium:'chromium',Bronzium:'bronzium',Carbonite:'carbonite'}[state.tier]||'kyber';var mode=state.mode==='3v3'?'3v3':'gac';document.querySelectorAll('.padawan-actions a[href*="swgoh.gg/tier-list/"]').forEach(function(a){a.href='https://swgoh.gg/tier-list/'+mode+'/?league='+league+'&side=defense';});}

function initRosterStatus(){var names=parseRoster();var status=document.getElementById('rosterConnectionStatus');if(names.length){status.textContent='Roster connecté détecté · '+names.length+' personnages disponibles. Les compositions seront filtrées automatiquement.';renderTeams();}else{status.textContent='Aucun roster synchronisé détecté dans le navigateur. Aucune composition ne sera affichée tant que le roster n’est pas reconnu.';renderTeams();}}
document.getElementById('showAllTeams').addEventListener('click',renderTeams);
document.getElementById('backToAccess').addEventListener('click',function(){show('access');});

document.getElementById('backToMode').addEventListener('click',function(){show('mode');});document.getElementById('backToTierFromAccess').addEventListener('click',function(){show('tier');});
sync();loadCatalog();show(state.access==='Padawan'?'padawan':state.access==='Maître Jedi'?'master':state.tier?'access':state.mode?'tier':'mode');if(state.access==='Padawan')initRosterStatus();if(state.access==='Maître Jedi')document.getElementById('masterConfig').textContent='Configuration : '+(state.mode||'—')+' · '+(state.tier||'—');
})();
