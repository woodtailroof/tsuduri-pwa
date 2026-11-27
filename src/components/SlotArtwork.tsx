import { useId } from 'react';
import { SLOT_SYMBOLS } from '../lib/slotGame';
import { STAGE_NAMES, visualCaption, type SlotVisual } from '../lib/slotPresentation';
export const SLOT_CAST = [
  {id:'tsuduri',name:'つづり',color:'#ff85bd'},
  {id:'matsuri',name:'まつり',color:'#c4a1ff'},
  {id:'kokoro',name:'こころ',color:'#7ddfef'},
  {id:'lulu',name:'るる',color:'#ffd28b'},
  {id:'rin',name:'りん',color:'#ffafba'},
] as const;
export function iconSrc(id:string){return `/assets/slot/${id}-icon.webp`;}
export function portraitSrc(id:string){return `/assets/characters-mobile/${id}/uniform/happy.webp`;}
export function hideBrokenImage(event:React.SyntheticEvent<HTMLImageElement>){event.currentTarget.style.visibility='hidden';}
export function bonusVariant(reel:number,position:number){return (reel*2+Math.floor(position/7))%5;}
// Atlas: 5 character sevens, 5 character BARs, gold reel, replay fish, lure, float.
export function symbolTile(symbol:number,variant=0):number {
  const actor=((Math.trunc(variant)%5)+5)%5;
  return symbol===0?actor:symbol===5?5+actor:[0,12,10,13,11,5][symbol];
}
export function SlotSymbol({symbol,variant=0}:{symbol:number;variant?:number}) {
  const clipId=`slot-symbol-${useId().replace(/[^a-zA-Z0-9_-]/g,'')}`;
  const tile=symbolTile(symbol,variant),column=tile%4,row=Math.floor(tile/4);
  const bonus=symbol===0||symbol===5,actor=((Math.trunc(variant)%5)+5)%5;
  const label=bonus?`${SLOT_CAST[actor].name}の${symbol===0?'7':'BAR'}`:SLOT_SYMBOLS[symbol].label;
  return <svg viewBox="0 0 300 200" preserveAspectRatio="xMidYMid meet" className={`ty-motif-symbol ty-painted-symbol motif-${symbol} ${bonus?'is-bonus-symbol':'is-small-symbol'} bonus-variant-${actor}`} role="img" aria-label={label} data-symbol-tile={tile}>
    <defs><clipPath id={clipId}><rect width="300" height="200"/></clipPath></defs>
    <g clipPath={`url(#${clipId})`}><image href="/assets/slot/moe-reel-symbols.webp" x={-column*300} y={-row*200} width="1200" height="800"/></g>
  </svg>;
}
export function FishingChibi({actor,className='',pose=0}:{actor:number;className?:string;pose?:number}) {
  return <div className={`ty-fishing-chibi ${className}`} style={{backgroundPosition:`${actor*25}% ${pose*50}%`}} role="img" aria-label={`${SLOT_CAST[actor].name}が釣りをしている`}/>;
}
export function SlotLcdScene({visual,phase,running}:{visual:SlotVisual;phase:number;running:boolean}) {
  const title=STAGE_NAMES[visual.stage];
  const pose=visual.outcome==='hit'||visual.outcome==='replay'||visual.outcome==='bonus'?2:running?(phase<1?1:phase>=2?2:0):0;
  return <div className={`ty-stage-scene stage-${visual.stage} cue-${visual.cue} effect-${visual.tier} outcome-${visual.outcome} scene-phase-${phase}`} aria-label={`液晶ステージ：${title}`}>
    <div className="ty-scene-cloud cloud-one"/><div className="ty-scene-cloud cloud-two"/>
    <div className="ty-stage-sun"/><div className="ty-stage-mountains"/><div className="ty-stage-bridge"/>
    <svg className="ty-scene-water" viewBox="0 0 600 100" preserveAspectRatio="none" aria-hidden="true"><path d="M-80 40Q0 10 80 40T240 40T400 40T560 40T720 40V100H-80Z"/><path d="M-80 70Q0 40 80 70T240 70T400 70T560 70T720 70V100H-80Z"/></svg>
    <div className="ty-stage-bank"/><div className="ty-stage-railing"/>
    <div key={visual.actor} className="ty-stage-angler"><FishingChibi actor={visual.actor} pose={pose} className={running?'is-fishing':'is-resting'}/><span>{SLOT_CAST[visual.actor].name}</span></div>
    <div key={visual.seed} className="ty-stage-action" aria-hidden="true"><div className="ty-stage-line"/><div className="ty-stage-float"/><div className="ty-stage-fish ty-vfx-fish"/><div className="ty-stage-splash ty-vfx-splash"/><div className="ty-stage-crab ty-vfx-crab"/><div className="ty-stage-shine ty-vfx-gold"/><div className="ty-stage-miss">…</div></div>
    <div className="ty-stage-banner"><span>{title}</span><b>{visual.tier==='rare'?'CHANCE!?':visual.cue==='quiet'?'FISHING TIME':'CAST CHANCE'}</b></div>
    <div className="ty-stage-caption" aria-live="polite">{visualCaption(visual,phase)}</div>
    {visual.tier==='rare'&&<div className="ty-rare-ribbon" aria-hidden="true"><span>大物の気配…!?</span></div>}
  </div>;
}
