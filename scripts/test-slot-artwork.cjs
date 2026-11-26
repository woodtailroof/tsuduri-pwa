const root=process.cwd(),assert=require('node:assert/strict'),fs=require('node:fs'),React=require(root+'/node_modules/react'),{renderToStaticMarkup:render}=require(root+'/node_modules/react-dom/server');
(async()=>{const file=root+'/.slot-artwork-test.cjs';await require(root+'/node_modules/esbuild').build({entryPoints:['src/components/SlotArtwork.tsx'],outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic'});try{
const {SlotSymbol,SlotLcdScene}=require(file);const bonus=[0,5];const ids=new Set();
for(let symbol=0;symbol<6;symbol++){
 const html=render(React.createElement(SlotSymbol,{symbol}));assert.ok(html.includes(bonus.includes(symbol)?'is-bonus-symbol':'is-small-symbol'));
 assert.equal(html.includes('<image'),bonus.includes(symbol),'only bonus glyphs include a character face');
 assert.ok(html.includes('<svg'));assert.ok(html.includes('aria-label='));
 if(symbol===0)assert.ok(html.includes('BIG BONUS'));if(symbol===5)assert.ok(html.includes('>BAR<'));
}
// One render pass must generate distinct gradient IDs for all reel cells.
const whole=render(React.createElement('div',null,Array.from({length:135},(_,i)=>React.createElement(SlotSymbol,{key:i,symbol:i%6}))));
for(const m of whole.matchAll(/ id="([^"]+)"/g)){assert.ok(!ids.has(m[1]));ids.add(m[1])}assert.equal(ids.size,540);
for(const cue of ['quiet','cast','chase','shine','float','splash','crab'])for(let phase=0;phase<4;phase++){
 const visual={stage:'harbor',actor:0,actorLeft:18,stageLeft:15,tension:0,cue,tier:'normal',outcome:'waiting',seed:1};
 const html=render(React.createElement(SlotLcdScene,{visual,phase,running:true}));assert.ok(html.includes('cue-'+cue));assert.ok(html.includes('scene-phase-'+phase));assert.ok(html.includes('ty-fishing-chibi'));assert.ok(!html.includes('BONUS 確定'));
}
const css=fs.readFileSync('src/screens/SlotMachine.css','utf8');assert.ok(css.includes('prefers-reduced-motion'));assert.ok(css.includes('.ty-machine-edition .ty-lever'));assert.ok(css.includes('tyFloatBite'));
console.log('PASS: bonus-only portraits, 135 unique-gradient cells, fishing chibis, 7 cues / 4 stop phases, no false bonus');
}finally{fs.rmSync(file,{force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
