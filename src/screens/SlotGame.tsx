import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import PageShell from '../components/PageShell';
import { beginSpin, stopReel, settleSpin, readSession, initialSession, visibleSymbols, modulo, SLOT_SYMBOLS, REEL_STRIPS, STORAGE_KEY, BIG_LIMIT, LINE_NAMES, type Session, type Result, type Bonus } from '../lib/slotGame';
import './SlotGame.css';
import './SlotMachine.css';
import './SlotStages.css';
import './SlotMoe.css';
import './SlotCompact.css';
import './SlotFishing.css';
import './SlotChallenge.css';
import './SlotCabinet.css';
import './SlotCinema.css';
import './SlotBonus.css';
import SlotBaitPreview from '../components/SlotBaitPreview';
import {SlotBonusScreen} from '../components/SlotBonusScreen';
import {ROLE_RULES,isRare} from '../lib/slotRules';
import {CHALLENGES,chooseChallenge,rateChallenge,type ChallengeId} from '../lib/slotChallenges';
import { fitCabinet } from '../lib/slotViewport';
import { advanceReel, reelStopDuration } from '../lib/slotReelMotion';
import { SLOT_CAST, iconSrc, hideBrokenImage, SlotSymbol, SlotLcdScene, bonusVariant } from '../components/SlotArtwork';
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
  const [baitPreview,setBaitPreview]=useState(false);
  const [infoOpen,setInfoOpen]=useState(false),[scale,setScale]=useState(1);
  const fitArea=useRef<HTMLDivElement>(null),cabinet=useRef<HTMLElement>(null),infoDialog=useRef<HTMLDialogElement>(null);
  useLayoutEffect(()=>{
    const area=fitArea.current,body=cabinet.current;if(!area||!body)return;
    const update=()=>setScale(fitCabinet(area.clientWidth,area.clientHeight,body.offsetWidth,body.offsetHeight));
    const observer=new ResizeObserver(update);observer.observe(area);observer.observe(body);update();
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>{const dialog=infoDialog.current;if(!dialog)return;if(infoOpen&&!dialog.open)dialog.showModal();else if(!infoOpen&&dialog.open)dialog.close();},[infoOpen]);
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
    const value=current.current;if(value.spin||(demo&&(value.state.pending||value.state.active||value.state.chance)))return;
    try{const next=beginSpin(value.state,Math.random,demo);next.visual=nextVisual(value.visual,{role:next.spin!.role,pending:next.state.pending,active:next.state.active,chance:next.state.chance,announced:next.state.announced,highLeft:next.state.highLeft});settled.current=[false,false,false];setResult(null);setError('');commit(next);}catch{setError('メダルが足りません。「遊技データ」で300枚に戻せます。');}
  }
  function previewScene(actor:number,mode:'lure'|'float'){
    const value=current.current;if(value.spin||value.state.active||value.state.chance)return;
    commit({...value,visual:{...value.visual,actor,fishing:mode,stage:mode==='float'?'harbor':'surf',cue:'quiet',tier:'quiet',outcome:'waiting',chanceLeft:0,chanceTotal:0,challenge:undefined,challengeStart:undefined}});setResult(null);
  }
  function previewChance(win:boolean,id?:ChallengeId,actor?:number){
    const value=current.current;if(value.spin||value.state.active||value.state.pending||value.state.chance)return;
    let challenge=chooseChallenge('chance',value.state.highLeft>0,win);
    if(id||actor!==undefined)challenge=rateChallenge('chance',value.state.highLeft>0,id??challenge.id,actor??challenge.actor);
    commit({...value,state:{...value.state,pending:win?'BIG':null,announced:false,chance:{left:6,total:6,mode:CHALLENGES.find(c=>c.id===challenge.id)!.mode,challenge,trigger:'chance',start:value.state.spins}},visual:{...value.visual,stage:'sunset',cue:'chase',tier:'rare',outcome:'waiting',chanceLeft:6,chanceTotal:6,actor:challenge.actor,challenge,challengeStart:value.state.spins}});setResult(null);setInfoOpen(false);
  }
  function reset(){if(current.current.spin)return;settled.current=[false,false,false];commit(initialSession());setResult(null);setError('');setResetOpen(false);}
  const {state,spin}=session;const running=!!spin;const active=state.active;
  const bonusFlag=!!state.pending&&state.announced;const bonusLimit=BIG_LIMIT;
  const bonusScreen=bonusFlag||!!active||!!result?.bonusEnded;
  const cost=active?1:state.replay?0:3;const net=state.paid-state.spent;
  const litLines=result?[...new Set([...result.board.awards.map(a=>a.line),...result.board.bonusLines])]:[];
  const [min,max]=[Math.min(0,...state.history),Math.max(1,...state.history)];
  const chart=state.history.map((n,i)=>`${10+i/Math.max(1,state.history.length-1)*280},${85-(n-min)/(max-min)*70}`).join(' ');
  const message=error||(running?'アタリに集中……好きな順番で止めてね！':result?.message|| (spin?'中断したゲームを再開します。':'ひろっち、準備できた？ レバーONだよっ♪'));
  const support=SLOT_CAST[session.visual.actor];
  const scenePhase=spin?spin.stops.filter(p=>p!==null).length:3;
  const doubleSeven=result?.bonusStarted==='BIG'&&result.board.bonusLines.length>=2;
  return <PageShell showBack={false} maxWidth={1200} showTestCharacter={false} scrollY="hidden" contentPadding={0} desktopContentLayout="home-centered">
    <div className="ty-slot-screen"><header className="ty-slot-toolbar"><button onClick={back}>← 戻る</button><strong>釣嫁スロット <small>潮騒パラダイス</small></strong><button onClick={()=>setInfoOpen(true)}>データ・遊び方</button></header>
    <div className="ty-slot-fit" ref={fitArea}>
    <div className="ty-slot-layout ty-a-type ty-cast-edition ty-machine-edition ty-moe-edition ty-compact"><section ref={cabinet} style={{transform:`scale(${scale})`}} className={`ty-cabinet ${result?.bonusStarted?'ty-jackpot':''} ${active?'ty-bonus-mode':''} ${doubleSeven?'ty-double-seven':''} ${state.highLeft?'ty-high-stage':''} ${result?.chanceEye?'ty-role-chance':''}`} aria-label="釣嫁スロット筐体">
      <div className="ty-compact-heading"><span>✦ 潮騒パラダイス ✦</span><b>BIG {state.bigCount} · REG {state.regCount}</b></div>
      <div className="ty-lcd">{!bonusScreen&&<div className="ty-lcd-top"><span>⚓ {active?`${active} BONUS`:STAGE_NAMES[session.visual.stage]}</span><b>{active?`${state.bonusPaid} / ${bonusLimit} PAYOUT`:state.chance?'BITE CHANCE':state.highLeft?`高確 ${state.highLeft}G`:state.replay?'REPLAY':'NORMAL'}</b></div>}
        {!state.chance&&!active&&result&&result.role!=='miss'&&<div className={`ty-role-toast ${isRare(result.role)?'ty-rare-role':''}`}>{result.chanceEye?'CHANCE目！':ROLE_RULES[result.role].label}</div>}
        {bonusScreen?<SlotBonusScreen session={session} result={result}/>:<>
        <SlotLcdScene visual={session.visual} phase={scenePhase} running={running}/>
        <div className="ty-sun"/>

        <div className="ty-lcd-sparkles" aria-hidden="true">✦<i>✧</i><b>✦</b></div><div className="ty-sea"/><div className="ty-island"/><div className="ty-fishing-silhouette" aria-hidden="true">⚓</div>
        <div className="ty-lcd-message" aria-live="polite"><small>{active?'大漁の時間は、ここから。':bonusFlag?'ボーナス図柄を狙ってね！':''}</small><strong>{result?.bonusStarted?result.title:active?`${active} BONUS`:bonusFlag?'BONUS CHANCE':running?'':result?.chanceOutcome?result.title:result?.payout?result.title:''}</strong><em>{active?`払い出し ${state.bonusPaid}枚`:result?.payout?`＋${result.payout} MEDALS`:state.replay?'NEXT PLAY FREE':''}</em></div>
        {active&&<div className="ty-bonus-progress"><div style={{width:`${Math.min(100,state.bonusPaid/bonusLimit*100)}%`}}/></div>}
        <div className="ty-talk"><b><img src={iconSrc(support.id)} alt="" draggable={false} onError={hideBrokenImage}/>{support.name}</b><span>{message}</span></div>
        </>}
      </div>
      <div className="ty-reel-bezel-title"><span>◀ 5 PAY LINES</span><b>SHIOSAI PARADISE</b><span>80 RPM ▶</span></div>
      <div className="ty-reel-frame"><svg className="ty-lines" viewBox="0 0 300 300" preserveAspectRatio="none" aria-hidden="true">{[[0,50,300,50],[0,150,300,150],[0,250,300,250],[0,0,300,300],[0,300,300,0]].map((p,i)=><line key={i} x1={p[0]} y1={p[1]} x2={p[2]} y2={p[3]} className={litLines.includes(i)?'is-winning':''}/>)}</svg>
        <div className="ty-reels">{[0,1,2].map(i=><Reel key={i} index={i} roundId={state.spins} running={running} target={spin?.stops[i]??null} initial={state.positions[i]} requestStop={requestStop} onSettled={finish}/>)}</div></div>
      <div className="ty-machine-controls"><button className="ty-lever" onClick={()=>start()} disabled={running||state.credit<cost} aria-label="左レバーでスタート"><i className="ty-lever-stem"/><span/>{running?'回転中':'LEVER ON'}<small>{cost===0?'REPLAY / FREE':`${cost} MEDALS`}</small></button><div className="ty-console"><div className="ty-meter"><small>CREDIT</small><strong>{state.credit.toLocaleString()}</strong></div><div className="ty-control-plaque">AUTO BET<b>{cost===0?'REPLAY':`${cost} BET`}</b></div><div className="ty-meter"><small>WIN</small><strong>{result?.payout??0}</strong></div></div><div className="ty-coin-slot" aria-hidden="true"><span/>MEDAL</div></div>
      <div className="ty-footer"><span>✦ TSURIYOME ALL STARS ✦</span><span>{litLines.length?litLines.map(i=>LINE_NAMES[i]).join(' / '):'上・中・下・斜め2本'}</span></div>
    </section>
    </div></div>
    <dialog ref={infoDialog} className="ty-slot-info-dialog ty-moe-edition" onCancel={()=>setInfoOpen(false)} onClose={()=>setInfoOpen(false)}><button className="ty-info-close" onClick={()=>setInfoOpen(false)}>閉じる ✕</button><aside className="ty-slot-info"><div className="ty-info-card"><small>SESSION DATA</small><h2>ひろっちの遊技ログ</h2><div className="ty-big-reg"><div><span>BIG</span><b>{state.bigCount}</b></div><div><span>REG</span><b>{state.regCount}</b></div><div><span>合算</span><b>{state.bigCount+state.regCount?`1/${(state.normalSpins/(state.bigCount+state.regCount)).toFixed(1)}`:'—'}</b></div></div><div className="ty-stats"><span>総ゲーム数 <b>{state.spins} G</b></span><span>通常ゲーム数 <b>{state.normalSpins} G</b></span><span>通常時・ボーナス間 <b>{state.sinceBonus} G</b></span><span>差枚 <b>{net>0?'+':''}{net}</b></span></div><svg className="ty-history-chart" viewBox="0 0 300 100" role="img" aria-label={`直近${state.history.length}ゲームの差枚推移。現在${net}枚`}><line x1="10" x2="290" y1={85-(0-min)/(max-min)*70} y2={85-(0-min)/(max-min)*70} stroke="#ffffff33" strokeDasharray="3 4"/><polyline points={chart} fill="none" stroke="#f1a7cf" strokeWidth="2.5"/><text x="10" y="98" fill="#b8c2da" fontSize="8">直近最大160ゲーム / 差枚</text></svg>{state.bonusLog.length>0&&<div className="ty-bonus-log">{state.bonusLog.slice(0,4).map((v,i)=><span key={i}>{v}</span>)}</div>}</div>
    <div className="ty-info-card"><small>5 LINES · PAY TABLE</small><h2>大漁へのチャンス</h2><ul className="ty-pays"><li><b>7 · 7 · 7</b><span>BIG / 252枚以上払い出し</span></li><li><b>7 · 7 · BAR</b><span>NABU★RUSH / 8G＋レア役で8G追加</span></li>{[{symbol:2,label:'金色リール ×3',pay:'6枚 / 1ゲーム'},{symbol:1,label:'ビッグベイト ×3',pay:'10枚 / 1ゲーム'},{symbol:3,label:'左リールの赤ウキ',pay:'2枚 / 1ゲーム'},{symbol:4,label:'魚 ×3',pay:'リプレイ'}].map(row=><li key={row.symbol} className="ty-motif-pay"><b><SlotSymbol symbol={row.symbol}/></b><span>{row.label}<small>{row.pay}</small></span></li>)}</ul><p>通常3枚・ボーナス中1枚。複数ラインでもベル6枚・スイカ10枚・チェリー2枚。BIG中はベル15枚で252枚以上の払い出しまで（約17G）。NABU★RUSH中はベル15枚・スイカ15枚・チェリー8枚。レア役合算9%は全ゲーム共通、取りこぼしても残りに8G加算。8G以内の延長率約53%、平均約28.6G。チャンス目は払い出しなし。表示枚数は純増ではありません。</p></div>
    <div className="ty-info-card"><button className="ty-text-button" onClick={()=>setDetails(!details)} aria-expanded={details}>遊び方・リール配列・遊技データ {details?'−':'＋'}</button>{details&&<div><p>レバーで役とボーナスを抽選。押した位置から最大4コマ滑らせて停止します。左リールの集合BAR（配列4・11番）を中段〜上段に狙います。通常はボーナス図柄が下段、直下の赤ウキは枠外。赤ウキ成立時は枠内に止まり、ビッグベイト成立時はボーナス図柄が枠下へ滑ってビッグベイトを引き込みます。連続7の17・18番はダブル7向けの別停止形です。ビッグベイト停止時は中・右にも狙ってね。色違いの7同士もBIG入賞です。左17番つづり黒7・18番まつり紫7、中のこころ黄7、右14番るる金7・15番りんピンク7の連続配置を使って2ライン同時に7が揃うと、ダブル7専用の入賞演出が出ます（BIGの枚数は通常と同じ）。チェリー・スイカやボーナスは目押しで取りこぼす場合があります。リプレイとベルは全押し順で取りこぼしなし。チェリー・スイカ・ボーナスは目押し対象です。ボーナス当選は揃えるまで保持します。</p><p>ボーナスは成立役ごとに複合抽選。チェリー22%・スイカ10%・チャンス目45%、高確中は40%・20%・70%。リプレイとベルも各1/2048（高確中1/1024）で複合します。BIG:REGは60:40。高確は20ゲーム、レア役で再移行すると20ゲームへ更新。ハマリ補正・天井はありません。</p><p>ステージは通常の港・サーフ・河口、高確の潮目チャンス、連続演出、ボーナス中のフェスに遷移します。ステージ変化だけでは当たり確定ではありません。キャラもときどき交代。回転は1周0.75秒（80rpm）。当たり・見せかけの前兆は6〜10ゲーム。前兆中はリプレイ72%（通常約13.7%）。最後のゲームの全停止後に成否を告知し、当選は図柄を揃えるまで保持します。課金・換金なし、音声なし。前の試作とは別の遊技データです。中断したゲームは再開できます。</p><div className="ty-role-rules"><h3>役の役割（初期バランス）</h3><table><thead><tr><th>役</th><th>出現</th><th>通常／高確 複合</th><th>非当選時の高確移行</th></tr></thead><tbody>{(['replay','bell','fish','cherry','chance'] as const).map(role=><tr key={role}><td>{ROLE_RULES[role].label}</td><td>1/{(1/ROLE_RULES[role].rate).toFixed(1)}</td><td>{(ROLE_RULES[role].bonus*100).toFixed(2)}%／{(ROLE_RULES[role].highBonus*100).toFixed(2)}%</td><td>{Math.round(ROLE_RULES[role].high*100)}%</td></tr>)}</tbody></table><p>前兆中はリプレイだけ72%に増加。スイカの取りこぼしはチャンス目として扱いません。複合・高確移行は内部成立で抽選するので、取りこぼしても当選結果は消えません。</p><p>期待度★は契機とお題・担当キャラの組み合わせによる導入時の目安。得意不得意はゲーム用の仮設定です。苦手でも成功・得意でも失敗あり。途中のレア役でもボーナスを上書き抽選します。</p></div><details className="ty-strip-guide"><summary>各リールの21コマ配列を見る</summary><div>{REEL_STRIPS.map((strip,r)=><ol key={r} aria-label={`${r+1}リール配列`}>{strip.map((symbol,i)=><li key={i}><small>{i+1}</small><SlotSymbol symbol={symbol} variant={bonusVariant(r,i)}/></li>)}</ol>)}</div></details><div className="ty-motion-previews"><button className="ty-demo" disabled={running} onClick={()=>{setInfoOpen(false);setBaitPreview(true)}}>ビッグベイト・2G映像プレビュー</button><p>演出の確認（当選・空振りの確認は遊技ログへ反映）</p><div className="ty-demo-buttons">{SLOT_CAST.map((actor,i)=><button key={actor.id} className="ty-demo" disabled={running||!!active||!!state.chance} onClick={()=>previewScene(i,session.visual.fishing??'lure')}>{actor.name}</button>)}</div><div className="ty-demo-buttons"><button className="ty-demo" disabled={running||!!active||!!state.chance} onClick={()=>previewScene(session.visual.actor,'lure')}>立ちルアー</button><button className="ty-demo" disabled={running||!!active||!!state.chance} onClick={()=>previewScene(session.visual.actor,'float')}>座りウキ釣り</button>{[true,false].map(win=><button key={String(win)} className="ty-demo" disabled={running||!!active||!!state.pending||!!state.chance} onClick={()=>previewChance(win)}>前兆{win?'成功':'空振り'}</button>)}</div></div><div className="ty-demo-buttons">{CHALLENGES.map(c=><button className="ty-demo" key={c.id} disabled={running||!!active||!!state.pending||!!state.chance} onClick={()=>previewChance(false,c.id,session.visual.actor)}>{c.title}</button>)}</div><p>お題ボタンは選択中のキャラで演出確認。途中のレア役で本当の当選に変わる場合もあります。前兆成功・空振りボタンは通常の担当抽選を使います。</p><div className="ty-demo-buttons">{(['BIG','REG'] as const).map(b=><button key={b} className="ty-demo" disabled={running||!!active||!!state.pending||!!state.chance||state.credit<cost} onClick={()=>start(b)}>{b}当選を試す</button>)}</div><p>演出確認は抽選外。自分で図柄を揃えると開始し、メダルとログにも反映されます。</p><button className="ty-text-button" disabled={running} onClick={()=>setResetOpen(!resetOpen)}>遊技データをリセット</button>{resetOpen&&<div><p>現在のメダル・履歴を消して300枚から遊び直します。</p><button className="ty-demo" disabled={running} onClick={reset}>消去して遊び直す</button></div>}</div>}{state.credit<cost&&!running&&<button className="ty-demo" onClick={()=>{setDetails(true);setResetOpen(true)}}>メダルを補充して遊び直す</button>}{saveWarning&&<p role="status">この端末では保存できません。画面を閉じると進行が失われます。</p>}{error&&<p role="alert">{error}</p>}</div></aside></dialog>
    {baitPreview&&<SlotBaitPreview close={()=>setBaitPreview(false)}/>}
    </div>
  </PageShell>;
}
