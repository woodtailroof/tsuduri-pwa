import SlotBaitCinema from './SlotBaitCinema';
import {useEffect,useState} from 'react';
import {challengeSpec,type Challenge} from '../lib/slotChallenges';
import {SLOT_CAST} from '../lib/slotCast';
import {poseSrc,type FishingPose} from '../lib/slotFishing';
import type {SlotVisual} from '../lib/slotPresentation';
export default function SlotChallenge({challenge,total,left,outcome,phase=0}:{challenge:Challenge;total:number;left:number;phase?:number;outcome:SlotVisual['outcome']}){
 const [time,setTime]=useState(0);
 useEffect(()=>{
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){setTime(1600);return;}
  let elapsed=0,previous=performance.now();const timer=window.setInterval(()=>{const now=performance.now();if(!document.hidden)elapsed+=Math.min(250,now-previous);previous=now;setTime(elapsed);},100);return()=>window.clearInterval(timer);
 },[]);
 const spec=challengeSpec(challenge.id),actor=SLOT_CAST[challenge.actor];
 const won=outcome==='confirmed',lost=outcome==='escape',final=won||lost,step=total-left;
 const stage=left<=2?'climax':step>=2?'attempt':'intro';
 const selecting=time<1200&&!final;
 const pose:FishingPose=spec.mode==='float'?(stage==='intro'?'sit':'twitch'):spec.id==='distance'?(time%4500<1100?'stand':'cast'):stage==='intro'?'stand':'retrieve';
 const caption=won?spec.win:lost?spec.lose:spec[stage];
 if(spec.id==='bigbait'){
  const beat=Math.max(0,Math.min(3,phase));
  const state={game:(step%2===0?1:2) as 1|2,stops:[0,1,2].map(i=>i<beat),cycle:Math.floor(step/2),route:(lost?'miss':'win') as 'miss'|'win',done:final};
  return <section className={`ty-challenge challenge-bigbait ty-bait-live ${won?'challenge-win':lost?'challenge-lose':''}`} aria-label={`専用シネマ演出 ${spec.title} ${actor.name} 期待度${challenge.stars}つ星`}>
   <SlotBaitCinema state={state} actor={challenge.actor}/>
   <div className="ty-bait-live-heading"><b>{spec.title}</b><span>期待度 {'★'.repeat(challenge.stars)}</span></div>
   <div className="ty-bait-live-caption" role="status">{won?'大物ヒット！ BONUS CHANCE！':lost?'見切られちゃった……次こそ！':beat===0?'集中して……':beat===1?'魚影……？':beat===2?'追ってきてる！':'今、食う……!?'}{won&&<small>MISSION CLEAR</small>}{lost&&<small>NEXT CHALLENGE</small>}</div>
  </section>;
 }
 return <section className={`ty-challenge challenge-${spec.id} challenge-${stage} ${selecting?'is-selecting':''} ${won?'challenge-win':lost?'challenge-lose':''}`} aria-label={`専用シネマ演出 ${spec.title} ${actor.name} 期待度${challenge.stars}つ星`}>
  <div className="ty-cinema-background" style={{backgroundImage:`url(/assets/slot/missions/${spec.id}.webp)`}} aria-hidden="true"/>
  <div className="ty-cinema-depth" aria-hidden="true"/><div className="ty-challenge-vignette"/>
  {!final&&<div className="ty-cinema-intro" aria-hidden="true"><small>TSURIYOME SPECIAL CHALLENGE</small><strong>{spec.title}</strong></div>}
  <div className="ty-cinema-impact" aria-hidden="true"/>
  <header><small>TSURIYOME MISSION</small><h2>{spec.title}</h2><p>{spec.goal}</p></header>
  <div className="ty-challenger-select"><span>{selecting?'挑戦者、選出中…':`${actor.name}、挑戦！`}</span><div>{SLOT_CAST.map((c,i)=><img key={c.id} className={(selecting?Math.floor(time/120)%5:challenge.actor)===i?'selected':''} src={`/assets/slot/${c.id}-icon.webp`} alt={c.name}/>)}</div><b title="開始契機とお題・担当の組み合わせから算出した導入時の期待度。途中のレア役による上書き抽選あり。">期待度 <strong>{'★'.repeat(challenge.stars)}<i>{'☆'.repeat(5-challenge.stars)}</i></strong></b><em>{challenge.skill>=4?'得意のお題！':challenge.skill<=2?'苦手でも、挑む！':'ここが腕の見せどころ！'}</em></div>
  <div className={`ty-mission-actor mission-pose-${pose}`}><img src={poseSrc(actor.id,pose)} alt="" draggable={false}/><span style={{borderColor:actor.color}}>{actor.name}</span></div>
  <div className="ty-mission-field" aria-hidden="true">
   <svg viewBox="0 0 360 150" preserveAspectRatio="none"><defs><linearGradient id={`dock-${spec.id}`} x2="0" y2="1"><stop stopColor="#dab88b"/><stop offset="1" stopColor="#594565"/></linearGradient></defs>
    {spec.id==='skipping'&&<g className="ty-mission-dock"><path d="M150 28H355V43H150Z" fill={`url(#dock-${spec.id})`}/><path d="M170 40V117M315 40V117" stroke="#74586a" strokeWidth="13"/><path d="M150 29H355" stroke="#ffe6bb" strokeWidth="3"/></g>}
    <path className="ty-mission-trajectory" d={spec.id==='skipping'?'M12 112Q55 63 85 110Q112 75 147 108Q190 82 227 106Q260 89 298 105':spec.id==='distance'?'M12 112Q150 -70 327 93':'M26 103Q160 26 282 100'}/>
    <ellipse className="ty-mission-target" cx={spec.id==='distance'?327:298} cy="107" rx="23" ry="9"/>
    <path className="ty-mission-ripples" d="M70 120Q100 109 130 120M175 121Q204 112 236 120M270 126Q295 117 328 125"/>
   </svg>
   <div className="ty-mission-lure"/><div className="ty-mission-fish"/><div className="ty-mission-float"/><div className="ty-mission-burst"/>
   {spec.id==='distance'&&<b className="ty-distance-meter">{final?(won?'100':'92'):Math.min(99,35+step*8+Math.floor(time%1500/90))}<small>m</small></b>}
   {spec.id==='skipping'&&<div className="ty-skip-calls"><i>1 BOUNCE</i><i>2 BOUNCE</i><i>IN THE GAP!</i></div>}
  </div>
  <div className="ty-cinema-progress" aria-label="演出の進行"><span className={stage==='intro'?'current':''}>接近</span><i/><span className={stage==='attempt'?'current':''}>挑戦</span><i/><span className={stage==='climax'?'current':''}>決着</span></div>
  <div className={`ty-mission-caption ${final?'is-final':''}`} role="status"><small>{final?(won?'MISSION CLEAR':'NEXT CHALLENGE'):stage==='climax'?'FINAL APPROACH':stage==='attempt'?'CHALLENGE START':'READY?'}</small><strong>{caption}</strong></div>
  {won&&<div className="ty-mission-confetti" aria-hidden="true">✦ ✧ ✦ ✧ ✦</div>}
 </section>;
}
