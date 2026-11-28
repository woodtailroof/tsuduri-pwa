import SlotBaitCinema from './SlotBaitCinema';
import {useEffect,useRef,useState} from 'react';
import {advanceBait,baitOutcome,initialBaitPreview,type BaitRoute} from '../lib/slotBaitPreview';
import '../screens/SlotBaitPreview.css';
export default function SlotBaitPreview({close}:{close:()=>void}){
 const [state,setState]=useState(()=>initialBaitPreview());
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{dialog.current?.showModal();},[]);
 const n=state.stops.filter(Boolean).length,outcome=baitOutcome(state),retry=state.done&&state.route==='retry'&&state.cycle===0;
 const canLever=state.game===0||n===3&&(!state.done||retry);
 function route(value:BaitRoute){setState(initialBaitPreview(value));}
 return <dialog ref={dialog} className="ty-bait-dialog" onCancel={close} onClose={close}><div className="ty-bait-toolbar"><b>ビッグベイトチャレンジ！</b><button onClick={close}>閉じる ✕</button></div>
 <div className={`ty-bait-world bait-game-${state.game} bait-step-${n} bait-${outcome} ${retry?'bait-retry':''}`}>
 <SlotBaitCinema state={state}/>
 <div className="ty-bait-speedlines"/>
 <div className="ty-bait-status">{state.game?`${state.cycle?'再チャレンジ · ':''}${state.game} / 2 GAME`:'演出プレビュー'}</div>
 <div className="ty-bait-dialogue" aria-live="polite">{state.game===0?'レバーONで、大きなルアーを投げるよ！':state.done?outcome==='win'?'大物ヒット！ ボーナス確定！':retry?'見切った……？ まだいる！ もう一投！':'見切られちゃった……！':state.game===1?n===3?'魚影が迫る……次のレバーへ！':n===0?'キャスト！ 水面直下を泳がせるよ！':'右へ、左へ……追ってきてる！':n===3?'……！':n===2?'今、食う……!?':'間を作って……食わせる！'}</div>
 {state.done&&<strong className="ty-bait-resolution">{outcome==='win'?'HIT！':retry?'もう一投！':'MISS…'}</strong>}
 </div>
 <div className="ty-bait-buttons"><button disabled={!canLever} onClick={()=>setState(s=>advanceBait(s,'lever'))}>レバーON</button>{[0,1,2].map(i=><button key={i} disabled={!state.game||state.stops[i]||state.done} onClick={()=>setState(s=>advanceBait(s,i))}>STOP {i+1}</button>)}</div>
 <div className="ty-bait-routes">{(['win','miss','retry'] as const).map(v=><button key={v} aria-pressed={state.route===v} onClick={()=>route(v)}>{v==='win'?'成功を確認':v==='miss'?'失敗を確認':'再挑戦→成功'}</button>)}</div><p>映像確認専用・つづり版。2ゲーム×1クール。メダル・内部抽選・遊技履歴には影響しません。</p></dialog>;
}
