
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
// V4.0.16 — compositions relevées sur les classements publics SWGOH.GG (saison indiquée par la source).
// Ces compositions sont des observations réelles, pas des équipes inventées. Chaque équipe est filtrée
// intégralement sur le roster. Les statistiques sont celles du classement Kyber consulté le 26/10/2026;
// elles ne doivent pas être interprétées comme des statistiques propres aux autres ligues.
var publicTeams=[
{format:'5v5',name:'The Stranger · Barriss · Maul · Starkiller · Visas',members:['The Stranger','Inquisitor Barriss','Maul (Hate-Fueled)','Starkiller','Visas Marr'],hold:53.0,battles:33900,source:'https://swgoh.gg/tier-list/gac/?side=defense',note:'Très forte tenue observée dans un grand volume de combats.'},
{format:'5v5',name:'SLKR · Rey (Dark Side Vision) · Sith Trooper · Hux · KRU',members:['Supreme Leader Kylo Ren','Rey (Dark Side Vision)','Sith Trooper','General Hux','Kylo Ren (Unmasked)'],hold:46.4,battles:7533,source:'https://swgoh.gg/tier-list/gac/?side=defense',note:'Composition First Order observée avec une tenue élevée.'},
{format:'5v5',name:'Leia · Raddus · Drogan · Jyn · R2-D2',members:['Leia Organa','Admiral Raddus','Captain Drogan','Jyn Erso','R2-D2'],hold:26.2,battles:5155,source:'https://swgoh.gg/tier-list/gac/?side=defense',note:'Composition observée ; tenue plus modérée que les équipes prioritaires.'},
{format:'5v5',name:'Baylan · Dengar · Hondo · Marrok · Shin Hati',members:['Baylan Skoll','Dengar','Hondo Ohnaka','Marrok','Shin Hati'],hold:29.0,battles:17200,source:'https://swgoh.gg/tier-list/gac/?side=defense',note:'Équipe observée ; elle ne sera affichée que si les cinq personnages sont possédés.'},
{format:'5v5',name:'Cere · Cal Kestis · KRU · Maul · Taron Malicos',members:['Cere Junda','Cal Kestis','Kylo Ren (Unmasked)','Maul','Taron Malicos'],hold:44.6,battles:2251,source:'https://swgoh.gg/tier-list/gac/?rank=best&side=defense',note:'Tenue observée de 44,6 % sur 2 251 combats (Kyber, saison 84 en cours).'},
{format:'5v5',name:'Ahsoka · Ezra Exilé · General Syndulla · Huyang · Sabine',members:['Ahsoka Tano','Ezra Bridger (Exile)','General Syndulla','Huyang','Padawan Sabine Wren'],hold:19.0,battles:114000,source:'https://swgoh.gg/tier-list/gac/?rank=best&side=defense',note:'Tenue observée de 19,0 % sur 114 000 combats (Kyber, saison 84 en cours).'},
{format:'5v5',name:'Kelleran Beq · Depa · Mace Windu · Jocasta · Temple Guard',members:['Kelleran Beq','Depa Billaba','Jedi Master Mace Windu','Jocasta Nu','Temple Guard'],hold:23.2,battles:1053,source:'https://swgoh.gg/tier-list/gac/?rank=best&side=defense',note:'Tenue observée de 23,2 % sur 1 053 combats (Kyber, saison 84 en cours).'},
{format:'5v5',name:'Great Mothers · Death Trooper Peridea · Morgan · Spirit · Night Trooper',members:['Great Mothers','Death Trooper (Peridea)','Morgan Elsbeth','Nightsister Spirit','Night Trooper'],hold:21.5,battles:29400,source:'https://swgoh.gg/tier-list/gac/?rank=best&side=defense',note:'Tenue observée de 21,5 % sur 29 400 combats (Kyber, saison 84 en cours).'},
{format:'5v5',name:'Rey · Amilyn Holdo · BB-8 · Ben Solo · Rey Jedi Training',members:['Rey','Amilyn Holdo','BB-8','Ben Solo','Rey (Jedi Training)'],hold:13.3,battles:12200,source:'https://swgoh.gg/tier-list/gac/?rank=best&side=defense',note:'Tenue observée de 13,3 % sur 12 200 combats (Kyber, saison 84 en cours).'},
{format:'5v5',name:'Queen Amidala · Grand Master Yoda · Master Qui-Gon · Padawan Obi-Wan · Shaak Ti',members:['Queen Amidala','Grand Master Yoda','Master Qui-Gon','Padawan Obi-Wan','Shaak Ti'],hold:10.9,battles:14000,source:'https://swgoh.gg/tier-list/gac/?rank=best&side=defense',note:'Tenue observée de 10,9 % sur 14 000 combats (Kyber, saison 84 en cours).'},
{format:'5v5',name:'Iden Versio · Death Trooper · Range Trooper · Scout Trooper · Shoretrooper',members:['Iden Versio','Death Trooper','Range Trooper','Scout Trooper','Shoretrooper'],hold:14.3,battles:2470,source:'https://swgoh.gg/tier-list/gac/?rank=best&side=defense',note:'Tenue observée de 14,3 % sur 2 470 combats (Kyber, saison 84 en cours).'},
{format:'5v5',name:'Hera · Captain Rex · Chopper · Kanan · Sabine',members:['Hera Syndulla','Captain Rex','Chopper','Kanan Jarrus','Sabine Wren'],hold:10.5,battles:3008,source:'https://swgoh.gg/tier-list/gac/?rank=best&side=defense',note:'Tenue observée de 10,5 % sur 3 008 combats (Kyber, saison 84 en cours).'},
{format:'5v5',name:'Raddus · Bistan · Cassian · Jyn · K-2SO',members:['Admiral Raddus','Bistan','Cassian Andor','Jyn Erso','K-2SO'],hold:3.8,battles:4973,source:'https://swgoh.gg/tier-list/gac/?rank=best&side=defense',note:'Tenue observée de 3,8 % sur 4 973 combats (Kyber, saison 84 en cours) ; option de dernier recours.'},
{format:'3v3',name:'SLKR · Rey (Dark Side Vision) · Kylo Ren (Unmasked)',members:['Supreme Leader Kylo Ren','Rey (Dark Side Vision)','Kylo Ren (Unmasked)'],hold:37.2,battles:12400,source:'https://swgoh.gg/tier-list/3v3/?side=defense',note:'Une des compositions défensives les plus solides du classement consulté.'},
{format:'3v3',name:'Lord Vader · Appo · CX-2',members:['Lord Vader','CC-1119 "Appo"','CX-2'],hold:31.6,battles:140000,source:'https://swgoh.gg/tier-list/3v3/?side=defense',note:'Volume d’observation important ; bonne tenue défensive mesurée.'},
{format:'3v3',name:'Rey · Ben Solo · Cal Kestis',members:['Rey','Ben Solo','Cal Kestis'],hold:28.4,battles:93300,source:'https://swgoh.gg/tier-list/3v3/?side=defense',note:'Composition fréquemment observée, avec tenue défensive intermédiaire.'},
{format:'3v3',name:'Ahsoka Tano · Ezra Bridger (Exile) · Huyang',members:['Ahsoka Tano','Ezra Bridger (Exile)','Huyang'],hold:28.0,battles:79100,source:'https://swgoh.gg/tier-list/3v3/?side=defense',note:'Composition fréquemment observée, avec tenue défensive intermédiaire.'},
{format:'3v3',name:'The Stranger · Maul · Starkiller',members:['The Stranger','Maul (Hate-Fueled)','Starkiller'],hold:32.8,battles:83000,source:'https://swgoh.gg/tier-list/3v3/?side=defense',note:'Tenue défensive élevée sur un volume d’observations important.'},
{format:'3v3',name:'Leia · Captain Drogan · R2-D2',members:['Leia Organa','Captain Drogan','R2-D2'],hold:24.5,battles:33000,source:'https://swgoh.gg/tier-list/3v3/?side=defense',note:'Composition observée ; priorité inférieure aux équipes ayant une meilleure tenue.'}

];
// Catalogue saisonnier relevé sur les classements défensifs SWGOH.GG.
// Rang = rang affiché par la page « Best build » ; les saisons récentes passent avant les anciennes.
// Statistiques volontairement conservées par saison : elles ne sont pas fusionnées artificiellement.
publicTeams=publicTeams.filter(function(t){return false;}).concat([
{format:'5v5',season:84,rank:1,name:'Rey · Ben Solo · Cal Kestis · Commander Ahsoka Tano · General Kenobi',members:['Rey','Ben Solo','Cal Kestis','Commander Ahsoka Tano','General Kenobi'],hold:64.8,battles:878,source:'https://swgoh.gg/tier-list/gac/?rank=best&side=defense',note:'S84 · Rang #1 · Elo 2288.'},
{format:'5v5',season:84,rank:2,name:'Baylan Skoll · Chewbacca · Marrok · Shin Hati · Taron Malicos',members:['Baylan Skoll','Chewbacca','Marrok','Shin Hati','Taron Malicos'],hold:34.9,battles:1144,source:'https://swgoh.gg/tier-list/gac/?rank=best&side=defense',note:'S84 · Rang #2 · Elo 2153.'},
{format:'5v5',season:84,rank:3,name:'The Stranger · Barriss Offee · Cal Kestis · Maul · Starkiller',members:['The Stranger','Barriss Offee','Cal Kestis','Maul (Hate-Fueled)','Starkiller'],hold:60.1,battles:150,source:'https://swgoh.gg/tier-list/gac/?rank=best&side=defense',note:'S84 · Rang #3 · Elo 1992 · échantillon limité.'},
{format:'5v5',season:84,rank:4,name:'SLKR · Rey (Dark Side Vision) · Sith Trooper · General Hux · KRU',members:['Supreme Leader Kylo Ren','Rey (Dark Side Vision)','Sith Trooper','General Hux','Kylo Ren (Unmasked)'],hold:46.4,battles:7533,source:'https://swgoh.gg/tier-list/gac/?rank=best&side=defense',note:'S84 · Rang #4 · Elo 1838.'},
{format:'5v5',season:84,rank:5,name:'Leia Organa · Threepio & Chewie · Captain Drogan · Captain Rex · R2-D2',members:['Leia Organa','Threepio & Chewie','Captain Drogan','Captain Rex','R2-D2'],hold:33.5,battles:2038,source:'https://swgoh.gg/tier-list/gac/?rank=best&side=defense',note:'S84 · Rang #5 · Elo 1721.'},
{format:'5v5',season:84,rank:6,name:'Cere Junda · Cal Kestis · KRU · Maul · Taron Malicos',members:['Cere Junda','Cal Kestis','Kylo Ren (Unmasked)','Maul','Taron Malicos'],hold:44.6,battles:2251,source:'https://swgoh.gg/tier-list/gac/?rank=best&side=defense',note:'S84 · Rang #6 · Elo 1708.'},
{format:'5v5',season:82,rank:1,name:'The Stranger · Barriss Offee · Maul · Starkiller · Visas Marr',members:['The Stranger','Barriss Offee','Maul (Hate-Fueled)','Starkiller','Visas Marr'],hold:63.4,battles:1032,source:'https://swgoh.gg/tier-list/gac/?league=chromium&season=82&side=defense',note:'S82 · Rang #1 · Elo 2176.'},
{format:'5v5',season:82,rank:2,name:'SLKR · Rey (Dark Side Vision) · Sith Trooper · General Hux · KRU',members:['Supreme Leader Kylo Ren','Rey (Dark Side Vision)','Sith Trooper','General Hux','Kylo Ren (Unmasked)'],hold:57.7,battles:9549,source:'https://swgoh.gg/tier-list/gac/?league=chromium&season=82&side=defense',note:'S82 · Rang #2 · Elo 2159.'},
{format:'5v5',season:82,rank:3,name:'Ahsoka Tano · Ezra Exile · General Syndulla · Huyang · Padawan Sabine',members:['Ahsoka Tano','Ezra Bridger (Exile)','General Syndulla','Huyang','Padawan Sabine Wren'],hold:48.0,battles:9350,source:'https://swgoh.gg/tier-list/gac/?league=chromium&season=82&side=defense',note:'S82 · Rang #3 · Elo 2065.'},
{format:'5v5',season:82,rank:4,name:'Leia Organa · Captain Drogan · Captain Rex · Old Ben · R2-D2',members:['Leia Organa','Captain Drogan','Captain Rex','Obi-Wan Kenobi (Old Ben)','R2-D2'],hold:46.4,battles:6253,source:'https://swgoh.gg/tier-list/gac/?league=chromium&season=82&side=defense',note:'S82 · Rang #4 · Elo 2036.'},
{format:'5v5',season:82,rank:5,name:'Pirate King Hondo · Brutus · Captain Silvo · SM-33 · Vane',members:['Pirate King Hondo Ohnaka','Brutus','Captain Silvo','SM-33','Vane'],hold:47.7,battles:1048,source:'https://swgoh.gg/tier-list/gac/?league=chromium&season=82&side=defense',note:'S82 · Rang #5 · Elo 2023.'},
{format:'5v5',season:82,rank:6,name:'Lord Vader · Appo · Disguised Clone Trooper · CX-2 · Scorch',members:['Lord Vader','CC-1119 "Appo"','Disguised Clone Trooper','CX-2','RC-1262 "Scorch"'],hold:38.1,battles:22300,source:'https://swgoh.gg/tier-list/gac/?league=chromium&season=82&side=defense',note:'S82 · Rang #6 · Elo 1823.'},
{format:'3v3',season:83,rank:1,name:'Leia Organa · Captain Drogan · R2-D2',members:['Leia Organa','Captain Drogan','R2-D2'],hold:50.1,battles:25300,source:'https://swgoh.gg/tier-list/3v3/?rank=best&side=defense',note:'S83 · Rang #1 · Elo 2723.'},
{format:'3v3',season:83,rank:2,name:'SLKR · Rey (Dark Side Vision) · KRU',members:['Supreme Leader Kylo Ren','Rey (Dark Side Vision)','Kylo Ren (Unmasked)'],hold:54.3,battles:8417,source:'https://swgoh.gg/tier-list/3v3/?rank=best&side=defense',note:'S83 · Rang #2 · Elo 2710.'},
{format:'3v3',season:83,rank:3,name:'Ahsoka Tano · Ezra Exile · Huyang',members:['Ahsoka Tano','Ezra Bridger (Exile)','Huyang'],hold:47.9,battles:3317,source:'https://swgoh.gg/tier-list/3v3/?rank=best&side=defense',note:'S83 · Rang #3 · Elo 2689.'},
{format:'3v3',season:83,rank:4,name:'The Stranger · Maul · Starkiller',members:['The Stranger','Maul (Hate-Fueled)','Starkiller'],hold:58.5,battles:1122,source:'https://swgoh.gg/tier-list/3v3/?rank=best&side=defense',note:'S83 · Rang #4 · Elo 2674.'},
{format:'3v3',season:83,rank:5,name:'Lord Vader · Appo · CX-2',members:['Lord Vader','CC-1119 "Appo"','CX-2'],hold:49.9,battles:13100,source:'https://swgoh.gg/tier-list/3v3/?rank=best&side=defense',note:'S83 · Rang #5 · Elo 2660.'},
{format:'3v3',season:83,rank:6,name:'Rey · Ben Solo · Commander Ahsoka Tano',members:['Rey','Ben Solo','Commander Ahsoka Tano'],hold:48.5,battles:350,source:'https://swgoh.gg/tier-list/3v3/?rank=best&side=defense',note:'S83 · Rang #6 · Elo 2592 · échantillon limité.'},
{format:'3v3',season:81,rank:1,name:'Leia Organa · Captain Drogan · R2-D2',members:['Leia Organa','Captain Drogan','R2-D2'],hold:54.1,battles:23900,source:'https://swgoh.gg/tier-list/3v3/?league=chromium&rank=best&season=81&side=defense',note:'S81 · Rang #1 · Elo 2820.'},
{format:'3v3',season:81,rank:2,name:'Ahsoka Tano · Ezra Exile · Huyang',members:['Ahsoka Tano','Ezra Bridger (Exile)','Huyang'],hold:51.3,battles:2554,source:'https://swgoh.gg/tier-list/3v3/?league=chromium&rank=best&season=81&side=defense',note:'S81 · Rang #2 · Elo 2770.'},
{format:'3v3',season:81,rank:3,name:'The Stranger · Maul · Starkiller',members:['The Stranger','Maul (Hate-Fueled)','Starkiller'],hold:62.2,battles:926,source:'https://swgoh.gg/tier-list/3v3/?league=chromium&rank=best&season=81&side=defense',note:'S81 · Rang #3 · Elo 2733.'},
{format:'3v3',season:81,rank:4,name:'Lord Vader · Appo · CX-2',members:['Lord Vader','CC-1119 "Appo"','CX-2'],hold:50.9,battles:11400,source:'https://swgoh.gg/tier-list/3v3/?league=chromium&rank=best&season=81&side=defense',note:'S81 · Rang #4 · Elo 2705.'},
{format:'3v3',season:81,rank:5,name:'SLKR · Rey (Dark Side Vision) · KRU',members:['Supreme Leader Kylo Ren','Rey (Dark Side Vision)','Kylo Ren (Unmasked)'],hold:52.4,battles:7011,source:'https://swgoh.gg/tier-list/3v3/?league=chromium&rank=best&season=81&side=defense',note:'S81 · Rang #5 · Elo 2685.'},
{format:'3v3',season:81,rank:6,name:'Rey · Ben Solo · Hermit Yoda',members:['Rey','Ben Solo','Hermit Yoda'],hold:48.1,battles:438,source:'https://swgoh.gg/tier-list/3v3/?league=chromium&rank=best&season=81&side=defense',note:'S81 · Rang #6 · Elo 2580 · échantillon limité.'}
,
{format:'5v5',season:84,rank:7,name:'Rotta the Hutt · Boushh · Gamorrean Guard · Mob Enforcer · Krrsantan',members:['Rotta the Hutt','Boushh (Leia Organa)','Gamorrean Guard','Mob Enforcer','Krrsantan'],hold:35.7,battles:398,source:'https://swgoh.gg/tier-list/gac/?rank=best&side=defense',note:'S84 · Rang #7 · Elo 1651 · échantillon limité.'},
{format:'5v5',season:84,rank:8,name:'Jedi Master Luke · General Skywalker · Jedi Knight Cal · Jedi Knight Luke · Leia (Jedi Training)',members:['Jedi Master Luke Skywalker','General Skywalker','Jedi Knight Cal Kestis','Jedi Knight Luke Skywalker','Leia (Jedi Training)'],hold:45.2,battles:194,source:'https://swgoh.gg/tier-list/gac/?rank=best&side=defense',note:'S84 · Rang #8 · Elo 1572 · échantillon limité.'},
{format:'5v5',season:84,rank:9,name:'Third Sister · Grand Inquisitor · Inquisitor Barriss · Ninth Sister · Seventh Sister',members:['Third Sister','Grand Inquisitor','Inquisitor Barriss','Ninth Sister','Seventh Sister'],hold:37.1,battles:3218,source:'https://swgoh.gg/tier-list/gac/?rank=best&side=defense',note:'S84 · Rang #9 · Elo 1548.'},
{format:'5v5',season:82,rank:7,name:'Rotta the Hutt · Cad Bane · Gamorrean Guard · Greedo · Mob Enforcer',members:['Rotta the Hutt','Cad Bane','Gamorrean Guard','Greedo','Mob Enforcer'],hold:46.0,battles:1886,source:'https://swgoh.gg/tier-list/gac/?league=chromium&season=82&side=defense',note:'S82 · Rang #7 · Elo 1819.'},
{format:'5v5',season:82,rank:8,name:'Jedi Master Luke · General Skywalker · Grand Master Yoda',members:['Jedi Master Luke Skywalker','General Skywalker','Grand Master Yoda','Jedi Knight Luke Skywalker','Hermit Yoda'],hold:24.7,battles:224,source:'https://swgoh.gg/tier-list/gac/?league=chromium&season=82&side=defense',note:'S82 · Rang #8 · Elo 1874 · échantillon limité.'},
{format:'5v5',season:82,rank:9,name:'Baylan Skoll · Marrok · Shin Hati · Taron Malicos · Chewbacca',members:['Baylan Skoll','Marrok','Shin Hati','Taron Malicos','Chewbacca'],hold:27.2,battles:12800,source:'https://swgoh.gg/tier-list/gac/?league=chromium&season=82&side=defense',note:'S82 · Rang #9 · Elo 1818.'},
{format:'3v3',season:83,rank:7,name:'Pirate King Hondo · Hondo Ohnaka · Vane',members:['Pirate King Hondo Ohnaka','Hondo Ohnaka','Vane'],hold:34.6,battles:234,source:'https://swgoh.gg/tier-list/3v3/?rank=best&side=defense',note:'S83 · Rang #7 · Elo 2372 · échantillon limité.'},
{format:'3v3',season:83,rank:8,name:'Bastila Shan · Jedi Master Luke · Wat Tambor',members:['Bastila Shan','Jedi Master Luke Skywalker','Wat Tambor'],hold:48.3,battles:1222,source:'https://swgoh.gg/tier-list/3v3/?rank=best&side=defense',note:'S83 · Rang #8 · Elo 2324.'},
{format:'3v3',season:83,rank:9,name:'Sith Eternal Emperor · Darth Malak · Sith Empire Trooper',members:['Sith Eternal Emperor','Darth Malak','Sith Empire Trooper'],hold:42.0,battles:128,source:'https://swgoh.gg/tier-list/3v3/?rank=best&side=defense',note:'S83 · Rang #9 · Elo 2271 · échantillon limité.'},
{format:'3v3',season:81,rank:7,name:'Pirate King Hondo · Hondo Ohnaka · Vane',members:['Pirate King Hondo Ohnaka','Hondo Ohnaka','Vane'],hold:35.4,battles:182,source:'https://swgoh.gg/tier-list/3v3/?league=chromium&rank=best&season=81&side=defense',note:'S81 · Rang #7 · Elo 2367 · échantillon limité.'},
{format:'3v3',season:81,rank:8,name:'Bastila Shan · Jedi Master Luke · Wat Tambor',members:['Bastila Shan','Jedi Master Luke Skywalker','Wat Tambor'],hold:48.6,battles:1220,source:'https://swgoh.gg/tier-list/3v3/?league=chromium&rank=best&season=81&side=defense',note:'S81 · Rang #8 · Elo 2349.'},
{format:'3v3',season:81,rank:9,name:'Jedi Master Kenobi · Commander Ahsoka Tano · General Skywalker',members:['Jedi Master Kenobi','Commander Ahsoka Tano','General Skywalker'],hold:36.6,battles:892,source:'https://swgoh.gg/tier-list/3v3/?league=chromium&rank=best&season=81&side=defense',note:'S81 · Rang #9 · Elo 2322.'}
]);
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

 if(!roster.length){status.textContent='Aucune recommandation affichée : le roster synchronisé n’a pas été reconnu.';results.innerHTML='<div class="empty-state">Roster indisponible ou non reconnu. Charge ton profil dans l’Holocron principal, puis rouvre le Sanctuaire bleu.</div>';return;}
var rosterSet=new Set(roster);
var requiredCounts={'5v5':{Kyber:11,Aurodium:9,Chromium:7,Bronzium:5,Carbonite:3},'3v3':{Kyber:15,Aurodium:13,Chromium:10,Bronzium:7,Carbonite:3}};
var required=(requiredCounts[fmt]&&requiredCounts[fmt][state.tier])||requiredCounts[fmt].Kyber;
var seasons=fmt==='5v5'?[84,82]:[83,81];var ranked=publicTeams.filter(function(t){return t.format===fmt&&seasons.indexOf(t.season)>=0&&Number.isFinite(t.rank);}).map(function(t){return Object.assign({sourceLeague:(Number(t.season)===84||Number(t.season)===83)?'Kyber':'Chromium'},t);}).filter(function(t){return t.sourceLeague===state.tier;}).slice().sort(function(a,b){return Number(b.battles||0)-Number(a.battles||0)||Number(b.hold||0)-Number(a.hold||0)||b.season-a.season||a.rank-b.rank;});
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
 status.textContent='Aucune donnée défensive vérifiée n’est disponible dans le catalogue local pour '+state.tier+' en '+fmt+'. Les instantanés actuels couvrent Kyber (S84/S83) et Chromium (S82/S81) uniquement ; aucune équipe d’une autre ligue ne sera présentée comme adaptée.';
 for(var noSourceIndex=1;noSourceIndex<=required;noSourceIndex++)addUnavailableTeamCard(noSourceIndex);
 return;
}
if(!candidates.length){
 status.textContent='Roster détecté ('+roster.length+' personnages), mais aucune équipe complète du classement actuel ne peut être posée sans doublon.';
 for(var emptyIndex=1;emptyIndex<=required;emptyIndex++)addUnavailableTeamCard(emptyIndex);
 return;
}
status.textContent=candidates.length+' / '+required+' équipes défensives retenues pour '+fmt+' '+state.tier+'. Saisons analysées : '+seasons.map(function(s){return 'S'+s;}).join(' et ')+'. '+skippedMissing+' équipe(s) ignorée(s) faute de personnages ; '+skippedUsed+' ignorée(s) pour éviter les doublons. Catalogue relevé : '+ranked.length+' entrées saisonnières.';

candidates.forEach(function(t,i){
var card=document.createElement('article');card.className='team-card';
var h=document.createElement('h3');h.textContent='Équipe '+(i+1)+' · '+t.name;card.appendChild(h);
var members=document.createElement('div');members.className='team-members';members.textContent=t.members.join(' · ');card.appendChild(members);
var stats=document.createElement('div');stats.className='team-stats';stats.textContent='Ligue '+t.sourceLeague+' · Saison S'+t.season+' · Rang source #'+t.rank+' · Tenue observée : '+t.hold.toFixed(1)+' % · Combats : '+t.battles.toLocaleString('fr-FR');card.appendChild(stats);
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
sync();show(state.access==='Padawan'?'padawan':state.access==='Maître Jedi'?'master':state.tier?'access':state.mode?'tier':'mode');if(state.access==='Padawan')initRosterStatus();if(state.access==='Maître Jedi')document.getElementById('masterConfig').textContent='Configuration : '+(state.mode||'—')+' · '+(state.tier||'—');
})();
