const assert=require('node:assert/strict'),fs=require('node:fs'),React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server');
(async()=>{const file=process.cwd()+'/.slot-mission-view.cjs';await require('esbuild').build({entryPoints:['src/components/SlotChallenge.tsx'],outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic'});try{
const View=require(file).default;
for(const id of ['distance','skipping','float','light'])for(let actor=0;actor<5;actor++)for(const outcome of ['waiting','confirmed','escape']){
 const html=render(React.createElement(View,{challenge:{id,actor,stars:3,skill:3,expectation:.4},left:outcome==='waiting'?6:1,total:6,outcome}));
 assert.ok(html.includes('challenge-'+id));assert.ok(html.includes('ty-cinema-background'));assert.ok(html.includes('/assets/slot/missions/'+id+'.webp'));assert.ok(html.includes('専用シネマ演出'));assert.ok(html.includes('期待度3つ星'));assert.ok(html.includes('/assets/slot/actors/'));
 assert.equal(html.includes('MISSION CLEAR'),outcome==='confirmed');assert.equal(html.includes('NEXT CHALLENGE'),outcome==='escape');assert.equal(html.includes('BONUS CHANCE'),outcome==='confirmed');
}
console.log('PASS: 4 legacy challenges × 5 actors × intro/win/fail, distinct stage classes, standalone art and stars, no premature bonus confirmation');
}finally{fs.rmSync(file,{force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
