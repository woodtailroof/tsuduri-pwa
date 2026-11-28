import {useEffect,useState} from 'react';
import {poseSrc} from '../lib/slotFishing';
import {SLOT_CAST} from '../lib/slotCast';
import {baitOutcome,type BaitPreview} from '../lib/slotBaitPreview';
const base='/assets/slot/missions/bigbait-v2/';
const offsets=[-45,20,-40,0];
/** Shared environment/gear plates; only the actor plates change with a character skin. */
export default function SlotBaitCinema({state,actor=0}:{state:BaitPreview;actor?:number}){
 const [pose,setPose]=useState(0);
 const n=state.stops.filter(Boolean).length;
 useEffect(()=>{
  setPose(0);
  if(state.game!==1||n!==0)return;
  const ids=[setTimeout(()=>setPose(1),650),setTimeout(()=>setPose(2),830),setTimeout(()=>setPose(4),1090),setTimeout(()=>setPose(3),1740)];
  return()=>ids.forEach(clearTimeout);
 },[state.game,state.cycle,n]);
 const surface=state.game===1&&n>0,under=state.game===2,win=baitOutcome(state)==='win';
 const common=pose===4?1:0;
 const chasing=surface||under||state.done;
 const frame=Math.min(2,Math.max(0,n-1));
 const escaped=state.done&&!win;
 const portrait=actor===0?`${base}reaction-tsuduri-${frame}.webp`:`/assets/slot/${SLOT_CAST[actor]?.id??'tsuduri'}-icon.webp`;
 const showActor=actor===0&&!chasing&&pose<4;

 return <div className="ty-bait-cinema ty-bait-keyframes">
 <img className="ty-bait-plate" src={`${base}${win?'hooked':chasing?`${escaped?'dart-top':'follow-top'}-${frame}`:`common-${common}`}.webp`} alt=""/>
 {showActor&&<><img className="ty-bait-plate" src={`${base}gear-${pose}.webp`} alt="共通の竿とリール"/><img className="ty-bait-actor-plate" style={{left:`${(40+offsets[pose])/9.6}%`}} src={`${base}actor-${pose}.webp`} alt="つづりのキャスト動作"/></>}

 {!chasing&&actor!==0&&<img className="ty-bait-entry-actor" src={poseSrc(SLOT_CAST[actor]?.id??'tsuduri',pose===3?'retrieve':'cast')} alt={`${SLOT_CAST[actor]?.name??'つづり'}がキャストする`}/>}
 {chasing&&!state.done&&<aside key={`${state.game}-${frame}-${state.done}`} className={`ty-bait-reaction reaction-${frame}`} aria-label={`${SLOT_CAST[actor]?.name??'つづり'}の反応`}><img src={portrait} alt={escaped?'魚を見送る':frame===0?'魚影に気づく':frame===1?'追尾に期待する':'食いつきを待って集中する'}/><span>{SLOT_CAST[actor]?.name??'つづり'}</span></aside>}
 {state.done&&<div className={`ty-bait-result-overlay result-${win?'win':'miss'}`} aria-label={win?'喜ぶキャラクター':'ガッカリするキャラクター'}><img src={`${base}result-${SLOT_CAST[actor]?.id??'tsuduri'}-${win?'win':'miss'}.webp`} alt={`${SLOT_CAST[actor]?.name??'つづり'}が${win?'喜ぶ':'ガッカリする'}`}/></div>}
 </div>;
}
