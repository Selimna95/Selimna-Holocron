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
vm.runInContext(seigneurSource.slice(priorityStart,priorityEnd)+'\\nthis.priority=seigneurDonorPriority;',prioritySandbox);
const stalePriority=prioritySandbox.priority({baseId:'REY'},{sourceStatus:'stale',formatSeasons:{}});
assert.equal(stalePriority.known,false,'Stale GAC snapshots must never rank donors');
assert.match(stalePriority.reason,/périmées/i);
const freshPriority=prioritySandbox.priority({baseId:'REY'},{sourceStatus:'observed',formatSeasons:{}});
assert.equal(freshPriority.known,true,'Fresh observed GAC data remains eligible for donor ranking');
