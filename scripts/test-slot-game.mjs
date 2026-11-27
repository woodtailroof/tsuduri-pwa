import assert from 'node:assert/strict';
import { build } from 'esbuild';
const code=(await build({entryPoints:['src/lib/slotGame.ts'],bundle:true,write:false,platform:'node',format:'esm'})).outputFiles[0].text;
const e=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
let seed=29;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
const orders=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
assert.equal(e.REEL_STRIPS.length,3);for(const strip of e.REEL_STRIPS)assert.equal(strip.length,21);
assert.notDeepEqual(e.REEL_STRIPS[0],e.REEL_STRIPS[1]);
let lines=new Set(),bonusTypes=new Set();
for(let a=0;a<21;a++)for(let b=0;b<21;b++)for(let c=0;c<21;c++){
 const board=e.evaluateBoard([a,b,c]);assert.ok(board.payout<=15);board.awards.forEach(v=>lines.add(v.line));if(board.bonus)bonusTypes.add(board.bonus);
 assert.ok(board.awards.filter(v=>v.role==='cherry').length<=1);
}
assert.equal(lines.size,5);assert.deepEqual([...bonusTypes].sort(),['BIG','REG']);
let s=e.initialSession(),settled=0,bb=0,rb=0,replays=0,misses=0;const begin=performance.now();
for(let game=0;game<20000;game++){
 const cost=s.state.active?1:s.state.replay?0:3;
 if(s.state.credit<cost)s=e.initialSession();
 const before=s.state;s=e.beginSpin(s.state,random);assert.equal(s.state.credit,before.credit-s.spin.cost);
 // A saved spin retains its role and stops; duplicate button input does nothing.
 const persisted=e.readSession(JSON.stringify(s));assert.deepEqual(persisted.spin.stops,s.spin.stops);assert.equal(persisted.spin.role,s.spin.role);
 for(const reel of orders[game%6]){
   const current=random()*420-210;let next;try{next=e.stopReel(s,reel,current)}catch{throw new Error(JSON.stringify({game,reel,current,role:s.spin.role,stops:s.spin.stops,pending:s.state.pending}))}const p=next.spin.stops[reel];
   assert.ok(e.modulo(Math.floor(current)-p)<=4,'maximum four-symbol slip');
   assert.equal(e.stopReel(next,reel,current),next);s=next;
 }
 assert.ok(e.legalBoard(e.evaluateBoard(s.spin.stops),s.spin));
 const done=e.settleSpin(s);assert.equal(done.session.state.credit,s.state.credit+done.result.payout);
 if(done.result.replay){replays++;assert.equal(e.beginSpin(done.session.state,()=>.99).spin.cost,0)}
 if(s.state.pending&&!done.result.bonusStarted)assert.equal(done.session.state.pending,s.state.pending);
 if(done.result.bonusStarted==='BIG')bb++;if(done.result.bonusStarted==='REG')rb++;
 if(done.result.bonusEnded)assert.ok(done.session.state.bonusPaid>=(done.result.bonusEnded==='BIG'?e.BIG_LIMIT:e.REG_LIMIT));
 if(s.spin.role!=='miss'&&!done.result.board.awards.length)misses++;
 assert.equal(done.session.state.spins,before.spins+1);assert.equal(done.session.state.normalSpins,before.normalSpins+(before.active?0:1));
 s=done.session;settled++;
}
assert.ok(bb>5&&rb>5&&replays>100&&misses>10);
for(const bonus of ['BIG','REG']){
 let test=e.beginSpin(e.initialState(),()=>.99,bonus),target=bonus==='BIG'?[2,2,8]:[2,2,5];
 assert.ok(target);
 for(const reel of [0,1,2])test=e.stopReel(test,reel,target[reel]+.5);
 const done=e.settleSpin(test);assert.equal(done.result.bonusStarted,bonus);assert.equal(done.session.state.pending,null);assert.equal(done.session.state.active,bonus);
 let active=done.session;
 for(let i=0;i<1000&&active.state.active;i++){
   active=e.beginSpin(active.state,random);for(const r of orders[i%6])active=e.stopReel(active,r,random()*21);
   active=e.settleSpin(active).session;
 }
 assert.equal(active.state.active,null);assert.ok(active.state.bonusPaid>=(bonus==='BIG'?e.BIG_LIMIT:e.REG_LIMIT));
}
// Adjacent outer sevens allow a real center + diagonal double, not a painted fake.
const doubleBoard=e.evaluateBoard([16,2,14]);assert.equal(doubleBoard.bonus,'BIG');assert.ok(doubleBoard.bonusLines.length>=2);
for(const order of orders){let d=e.beginSpin({...e.initialState(),pending:'BIG',announced:true},()=>.99);for(const r of order)d=e.stopReel(d,r,[16.5,2.5,14.5][r]);const done=e.settleSpin(d);assert.equal(done.result.bonusStarted,'BIG');assert.ok(done.result.board.bonusLines.length>=2);assert.ok(done.result.title.includes('DOUBLE'));assert.equal(done.session.state.bigCount,1);}
const noBonus=e.beginSpin(e.initialState(),()=>.99);assert.equal(e.legalBoard(doubleBoard,noBonus.spin),false);
// Aim either left bonus mark around the middle: pull in cherry/watermelon equivalents.
for(const anchor of [3,10,17])for(const role of ['cherry','fish']){
 let aim=e.beginSpin(e.initialState(),()=>.99);aim.spin.role=role;
 aim=e.stopReel(aim,0,anchor+.5);assert.ok(e.visibleSymbols(0,aim.spin.stops[0]).includes(role==='cherry'?3:1),`left bonus aim follows ${role} at ${anchor}`);
}
// Layout upgrade cancels only the partial old-layout game and returns its charged bet.
const old=e.beginSpin({...e.initialState(),pending:'BIG',announced:true},()=>.99);delete old.layoutVersion;delete old.visual;
const resumed=e.readSession(JSON.stringify(old));assert.equal(resumed.spin,null);assert.equal(resumed.state.credit,300);assert.equal(resumed.state.spent,0);assert.equal(resumed.state.pending,'BIG');assert.equal(resumed.layoutVersion,5);
assert.deepEqual(e.readSession(JSON.stringify(resumed)).state,resumed.state,'refund is idempotent');
assert.throws(()=>e.beginSpin({...e.initialState(),credit:2}));
assert.deepEqual(e.readSession('broken').state,e.initialState());assert.deepEqual(e.readSession('{"state":{}}').state,e.initialState());
console.log(`PASS: 9,261 boards, 5 lines, 6 stop orders, ${settled} simulated games, BIG ${bb}, REG ${rb}, replays ${replays}, misses ${misses}, save/resume, four-symbol slips (${((performance.now()-begin)/1000).toFixed(1)}s)`);

for(let a=0;a<21;a++)for(let b=0;b<21;b++)for(let c=0;c<21;c++){const board=e.evaluateBoard([a,b,c]);if(board.bonusKinds.length>1)for(const pending of ['BIG','REG']){const spin=e.beginSpin({...e.initialState(),pending,announced:true},()=>.99).spin;assert.equal(e.legalBoard(board,spin),false);}}
