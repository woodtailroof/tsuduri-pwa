process.on('uncaughtException',e=>{console.error(e.message);console.error(e.stack?.split('\n').filter(l=>!l.includes('data:')).slice(-5).join('\n'));process.exitCode=1;});
import assert from 'node:assert/strict';import {build} from 'esbuild';
async function bundle(path){const js=(await build({entryPoints:[path],bundle:true,write:false,format:'esm'})).outputFiles[0].text;return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));}
const e=await bundle('src/lib/slotGame.ts'),r=await bundle('src/lib/slotRules.ts'),c=await bundle('src/lib/slotChallenges.ts');
const phase={replay:.05,bell:.2,fish:.315,cherry:.33,chance:.341,miss:.99};
const queued=values=>()=>values.length?values.shift():.99999;
for(const high of [false,true])for(const role of Object.keys(phase)){
 const p=r.bonusRate(role,high);
 for(const win of [false,true]){
  const s=e.beginSpin({...e.initialState(),highLeft:high?20:0},queued([phase[role],win?p-1e-8:p,.2,.99,.5,.5]));
  assert.equal(s.spin.role,role);assert.equal(!!s.state.pending,win,`${role} bonus threshold ${p}`);
  if(win){assert.ok(s.state.chance);assert.equal(s.state.announced,false);assert.ok(c.validChallenge(s.state.chance.challenge));}
 }
}
assert.ok(r.ROLE_RULES.fish.rate>r.ROLE_RULES.cherry.rate);assert.ok(r.ROLE_RULES.chance.bonus>r.ROLE_RULES.cherry.bonus&&r.ROLE_RULES.cherry.bonus>r.ROLE_RULES.fish.bonus);
assert.ok(r.ROLE_RULES.chance.high<r.ROLE_RULES.fish.high&&r.ROLE_RULES.fish.high<r.ROLE_RULES.cherry.high);
for(let a=0;a<21;a++)for(let b=0;b<21;b++)for(let d=0;d<21;d++){
 const board=e.evaluateBoard([a,b,d]);if(board.awards.length&&board.awards.every(x=>x.role===board.awards[0].role))assert.equal(board.payout,r.ROLE_RULES[board.awards[0].role].pay,'per-game fixed payout');
}
const orders=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
for(const order of orders)for(let boundary=0;boundary<21;boundary++){
 let s=e.beginSpin(e.initialState(),()=>.99);s.spin.role='chance';
 for(const reel of order)s=e.stopReel(s,reel,(boundary+reel*7)%21+.5);
 const done=e.settleSpin(s);assert.equal(done.result.payout,0);assert.ok(done.result.chanceEye);assert.ok(done.result.board.chancePattern);assert.equal(done.result.board.bonus,null);
}
// Correct left bonus aim: chance eyes slide to the fish, while ordinary misses keep lower bonus.
for(const anchor of [3,10])for(const role of ['miss','chance']){let s=e.beginSpin(e.initialState(),()=>.99);s.spin.role=role;s=e.stopReel(s,0,anchor+.5);const cells=e.visibleSymbols(0,s.spin.stops[0]);if(role==='chance'){assert.ok(cells.includes(1));assert.ok(!cells.includes(0)&&!cells.includes(5));}else assert.equal(s.spin.stops[0],anchor-1);}
let dropped=e.beginSpin(e.initialState(),()=>.99);dropped.spin.role='fish';findMiss:for(let a=0;a<21;a++)for(let b=0;b<21;b++)for(let d=0;d<21;d++){const board=e.evaluateBoard([a,b,d]);if(board.chancePattern&&e.legalBoard(board,dropped.spin)){dropped.spin.stops=[a,b,d];break findMiss;}}const miss=e.settleSpin(dropped);assert.equal(miss.result.chanceEye,false);assert.equal(miss.result.title,'スイカ取りこぼし');
// Role-driven high-stage transition survives a small-role miss and a saved spin.
let high=e.beginSpin(e.initialState(),queued([.33,.99,0,.99]));assert.ok(high.spin.highTriggered);high=e.readSession(JSON.stringify(high));for(let reel=0;reel<3;reel++)high=e.stopReel(high,reel,3.5);let done=e.settleSpin(high);assert.equal(done.session.state.highLeft,20);assert.ok(done.result.highEntered);high=e.beginSpin(done.session.state,()=>.99);for(let reel=0;reel<3;reel++)high=e.stopReel(high,reel,3.5);assert.equal(e.settleSpin(high).session.state.highLeft,19);
const saved=e.initialSession();saved.layoutVersion=5;saved.state.pending='REG';saved.state.announced=false;saved.state.chance={left:3,total:6,mode:'float'};delete saved.state.highLeft;const migrated=e.readSession(JSON.stringify(saved));assert.equal(migrated.state.pending,'REG');assert.equal(migrated.state.chance.left,3);assert.equal(migrated.state.announced,false);assert.equal(migrated.state.highLeft,0);
let seed=23;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32};
const buckets=new Map(),seen=new Set();for(let i=0;i<160000;i++){
 const win=random()<r.bonusRate('chance');if(!win&&random()>=r.ROLE_RULES.chance.tease)continue;
 const chosen=c.chooseChallenge('chance',false,win,random);assert.ok(c.validChallenge(chosen));seen.add(`${chosen.id}:${chosen.actor}:${win}`);
 const b=buckets.get(chosen.stars)??{n:0,wins:0,expected:0};b.n++;b.wins+=win;b.expected+=chosen.expectation;buckets.set(chosen.stars,b);
}
assert.equal(seen.size,50,'every challenge + actor can both win and lose');
let previous=-1;for(const [stars,b] of [...buckets].sort((a,b)=>a[0]-b[0])){const actual=b.wins/b.n;assert.ok(actual>previous);assert.ok(Math.abs(actual-b.expected/b.n)<.02,`star ${stars} reflects observed initial winning rate`);previous=actual;}
assert.ok(buckets.get(5).wins<buckets.get(5).n);assert.ok(buckets.get(1).wins>0);
console.log('PASS: role-specific bonus/high thresholds, 6/2/10 fixed payouts, 126 chance-eye stop sequences, no fake chance from fish miss, high-stage/save/migration, 160k weighted challenge selections calibrated to stars');
