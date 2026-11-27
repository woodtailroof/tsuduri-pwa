const root=process.cwd(),assert=require('node:assert/strict'),fs=require('node:fs'),React=require(root+'/node_modules/react'),{renderToStaticMarkup:render}=require(root+'/node_modules/react-dom/server');
(async()=>{const file=root+'/.slot-artwork-test.cjs';await require(root+'/node_modules/esbuild').build({entryPoints:['src/components/SlotArtwork.tsx'],outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic'});try{
const {SlotSymbol,SlotLcdScene,symbolTile}=require(file);const bonusTiles=new Set();
for(const symbol of[0,5])for(let actor=0;actor<5;actor++){
 const tile=symbolTile(symbol,actor);bonusTiles.add(tile);const html=render(React.createElement(SlotSymbol,{symbol,variant:actor}));assert.ok(html.includes('is-bonus-symbol'));assert.ok(html.includes(`data-symbol-tile="${tile}"`));assert.ok(html.includes('reel-symbols-v2.webp'));assert.ok(html.includes('preserveAspectRatio="xMidYMid meet"'));assert.ok(!html.includes('<small'));assert.ok(!html.includes('<path'),'old vector pictograms must be gone');assert.ok(html.includes('<clipPath'));assert.ok(html.includes('<rect width="300" height="200"'));assert.ok(html.includes('clip-path="url(#slot-symbol-')); 
}
assert.equal(bonusTiles.size,6);for(const [symbol,tile] of[[2,10],[4,11],[1,12],[3,13]])assert.equal(symbolTile(symbol),tile);
const whole=render(React.createElement('div',null,Array.from({length:135},(_,i)=>React.createElement(SlotSymbol,{key:i,symbol:i%6,variant:i%5}))));assert.equal([...whole.matchAll(/href="\/assets\/slot\/reel-symbols-v2.webp"/g)].length,135);assert.ok(!whole.includes('GOLD REEL'));const ids=[...whole.matchAll(/<clipPath id="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,135,'each cell has its own viewBox clip, including letterbox margins');
for(const cue of ['quiet','cast','chase','shine','float','splash','crab'])for(let phase=0;phase<4;phase++){
 const visual={stage:'harbor',actor:0,actorLeft:18,stageLeft:15,tension:0,cue,tier:'normal',outcome:'waiting',seed:1};
 const html=render(React.createElement(SlotLcdScene,{visual,phase,running:true}));assert.ok(html.includes('cue-'+cue));assert.ok(html.includes('scene-phase-'+phase));assert.ok(html.includes('ty-fishing-chibi'));assert.ok(!html.includes('BONUS 確定'));
}
const {data,info}=await require(root+'/node_modules/sharp')('public/assets/slot/reel-symbols-v2.webp').raw().toBuffer({resolveWithObject:true});assert.equal(info.width,1200);assert.equal(info.height,800);assert.equal(info.channels,4);
for(let tile=0;tile<16;tile++){let opaque=0;const left=tile%4*300,top=Math.floor(tile/4)*200;for(let y=top;y<top+200;y++)for(let x=left;x<left+300;x++)if(data[(y*1200+x)*4+3]>128)opaque++;assert.ok(tile<14?opaque>6000:opaque<1200,`atlas cell ${tile} occupancy ${opaque}`)}
console.log('PASS: 5 fixed character sevens + shared group BAR, 4 painted fishing motifs, all 135 reel cells use atlas, no micro-captions/old vectors, transparent tile bounds, stage cues preserved');
}finally{fs.rmSync(file,{force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
