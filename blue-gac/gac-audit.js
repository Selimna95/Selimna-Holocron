(function(root){
'use strict';
function norm(value){return String(value||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');}
var leagues=['Kyber','Aurodium','Chromium','Bronzium','Carbonite'];
var sizes={'3v3':3,'5v5':5};
var required={'5v5':{Kyber:11,Aurodium:9,Chromium:7,Bronzium:5,Carbonite:3},'3v3':{Kyber:15,Aurodium:13,Chromium:10,Bronzium:7,Carbonite:3}};
function auditCatalog(catalog,rosterNames){
 var checks=[],teams=catalog&&Array.isArray(catalog.teams)?catalog.teams:[],errors=0,warnings=0;
 function add(level,title,detail){checks.push({level:level,title:title,detail:detail});if(level==='error')errors++;if(level==='warning')warnings++;}
 if(!catalog||catalog.schemaVersion!==1||!Array.isArray(catalog.teams)){add('error','Structure du catalogue','Le schéma ou le tableau des compositions est absent ou non reconnu.');return {checks:checks,errors:errors,warnings:warnings,teamCount:0,selections:[]};}
 add('success','Structure','Catalogue V'+catalog.schemaVersion+' · '+teams.length+' compositions analysées.');
 if(catalog.collectionStatus==='partial')add('warning','Collecte partielle',catalog.collectionNote||'Certaines données publiques sont manquantes.');else if(catalog.collectionStatus!=='complete')add('warning','État de collecte','État déclaré : '+String(catalog.collectionStatus||'inconnu')+'.');
 var seenTeams=new Set(),invalid=0,duplicates=0;
 teams.forEach(function(row){
  var t=row&&typeof row==='object'?row:{},fmt=t.format,league=t.league,expected=sizes[fmt],members=Array.isArray(t.members)?t.members:[];
  var valid=!!expected&&leagues.indexOf(league)>=0&&Number.isInteger(Number(t.season))&&Number(t.season)>0&&Number.isInteger(Number(t.rank))&&Number(t.rank)>0&&members.length===expected&&members.every(Boolean)&&new Set(members.map(norm)).size===members.length&&t.hold!==null&&t.hold!==undefined&&Number.isFinite(Number(t.hold))&&Number(t.hold)>=0&&Number(t.hold)<=100&&t.battles!==null&&t.battles!==undefined&&Number.isFinite(Number(t.battles))&&Number(t.battles)>0&&typeof t.source==='string'&&/^https:\/\/swgoh\.gg\//.test(t.source);
  if(!valid)invalid++;
  var key=[fmt,league,t.season,members.map(norm).sort().join('|')].join('::');
  if(seenTeams.has(key))duplicates++;else seenTeams.add(key);
 });
 if(invalid)add('error','Compositions invalides',invalid+' ligne(s) ne respectent pas le format attendu (taille, membres, saison, rang, statistiques ou source).');else add('success','Intégrité des compositions','Toutes les lignes ont le bon nombre de personnages et des métadonnées exploitables.');
 if(duplicates)add('error','Compositions en double',duplicates+' doublon(s) exact(s) détecté(s) dans une même ligue et saison.');else add('success','Unicité','Aucune composition identique répétée dans une même ligue et saison.');
 ['3v3','5v5'].forEach(function(fmt){
  var current=Number(catalog.currentSeasons&&catalog.currentSeasons[fmt])||0;
  if(!current)add('error','Saison actuelle '+fmt,'La saison prioritaire n’est pas renseignée.');
  leagues.forEach(function(league){
   var key=league.toLowerCase(),actual=teams.filter(function(t){return t&&t.format===fmt&&t.league===league;});
   var declared=Number(catalog.coverage&&catalog.coverage[fmt]&&catalog.coverage[fmt][key]);
   if(!Number.isFinite(declared)||declared!==actual.length)add('error','Couverture '+fmt+' · '+league,'Le catalogue déclare '+String(declared)+' ligne(s), mais '+actual.length+' sont réellement présentes.');
   var actualSeasons=Array.from(new Set(actual.map(function(t){return Number(t.season);}))).sort(function(a,b){return b-a;});
   var declaredSeasons=(catalog.seasons&&catalog.seasons[fmt]&&catalog.seasons[fmt][key]||[]).map(Number).sort(function(a,b){return b-a;});
   if(JSON.stringify(actualSeasons)!==JSON.stringify(declaredSeasons))add('error','Saisons '+fmt+' · '+league,'Les saisons déclarées ne correspondent pas aux lignes du catalogue.');
   if(!actual.length)add('warning','Données absentes '+fmt+' · '+league,'Aucune composition collectée pour cette ligue ; aucune équipe ne doit être inventée.');
   else if(actual.every(function(t){return Number(t.season)!==current;}))add('warning','Saison prioritaire absente '+fmt+' · '+league,'Aucune ligne de la saison S'+current+' ; le moteur ne peut utiliser que les saisons historiques disponibles.');
  });
 });
 var roster=(Array.isArray(rosterNames)?rosterNames:[]).map(norm).filter(Boolean),rosterSet=new Set(roster);
 var selections=[];
 if(rosterSet.size){
  ['3v3','5v5'].forEach(function(fmt){leagues.forEach(function(league){
   var current=Number(catalog.currentSeasons&&catalog.currentSeasons[fmt])||0;
   var ranked=teams.filter(function(t){return t&&t.format===fmt&&t.league===league&&Number.isFinite(Number(t.rank));}).slice().sort(function(a,b){return Number(b.season||0)-Number(a.season||0)||Number(b.battles||0)-Number(a.battles||0)||Number(b.hold||0)-Number(a.hold||0)||Number(a.rank)-Number(b.rank);});
   var used=new Set(),selected=[],missing=0,overlap=0,limit=required[fmt][league];
   ranked.forEach(function(t){if(selected.length>=limit)return;var members=(Array.isArray(t.members)?t.members:[]).map(norm);if(!members.length||!members.every(function(m){return rosterSet.has(m);})){missing++;return;}if(members.some(function(m){return used.has(m);})){overlap++;return;}selected.push(t);members.forEach(function(m){used.add(m);});});
   var badOrder=false,oldSeen=false;selected.forEach(function(t){if(Number(t.season)!==current)oldSeen=true;else if(oldSeen)badOrder=true;});
   selections.push({format:fmt,league:league,required:limit,selected:selected.length,missing:missing,overlap:overlap,priorityOk:!badOrder,seasons:Array.from(new Set(selected.map(function(t){return Number(t.season);}))).sort(function(a,b){return b-a;}),teams:selected});
   if(badOrder)add('error','Priorité saison '+fmt+' · '+league,'Une équipe historique précède une équipe de la saison actuelle.');
  });});
  add('success','Simulation roster','Sélection simulée pour les 10 couples format/ligue avec '+rosterSet.size+' personnages distincts du roster.');
 }else add('warning','Simulation roster','Aucun roster détecté : l’intégrité du catalogue est contrôlée, mais la disponibilité réelle des équipes ne peut pas être simulée.');
 return {checks:checks,errors:errors,warnings:warnings,teamCount:teams.length,selections:selections};
}

function wilsonInterval(rate,total){
 var n=Number(total),p=Number(rate)/100,z=1.96;
 if(!Number.isFinite(n)||n<=0||!Number.isFinite(p)||p<0||p>1)return null;
 var z2=z*z,den=1+z2/n,center=(p+z2/(2*n))/den;
 var half=z*Math.sqrt((p*(1-p)+z2/(4*n))/n)/den;
 return {low:Math.max(0,center-half)*100,high:Math.min(1,center+half)*100,margin:half*100};
}
function analyzePerformance(catalog){
 var teams=catalog&&Array.isArray(catalog.teams)?catalog.teams:[];
 var groups={};
 teams.forEach(function(t){var key=[t.format,t.league,t.season].join('::');(groups[key]||(groups[key]=[])).push(t);});
 var items=teams.map(function(t){
  var key=[t.format,t.league,t.season].join('::'),peers=groups[key].filter(function(other){return other!==t;});
  var peerBattles=peers.reduce(function(sum,x){return sum+Number(x.battles||0);},0);
  var baseline=peerBattles?peers.reduce(function(sum,x){return sum+Number(x.hold||0)*Number(x.battles||0);},0)/peerBattles:null;
  var interval=wilsonInterval(t.hold,t.battles),delta=baseline===null?null:Number(t.hold)-baseline;
  var confidence=!interval?'indisponible':interval.margin<=2.5?'élevée':interval.margin<=5?'moyenne':'limitée';
  var signal=delta===null?'non comparable':delta>=5?'au-dessus des pairs':delta<=-5?'en dessous des pairs':'proche des pairs';
  return {format:t.format,league:t.league,season:Number(t.season),name:t.name,members:t.members,hold:Number(t.hold),battles:Number(t.battles),rank:Number(t.rank),source:t.source,baseline:baseline,delta:delta,interval:interval,confidence:confidence,signal:signal};
 });
 return {items:items,comparable:items.filter(function(x){return x.delta!==null;}).length};
}

root.GACAudit={auditCatalog:auditCatalog,analyzePerformance:analyzePerformance,wilsonInterval:wilsonInterval,requiredCounts:required};
})(typeof window!=='undefined'?window:globalThis);
