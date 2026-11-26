const root=process.cwd(),assert=require('node:assert/strict'),fs=require('node:fs'),React=require(root+'/node_modules/react'),{renderToStaticMarkup:render}=require(root+'/node_modules/react-dom/server');
(async()=>{const file=root+'/.slot-artwork-test.cjs';await require(root+'/node_modules/esbuild').build({entryPoints:['src/components/SlotArtwork.tsx'],outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic'});try{
const {SlotSymbol,SlotLcdScene}=require(file);const bonus=[0,5];const ids=new Set();
for(let symbol=0;symbol<6;symbol++){
 const html=render(React.createElement(SlotSymbol,{symbol}));assert.ok(html.includes(bonus.includes(symbol)?'is-bonus-symbol':'is-small-symbol'));
 assert.ok(!html.includes('<img'),'bonus and small motifs have no portrait competing with glyph');
 assert.ok(html.includes('<svg'));assert.ok(html.includes('aria-label='));
 if(symbol===0)assert.ok(html.includes('BIG BONUS'));if(symbol===5)assert.ok(html.includes('>BAR<'));
}
// One render pass must generate distinct gradient IDs for all reel cells.
const whole=render(React.createElement('div',null,Array.from({length:135},(_,i)=>React.createElement(SlotSymbol,{key:i,symbol:i%6}))));
for(const m of whole.matchAll(/ id="([^"]+)"/g)){assert.ok(!ids.has(m[1]));ids.add(m[1])}assert.equal(ids.size,405);
for(const role of ['idle','miss','bell','replay','fish','cherry'])for(let phase=0;phase<4;phase++){
 const html=render(React.createElement(SlotLcdScene,{role,phase,roundId:1,bonus:false}));assert.ok(html.includes('scene-'+role));assert.ok(html.includes('scene-phase-'+phase));
 assert.equal(html.includes('ty-scene-motif'),!['idle','miss'].includes(role));assert.ok(!html.includes('BONUS 確定'),'small-role cues must not falsely confirm a bonus');
}
const css=fs.readFileSync('src/screens/SlotMachine.css','utf8');assert.ok(css.includes('prefers-reduced-motion'));assert.ok(css.includes('.ty-machine-edition .ty-lever'));assert.ok(css.includes('tyFloatBite'));
console.log('PASS: 6 distinct readable motif symbols, 135 cells with unique SVG gradients, all role/stop-phase LCD scenes, reduced-motion styles');
}finally{fs.rmSync(file,{force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
