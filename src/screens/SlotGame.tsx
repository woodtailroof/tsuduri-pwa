import { useCallback, useEffect, useRef, useState } from 'react';
import PageShell from '../components/PageShell';
import { beginSpin, stopReel, settleSpin, readSession, initialSession, visibleSymbols, modulo, SLOT_SYMBOLS, REEL_STRIPS, STORAGE_KEY, BIG_LIMIT, REG_LIMIT, LINE_NAMES, type Session, type Result, type Bonus } from '../lib/slotGame';
import './SlotGame.css';
import './SlotMachine.css';
import './SlotStages.css';
import { advanceReel, reelStopDuration } from '../lib/slotReelMotion';
import type { CSSProperties } from 'react';
import { SLOT_CAST, iconSrc, hideBrokenImage, SlotSymbol, SlotLcdScene, FishingChibi, bonusVariant } from '../components/SlotArtwork';
import { nextVisual, resolveVisual, STAGE_NAMES } from '../lib/slotPresentation';
export { SlotSymbol } from '../components/SlotArtwork';
function loadSession(){try{return readSession(localStorage.getItem(STORAGE_KEY));}catch{return initialSession();}}
function saveSession(session:Session){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(session));return true;}catch{return false;}}
const CELL_COUNT=45;
export function Reel({index,roundId,running,target,initial,requestStop,onSettled}:{index:number;roundId:number;running:boolean;target:number|null;initial:number;requestStop:(index:number,current:number)=>boolean;onSettled:(index:number)=>void}) {
  const belt=useRef<HTMLDivElement>(null),position=useRef(target??initial),frozen=useRef(false);
  const strip=REEL_STRIPS[index];const offset=(p:number)=>21+modulo(p);
  useEffect(()=>{
    if(!running)return;
    if(target===null)frozen.current=false;
    let frame=0,last=performance.now(),start:number|null=null,from=position.current,end=from,duration=180;
    const loop=(now:number)=>{
      const dt=Math.max(0,now-last);last=now;
      if(target!==null && start===null){start=now;from=position.current;end=Math.floor((from-target)/21)*21+target;duration=reelStopDuration(from-end);}
      const progress=start===null?0:Math.min(1,(now-start)/duration);
      position.current=start===null?advanceReel(position.current,dt,frozen.current):from+(end-from)*progress;
      if(belt.current)belt.current.style.transform=`translateY(${-offset(position.current)*100/CELL_COUNT}%)`;
      if(start!==null&&progress===1){onSettled(index);return;}
      frame=requestAnimationFrame(loop);
    };
    frame=requestAnimationFrame(loop);return()=>cancelAnimationFrame(frame);
  // roundId starts a fresh run even when consecutive rounds have the same target.
  },[running,target,index,onSettled,roundId]);
  const cells=[strip[20],...strip,...strip,...strip.slice(0,2)];
  const label=running&&target===null?'回転中':visibleSymbols(index,target??initial).map(s=>SLOT_SYMBOLS[s].label).join('・');
  return <div className="ty-reel-column"><div className={`ty-reel ${running&&target===null?'is-spinning':''}`} aria-label={`${index+1}リール ${label}`}>
    <div className="ty-strip" ref={belt} style={{transform:`translateY(${-offset(position.current)*100/CELL_COUNT}%)`}}>{cells.map((s,i)=><div className={`ty-symbol symbol-${s}`} key={i}><SlotSymbol symbol={s} variant={bonusVariant(index,modulo(i-1))}/></div>)}</div><div className="ty-reel-shade"/>
  </div><button className="ty-stop" disabled={!running||target!==null} onClick={()=>{frozen.current=true;if(!requestStop(index,position.current))frozen.current=false;}} aria-label={`${index+1}リール停止`}><span/>STOP {index+1}</button></div>;
}
export default function SlotGame({back}:{back:()=>void}) {
  const [session,setSession]=useState(loadSession);const current=useRef(session);
  const [result,setResult]=useState<Result|null>(null),[details,setDetails]=useState(false),[error,setError]=useState(''),[saveWarning,setSaveWarning]=useState(false),[resetOpen,setResetOpen]=useState(false);
  const settled=useRef([false,false,false]);
  const commit=useCallback((next:Session)=>{current.current=next;setSession(next);setSaveWarning(!saveSession(next));},[]);
  const finish=useCallback((index:number)=>{
    const value=current.current;if(!value.spin||settled.current[index])return;
    settled.current[index]=true;
    if(settled.current.every(Boolean)&&value.spin.stops.every(p=>p!==null)){
      try{const done=settleSpin(value);done.session.visual=resolveVisual(value.visual,done.result);commit(done.session);setResult(done.result);}catch{setError('入賞判定に失敗しました。再読み込みすると停止状態から再開します。');}
    }
  },[commit]);
  const requestStop=useCallback((index:number,position:number)=>{
    const value=current.current;if(!value.spin||value.spin.stops[index]!==null)return false;
    try{commit(stopReel(value,index,position));return true;}catch{setError('停止位置を決められませんでした。もう一度STOPを押してください。');return false;}
  },[commit]);
  function start(demo:Bonus|null=null){
    const value=current.current;if(value.spin)return;
    try{const next=beginSpin(value.state,Math.random,demo);next.visual=nextVisual(value.visual,{role:next.spin!.role,pending:next.state.pending,active:next.state.active});settled.current=[false,false,false];setResult(null);setError('');commit(next);}catch{setError('メダルが足りません。「遊技データ」で300枚に戻せます。');}
  }
  function reset(){if(current.current.spin)return;settled.current=[false,false,false];commit(initialSession());setResult(null);setError('');setResetOpen(false);}
  const {state,spin}=session;const running=!!spin;const active=state.active;
  const bonusFlag=!!state.pending;const bonusLimit=active==='BIG'?BIG_LIMIT:REG_LIMIT;
  const cost=active?1:state.replay?0:3;const net=state.paid-state.spent;
  const litLines=result?[...new Set([...result.board.awards.map(a=>a.line),...result.board.bonusLines])]:[];
  const [min,max]=[Math.min(0,...state.history),Math.max(1,...state.history)];
  const chart=state.history.map((n,i)=>`${10+i/Math.max(1,state.history.length-1)*280},${85-(n-min)/(max-min)*70}`).join(' ');
  const message=error||(running?'好きな順番でSTOP！ 当選役を最大4コマで引き込むよ。':result?.message|| (spin?'中断したゲームを再開します。':'ひろっち、準備できた？ レバーONだよっ♪'));
  const support=SLOT_CAST[session.visual.actor];
  const scenePhase=spin?spin.stops.filter(p=>p!==null).length:3;
  return <PageShell title="🎰 釣嫁スロット" subtitle="潮騒パラダイス · A-TYPE / 5 LINES · SOUND OFF" onBack={back} maxWidth={1160} showTestCharacter={false}>
    <div className="ty-slot-layout ty-a-type ty-cast-edition ty-machine-edition"><section className={`ty-cabinet ${result?.bonusStarted?'ty-jackpot':''} ${active?'ty-bonus-mode':''}`} aria-label="釣嫁スロット筐体">
      <div className="ty-machine-crown" aria-hidden="true"><span/>TSURIYOME AMUSEMENT<span/></div>
      <div className="ty-marquee"><span>TSURIYOME PROJECT</span><strong>潮騒パラダイス<span>SHIOSAI PARADISE · A-TYPE</span></strong><i>✦</i></div>
      <div className="ty-lcd"><div className="ty-lcd-top"><span>⚓ {active?`${active} BONUS`:STAGE_NAMES[session.visual.stage]}</span><b>{active?`${state.bonusPaid} / ${bonusLimit} PAYOUT`:state.replay?'REPLAY':'NORMAL'}</b></div>
        <SlotLcdScene visual={session.visual} phase={scenePhase} running={running}/>
        <div className="ty-sun"/>
        {active&&<div className="ty-bonus-cut-in ty-chibi-cut-in" key={support.id} aria-hidden="true"><FishingChibi actor={session.visual.actor}/><span>{support.name}</span></div>}
        <div className="ty-lcd-sparkles" aria-hidden="true">✦<i>✧</i><b>✦</b></div><div className="ty-sea"/><div className="ty-island"/><div className="ty-fishing-silhouette" aria-hidden="true">⚓</div>
        <div className="ty-lcd-message" aria-live="polite"><small>{active?'大漁の時間は、ここから。':bonusFlag?'ボーナス図柄を狙ってね！':''}</small><strong>{result?.bonusStarted?result.title:active?`${active} BONUS`:bonusFlag?'BONUS CHANCE':running?'':result?.payout?result.title:''}</strong><em>{active?`払い出し ${state.bonusPaid}枚`:result?.payout?`＋${result.payout} MEDALS`:state.replay?'NEXT PLAY FREE':''}</em></div>
        {active&&<div className="ty-bonus-progress"><div style={{width:`${Math.min(100,state.bonusPaid/bonusLimit*100)}%`}}/></div>}
        <div className="ty-talk"><b><img src={iconSrc(support.id)} alt="" draggable={false} onError={hideBrokenImage}/>{support.name}</b><span>{message}</span></div>
      </div>
      <div className="ty-lamp-row"><div className={`ty-chance-lamp ${bonusFlag?'is-lit':''}`} role="status" aria-label={bonusFlag?'ボーナス当選中':'ボーナス告知ランプ'}><span>FISH ON!</span><small>{bonusFlag?'BONUS 確定':'TSURIYOME CHANCE'}</small></div><div className="ty-bonus-target">{bonusFlag?<><b>{state.pending==='BIG'?'7・7・7':'7・7・BAR'}</b><small>揃えるまで持ち越し</small></>:<><b>BIG <i>{state.bigCount}</i>　REG <i>{state.regCount}</i></b><small>5ライン有効 / MAX 4コマ滑り</small></>}</div></div>
      <div className="ty-reel-bezel-title"><span>◀ 5 PAY LINES</span><b>SHIOSAI PARADISE</b><span>80 RPM ▶</span></div>
      <div className="ty-reel-frame"><svg className="ty-lines" viewBox="0 0 300 300" preserveAspectRatio="none" aria-hidden="true">{[[0,50,300,50],[0,150,300,150],[0,250,300,250],[0,0,300,300],[0,300,300,0]].map((p,i)=><line key={i} x1={p[0]} y1={p[1]} x2={p[2]} y2={p[3]} className={litLines.includes(i)?'is-winning':''}/>)}</svg>
        <div className="ty-reels">{[0,1,2].map(i=><Reel key={i} index={i} roundId={state.spins} running={running} target={spin?.stops[i]??null} initial={state.positions[i]} requestStop={requestStop} onSettled={finish}/>)}</div></div>
      <div className="ty-machine-controls"><div className="ty-bet-decor" aria-hidden="true"><b>AUTO<br/>BET</b><span>{cost===0?'REPLAY':`${cost} BET`}</span></div><div className="ty-console"><div className="ty-meter"><small>CREDIT</small><strong>{state.credit.toLocaleString()}</strong></div><button className="ty-lever" onClick={()=>start()} disabled={running||state.credit<cost}><span>●</span>{running?'回転中':'LEVER ON'}<small>{cost===0?'REPLAY / FREE':`${cost} MEDAL${cost>1?'S':''}`}</small></button><div className="ty-meter"><small>WIN</small><strong>{result?.payout??0}</strong></div></div><div className="ty-coin-slot" aria-hidden="true"><span/>MEDAL</div></div>
      <div className="ty-cast-plaque" aria-label="釣嫁ぷろじぇくとの5人">{SLOT_CAST.map(c=><div key={c.id} style={{'--cast-color':c.color} as CSSProperties}><img src={iconSrc(c.id)} alt={c.name} draggable={false} onError={hideBrokenImage}/><span>{c.name}</span></div>)}</div>
      <div className="ty-speaker-tray" aria-hidden="true"><div/><span>TSURIYOME PROJECT</span><div/></div>
      <div className="ty-footer"><span>✦ TSURIYOME ALL STARS ✦</span><span>{litLines.length?litLines.map(i=>LINE_NAMES[i]).join(' / '):'上・中・下・斜め2本'}</span></div>
    </section>
    <aside className="ty-slot-info"><div className="ty-info-card"><small>SESSION DATA</small><h2>ひろっちの遊技ログ</h2><div className="ty-big-reg"><div><span>BIG</span><b>{state.bigCount}</b></div><div><span>REG</span><b>{state.regCount}</b></div><div><span>合算</span><b>{state.bigCount+state.regCount?`1/${(state.normalSpins/(state.bigCount+state.regCount)).toFixed(1)}`:'—'}</b></div></div><div className="ty-stats"><span>総ゲーム数 <b>{state.spins} G</b></span><span>通常ゲーム数 <b>{state.normalSpins} G</b></span><span>通常時・ボーナス間 <b>{state.sinceBonus} G</b></span><span>差枚 <b>{net>0?'+':''}{net}</b></span></div><svg className="ty-history-chart" viewBox="0 0 300 100" role="img" aria-label={`直近${state.history.length}ゲームの差枚推移。現在${net}枚`}><line x1="10" x2="290" y1={85-(0-min)/(max-min)*70} y2={85-(0-min)/(max-min)*70} stroke="#ffffff33" strokeDasharray="3 4"/><polyline points={chart} fill="none" stroke="#f1a7cf" strokeWidth="2.5"/><text x="10" y="98" fill="#b8c2da" fontSize="8">直近最大160ゲーム / 差枚</text></svg>{state.bonusLog.length>0&&<div className="ty-bonus-log">{state.bonusLog.slice(0,4).map((v,i)=><span key={i}>{v}</span>)}</div>}</div>
    <div className="ty-info-card"><small>5 LINES · PAY TABLE</small><h2>大漁へのチャンス</h2><ul className="ty-pays"><li><b>7 · 7 · 7</b><span>BIG / 252枚以上払い出し</span></li><li><b>7 · 7 · BAR</b><span>REG / 96枚以上払い出し</span></li>{[{symbol:2,label:'金色リール ×3',pay:'8枚 / 1ライン'},{symbol:1,label:'ビッグベイト ×3',pay:'6枚 / 1ライン'},{symbol:3,label:'左リールの赤ウキ',pay:'2枚 / 1ゲーム'},{symbol:4,label:'魚 ×3',pay:'リプレイ'}].map(row=><li key={row.symbol} className="ty-motif-pay"><b><SlotSymbol symbol={row.symbol}/></b><span>{row.label}<small>{row.pay}</small></span></li>)}</ul><p>通常3枚・ボーナス中1枚。払い出しは1ゲーム最大15枚。ボーナス中は金色リール成立、規定払い出しで終了。表示枚数は純増ではありません。</p></div>
    <div className="ty-info-card"><button className="ty-text-button" onClick={()=>setDetails(!details)} aria-expanded={details}>遊び方・リール配列・遊技データ {details?'−':'＋'}</button>{details&&<div><p>レバーで役とボーナスを抽選。押した位置から最大4コマ滑らせて停止します。左リールの7かBARを中段付近に狙うと、赤ウキ（チェリー相当）とビッグベイト（スイカ相当）をフォローできます。ビッグベイト停止時は中・右にも狙ってね。色違いの7同士もBIG入賞です。小役やボーナスは目押しで取りこぼす場合があります。リプレイは引き込み、ボーナス当選は揃えるまで保持します。</p><p>BIG 1/180・REG 1/240（通常時、新規抽選可能なゲーム）。合算約1/103。実機より遊びやすいオリジナル設定で、ハマリによる確率変更や天井はありません。</p><p>ステージは通常の港・サーフ・河口、レア役後の夕マズメ、ボーナス中のフェスに遷移します。ステージ変化だけで当たり確定や抽選確率アップにはなりません。キャラもときどき交代。回転は1周0.75秒（80rpm）。今はレバー時の完全告知。課金・換金なし、音声なし。前の試作とは別の遊技データです。中断したゲームは再開できます。</p><details className="ty-strip-guide"><summary>各リールの21コマ配列を見る</summary><div>{REEL_STRIPS.map((strip,r)=><ol key={r} aria-label={`${r+1}リール配列`}>{strip.map((symbol,i)=><li key={i}><small>{i+1}</small><SlotSymbol symbol={symbol} variant={bonusVariant(r,i)}/></li>)}</ol>)}</div></details><div className="ty-demo-buttons">{(['BIG','REG'] as const).map(b=><button key={b} className="ty-demo" disabled={running||!!active||state.credit<cost} onClick={()=>start(b)}>{b}当選を試す</button>)}</div><p>演出確認は抽選外。自分で図柄を揃えると開始し、メダルとログにも反映されます。</p><button className="ty-text-button" disabled={running} onClick={()=>setResetOpen(!resetOpen)}>遊技データをリセット</button>{resetOpen&&<div><p>現在のメダル・履歴を消して300枚から遊び直します。</p><button className="ty-demo" disabled={running} onClick={reset}>消去して遊び直す</button></div>}</div>}{state.credit<cost&&!running&&<button className="ty-demo" onClick={()=>{setDetails(true);setResetOpen(true)}}>メダルを補充して遊び直す</button>}{saveWarning&&<p role="status">この端末では保存できません。画面を閉じると進行が失われます。</p>}{error&&<p role="alert">{error}</p>}</div></aside>
    </div>
  </PageShell>;
}
