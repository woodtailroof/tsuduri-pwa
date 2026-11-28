import {useEffect,useRef,useState} from 'react';
import {advanceBait,baitOutcome,initialBaitPreview,type BaitRoute} from '../lib/slotBaitPreview';
import '../screens/SlotBaitPreview.css';
export default function SlotBaitPreview({close}:{close:()=>void}){
 const [state,setState]=useState(()=>initialBaitPreview());const dialog=useRef<HTMLDialogElement>(null),field=useRef<HTMLDivElement>(null),line=useRef<SVGPathElement>(null),latest=useRef(state);latest.current=state;
 useEffect(()=>{dialog.current?.showModal();},[]);
 useEffect(()=>{let raf=0,last=performance.now(),elapsed=0,progress=0;const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const animate=(now:number)=>{const dt=Math.min(80,now-last);last=now;if(!document.hidden)elapsed+=dt;const s=latest.current,n=s.stops.filter(Boolean).length,target=s.game===0?0:(s.game-1)*.5+(n+1)/8;progress+=(target-progress)*Math.min(1,dt/240);const sway=reduced?0:Math.sin(elapsed/260+progress*12);const x=82-progress*37+sway*(s.game===1?6:3),y=28+progress*42;const el=field.current;if(el){el.style.setProperty('--lure-x',`${x}%`);el.style.setProperty('--lure-y',`${y}%`);el.style.setProperty('--lure-turn',`${sway*32}deg`);el.style.setProperty('--fish-x',`${x+12-progress*8}%`);el.style.setProperty('--fish-y',`${y-5}%`);el.style.setProperty('--water-pan',`${Math.sin(elapsed/2200)*.6}%`);line.current?.setAttribute('d',`M36 20 Q${(36+x)/2} ${Math.min(20,y)-4} ${x} ${y}`);}raf=requestAnimationFrame(animate);};raf=requestAnimationFrame(animate);return()=>cancelAnimationFrame(raf);},[]);
 const n=state.stops.filter(Boolean).length,outcome=baitOutcome(state),retry=state.done&&state.route==='retry'&&state.cycle===0;
 const canLever=state.game===0||n===3&&(!state.done||retry);
 function route(value:BaitRoute){setState(initialBaitPreview(value));}
 return <dialog ref={dialog} className="ty-bait-dialog" onCancel={close} onClose={close}><div className="ty-bait-toolbar"><b>ビッグベイトチャレンジ！</b><button onClick={close}>閉じる ✕</button></div>
 <div ref={field} className={`ty-bait-world bait-game-${state.game} bait-step-${n} bait-${outcome} ${retry?'bait-retry':''}`}>
 <div className="ty-bait-water"/><img className="ty-bait-back-actor" src="/assets/slot/missions/bigbait-back-tsuduri.webp" alt="背後から見たつづりのキャスト"/>
 {state.game>0&&<><svg className="ty-bait-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path ref={line} d={`M36 20 Q60 28 ${82-((state.game-1)*.5+(n+1)/8)*37} ${28+((state.game-1)*.5+(n+1)/8)*42}`} /></svg><div className="ty-bait-moving-lure"/><div className="ty-bait-wake"/>{(n>=2||state.game===2)&&<div className="ty-bait-chaser"/>}</>}
 <div className="ty-bait-speedlines"/>
 <div className="ty-bait-status">{state.game?`${state.cycle?'再チャレンジ · ':''}${state.game} / 2 GAME`:'演出プレビュー'}</div>
 <div className="ty-bait-dialogue" aria-live="polite">{state.game===0?'レバーONで、大きなルアーを投げるよ！':state.done?outcome==='win'?'大物ヒット！ ボーナス確定！':retry?'見切った……？ まだいる！ もう一投！':'見切られちゃった……！':state.game===1?n===3?'魚影が迫る……次のレバーへ！':n===0?'キャスト！ 水面を滑らせるよ！':'右へ、左へ……追ってきてる！':n===3?'……！':n===2?'今、食う……!?':'間を作って……食わせる！'}</div>
 {state.done&&<strong className="ty-bait-resolution">{outcome==='win'?'HIT！':retry?'もう一投！':'MISS…'}</strong>}
 </div>
 <div className="ty-bait-buttons"><button disabled={!canLever} onClick={()=>setState(s=>advanceBait(s,'lever'))}>レバーON</button>{[0,1,2].map(i=><button key={i} disabled={!state.game||state.stops[i]||state.done} onClick={()=>setState(s=>advanceBait(s,i))}>STOP {i+1}</button>)}</div>
 <div className="ty-bait-routes">{(['win','miss','retry'] as const).map(v=><button key={v} aria-pressed={state.route===v} onClick={()=>route(v)}>{v==='win'?'成功を確認':v==='miss'?'失敗を確認':'再挑戦→成功'}</button>)}</div><p>映像確認専用・つづり版。2ゲーム×1クール。メダル・内部抽選・遊技履歴には影響しません。</p></dialog>;
}
