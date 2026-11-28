import {FishingChibi} from './SlotArtwork';
import {SLOT_CAST} from '../lib/slotCast';
import type {Bonus,Result,Session} from '../lib/slotGame';
export function SlotBonusScreen({session,result}:{session:Session;result:Result|null}){
 const {state,spin}=session;
 const kind:Bonus=state.active??state.pending??result?.bonusEnded??'BIG';
 const confirmed=!!state.pending&&state.announced||!!state.active&&state.bonusGames===0&&!spin;
 const stops=spin?.stops.filter(p=>p!==null).length??0;
 const phase=confirmed?'confirmed':spin?(stops===0?'cast':'fight'):result?.bonusEnded?'finish':result&&state.bonusGames>0?'get':'ready';
 const actor=SLOT_CAST[session.visual.actor];
 const title=kind==='BIG'?'爆釣ボーナス':'NABU★RUSHボーナス';
 return <div className={`ty-bonus-scene ty-bonus-${kind.toLowerCase()} ty-bonus-phase-${phase}`} data-phase={phase}>
  {confirmed?<><img className="ty-bonus-group" src="/assets/slot/bonus-confirmed.webp" alt="釣嫁5人が揃って大漁をお祝い"/><div className="ty-confirm-title"><small>TSURIYOME ALL STARS</small><strong>{title}確定</strong><span>{state.pending?(kind==='BIG'?'7・7・7 を狙ってね！':'7・7・BAR を狙ってね！'):'レバーONで大漁タイム！'}</span></div></>:<>
   <div className="ty-bonus-background"/>
   <div className="ty-bonus-counter"><b>{title}</b><span>{kind==='REG'?`残り ${state.regRemaining} G`:`${state.bonusPaid} / 252 枚`}</span><small>{state.bonusGames} G · 払い出し {state.bonusPaid} 枚{kind==='REG'?` · 延長 ${state.rushExtensions} 回`:''}</small></div>
   <div className="ty-bonus-angler" key={`${actor.id}-${phase}`}><FishingChibi actor={session.visual.actor} pose={phase==='cast'?'cast':phase==='ready'?'stand':'retrieve'}/></div>
   {phase==='cast'&&<div className="ty-bonus-lure" aria-hidden="true">✦</div>}
   {phase==='fight'&&<div className="ty-bonus-bite">HIT！<small>第3停止で合わせて！</small></div>}
   {(phase==='get'||phase==='finish')&&<><div className="ty-bonus-catch-fish" aria-hidden="true"/><div className="ty-bonus-get" key={state.spins}><strong>{result?.payout?'GET！':'CHANCE！'}</strong><b>{result?.payout?`＋${result.payout} MEDALS`:''}</b>{!!result?.rushAdded&&<em>レア役キャッチ！ ＋8G</em>}{phase==='finish'&&<small>FINISH · {state.bonusGames}G / {state.bonusPaid}枚</small>}</div></>}
   <div className="ty-bonus-caption">{actor.name} ♥ {phase==='cast'?'いっけー！ 大物めがけてキャスト！':phase==='fight'?'来てる、来てる……合わせるよ！':phase==='finish'?'大漁だったね！ また一緒に投げよう♪':phase==='get'?'やった、キャッチ！ 次もいくよっ♪':'レバーで投げるよ！'}</div>
  </>}
 </div>;
}
