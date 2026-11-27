import assert from 'node:assert/strict';import fs from 'node:fs/promises';import sharp from 'sharp';import {build} from 'esbuild';
const js=(await build({entryPoints:['src/lib/slotFishing.ts'],bundle:true,write:false,format:'esm'})).outputFiles[0].text;const f=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const modes={lure:new Set(['stand','cast','retrieve']),float:new Set(['sit','twitch','sleep'])};
for(const mode of ['lure','float']){const seen=new Set();for(let time=0;time<32000;time+=100){const frame=f.fishingFrame(mode,time);seen.add(frame.pose);assert.ok(frame.progress>=0&&frame.progress<=1);}assert.deepEqual(seen,modes[mode]);assert.notEqual(f.fishingFrame(mode,13000,true).pose,'sleep');}
const actors=['tsuduri','matsuri','kokoro','lulu','rin'];let bytes=0;
for(let i=0;i<5;i++)for(const pose of f.FISHING_POSES){const path='public'+f.poseSrc(actors[i],pose),metadata=await sharp(path).metadata();assert.equal(metadata.width,448);assert.equal(metadata.height,448);assert.ok(metadata.hasAlpha);bytes+=(await fs.stat(path)).size;const tip=f.rodTip(i,pose);assert.ok(tip.x>0&&tip.x<1&&tip.y>0&&tip.y<1);}
const start={x:200,y:100},end={x:410,y:180};assert.deepEqual(f.lurePoint(start,end,0),start);assert.deepEqual(f.lurePoint(start,end,1),end);assert.ok(f.lurePoint(start,end,.4).y<100,'lure arcs above rod before landing');
console.log(`PASS: 30 independent transparent assets (${Math.round(bytes/1024)}KiB), standing cast→wind, seated watch→bite→sleep, rod anchors and lure flight`);
