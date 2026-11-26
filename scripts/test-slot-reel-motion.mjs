import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';
const js=ts.transpileModule(fs.readFileSync('src/lib/slotReelMotion.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {advanceReel,reelStopDuration,REEL_REVOLUTION_MS}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
assert.equal(REEL_REVOLUTION_MS,750);assert.equal(advanceReel(0,750),-21);assert.equal(advanceReel(0,1500),-42);assert.equal(advanceReel(5,750,true),5);
for(const fps of[30,60,90,120]){let p=0;for(let frame=0;frame<fps*3;frame++)p=advanceReel(p,1000/fps);assert.ok(Math.abs(p+84)<1e-8,'same rpm at different refresh rates');}
for(let distance=0;distance<5;distance+=.01)assert.ok(reelStopDuration(distance)>=16&&reelStopDuration(distance)<=180);
console.log('PASS: 80rpm / 750ms revolution, 30–120fps parity, freeze, stop timing');
