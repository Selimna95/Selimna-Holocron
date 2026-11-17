import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../modules/seigneur-gac.js',import.meta.url),'utf8');
const teams=[
  {format:'5v5',league:'Kyber',season:84,battles:1000,members:['Target','Donor','Third','Fourth','Fifth'],source:'https://swgoh.gg/a'},
  {format:'5v5',league:'Aurodium',season:84,battles:500,members:['Target','Donor','Sixth','Seventh','Eighth'],source:'https://swgoh.gg/b'},
  {format:'3v3',league:'Kyber',season:83,battles:700,members:['Target','Ninth','Tenth'],source:'https://swgoh.gg/c'},
  {format:'5v5',league:'Kyber',season:83,battles:900,members:['Historical Only','Donor','A','B','C'],source:'https://swgoh.gg/d'}
];
const catalog={collectionStatus:'partial',updatedAt:'2026-11-04T10:00:00Z',currentSeasons:{'5v5':84,'3v3':83},teams};
const window={__SWGOH_GAC_USAGE__:{seasons:[]},dispatchEvent(){}};
const context=vm.createContext({
  window,document:{baseURI:'https://example.test/'},
  fetch:async()=>({ok:true,json:async()=>catalog}),
  URL,CustomEvent:function CustomEvent(type,init){this.type=type;this.detail=init?.detail;}
});
vm.runInContext(source,context);
const built=await window.__SWGOH_GAC_USAGE_READY__;
assert.equal(built.sourceStatus,'partial');
assert.equal(built.evidenceType,'defense-composition');
assert.deepEqual(JSON.parse(JSON.stringify(built.currentSeasons)),{'5v5':84,'3v3':83});
const current84=built.seasons.find(s=>s.season===84);
assert.equal(current84.characters.Target.byFormat['5v5'],1500);
const current83=built.seasons.find(s=>s.season===83);
assert.equal(current83.characters.Target.byFormat['3v3'],700);
assert.equal(current84.characters.Target.uses,1500);
assert.equal(current83.characters.Target.uses,700);
assert.equal(current84.characters['Historical Only'],undefined,'Historical rows stay in their original season');
assert.equal(current83.characters['Historical Only'].uses,900,'Historical observations are retained for fallback');
const target=window.holocronGacPriorityForCharacter({baseId:'TARGET',name:'Target'});
assert.equal(target.known,true);
assert.equal(target.uses,2200);
assert.equal(target.defenseOnly,true);
assert.deepEqual(Array.from(target.evidence),['5v5 S84','3v3 S83']);
const historical=window.holocronGacPriorityForCharacter({baseId:'HISTORICAL',name:'Historical Only'});
assert.equal(historical.known,true);
assert.equal(historical.uses,900,'Historical usage fills a missing current-season observation');
assert.deepEqual(Array.from(historical.evidence),['5v5 S83']);
const missing=window.holocronGacPriorityForCharacter({baseId:'NOTINCATALOG',name:'Not in catalog'});
assert.equal(missing.known,false);
assert.equal(missing.uses,null,'Missing characters remain unknown, never zero');
console.log('Seigneur GAC bridge tests passed.');
const seigneurSource=fs.readFileSync(new URL('../modules/seigneur.js',import.meta.url),'utf8');
const priorityStart=seigneurSource.indexOf('function seigneurDonorPriority(');
const priorityEnd=seigneurSource.indexOf('function forgeSourceStatusAllowed(',priorityStart);
assert.ok(priorityStart>=0&&priorityEnd>priorityStart,'Donor priority function must remain testable');
const prioritySandbox=vm.createContext({
  seigneurCharacterGacUsage:()=>10,
  seigneurCharacterFleetUsage:()=>({uses:0,known:true,shipCount:0,reason:'No assigned ship'}),
});
vm.runInContext(seigneurSource.slice(priorityStart,priorityEnd)+'\nthis.priority=seigneurDonorPriority;',prioritySandbox);
const stalePriority=prioritySandbox.priority({baseId:'REY'},{sourceStatus:'stale',formatSeasons:{}});
assert.equal(stalePriority.known,false,'Stale GAC snapshots must never rank donors');
assert.match(stalePriority.reason,/périmées/i);
const freshPriority=prioritySandbox.priority({baseId:'REY'},{sourceStatus:'observed',formatSeasons:{}});
assert.equal(freshPriority.known,true,'Fresh observed GAC data remains eligible for donor ranking');


// Real roster exports may omit ship crew arrays. Recover pilot links from the
// canonical game-data map and include verified fleet usage in donor priority.
const crewStart=seigneurSource.indexOf('const SEIGNEUR_SHIP_CREW_BY_BASE_ID =');
const crewEnd=seigneurSource.indexOf('function seigneurDonorPriority(',crewStart);
assert.ok(crewStart>=0&&crewEnd>crewStart,'Canonical ship-to-crew map and fleet resolver must exist');
const crewSandbox=vm.createContext({
  compactKey:value=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,''),
  rosterShips:[{baseId:'HOUNDSTOOTH',name:"Hound's Tooth",raw:{}}],
});
vm.runInContext(seigneurSource.slice(crewStart,crewEnd)+
  '\nthis.fleetUsage=seigneurCharacterFleetUsage;this.shipCrew=seigneurShipCrewAliases;this.shipUsageMap=seigneurShipUsageMap;',crewSandbox);
const mappedFleet=crewSandbox.fleetUsage(
  {baseId:'BOSSK',name:'Bossk'},
  {ships:{"Hound's Tooth":{uses:77}},fleets:[]}
);
assert.equal(mappedFleet.known,true,'A roster ship with canonical crew metadata must be associated to its pilot');
assert.equal(mappedFleet.uses,77,'The pilot must inherit the observed GAC usage of their owned ship');
assert.equal(mappedFleet.shipCount,1);
assert.deepEqual(Array.from(crewSandbox.shipCrew(crewSandbox.rosterShips[0])),['BOSSK']);
const missingFleet=crewSandbox.fleetUsage(
  {baseId:'BOSSK',name:'Bossk'},
  {ships:{},fleets:[]}
);
assert.equal(missingFleet.known,false,'An owned pilot ship with no observed GAC usage remains unknown, never zero');
assert.equal(missingFleet.shipCount,1);
assert.equal(crewSandbox.shipCrew({baseId:'YWINGREBEL',name:'Rebel Y-wing',raw:{}}).length,0,
  'Crewless ships must not be assigned an invented pilot');
assert.equal(crewSandbox.shipCrew({baseId:'BWINGREBEL',name:'Rebel B-wing',raw:{}})[0],'CAPTAINDROGAN',
  'The canonical mapping must include ships beyond the sample pilot');

const aggregatedShipUsage=crewSandbox.shipUsageMap({
  ships:{"Hound's Tooth":{uses:77}},
  fleets:[{uses:77,ships:["Hound's Tooth"]}]
});
assert.equal(aggregatedShipUsage.get('HOUNDSTOOTH'),77,
  'Fleet compositions must not be added again when the aggregate ship total already exists');
const fallbackShipUsage=crewSandbox.shipUsageMap({
  ships:{},
  fleets:[{uses:20,ships:["Hound's Tooth"]},{uses:30,ships:["Hound's Tooth"]}]
});
assert.equal(fallbackShipUsage.get('HOUNDSTOOTH'),50,
  'Fleet compositions must still aggregate when the explicit ship totals are absent');

const actualGacData=JSON.parse(fs.readFileSync(new URL('../gac-usage.json',import.meta.url),'utf8'));
const actualSeason84=actualGacData.seasons.find(season=>Number(season.season)===84);
assert.ok(actualSeason84&&Object.keys(actualSeason84.ships||{}).length>0,'The repository must expose its observed season-84 ship totals');
const actualUsageMap=crewSandbox.shipUsageMap(actualSeason84);
const canonicalShipKey=value=>String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
for(const [shipName,record] of Object.entries(actualSeason84.ships||{})){
  const compositionTotal=(actualSeason84.fleets||[]).reduce((sum,fleet)=>{
    const ships=fleet?.ships||fleet?.units||[];
    return ships.some(ship=>canonicalShipKey(ship)===canonicalShipKey(shipName))
      ?sum+(Number(fleet.uses)||0):sum;
  },0);
  assert.equal(compositionTotal,Number(record.uses),
    'Observed season-84 fleet composition sum must match the stored ship aggregate for '+shipName);
  assert.equal(actualUsageMap.get(canonicalShipKey(shipName)),Number(record.uses),
    'The donor usage map must not double-count actual season-84 ship usage for '+shipName);
}
