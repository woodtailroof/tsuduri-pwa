const assert=require('node:assert/strict'),fs=require('node:fs'),React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server');
(async()=>{const file=process.cwd()+'/.slot-bait-production.cjs';await require('esbuild').build({entryPoints:['src/components/SlotChallenge.tsx'],outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic'});try{const View=require(file).default;
for(let actor=0;actor<5;actor++)for(const phase of [0,1,2,3])for(const outcome of ['waiting','confirmed','escape']){
const html=render(React.createElement(View,{challenge:{id:'bigbait',actor,stars:3,skill:3,expectation:.4},total:6,left:3,phase,outcome}));
assert.ok(html.includes('ty-bait-live'));assert.ok(html.includes('ty-bait-reaction'));assert.ok(!html.includes('ty-mission-fish'));assert.equal(html.includes('MISSION CLEAR'),outcome==='confirmed');assert.equal(html.includes('NEXT CHALLENGE'),outcome==='escape');
if(outcome==='escape')assert.ok(html.includes('dart-top-'));else if(outcome==='confirmed')assert.ok(html.includes('hooked.webp'));else assert.ok(html.includes('follow-top-'));
if(actor===0)assert.ok(html.includes('reaction-tsuduri-'));else assert.ok(!html.includes('reaction-tsuduri-'));
}
for(const name of ['common-0','common-1',...Array.from({length:4},(_,i)=>'actor-'+i),...Array.from({length:4},(_,i)=>'gear-'+i),...Array.from({length:3},(_,i)=>'follow-top-'+i),...Array.from({length:3},(_,i)=>'dart-top-'+i),...Array.from({length:3},(_,i)=>'reaction-tsuduri-'+i)])assert.ok(fs.existsSync('public/assets/slot/missions/bigbait-v2/'+name+'.webp'));
console.log('PASS: bigbait 5 characters × 4 stop phases × wait/win/miss; correct identity fallback, no false confirmation, all plates present');}finally{fs.rmSync(file,{force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
