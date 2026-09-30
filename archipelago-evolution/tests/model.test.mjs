import assert from 'node:assert/strict';
import '../dist/model.js';
const E=globalThis.EvoLab;
const tests=E.selfTests();
for(const test of tests){console.log(`${test.pass?'PASS':'FAIL'} ${test.name}: ${test.detail}`);assert.ok(test.pass,test.name);}

// These checks address scientific failure modes independently of the UI.
const rand=E.rng('poisson-moments'),values=Array.from({length:20000},()=>E.poisson(55,rand));
const mean=values.reduce((a,b)=>a+b,0)/values.length,variance=values.reduce((s,x)=>s+(x-mean)**2,0)/(values.length-1);
assert.ok(Math.abs(mean-55)<.4);assert.ok(Math.abs(variance-55)<2.5);
console.log(`PASS Poisson(55) moments: mean=${mean.toFixed(3)}, variance=${variance.toFixed(3)}`);

const migrant=E.createWorld('migration-on',{selection:0,migration:1,mutation:0});
E.step(migrant);assert.ok(migrant.lastMigration.length>0);assert.equal(migrant.lastMigration.length,migrant.islands.flat().length);
console.log('PASS Migration probability 1 moves every juvenile to a connected other island');

const neutral=E.createWorld('drift-without-selection',{selection:0,mutation:0,migration:0});
const original=E.metrics(neutral).islands[0].alleleFreq;
for(let g=0;g<15;g++)E.step(neutral);
assert.notDeepEqual(E.metrics(neutral).islands[0].alleleFreq,original);
console.log('PASS Neutral allele frequencies drift without mutation or selection');

const zero=E.createWorld('zero',{mutation:0,migration:0});
for(let i=0;i<3;i++)E.applyAction(zero,{type:'bottleneck',island:i,survivors:0});
for(let g=0;g<10;g++)E.step(zero);
assert.equal(E.metrics(zero).total,0);assert.equal(E.metrics(zero).diversity,null);assert.equal(E.metrics(zero).divergence,null);
console.log('PASS Global extinction remains absorbing and undefined metrics stay null');

const probe=E.createWorld('invalid-input'),snapshot=JSON.stringify(probe);
assert.throws(()=>E.applyAction(probe,{type:'environment',island:0,values:[-1,.5]}));assert.equal(JSON.stringify(probe),snapshot);
assert.throws(()=>E.applyAction(probe,{type:'parameters',mutation:-.1}));assert.equal(JSON.stringify(probe),snapshot);
console.log('PASS Invalid interventions do not corrupt the world');

for(const type of ['migration','selection','bottleneck']){
  const res=[];
  for(let j=1;j<=20;j++)res.push(E.runReplicate(type,'ISLAND-PAIR-01|replicate|'+j,100));
  const metric={migration:'divergence',selection:'mismatch',bottleneck:'diversity'}[type];
  const valid=res.filter(r=>r.a[metric]!==null&&r.b[metric]!==null),diff=valid.map(r=>r.a[metric]-r.b[metric]);
  const summary={experiment:type,metric,valid:valid.length,replicates:res.length,meanDifference:diff.reduce((s,x)=>s+x,0)/diff.length,
    meanPopulationA:res.reduce((s,r)=>s+r.a.total,0)/res.length,meanPopulationB:res.reduce((s,r)=>s+r.b.total,0)/res.length};
  console.log('OBSERVED '+JSON.stringify(summary));
  assert.equal(res.length,20);assert.ok(res.every(r=>r.a.generation===100&&r.b.generation===100));
  // No assertion enforces a preferred scientific outcome.
}
console.log(`ALL ${tests.length+5} INVARIANT CHECKS PASSED; 60 paired experiments completed`);
