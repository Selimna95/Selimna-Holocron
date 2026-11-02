
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
document.querySelectorAll('[data-mode]').forEach(function(b){b.addEventListener('click',function(){if(document.getElementById('modeGrid').classList.contains('is-crossing'))return;state.mode=b.dataset.mode;state.tier='';state.strategy='Défensive';state.access='';selectedEnemyDefenses=[];sync();var grid=document.getElementById('modeGrid');grid.classList.add('is-crossing');b.classList.add('is-entering');window.setTimeout(function(){grid.classList.remove('is-crossing');b.classList.remove('is-entering');show('tier');},window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:6000);});});
document.querySelectorAll('[data-tier]').forEach(function(b){b.addEventListener('click',function(){state.tier=b.dataset.tier;state.strategy='Défensive';state.access='';selectedEnemyDefenses=[];sync();show('access');});});

document.querySelectorAll('[data-access]').forEach(function(b){b.addEventListener('click',function(){state.access=b.dataset.access;sync();if(state.access==='Padawan'){show('padawan');initRosterStatus();}else{show('master');initMasterPlanner();}});});
document.getElementById('backFromMaster').addEventListener('click',function(){show('access');});
// Catalogue dynamique : snapshot généré automatiquement depuis les classements défensifs SWGOH.GG.
var publicTeams=[];
var catalogMeta=null;
var catalogReady=false;
var catalogError='';
var counterCatalog=null,counterReady=false,counterError='',masterDefenseOptions=[],selectedEnemyDefenses=[];
function loadCatalog(){
 var catalogUrl=location.hostname==='selimna95.github.io'?'https://raw.githubusercontent.com/Selimna95/Selimna-Holocron/main/blue-gac/gac-catalog.json?v=4.1.0':'gac-catalog.json?v=4.1.0';
 return fetch(catalogUrl,{cache:'no-store'}).then(function(response){
  if(!response.ok)throw new Error('HTTP '+response.status);
  return response.json();
 }).then(function(data){
  if(!data||data.schemaVersion!==1||!Array.isArray(data.teams))throw new Error('Format du catalogue non reconnu');
  publicTeams=data.teams;catalogMeta=data;catalogReady=true;catalogError='';
  if(state.access==='Padawan')renderTeams();
  if(state.access==='Maître Jedi')initMasterPlanner();
 }).catch(function(error){
  catalogError=error&&error.message?error.message:'erreur inconnue';catalogReady=true;
  if(state.access==='Padawan')renderTeams();
  if(state.access==='Maître Jedi')initMasterPlanner();
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
var seasons=(catalogMeta.seasons&&catalogMeta.seasons[fmt]&&catalogMeta.seasons[fmt][String(state.tier||'Kyber').toLowerCase()])||[];var ranked=publicTeams.filter(function(t){return t.format===fmt&&t.league===state.tier&&seasons.indexOf(Number(t.season))>=0&&Number.isFinite(t.rank);}).slice().sort(function(a,b){return Number(b.battles||0)-Number(a.battles||0)||Number(b.hold||0)-Number(a.hold||0)||b.season-a.season||a.rank-b.rank;});
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
var availableSeasons=Array.from(new Set(ranked.map(function(t){return Number(t.season);}))).sort(function(a,b){return b-a;});status.textContent=candidates.length+' / '+required+' équipes défensives retenues pour '+fmt+' '+state.tier+'. Saisons réellement disponibles : '+availableSeasons.map(function(s){return 'S'+s;}).join(' et ')+'. '+skippedMissing+' équipe(s) ignorée(s) faute de personnages ; '+skippedUsed+' ignorée(s) pour éviter les doublons. '+ranked.length+' compositions observées · actualisation : '+new Date(catalogMeta.updatedAt).toLocaleString('fr-FR')+'.';

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


var counterCatalogUrl=location.hostname==='selimna95.github.io'?'https://raw.githubusercontent.com/Selimna95/Selimna-Holocron/main/blue-gac/gac-counters.json?v=4.2.0':'gac-counters.json?v=4.2.0';
function loadCounterCatalog(){
 return fetch(counterCatalogUrl,{cache:'no-store'}).then(function(response){
  if(!response.ok)throw new Error('HTTP '+response.status);
  return response.json();
 }).then(function(data){
  if(!data||data.schemaVersion!==1||!Array.isArray(data.counters))throw new Error('Format des counters non reconnu');
  counterCatalog=data;counterReady=true;counterError='';
  if(state.access==='Maître Jedi')initMasterPlanner();
 }).catch(function(error){
  counterError=error&&error.message?error.message:'erreur inconnue';counterReady=true;
  if(state.access==='Maître Jedi')initMasterPlanner();
 });
}
function defenseKey(team){return (team.format||'')+'|'+(team.league||'')+'|'+(team.season||'')+'|'+(team.members||[]).map(canonicalName).join('|');}
function initMasterPlanner(){
 var config=document.getElementById('masterConfig');
 if(config)config.textContent='Configuration : '+(state.mode||'—')+' · '+(state.tier||'—')+' · Attaque';
 var status=document.getElementById('counterSourceStatus');
 var select=document.getElementById('enemyDefenseSelect');
 if(!select)return;
 if(!catalogReady){
  select.innerHTML='<option value="">Chargement des défenses disponibles…</option>';
  if(status)status.textContent='Chargement du catalogue des défenses SWGOH.GG…';
  return;
 }
 if(catalogError){
  select.innerHTML='<option value="">Catalogue défensif indisponible</option>';
  if(status)status.textContent='Impossible de charger les défenses : '+catalogError;
  return;
 }
 var fmt=state.mode||'5v5';
 var seasons=(catalogMeta&&catalogMeta.seasons&&catalogMeta.seasons[fmt]&&catalogMeta.seasons[fmt][String(state.tier||'Kyber').toLowerCase()])||[];
 masterDefenseOptions=publicTeams.filter(function(t){return t.format===fmt&&t.league===state.tier&&seasons.indexOf(Number(t.season))>=0&&Array.isArray(t.members)&&t.members.length===(fmt==='3v3'?3:5);}).slice().sort(function(a,b){return Number(b.battles||0)-Number(a.battles||0)||Number(b.hold||0)-Number(a.hold||0);});
 var unique=[],seen={};
 masterDefenseOptions.forEach(function(t){var k=t.members.map(canonicalName).join('|');if(!seen[k]){seen[k]=true;unique.push(t);}});
 masterDefenseOptions=unique;
 select.innerHTML='';
 if(!masterDefenseOptions.length){
  select.innerHTML='<option value="">Aucune défense observée pour cette ligue et ce format</option>';
 }else{
  masterDefenseOptions.forEach(function(t,i){
   var option=document.createElement('option');option.value=String(i);
   option.textContent=t.name+' · '+t.members.join(' / ')+' · S'+t.season;
   select.appendChild(option);
  });
 }
 if(status){
  if(!counterReady)status.textContent='Défenses disponibles : '+masterDefenseOptions.length+'. Chargement des counters d’attaque…';
  else if(counterError)status.textContent='Défenses disponibles : '+masterDefenseOptions.length+'. Données de counters indisponibles : '+counterError;
  else if(!counterCatalog.counters.length)status.textContent='Défenses disponibles : '+masterDefenseOptions.length+'. Le catalogue de counters est prêt mais attend sa première collecte SWGOH.GG ; aucune statistique ne sera inventée.';
  else status.textContent='Défenses disponibles : '+masterDefenseOptions.length+'. '+counterCatalog.counters.length+' confrontations observées · données globales à la saison, par leader défensif · relevé : '+(counterCatalog.updatedAt?new Date(counterCatalog.updatedAt).toLocaleString('fr-FR'):'date non fournie')+'.';
 }
 renderSelectedEnemyDefenses();
}
function renderSelectedEnemyDefenses(){
 var host=document.getElementById('enemyDefenseList');if(!host)return;host.innerHTML='';
 if(!selectedEnemyDefenses.length){host.innerHTML='<div class="empty-state">Aucune défense adverse sélectionnée pour le moment.</div>';return;}
 selectedEnemyDefenses.forEach(function(t,i){
  var card=document.createElement('article');card.className='master-defense-chip';
  var copy=document.createElement('div');copy.className='master-defense-copy';
  var title=document.createElement('strong');title.textContent='Défense '+(i+1)+' · '+t.name;copy.appendChild(title);
  var members=document.createElement('span');members.textContent=t.members.join(' · ');copy.appendChild(members);
  var remove=document.createElement('button');remove.type='button';remove.className='ghost master-remove';remove.textContent='RETIRER';remove.setAttribute('data-remove-defense',String(i));
  card.appendChild(copy);card.appendChild(remove);host.appendChild(card);
 });
}
document.getElementById('addEnemyDefense').addEventListener('click',function(){
 var select=document.getElementById('enemyDefenseSelect');var index=Number(select.value);
 if(!Number.isInteger(index)||!masterDefenseOptions[index])return;
 var team=masterDefenseOptions[index],key=defenseKey(team);
 if(selectedEnemyDefenses.some(function(x){return defenseKey(x)===key;})){
  document.getElementById('attackPlanStatus').textContent='Cette défense est déjà présente dans ton plan.';
  return;
 }
 selectedEnemyDefenses.push(team);renderSelectedEnemyDefenses();
 document.getElementById('attackPlanStatus').textContent=selectedEnemyDefenses.length+' défense(s) sélectionnée(s).';
 document.getElementById('attackPlanResults').innerHTML='';
});
document.getElementById('enemyDefenseList').addEventListener('click',function(event){
 var button=event.target.closest('[data-remove-defense]');if(!button)return;
 selectedEnemyDefenses.splice(Number(button.getAttribute('data-remove-defense')),1);renderSelectedEnemyDefenses();
 document.getElementById('attackPlanResults').innerHTML='';
});
function wilsonLowerBound(rate,battles){
 var n=Math.max(1,Number(battles)||1),p=Math.max(0,Math.min(1,(Number(rate)||0)/100)),z=1.96,z2=z*z;
 return (p+z2/(2*n)-z*Math.sqrt((p*(1-p)+z2/(4*n))/n))/(1+z2/n);
}
function countersForDefense(defense,rosterSet){
 if(!counterReady||counterError||!counterCatalog)return [];
 var fmt=state.mode||'5v5',seasons=(counterCatalog.seasons&&counterCatalog.seasons[fmt])||[];
 var leader=canonicalName(defense.members[0]),grouped={};
 counterCatalog.counters.forEach(function(row){
  if(row.format!==fmt||seasons.indexOf(Number(row.season))<0||canonicalName(row.defenseLeader)!==leader)return;
  var members=(row.attackMembers||[]).map(canonicalName);
  if(members.length!==(fmt==='3v3'?3:5)||!members.every(function(m){return rosterSet.has(m);}))return;
  var key=members.join('|');
  if(!grouped[key])grouped[key]={members:row.attackMembers.slice(),canonical:members,battles:0,wins:0,banners:0,seasons:[],sources:[]};
  var g=grouped[key],n=Number(row.battles)||0;
  g.battles+=n;g.wins+=(Number(row.winRate)||0)*n;g.banners+=(Number(row.averageBanners)||0)*n;
  if(g.seasons.indexOf(Number(row.season))<0)g.seasons.push(Number(row.season));
  if(row.source&&g.sources.indexOf(row.source)<0)g.sources.push(row.source);
 });
 return Object.keys(grouped).map(function(key){
  var g=grouped[key],rate=g.battles?g.wins/g.battles:0,banners=g.battles?g.banners/g.battles:0;
  var lower=wilsonLowerBound(rate,g.battles);
  return {members:g.members,battles:g.battles,winRate:rate,averageBanners:banners,confidence:lower,seasons:g.seasons.sort(function(a,b){return b-a;}),source:g.sources[0]||'',score:lower*100+banners*.04};
 }).sort(function(a,b){return b.score-a.score||b.battles-a.battles;});
}
function allocateAttackPlan(items){
 var ordered=items.slice().sort(function(a,b){return a.candidates.length-b.candidates.length;});
 var best={covered:-1,score:-Infinity,picks:{}},nodes=0,limit=50000;
 function visit(index,used,picks,score){
  nodes++;
  if(nodes>limit)return;
  var covered=Object.keys(picks).length;
  if(covered+(ordered.length-index)<best.covered)return;
  if(index>=ordered.length){
   if(covered>best.covered||(covered===best.covered&&score>best.score))best={covered:covered,score:score,picks:Object.assign({},picks)};
   return;
  }
  var item=ordered[index],candidates=item.candidates.slice(0,18);
  candidates.forEach(function(candidate){
   if(candidate.canonical.some(function(member){return used.has(member);}))return;
   var nextUsed=new Set(used);candidate.canonical.forEach(function(member){nextUsed.add(member);});
   picks[item.key]=candidate;visit(index+1,nextUsed,picks,score+candidate.score);delete picks[item.key];
  });
  visit(index+1,used,picks,score);
 }
 visit(0,new Set(),{},0);
 return {picks:best.picks,covered:Math.max(0,best.covered),nodes:nodes,limited:nodes>limit};
}
function buildAttackPlan(){
 var status=document.getElementById('attackPlanStatus'),results=document.getElementById('attackPlanResults');
 results.innerHTML='';
 if(!selectedEnemyDefenses.length){status.textContent='Ajoute au moins une défense adverse avant de construire le plan.';return;}
 if(!counterReady){status.textContent='Les statistiques de counters sont encore en cours de chargement.';return;}
 if(counterError||!counterCatalog){status.textContent='Le catalogue des counters est indisponible : '+(counterError||'aucune donnée reçue')+'.';return;}
 if(!counterCatalog.counters.length){status.textContent='Aucune collecte SWGOH.GG des counters n’a encore été publiée. Le plan d’attaque reste indisponible tant que les statistiques réelles ne sont pas présentes.';return;}
 var roster=parseRoster().map(canonicalName),rosterSet=new Set(roster);
 if(!roster.length){status.textContent='Aucun roster synchronisé reconnu. Charge ton profil dans le Temple avant de préparer tes attaques.';return;}
 var items=selectedEnemyDefenses.map(function(defense,index){
  return {defense:defense,key:String(index),candidates:countersForDefense(defense,rosterSet)};
 });
 var allocation=allocateAttackPlan(items);
 var assigned=allocation.picks;
 status.textContent=allocation.covered+' / '+items.length+' défenses couvertes sans réutiliser de personnage. Les counters sont classés avec une borne basse de confiance à 95 % (Wilson), ce qui pénalise les taux élevés basés sur peu de combats.'+(allocation.limited?' Recherche globale plafonnée pour préserver la réactivité.':'');
 items.forEach(function(item,index){
  var card=document.createElement('article');card.className='team-card';
  var heading=document.createElement('h3');heading.textContent='Défense '+(index+1)+' · '+item.defense.name;card.appendChild(heading);
  var defenseMembers=document.createElement('div');defenseMembers.className='team-members';defenseMembers.textContent=item.defense.members.join(' · ');card.appendChild(defenseMembers);
  var chosen=assigned[item.key];
  if(chosen){
   var attack=document.createElement('div');attack.className='master-attack-choice';
   var label=document.createElement('strong');label.textContent='COUNTER RETENU';attack.appendChild(label);
   var team=document.createElement('div');team.className='team-members';team.textContent=chosen.members.join(' · ');attack.appendChild(team);
   var stats=document.createElement('div');stats.className='team-stats';
   stats.textContent='Victoire observée : '+chosen.winRate.toFixed(1)+' % · confiance 95 % : '+(chosen.confidence*100).toFixed(1)+' % · '+chosen.battles.toLocaleString('fr-FR')+' combats · '+chosen.averageBanners.toFixed(1)+' bannières moyennes · '+chosen.seasons.map(function(s){return 'S'+s;}).join(' + ');
   attack.appendChild(stats);
   var link=document.createElement('a');link.href=chosen.source;link.target='_blank';link.rel='noopener';link.className='back';link.textContent='VÉRIFIER LES STATISTIQUES ↗';link.style.display='inline-block';link.style.marginTop='10px';attack.appendChild(link);
   card.appendChild(attack);
  }else{
   var empty=document.createElement('div');empty.className='empty-state';
   empty.textContent=item.candidates.length?'Des counters existent dans ton roster, mais leurs personnages sont déjà affectés à une autre attaque.':'Aucun counter observé complet n’est disponible dans ton roster pour ce leader défensif.';
   card.appendChild(empty);
  }
  if(item.candidates.length){
   var details=document.createElement('details');details.className='master-alternatives';
   var summary=document.createElement('summary');summary.textContent='Voir les autres counters éligibles ('+item.candidates.length+')';details.appendChild(summary);
   item.candidates.slice(0,5).forEach(function(candidate){
    var row=document.createElement('div');row.className='master-alternative';
    var names=document.createElement('span');names.textContent=candidate.members.join(' · ');row.appendChild(names);
    var metric=document.createElement('small');metric.textContent=candidate.winRate.toFixed(1)+' % · '+candidate.battles.toLocaleString('fr-FR')+' combats · '+candidate.averageBanners.toFixed(1)+' bannières';row.appendChild(metric);details.appendChild(row);
   });
   card.appendChild(details);
  }
  results.appendChild(card);
 });
}
document.getElementById('buildAttackPlan').addEventListener('click',buildAttackPlan);

function updateSourceLinks(){var league={Kyber:'kyber',Aurodium:'aurodium',Chromium:'chromium',Bronzium:'bronzium',Carbonite:'carbonite'}[state.tier]||'kyber';var mode=state.mode==='3v3'?'3v3':'gac';document.querySelectorAll('.padawan-actions a[href*="swgoh.gg/tier-list/"]').forEach(function(a){a.href='https://swgoh.gg/tier-list/'+mode+'/?league='+league+'&side=defense';});}

function initRosterStatus(){var names=parseRoster();var status=document.getElementById('rosterConnectionStatus');if(names.length){status.textContent='Roster connecté détecté · '+names.length+' personnages disponibles. Les compositions seront filtrées automatiquement.';renderTeams();}else{status.textContent='Aucun roster synchronisé détecté dans le navigateur. Aucune composition ne sera affichée tant que le roster n’est pas reconnu.';renderTeams();}}
document.getElementById('showAllTeams').addEventListener('click',renderTeams);
document.getElementById('backToAccess').addEventListener('click',function(){show('access');});

document.getElementById('backToMode').addEventListener('click',function(){show('mode');});document.getElementById('backToTierFromAccess').addEventListener('click',function(){show('tier');});
sync();loadCatalog();loadCounterCatalog();show(state.access==='Padawan'?'padawan':state.access==='Maître Jedi'?'master':state.tier?'access':state.mode?'tier':'mode');if(state.access==='Padawan')initRosterStatus();if(state.access==='Maître Jedi')initMasterPlanner();
})();
