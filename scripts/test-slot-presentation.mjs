import assert from 'node:assert/strict';import {build} from 'esbuild';
const js=(await build({entryPoints:['src/lib/slotPresentation.ts'],bundle:true,write:false,format:'esm'})).outputFiles[0].text;
const p=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
let v=p.initialVisual();const quiet={role:'miss',pending:null,active:null};
assert.equal(p.nextVisual(v,{...quiet,active:'BIG'},()=>.99).stage,'festival');
assert.equal(p.nextVisual(v,{...quiet,pending:'REG'},()=>.99).stage,'sunset');
v=p.nextVisual(v,{...quiet,role:'cherry'},()=>.1);assert.equal(v.stage,'harbor');assert.equal(v.tier,'rare');assert.equal(p.nextVisual(v,{...quiet,highLeft:20},()=>.99).stage,'tide');
for(let i=0;i<12;i++)v=p.nextVisual(v,quiet,()=>.99);assert.notEqual(v.stage,'sunset');assert.equal(v.tension,0);
v=p.initialVisual();const actor=v.actor;for(let i=0;i<18;i++)v=p.nextVisual(v,quiet,()=>.5);assert.notEqual(v.actor,actor);assert.ok(v.actorLeft>=14);
assert.equal(p.nextVisual(p.initialVisual(),quiet,()=>.01).tier,'rare','dramatic misses exist');assert.equal(p.nextVisual(p.initialVisual(),quiet,()=>.1).cue,'crab');
assert.equal(p.nextVisual(p.initialVisual(),quiet,()=>.9).tier,'quiet');
let seed=17;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};let stages=new Set(),actors=new Set(),cues=new Set();v=p.initialVisual();
for(let i=0;i<3000;i++){v=p.nextVisual(v,{...quiet,role:i%19===0?'fish':'miss',highLeft:i%50===0?20:0},random);assert.ok(p.validVisual(v));stages.add(v.stage);actors.add(v.actor);cues.add(v.cue);const miss=p.resolveVisual(v,{payout:0,replay:false,bonusStarted:null});assert.equal(miss.outcome,'miss');assert.ok(!p.visualCaption(miss,3).includes('ボーナス'));}
assert.equal(actors.size,5);assert.ok(stages.size>=4);assert.ok(cues.size>=4);
console.log('PASS: stage transitions, rare-role tension decay, normal/rare miss cues, all 5 actors, saved visual validation, no false bonus caption');
