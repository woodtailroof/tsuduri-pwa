const assert=require('node:assert/strict'),fs=require('node:fs'),React=require('react'),{renderToStaticMarkup:render}=require('react-dom/server');
(async()=>{const file=process.cwd()+'/.slot-bonus-view.cjs';await require('esbuild').build({entryPoints:['src/components/SlotBonusScreen.tsx','src/lib/slotGame.ts'],outdir:'.bonus-test',bundle:true,platform:'node',format:'cjs',outExtension:{'.js':'.cjs'},packages:'external',jsx:'automatic'});try{
 const View=require('../.bonus-test/components/SlotBonusScreen.cjs').SlotBonusScreen;
 const e=require('../.bonus-test/lib/slotGame.cjs');
 function check(session,result,phase){const html=render(React.createElement(View,{session,result}));assert.ok(html.includes('data-phase="'+phase+'"'));assert.equal(html.includes('ty-bonus-get'),phase==='get'||phase==='finish');return html;}
 for(const kind of ['BIG','REG']){let s=e.initialSession();s.state.pending=kind;s.state.announced=true;assert.ok(check(s,null,'confirmed').includes('bonus-confirmed.webp'));s.state.pending=null;s.state.announced=false;s.state.active=kind;check(s,null,'confirmed');s=e.beginSpin(s.state,()=>.99);check(s,null,'cast');s.spin.stops=[2,null,null];check(s,null,'fight');s.spin.stops=[2,2,2];check(s,null,'fight');s.spin=null;s.state.bonusGames=1;check(s,{payout:15},'get');s.state.active=null;check(s,{payout:15,bonusEnded:kind},'finish');}
 console.log('PASS: both bonuses confirmation, cast, fight, no GET before settled, GET and final screen');
 }finally{fs.rmSync('.bonus-test',{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
