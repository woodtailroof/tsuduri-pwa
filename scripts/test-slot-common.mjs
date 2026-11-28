import assert from 'node:assert/strict';import {build} from 'esbuild';
process.on('uncaughtException',e=>{console.error(e.message);console.error(e.stack?.split('\n').filter(l=>!l.includes('data:')).slice(-5).join('\n'));process.exitCode=1;});
const js=(await build({entryPoints:['src/lib/slotGame.ts'],bundle:true,write:false,format:'esm'})).outputFiles[0].text;
const e=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const orders=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];let checked=0;const began=performance.now();
for(const role of ['replay','bell']){
 const base=e.beginSpin(e.initialState(),()=>.99);base.spin.role=role;
 for(const order of orders)for(let a=0;a<21;a++)for(let b=0;b<21;b++)for(let c=0;c<21;c++){
  const phase=[a+.5,b+.5,c+.5];let s=base;
  for(const reel of order){s=e.stopReel(s,reel,phase[reel]);assert.ok(e.modulo(Math.floor(phase[reel])-s.spin.stops[reel])<=4);}
  const board=e.evaluateBoard(s.spin.stops);assert.ok(board.awards.some(v=>v.role===role),`${role} ${order} ${phase}`);assert.ok(board.awards.every(v=>v.role===role));assert.equal(board.bonus,null);assert.equal(board.payout,role==='bell'?6:0);checked++;
 }
 // Pending bonus and active-bonus contexts have exactly the same legal common-role boards.
 for(const state of [{pending:'BIG',announced:false},{pending:'REG',announced:true},{active:'BIG'}]){
  const other={...base.spin,before:{...base.spin.before,...state}};
  for(let a=0;a<21;a++)for(let b=0;b<21;b++)for(let c=0;c<21;c++){const board=e.evaluateBoard([a,b,c]);assert.equal(e.legalBoard(board,other),e.legalBoard(board,base.spin));}
 }
}
const old=e.beginSpin(e.initialState(),()=>.99);old.layoutVersion=6;old.spin.highTriggered=true;old.state.pending='REG';old.state.announced=false;old.state.chance={left:3,total:6,mode:'float'};const next=e.readSession(JSON.stringify(old));assert.equal(next.layoutVersion,10);assert.equal(next.spin,null);assert.equal(next.state.credit,300);assert.equal(next.state.highLeft,20);assert.equal(next.state.pending,'REG');assert.equal(next.state.chance.left,3);assert.deepEqual(e.readSession(JSON.stringify(next)),next);
console.log(`PASS: ${checked.toLocaleString()} all-phase/common-role games, 6 stop orders, 4-symbol maximum, no misses or unauthorized awards, pending/active equivalence, v6 migration (${((performance.now()-began)/1000).toFixed(1)}s)`);
