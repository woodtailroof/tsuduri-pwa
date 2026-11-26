import { useId } from 'react';
import { SLOT_SYMBOLS } from '../lib/slotGame';
import type { Role } from '../lib/slotGame';
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
export function SlotSymbol({symbol}:{symbol:number}) {
  const id=useId().replace(/:/g,'');const bonus=symbol===0||symbol===5;
  return <span className={`ty-motif-symbol motif-${symbol} ${bonus?'is-bonus-symbol':'is-small-symbol'}`}>
    <svg viewBox="0 0 120 76" className="ty-motif-art" role="img" aria-label={SLOT_SYMBOLS[symbol].label}>
      <defs><linearGradient id={`${id}-gold`} x1="0" y1="0" x2=".7" y2="1"><stop stopColor="#fff6b8"/><stop offset=".35" stopColor="#edc55c"/><stop offset=".6" stopColor="#aa6d20"/><stop offset=".8" stopColor="#f7df82"/><stop offset="1" stopColor="#9d601d"/></linearGradient><linearGradient id={`${id}-red`} x2=".3" y2="1"><stop stopColor="#ffb3d6"/><stop offset=".4" stopColor="#fa246b"/><stop offset="1" stopColor="#9b154f"/></linearGradient><linearGradient id={`${id}-fish`} x2=".3" y2="1"><stop stopColor="#368cc1"/><stop offset=".45" stopColor="#d9f6fb"/><stop offset="1" stopColor="#77cbd1"/></linearGradient></defs>
      {symbol===0?<><path d="M13 10H107L99 29Q73 41 61 67H32Q44 38 72 28H9Z" fill={`url(#${id}-red)`} stroke="#77344b" strokeWidth="7" strokeLinejoin="round"/><path d="M13 10H107L99 29Q73 41 61 67H32Q44 38 72 28H9Z" fill={`url(#${id}-red)`} stroke="#fff0ad" strokeWidth="3" strokeLinejoin="round"/><path d="M20 15H93" stroke="white" strokeWidth="3"/><text x="62" y="24" textAnchor="middle" fill="white" fontSize="8" fontWeight="900" fontFamily="system-ui">TSURIYOME</text><path d="M95 47L98 55L106 58L98 61L95 69L92 61L84 58L92 55Z" fill="#ffdb7e"/></>:symbol===5?<><rect x="8" y="9" width="104" height="59" rx="9" fill="#25182d" stroke="#6d425a" strokeWidth="5"/><rect x="9" y="8" width="102" height="57" rx="8" fill="#1b1725" stroke={`url(#${id}-gold)`} strokeWidth="3"/><path d="M16 16H104M16 57H104" stroke="#e4b85f" strokeWidth="2"/><text x="60" y="49" textAnchor="middle" fill="#fff4c1" fontSize="38" fontWeight="1000" fontFamily="Arial, sans-serif" letterSpacing="1">BAR</text><text x="60" y="22" textAnchor="middle" fill="#e7c879" fontSize="6" letterSpacing="2">TSURIYOME PROJECT</text></>:symbol===2?<>
        <path d="M37 20L29 15L21 23V49L31 56L38 49Z" fill="#a77831" stroke="#5d4d36" strokeWidth="2"/><ellipse cx="58" cy="37" rx="30" ry="27" fill={`url(#${id}-gold)`} stroke="#7c5a28" strokeWidth="2.5"/><ellipse cx="59" cy="36" rx="21" ry="21" fill="#eccb79" stroke="#9b712a" strokeWidth="2"/><circle cx="59" cy="36" r="15" fill="#514d48" stroke="#f9e4a4" strokeWidth="3"/><path d="M47 29H70M45 34H73M45 39H73M48 44H69" stroke="#a3b0af" strokeWidth="1.5"/><circle cx="59" cy="36" r="5" fill="#b8b0a0"/><path d="M88 35L97 29L103 34L93 42" fill="none" stroke="#545766" strokeWidth="5" strokeLinecap="round"/><path d="M95 34L107 19M95 34L84 51" stroke="#8b733a" strokeWidth="5"/><rect x="100" y="10" width="14" height="14" rx="6" fill="#44434a" transform="rotate(25 107 17)"/><rect x="77" y="49" width="15" height="12" rx="5" fill="#44434a" transform="rotate(25 84 55)"/><path d="M33 20Q52 5 74 17" fill="none" stroke="#fff7cd" strokeWidth="3"/><circle cx="37" cy="51" r="3" fill="#a37b36"/>
      </>:symbol===4?<>
        <path d="M16 38Q39 8 80 31L104 19L100 38L105 56L80 45Q41 68 16 38Z" fill={`url(#${id}-fish)`} stroke="#377b99" strokeWidth="2"/><path d="M45 24L61 13L65 28M47 54L63 65L67 50" fill="#61b9cb" stroke="#377b99" strokeWidth="1.5"/><path d="M22 33Q47 20 78 34M38 29Q48 39 39 50" fill="none" stroke="#ffffffbb" strokeWidth="2"/><circle cx="28" cy="35" r="3.5" fill="#1b3e56"/><path d="M51 35H82M53 40H86M51 45H78" stroke="#75b2c1" strokeWidth="1.5"/><circle cx="88" cy="58" r="12" fill="#efffff" stroke="#73b8be" strokeWidth="1.5"/><path d="M82 55A7 7 0 1 1 82 62" fill="none" stroke="#24899a" strokeWidth="2.5"/><path d="M78 50V59L86 57" fill="#24899a"/>
      </>:symbol===1?<>
        <path d="M12 34Q28 16 61 27L64 44Q30 53 12 40Z" fill="#bad6a0" stroke="#365c4f" strokeWidth="2"/><path d="M65 27L87 30L99 21L95 37L100 51L87 43L68 44Z" fill="#77a68d" stroke="#365c4f" strokeWidth="2"/><path d="M14 32Q38 19 60 29M70 29L87 32" stroke="#33574b" fill="none" strokeWidth="5"/><path d="M26 27L30 42M38 25L41 44M51 27L54 43" stroke="#5c8b66" strokeWidth="3"/><circle cx="22" cy="33" r="4" fill="#f8d978" stroke="#424a46" strokeWidth="1.5"/><circle cx="22" cy="33" r="2" fill="#252f38"/><path d="M40 49V59Q40 68 34 64L32 59M43 62L48 65M81 47V57Q81 67 74 62L73 57M83 60L88 63" fill="none" stroke="#626f7a" strokeWidth="2" strokeLinecap="round"/><path d="M7 36H12" stroke="#788c94" strokeWidth="2"/><path d="M63 27L67 44" stroke="#e8dcc0" strokeWidth="2"/>
      </>:<>
        <path d="M16 64Q37 21 82 9" fill="none" stroke="#333844" strokeWidth="4" strokeLinecap="round"/><path d="M17 63L28 44" stroke="#a97748" strokeWidth="7" strokeLinecap="round"/><path d="M82 9Q96 17 93 27L87 41" fill="none" stroke="#83949a" strokeWidth="1.3"/><ellipse cx="85" cy="44" rx="10" ry="17" transform="rotate(17 85 44)" fill="#fff7e3" stroke="#a85858" strokeWidth="1.5"/><path d="M81 28Q95 25 96 38L76 44Q74 34 81 28" fill="#eb3e48"/><path d="M82 59L80 69M90 22L94 12" stroke="#c43845" strokeWidth="2"/><circle cx="33" cy="42" r="5" fill="#b7ab8d" stroke="#4e535a" strokeWidth="1.5"/><circle cx="44" cy="29" r="2.8" fill="none" stroke="#afb6b8" strokeWidth="1.3"/><circle cx="64" cy="16" r="2" fill="none" stroke="#afb6b8" strokeWidth="1.2"/>
      </>}
    </svg>
    <small>{symbol===0?'BIG BONUS':symbol===5?'REG BONUS':symbol===2?'GOLD REEL':symbol===4?'FISH / REPLAY':symbol===1?'BIG BAIT':'FLOAT'}</small>
  </span>;
}
export function SlotLcdScene({role,phase,roundId,bonus}:{role:Role|'idle';phase:number;roundId:number;bonus:boolean}) {
  const names={idle:'潮待ち',miss:'キャスト',bell:'金のリール',replay:'魚影',fish:'ビッグベイト',cherry:'ウキのアタリ'};
  const labels={idle:'波音を聞いて、次の一投へ。',miss:phase<3?'狙いを定めて、キャスト！':'次のポイントを探そう。',bell:phase<2?'ドラグが鳴る…！':'金色のリールが輝く！',replay:phase<2?'足元に魚影…！':'もう一投、チャンス！',fish:phase<2?'大きなルアーに反応が…！':'ビッグベイトを追ってきた！',cherry:phase<2?'ウキをよく見て…':'ピクッ！ アタリの気配！'};
  return <div key={roundId} className={`ty-live-scene scene-${role} scene-phase-${phase} ${bonus?'scene-bonus':''}`} aria-label={`液晶演出：${names[role]}`}>
    <div className="ty-scene-cloud cloud-one"/><div className="ty-scene-cloud cloud-two"/>
    <svg className="ty-scene-water" viewBox="0 0 600 100" preserveAspectRatio="none" aria-hidden="true"><path d="M-80 40Q0 10 80 40T240 40T400 40T560 40T720 40V100H-80Z"/><path d="M-80 70Q0 40 80 70T240 70T400 70T560 70T720 70V100H-80Z"/></svg>
    <div className="ty-scene-line"/><div className="ty-scene-rings"/>
    {role!=='idle'&&role!=='miss'&&<div className={`ty-scene-motif scene-motif-${role}`}><SlotSymbol symbol={role==='bell'?2:role==='fish'?1:role==='cherry'?3:4}/></div>}
    <div className="ty-scene-fish-shadow"/><div className="ty-scene-caption"><span>{names[role]}</span><b>{labels[role]}</b></div>
  </div>;
}
