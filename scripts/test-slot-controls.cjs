const root=process.cwd(),React=require(root+'/node_modules/react'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
const file=root+'/.slot-control-test.cjs';await require(root+'/node_modules/esbuild').build({entryPoints:['src/screens/SlotGame.tsx'],outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
try{
const Game=require(file).default,old={useState:React.useState,useRef:React.useRef,useEffect:React.useEffect,useLayoutEffect:React.useLayoutEffect,useCallback:React.useCallback},random=Math.random;
let states=[],refs=[],si=0,ri=0,saved=null;
React.useState=init=>{let i=si++;if(!(i in states))states[i]=typeof init==='function'?init():init;return[states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]};React.useRef=init=>{let i=ri++;return refs[i]??(refs[i]={current:init})};React.useEffect=()=>{};React.useLayoutEffect=()=>{};React.useCallback=f=>f;Math.random=()=>.99;
global.localStorage={getItem:()=>saved,setItem:(k,v)=>saved=v};
const all=(n,p)=>!n||typeof n!=='object'?[]:[...(p(n)?[n]:[]),...[n.props?.children].flat(Infinity).flatMap(c=>all(c,p))];
const view=()=>{si=ri=0;return Game({back(){}})};const reels=t=>all(t,n=>n.props?.requestStop&&n.props?.index!==undefined);
let t=view(),lever=all(t,n=>n.props?.className==='ty-lever')[0];lever.props.onClick();const pending=JSON.parse(saved);lever.props.onClick();assert.deepEqual(JSON.parse(saved),pending,'rapid double lever cannot redraw or double charge');assert.equal(pending.state.credit,297);
t=view();for(const i of[2,0,1]){const r=reels(t)[i];assert.equal(r.props.requestStop(i,8.2),true);assert.equal(r.props.requestStop(i,0),false);t=view()}
assert.ok(JSON.parse(saved).spin,'all button presses do not settle before animations finish');
const interrupted=saved;
for(const i of[2,0])reels(t)[i].props.onSettled(i);assert.ok(JSON.parse(saved).spin);
reels(t)[1].props.onSettled(1);assert.equal(JSON.parse(saved).spin,null);assert.equal(JSON.parse(saved).state.spins,1);
const done=saved;reels(t)[1].props.onSettled(1);assert.equal(saved,done,'duplicate animation completion does not pay twice');
// Reload a spin whose three stops were saved but animation/settlement was interrupted.
states=[];refs=[];saved=interrupted;t=view();assert.equal(states[0].state.credit,297);for(const i of[0,2,1])reels(t)[i].props.onSettled(i);assert.equal(JSON.parse(saved).spin,null);assert.equal(JSON.parse(saved).state.spins,1);assert.equal(JSON.parse(saved).state.spent,3);
Object.assign(React,old);Math.random=random;console.log('PASS: lever/STOP guards, settlement waits for all reels, no duplicate payout, interrupted game resumes without redraw or double charge');
}finally{fs.rmSync(file,{force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
