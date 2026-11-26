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
const strip=[1,2,4,0,3,1,5,2,4,1,3,2,0,4,1,2,3,5,4,2,1];
for(const start of[-83.2,-21.001,-.01,0,3.4,20.999,52.7])for(let symbol=0;symbol<6;symbol++){
 refs=[];frames.clear();let settled=0;
 const props={index:0,spinning:true,symbol,stopped:false,stop(){},onSettled(){settled++}};
 const view=()=>{cursor=0;return Reel(props)};
 let tree=view();refs[0].current={style:{}};refs[1].current=start;cleanup=effect();let now=performance.now();tick(now+16);assert.ok(refs[1].current<start,'position decreases so strip moves downward');cleanup();
 props.stopped=true;tree=view();cleanup=effect();now=performance.now();tick(now+16);tick(now+320);assert.equal(settled,1);assert.equal(frames.size,0,'settled reel no longer schedules frames');
 const pos=refs[1].current;const center=((Math.round(pos)%strip.length)+strip.length)%strip.length;assert.equal(strip[center],symbol,'land on correct outcome');
 const transform=refs[0].current.style.transform;cleanup();props.spinning=false;tree=view();const belt=all(tree,n=>n.props?.className==='ty-strip')[0];assert.ok(belt);assert.equal(belt.props.style.transform,transform,'keep exact transform after all reels stop');assert.equal(all(tree,n=>n.props?.className==='ty-static').length,0);
 // Adjacent symbols come from the same physical strip, never from numeric symbol IDs.
 const rows=[(center+20)%21,center,(center+1)%21].map(i=>strip[i]);assert.equal(rows[1],symbol);
}
Object.assign(React,old);console.log('PASS: downward rotation, all symbols at 7 wrap positions, exact landing, unchanged strip after settlement, RAF ends on stop');
}finally{fs.rmSync(file,{force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
