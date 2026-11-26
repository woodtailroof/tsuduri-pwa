import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
const code = ts.transpileModule(fs.readFileSync('src/lib/slotGame.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {drawSlot,initialWallet,readSlotWallet,REEL_STRIP}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
for (const [r,payout,symbols] of [[0,30,[0,0,0]],[.1,12,[2,2,2]],[.3,8,[1,1,1]],[.4,2,[3,4,3]],[.99,0,null]]) {
 const round=drawSlot(initialWallet(),()=>r);assert.equal(round.payout,payout);assert.equal(round.next.credit,297+payout);
 if(symbols)assert.deepEqual(round.symbols,symbols);else assert.notEqual(round.symbols[0],round.symbols[1]);
 for(const symbol of round.symbols)assert.ok(REEL_STRIP.includes(symbol));
}
let w=initialWallet();let bonus=drawSlot(w,()=>.99,true);assert.equal(bonus.next.bonus,8);
let free=drawSlot(bonus.next,()=>.99);assert.equal(free.next.credit,bonus.next.credit);assert.equal(free.next.bonus,7);
let extra=drawSlot(free.next,()=>0);assert.equal(extra.next.bonus,14);
assert.throws(()=>drawSlot({...w,credit:2},()=>0));
assert.deepEqual(readSlotWallet('{"credit":-5}'),initialWallet());assert.deepEqual(readSlotWallet('broken'),initialWallet());
let seed=23;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
for(let i=0;i<100000;i++){if(w.credit<3&&!w.bonus)w=initialWallet();const round=drawSlot(w,random);assert.equal(round.next.spins,w.spins+1);assert.ok(round.next.credit>=0);assert.ok(round.next.bonus>=0);assert.ok(round.next.best>=round.next.credit);w=round.next}
console.log('PASS: payouts, free spins, bonus extensions, insufficient credits, saved-data validation, 100,000 simulated games');
