import assert from 'node:assert/strict';import {build} from 'esbuild';
const js=(await build({entryPoints:['src/lib/slotGame.ts'],bundle:true,write:false,format:'esm'})).outputFiles[0].text;
const e=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
let seed=527;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32};
const chances={left:6,total:6,mode:'float'};
for(const win of [false,true]){
 let state={...e.initialState(),pending:win?'BIG':null,chance:{...chances}};
 for(let game=0;game<6;game++){
  let s=e.beginSpin(state,()=>.99);assert.equal(s.spin.announced,false);assert.equal(s.state.announced,false);
  const board=e.evaluateBoard([16,2,14]);assert.equal(e.legalBoard(board,s.spin),false,'hidden bonus cannot land early');
  s=e.readSession(JSON.stringify(s));assert.equal(s.state.chance.left,6-game);
  for(let r=0;r<3;r++)s=e.stopReel(s,r,[3.5,2.5,8.5][r]);
  const done=e.settleSpin(s);assert.equal(done.result.bonusStarted,null);
  if(game<5){assert.equal(done.result.chanceOutcome,null);assert.equal(done.session.state.chance.left,5-game);assert.equal(done.session.state.announced,false);}
  else{assert.equal(done.result.chanceOutcome,win?'win':'miss');assert.equal(done.session.state.chance,null);assert.equal(done.session.state.announced,win);}
  state=done.session.state;
 }
 if(win){let s=e.beginSpin(state,()=>.99);for(let r=0;r<3;r++)s=e.stopReel(s,r,[16.5,2.5,14.5][r]);const d=e.settleSpin(s);assert.equal(d.result.bonusStarted,'BIG');assert.equal(d.session.state.pending,null);assert.equal(d.session.state.chance,null);}
}
let normal=0,high=0;const n=40000;
for(let i=0;i<n;i++){
 normal+=e.beginSpin({...e.initialState(),pending:'BIG',announced:true},random).spin.role==='replay';
 high+=e.beginSpin({...e.initialState(),pending:'BIG',chance:{...chances}},random).spin.role==='replay';
}
assert.ok(Math.abs(normal/n-e.NORMAL_REPLAY_RATE)<.008);assert.ok(Math.abs(high/n-e.CHANCE_REPLAY_RATE)<.008);
// A false lead may acquire a genuine win; retain the existing countdown.
const upgrade=e.beginSpin({...e.initialState(),chance:{left:3,total:6,mode:'lure'}},()=>0);assert.equal(upgrade.state.pending,'BIG');assert.equal(upgrade.state.chance.left,3);assert.equal(upgrade.state.announced,false);
for(const anchor of [3,10])for(const offset of [0,1])for(const role of ['miss','bell','replay','cherry','fish']){
 let s=e.beginSpin(e.initialState(),()=>.99);s.spin.role=role;s=e.stopReel(s,0,anchor+offset+.5);const cells=e.visibleSymbols(0,s.spin.stops[0]);
 if(role==='cherry')assert.ok(cells.includes(3));else if(role==='fish'){assert.ok(cells.includes(1));assert.ok(!cells.includes(0)&&!cells.includes(5));}else{assert.equal(s.spin.stops[0],anchor-1);assert.ok(cells[2]===0||cells[2]===5);assert.ok(!cells.includes(3));}
}
const old=e.beginSpin(e.initialState(),()=>.99,'REG');old.layoutVersion=4;delete old.state.announced;delete old.state.chance;const upgraded=e.readSession(JSON.stringify(old));assert.equal(upgraded.state.pending,'REG');assert.equal(upgraded.state.announced,true);assert.equal(upgraded.state.credit,300);assert.equal(upgraded.spin,null);assert.deepEqual(e.readSession(JSON.stringify(upgraded)),upgraded);
for(const chance of [{left:0,total:6,mode:'lure'},{left:7,total:6,mode:'float'},{left:2,total:99,mode:'float'},{left:2,total:6,mode:'bad'}])assert.equal(e.readSession(JSON.stringify({...e.initialSession(),state:{...e.initialState(),chance}})).state.chance,null);
console.log(`PASS: hidden true/false 6G lead-up, replay ${(normal/n*100).toFixed(2)}%→${(high/n*100).toFixed(2)}%, final reveal, carry, save/resume/migration, conventional left bonus/cherry/fish stops`);
