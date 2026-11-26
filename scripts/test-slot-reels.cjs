const root=process.cwd(),React=require(root+'/node_modules/react'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
const file=root+'/.slot-reel-test.cjs';
await require(root+'/node_modules/esbuild').build({entryPoints:['src/screens/SlotGame.tsx'],outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
try{
const {Reel}=require(file);const old={useRef:React.useRef,useEffect:React.useEffect};let refs=[],cursor=0,effect,cleanup,frames=new Map(),frameId=0;
React.useRef=init=>refs[cursor++]??(refs[cursor-1]={current:init});React.useEffect=f=>effect=f;
global.requestAnimationFrame=f=>{frames.set(++frameId,f);return frameId};global.cancelAnimationFrame=id=>frames.delete(id);
const all=(n,p)=>!n||typeof n!=='object'?[]:[...(p(n)?[n]:[]),...[n.props?.children].flat(Infinity).flatMap(c=>all(c,p))];
const tick=t=>{const queue=[...frames.values()];frames.clear();queue.forEach(f=>f(t))};
for(let reel=0;reel<3;reel++)for(const start of[-83.2,-21.001,-.01,0,3.4,20.999,52.7])for(let slip=0;slip<=4;slip++){
 refs=[];frames.clear();let settled=0,pressed;
 const props={index:reel,roundId:1,running:true,target:null,initial:0,requestStop(i,p){pressed=p;return true},onSettled(){settled++}};
 const view=()=>{cursor=0;return Reel(props)};
 let tree=view();refs[0].current={style:{}};refs[1].current=start;cleanup=effect();let now=performance.now();tick(now+16);assert.ok(refs[1].current<start,'moves downward');
 const stop=all(tree,n=>n.type==='button')[0];stop.props.onClick();const frozen=refs[1].current;tick(now+32);assert.equal(refs[1].current,frozen,'freeze immediately on button press while control computes');cleanup();
 props.target=((Math.floor(pressed)-slip)%21+21)%21;tree=view();cleanup=effect();now=performance.now();tick(now+16);tick(now+250);assert.equal(settled,1);assert.equal(frames.size,0);
 const end=refs[1].current;assert.ok(frozen-end>=-1e-9&&frozen-end<5+1e-9,'animation cannot sneak in a full extra turn');assert.equal(((end%21)+21)%21,props.target);
 const transform=refs[0].current.style.transform;cleanup();props.running=false;tree=view();assert.equal(all(tree,n=>n.props?.className==='ty-strip')[0].props.style.transform,transform,'no symbol swap after settlement');
}
Object.assign(React,old);console.log('PASS: 105 downward stop animations, button-phase freeze, four-symbol slip limit, no symbol changes, frame cleanup');
}finally{fs.rmSync(file,{force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
