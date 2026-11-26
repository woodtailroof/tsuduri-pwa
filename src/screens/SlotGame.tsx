import { useCallback, useEffect, useRef, useState } from 'react';
import PageShell from '../components/PageShell';
import { drawSlot, initialWallet, readSlotWallet, REEL_STRIP, SLOT_SYMBOLS, type SlotRound } from '../lib/slotGame';
import './SlotGame.css';
const KEY = 'tsuduri_slot_prototype_v1';
function loadWallet() { try { return readSlotWallet(localStorage.getItem(KEY)); } catch { return initialWallet(); } }
export function Reel({ index, spinning, symbol, stopped, stop, onSettled }: {index:number;spinning:boolean;symbol:number;stopped:boolean;stop:()=>void;onSettled:(index:number)=>void}) {
  const strip = useRef<HTMLDivElement>(null);
  const position = useRef(REEL_STRIP.indexOf(1));
  const cycle = REEL_STRIP.length;
  const offset = (value:number) => cycle + ((value % cycle) + cycle) % cycle;
  useEffect(()=>{
    if(!spinning) return;
    let frame = 0, previous = performance.now(), stopping = false, from = 0, target = 0, since = 0;
    const loop=(now:number)=>{
      const step=Math.min(now-previous,50); previous=now;
      if(stopped && !stopping){
        stopping=true; since=now; from=position.current;
        const match=REEL_STRIP.indexOf(symbol);
        target=Math.floor((from-2-match)/cycle)*cycle+match;
      }
      const progress=stopping?Math.min(1,(now-since)/260):0;
      if(stopping)position.current=from+(target-from)*(1-Math.pow(1-progress,3));
      else position.current-=step*.018;
      const visibleOffset=cycle+((position.current%cycle)+cycle)%cycle;
      if(strip.current) strip.current.style.transform=`translateY(${-visibleOffset*100/(cycle*2+3)}%)`;
      if(stopping && progress===1){onSettled(index);return;}
      frame=requestAnimationFrame(loop);
    };
    frame=requestAnimationFrame(loop);return()=>cancelAnimationFrame(frame);
  },[spinning,stopped,symbol,cycle,index,onSettled]);
  // Keep the same strip and exact position after stopping: all three visible rows stay put.
  const cells=[REEL_STRIP[cycle-1],...REEL_STRIP,...REEL_STRIP,...REEL_STRIP.slice(0,2)];
  return <div className="ty-reel-column"><div className={`ty-reel ${spinning&&!stopped?'is-spinning':''}`} aria-label={`${index+1}リール ${spinning&&!stopped?'回転中':SLOT_SYMBOLS[symbol].label}`}>
    <div className="ty-strip" ref={strip} style={{transform:`translateY(${-offset(position.current)*100/cells.length}%)`}}>{cells.map((s,i)=><div className={`ty-symbol symbol-${s}`} key={i}>{SLOT_SYMBOLS[s].glyph}</div>)}</div>
    <div className="ty-reel-shade"/></div><button className="ty-stop" onClick={stop} disabled={!spinning||stopped} aria-label={`${index+1}リール停止`}><span/>STOP {index+1}</button></div>;
}
export default function SlotGame({back}:{back:()=>void}) {
  const [wallet,setWallet]=useState(loadWallet);
  const [round,setRound]=useState<SlotRound|null>(null);
  const [spinning,setSpinning]=useState(false);
  const [stopped,setStopped]=useState([false,false,false]);
  const [tab,setTab]=useState(false);
  const busy=useRef(false), stops=useRef([false,false,false]), pending=useRef<SlotRound|null>(null);
  const settled=useRef([false,false,false]);
  const onSettled=useCallback((index:number)=>{
    if(!busy.current||settled.current[index])return;
    settled.current[index]=true;
    if(settled.current.every(Boolean)){
      const result=pending.current;if(!result)return;
      setWallet(result.next);setRound(result);setSpinning(false);busy.current=false;
    }
  },[]);
  function spin(demo=false){
    if(busy.current||(!wallet.bonus&&wallet.credit<3))return;
    const result=drawSlot(wallet,Math.random,demo);
    busy.current=true;pending.current=result;stops.current=[false,false,false];settled.current=[false,false,false];
    // Save the settled result before animation, so closing cannot reroll a spin.
    try{localStorage.setItem(KEY,JSON.stringify(result.next))}catch{/* Private storage may be unavailable. */}
    setRound(null);setStopped([...stops.current]);setSpinning(true);
  }
  function stop(index:number){
    if(!busy.current||stops.current[index])return;
    stops.current[index]=true;setStopped([...stops.current]);

  }
  function reset(){if(busy.current)return;const next=initialWallet();setWallet(next);setRound(null);try{localStorage.setItem(KEY,JSON.stringify(next))}catch{/* optional storage */}}
  const big=!!round?.big;
  return <PageShell title="🎰 釣嫁スロット" subtitle="遊べるビジュアル試作 · SOUND OFF" onBack={back} maxWidth={1100} showTestCharacter={false}>
    <div className="ty-slot-layout"><section className={`ty-cabinet ${big?'ty-jackpot':''} ${wallet.bonus?'ty-bonus-mode':''}`} aria-label="釣嫁スロット筐体">
      <div className="ty-marquee"><span>TSURIYOME PROJECT</span><strong>潮騒パラダイス<span>SHIOSAI PARADISE</span></strong><i>✦</i></div>
      <div className="ty-lcd"><div className="ty-lcd-top"><span>⚓ {wallet.bonus?'大漁ボーナス':'夕凪のフィッシングタイム'}</span><b>{wallet.bonus?`残り ${wallet.bonus} G`:'NORMAL'}</b></div>
        <div className="ty-sun"/><div className="ty-sea"/><div className="ty-island"/>
        <div className="ty-lcd-message" aria-live="polite"><small>{spinning?'狙え、最高の一投。':big?'SPECIAL FISHING BONUS':wallet.bonus?'FISHING BONUS':'釣嫁たちと、大物を狙おう。'}</small><strong>{spinning?'REEL CHANCE':round?.title||'さあ、釣りに行こう！'}</strong>{!spinning&&round&&<em>{round.payout?`＋${round.payout} MEDALS`: 'NEXT CAST'}</em>}</div>
        <div className="ty-talk"><b>つづり</b><span>{spinning?'停止ボタンでリールを止めてね！':round?.line||'ひろっち、準備できた？ レバーONだよっ♪'}</span></div>
      </div>
      <div className="ty-reel-frame"><div className="ty-payline" aria-hidden="true"/><div className="ty-reels">{[0,1,2].map(i=><Reel key={i} index={i} spinning={spinning} symbol={pending.current?.symbols[i]??1} stopped={stopped[i]} stop={()=>stop(i)} onSettled={onSettled}/>)}</div></div>
      <div className="ty-console"><div className="ty-meter"><small>CREDIT</small><strong>{wallet.credit.toLocaleString()}</strong></div><button className="ty-lever" onClick={()=>spin()} disabled={spinning||(!wallet.bonus&&wallet.credit<3)}><span>●</span>{spinning?'回転中':wallet.bonus?'BONUS START':'LEVER ON'}<small>{wallet.bonus?'FREE SPIN':'3 MEDALS'}</small></button><div className="ty-meter"><small>WIN</small><strong>{round?.payout??0}</strong></div></div>
      <div className="ty-footer"><span>✦ TSURIYOME AMUSEMENT ✦</span><span>中央1ライン有効</span></div>
    </section>
    <aside className="ty-slot-info"><div className="ty-info-card"><small>PLAY RECORD</small><h2>ひろっちの遊技ログ</h2><div className="ty-stats"><span>総ゲーム数<b>{wallet.spins} G</b></span><span>当たり回数<b>{wallet.hits} 回</b></span><span>最高所持メダル<b>{wallet.best.toLocaleString()}</b></span></div><p>レバーON → 3つのSTOPを押す。<br/>好きな順番で止められるよ。</p></div>
    <div className="ty-info-card"><small>PAY TABLE</small><h2>大漁へのチャンス</h2><ul className="ty-pays"><li><b>7 · 7 · 7</b><span>30枚 ＋ ボーナス8G</span></li><li><b>🔔 🔔 🔔</b><span>12枚</span></li><li><b>🐟 🐟 🐟</b><span>8枚</span></li><li><b>🍒 🐚 🍒</b><span>2枚</span></li></ul><p>ボーナス中は消費なし＆当たりやすさUP！<br/>セブンで残りゲーム数を8G上乗せ。</p></div>
    <div className="ty-info-card"><button className="ty-text-button" onClick={()=>setTab(!tab)} aria-expanded={tab}>試作について・演出確認 {tab?'−':'＋'}</button>{tab&&<div><p>停止タイミングでは当落が変わらない、演出を楽しむ試作です。複雑な内部状態・目押し制御・専用キャラ絵・音声はこれから。メダルはゲーム内だけの数値です。</p><button className="ty-demo" disabled={spinning||(!wallet.bonus&&wallet.credit<3)} onClick={()=>spin(true)}>ボーナス演出を試す（抽選外）</button><p>演出確認もメダル・遊技ログに反映されます。</p><button className="ty-text-button" disabled={spinning} onClick={reset}>遊技データをリセット（300枚）</button></div>}{wallet.credit<3&&!wallet.bonus&&!spinning&&<button className="ty-demo" onClick={reset}>300枚で遊び直す</button>}</div></aside></div>
  </PageShell>;
}
