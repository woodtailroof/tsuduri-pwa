import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { fishingFrame, FISHING_POSES, poseSrc, rodTip, lurePoint, type FishingPose } from '../lib/slotFishing';
import { SLOT_SYMBOLS } from '../lib/slotGame';
import { STAGE_NAMES, visualCaption, type SlotVisual } from '../lib/slotPresentation';
import {SLOT_CAST} from '../lib/slotCast';
export {SLOT_CAST} from '../lib/slotCast';
import SlotChallenge from './SlotChallenge';
export function iconSrc(id:string){return `/assets/slot/${id}-icon.webp`;}
export function portraitSrc(id:string){return `/assets/characters-mobile/${id}/uniform/happy.webp`;}
export function hideBrokenImage(event:React.SyntheticEvent<HTMLImageElement>){event.currentTarget.style.visibility='hidden';}
export function bonusVariant(reel:number,position:number){return reel===0?(position===17?1:0):reel===1?2:position===14?4:3;}
// Atlas: fixed character sevens; all BAR cells use the approved grayscale group emblem.
export function symbolTile(symbol:number,variant=0):number {
  const actor=((Math.trunc(variant)%5)+5)%5;
  return symbol===0?actor:symbol===5?5:[0,12,10,13,11,5][symbol];
}
export function SlotSymbol({symbol,variant=0}:{symbol:number;variant?:number}) {
  const clipId=`slot-symbol-${useId().replace(/[^a-zA-Z0-9_-]/g,'')}`;
  const tile=symbolTile(symbol,variant),column=tile%4,row=Math.floor(tile/4);
  const bonus=symbol===0||symbol===5,actor=((Math.trunc(variant)%5)+5)%5;
  const label=symbol===5?'釣嫁プロジェクト・集合BAR':bonus?`${SLOT_CAST[actor].name}の7`:SLOT_SYMBOLS[symbol].label;
  return <svg viewBox="0 0 300 200" preserveAspectRatio="xMidYMid meet" className={`ty-motif-symbol ty-painted-symbol motif-${symbol} ${bonus?'is-bonus-symbol':'is-small-symbol'} bonus-variant-${actor}`} role="img" aria-label={label} data-symbol-tile={tile}>
    <defs><clipPath id={clipId}><rect width="300" height="200"/></clipPath></defs>
    <g clipPath={`url(#${clipId})`}><image href="/assets/slot/reel-symbols-v2.webp" x={-column*300} y={-row*200} width="1200" height="800"/></g>
  </svg>;
}
export function FishingChibi({actor,className='',pose='stand'}:{actor:number;className?:string;pose?:FishingPose}) {
 const cast=SLOT_CAST[actor];
 return <div className={`ty-fishing-chibi ty-individual-pose pose-${pose} ${className}`} role="img" aria-label={`${cast.name}が釣りをしている`}><img src={poseSrc(cast.id,pose)} alt="" draggable={false}/></div>;
}
export function SlotLcdScene({visual,phase,running}:{visual:SlotVisual;phase:number;running:boolean}) {
  const title=STAGE_NAMES[visual.stage];
  const [elapsed,setElapsed]=useState(0);
  const scene=useRef<HTMLDivElement>(null),angler=useRef<HTMLDivElement>(null);
  const [geometry,setGeometry]=useState({width:600,height:280,left:30,top:30,size:210});
  useLayoutEffect(()=>{
    const element=scene.current,body=angler.current;if(!element||!body)return;
    const measure=()=>setGeometry({width:element.clientWidth,height:element.clientHeight,left:body.offsetLeft,top:body.offsetTop,size:body.offsetWidth});
    const observer=new ResizeObserver(measure);observer.observe(element);observer.observe(body);measure();return()=>observer.disconnect();
  },[]);
  const mode=visual.fishing??'lure';
  useEffect(()=>{
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){setElapsed(0);return;}
    let time=0,previous=performance.now();setElapsed(0);
    const timer=window.setInterval(()=>{const now=performance.now();if(!document.hidden)time+=Math.min(500,now-previous);previous=now;setElapsed(time);},100);
    return()=>window.clearInterval(timer);
  },[visual.actor,mode]);
  useEffect(()=>{const images=FISHING_POSES.map(p=>{const img=new Image();img.src=poseSrc(SLOT_CAST[visual.actor].id,p);return img;});return()=>{for(const img of images)img.onload=null;};},[visual.actor]);
  const bite=(!!visual.chanceLeft&&visual.outcome!=='escape')||visual.outcome==='confirmed'||visual.outcome==='bonus';
  const frame=fishingFrame(mode,elapsed,bite);
  const pose=frame.pose;
  const final=visual.outcome==='confirmed'||visual.outcome==='escape';
  const tip=rodTip(visual.actor,pose),start={x:geometry.left+geometry.size*tip.x,y:geometry.top+geometry.size*tip.y};
  const end={x:geometry.width*.72,y:geometry.height*.63};
  const lure=lurePoint(start,end,frame.progress);
  return <div className={`ty-stage-scene stage-${visual.stage} cue-${visual.cue} effect-${visual.tier} outcome-${visual.outcome} scene-phase-${phase} ${running?'scene-running':'scene-idle'} fishing-${mode} motion-${frame.action} ${bite?'has-bite':''} ${visual.challenge?'has-challenge':''}`} ref={scene} aria-label={`液晶ステージ：${title}`}>
    <div className="ty-scene-cloud cloud-one"/><div className="ty-scene-cloud cloud-two"/>
    <div className="ty-stage-sun"/><div className="ty-stage-mountains"/><div className="ty-stage-bridge"/>
    <svg className="ty-scene-water" viewBox="0 0 600 100" preserveAspectRatio="none" aria-hidden="true"><path d="M-80 40Q0 10 80 40T240 40T400 40T560 40T720 40V100H-80Z"/><path d="M-80 70Q0 40 80 70T240 70T400 70T560 70T720 70V100H-80Z"/></svg>
    <div className="ty-stage-bank"/><div className="ty-stage-railing"/>
    <div ref={angler} key={visual.actor} className="ty-stage-angler"><FishingChibi actor={visual.actor} pose={pose} className={`action-${frame.action}`}/><span>{SLOT_CAST[visual.actor].name}</span></div>
    <div className="ty-stage-action" aria-hidden="true"><svg className="ty-connected-line" viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none"><path d={`M${start.x} ${start.y} Q${(start.x+end.x)/2} ${Math.max(start.y,end.y)-8} ${end.x} ${end.y}`}/></svg><div className="ty-cast-lure" style={{left:lure.x,top:lure.y,opacity:frame.action==='cast'&&frame.progress<.92?1:0,transform:`rotate(${frame.progress*65-30}deg) scale(${1-frame.progress*.4})`}}/><div className="ty-cast-ring"/><div className="ty-stage-float"/><div className="ty-stage-fish ty-vfx-fish"/><div className="ty-stage-splash ty-vfx-splash"/><div className="ty-stage-crab ty-vfx-crab"/><div className="ty-stage-shine ty-vfx-gold"/><div className="ty-stage-miss">…</div></div>
    {visual.challenge&&<SlotChallenge key={`${visual.challengeStart??0}-${visual.challenge.id}-${visual.challenge.actor}`} challenge={visual.challenge} total={visual.chanceTotal??6} left={visual.chanceLeft??0} outcome={visual.outcome}/>}
    <div className="ty-stage-banner"><span>{title}</span><b>{visual.chanceLeft?'BITE CHANCE':mode==='float'?'FLOAT FISHING':'LURE FISHING'}</b></div>
    {visual.chanceLeft&&!final&&<div className={`ty-bite-meter bite-step-${Math.min(3,Math.floor(((visual.chanceTotal??6)-visual.chanceLeft)/2))}`} aria-label="連続演出"><span>気配</span><i/><span>追尾</span><i/><span>合わせ！</span></div>}
    {pose==='sleep'&&<div className="ty-sleep-bubbles" aria-hidden="true">ふぁ…<i>すぅ…</i></div>}
    <div className="ty-stage-caption" aria-live="polite">{visualCaption(visual,phase)}</div>
    {visual.tier==='rare'&&!visual.chanceLeft&&<div className="ty-rare-ribbon" aria-hidden="true"><span>大物の気配…!?</span></div>}
  </div>;
}
