import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
function extractFunction(source,name){
  const marker='function '+name+'(';
  const start=source.indexOf(marker);
  assert.notEqual(start,-1,'Missing function '+name);
  const open=source.indexOf('{',start+marker.length);
  let depth=0;
  for(let i=open;i<source.length;i++){
    const ch=source[i],next=source[i+1];
    if(ch==='/'&&next==='/'){i+=2;while(i<source.length&&source[i]!=='\n')i++;continue;}
    if(ch==='/'&&next==='*'){i+=2;while(i<source.length-1&&!(source[i]==='*'&&source[i+1]==='/'))i++;i++;continue;}
    if(ch==="'"||ch==='"'||ch==='\x60'){
      const quote=ch;
      for(i++;i<source.length;i++){if(source[i]==='\\'){i++;continue;}if(source[i]===quote)break;}
      continue;
    }
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error('Unclosed '+name);
}
const seigneur=read('../modules/seigneur.js');
const impact=read('../modules/seigneur-impact.js');
const core=read('../modules/core.js');
const compactKey=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const numericValue=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const modTotalSpeed=m=>Number(m?.speed||0);
const optimizerSlotKey=v=>String(v||'');
const roster=[
  {baseId:'TARGET',name:'Target',base_stats:{Speed:100}},
  {baseId:'DONOR',name:'Donor',base_stats:{Speed:100}}
];
const equipped={
  TARGET:['Square','Arrow','Diamond','Triangle','Circle','Cross'].map(slot=>({id:'t-'+slot,game_id:'t-'+slot,character:'TARGET',slot,set_name:'Offense',speed:10})),
  DONOR:['Square','Arrow','Diamond','Triangle','Circle','Cross'].map((slot,i)=>({id:'d-'+slot,game_id:'d-'+slot,character:'DONOR',slot,set_name:'Offense',speed:[2,3,4,5,6,7][i]}))
};
const context=vm.createContext({
  compactKey,numericValue,modTotalSpeed,optimizerSlotKey,
  rosterCharacters:roster,
  getCharacterMods:c=>equipped[c.baseId]||[],
  optimizerProfileForCharacter:c=>({base_stats:c.base_stats||{}}),
  forgeSpeedSetCount:list=>list.filter(m=>m.set_name==='Speed').length,
  v176ModStatus:list=>({status:list.length===6?'FAIBLES':list.length?'INCOMPLETS':'SANS MODS'}),
  seigneurDonorPriority:c=>({known:true,uses:c.baseId==='TARGET'?100:10}),
  seigneurLatestGacUsageSeason:()=>({evidenceType:'defense-composition',sourceStatus:'partial'}),
  buildRosterOwnerResolver:characters=>({resolve:value=>{
    const raw=typeof value==='object'?(value.baseId||value.name):value;
    return characters.find(c=>compactKey(c.baseId)===compactKey(raw))?.baseId||'';
  }}),
  resolveModOwnerKey:(mod,resolver)=>resolver.resolve(mod.character||mod.baseId),
  characterKey:c=>compactKey(c.baseId),
  num:(v,d=0)=>Number(v||0).toFixed(d),
  esc:v=>String(v??'')
});
vm.runInContext([
  extractFunction(seigneur,'forgeProjectedModSpeed'),
  extractFunction(impact,'forgeBuildPreservesSpeed'),
  extractFunction(impact,'forgeBuildGlobalImpact'),
  extractFunction(impact,'forgeBuildGlobalImpactMarkup')
].join('\n'),context);

const current=equipped.TARGET;
const safeBuild=[...current.slice(0,5),{id:'d-Cross',game_id:'d-Cross',character:'DONOR',slot:'Cross',set_name:'Offense',speed:15}];
const unsafeBuild=[...current.slice(0,5),{id:'d-Cross',game_id:'d-Cross',character:'DONOR',slot:'Cross',set_name:'Offense',speed:5}];
assert.equal(context.forgeBuildPreservesSpeed(roster[0],{base_stats:{Speed:100}},current,safeBuild),true);
assert.equal(context.forgeBuildPreservesSpeed(roster[0],{base_stats:{Speed:100}},current,unsafeBuild),false,
  'A six-mod build that reduces the recipient speed must be rejected');
assert.equal(context.forgeBuildPreservesSpeed(roster[0],{base_stats:{Speed:100}},current,[...current.slice(0,5),{slot:'Circle',speed:20}]),false,
  'A six-mod build with a duplicate slot must be rejected');

const speedSetCurrent=current.map((m,i)=>({...m,set_name:i<4?'Speed':'Offense'}));
const speedSetReplacement=speedSetCurrent.map((m,i)=>({...m,set_name:i===0?'Offense':m.set_name}));
assert.equal(context.forgeBuildPreservesSpeed({baseId:'TARGET'}, {}, speedSetCurrent,speedSetReplacement),false,
  'Losing a four-piece Speed set is unsafe when base speed is unknown');

const impactData=context.forgeBuildGlobalImpact(roster[0],{base_stats:{Speed:100}},safeBuild);
assert.equal(impactData.targetSpeedGain,5);
assert.equal(impactData.donors.length,1);
assert.equal(impactData.donors[0].modsTaken,1);
assert.equal(impactData.donors[0].beforeCount,6);
assert.equal(impactData.donors[0].afterCount,5);
assert.equal(impactData.donors[0].speedLoss,7);
assert.equal(impactData.donors[0].statusWorsened,true);
assert.equal(impactData.priorityGap,90);
const markup=context.forgeBuildGlobalImpactMarkup(impactData);
assert.match(markup,/BILAN GLOBAL DU TRANSFERT/);
assert.match(markup,/DONNEUR\(S\) FRAGILISÉ\(S\)/);
assert.match(markup,/Signal GAC issu des compositions défensives/);

const donorPriority = extractFunction(seigneur,'seigneurDonorPriority');
context.seigneurCharacterGacUsage=()=>80;
context.seigneurCharacterFleetUsage=()=>({uses:null,known:false,shipCount:0,reason:'Correspondance pilotes/vaisseaux indisponible'});
context.seigneurLatestGacUsageSeason=()=>({sourceStatus:'partial',formatSeasons:{'5v5':84,'3v3':83}});
vm.runInContext(donorPriority,context);
const terrestrialOnly=context.seigneurDonorPriority({baseId:'DONOR'});
assert.equal(terrestrialOnly.known,true,
  'Verified terrestrial GAC evidence must keep a donor eligible when fleet metadata is absent');
assert.equal(terrestrialOnly.uses,80,
  'When fleet usage is unknown, rank by observed terrestrial usage only');
assert.equal(terrestrialOnly.fleetKnown,false);
assert.equal(terrestrialOnly.fleetUses,null);
assert.match(terrestrialOnly.reason,/terrestre uniquement/);

context.seigneurCharacterFleetUsage=()=>({uses:null,known:false,shipCount:1,reason:'Utilisation GAC du vaisseau indisponible'});
const mappedPilotButMissingFleet=context.seigneurDonorPriority({baseId:'DONOR'});
assert.equal(mappedPilotButMissingFleet.known,false,
  'A pilot with a known ship association but missing ship usage must remain protected');
assert.equal(mappedPilotButMissingFleet.fleetKnown,false);
assert.match(mappedPilotButMissingFleet.reason,/Pilote identifié/);

context.seigneurCharacterGacUsage=()=>null;
const noLandEvidence=context.seigneurDonorPriority({baseId:'UNKNOWN'});
assert.equal(noLandEvidence.known,false,
  'Without terrestrial GAC evidence, a roster character must not be promoted as a verified donor');

console.log('Seigneur global impact tests passed.');