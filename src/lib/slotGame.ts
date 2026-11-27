import {drawRole, bonusRate, ROLE_RULES, HIGH_GAMES, NORMAL_REPLAY_RATE, CHANCE_REPLAY_RATE, type Role} from './slotRules';
import {chooseChallenge, challengeSpec, validChallenge, type Challenge} from './slotChallenges';
export {ROLE_RULES, NORMAL_REPLAY_RATE, CHANCE_REPLAY_RATE} from './slotRules';
export type {Role} from './slotRules';
import { initialVisual, validVisual, type SlotVisual } from './slotPresentation';
// Original A-type game. Public manufacturer layouts inform the concept, not proprietary tables.
export const SLOT_SYMBOLS = [
  { id:'seven', glyph:'7', label:'釣嫁セブン', color:'#ff70b9' },
  { id:'fish', glyph:'🐟', label:'ビッグベイト', color:'#65dfff' },
  { id:'bell', glyph:'🔔', label:'金色ベイトリール', color:'#ffcf67' },
  { id:'cherry', glyph:'🍒', label:'竿と赤ウキ', color:'#ff829e' },
  { id:'replay', glyph:'↻', label:'魚リプレイ', color:'#74dce4' },
  { id:'bar', glyph:'BAR', label:'釣嫁BAR', color:'#c7aeff' },
] as const;
// Original 21-stop strips. Left bonus aim: fish / replay / bell / bonus / cherry.
export const REEL_STRIPS: readonly (readonly number[])[] = [
  [1,4,2,0,3,4,2,1,4,2,5,3,4,2,1,4,0,0,2,4,2],
  [4,2,0,4,2,1,4,2,5,4,2,1,4,2,0,4,2,1,4,2,1],
  [4,1,2,4,5,2,4,0,2,4,1,2,4,0,0,2,4,2,4,1,2],
];
export const PAY_LINES = [[0,0,0],[1,1,1],[2,2,2],[0,1,2],[2,1,0]] as const;
export const LINE_NAMES = ['上段','中段','下段','右下がり','右上がり'];
export const BIG_LIMIT = 252, REG_LIMIT = 96;
export const STORAGE_KEY = 'tsuduri_slot_a_type_v2';
export type Bonus = 'BIG'|'REG';
export type FishingMode = 'lure'|'float';
export type Chance = {left:number;total:number;mode:FishingMode;challenge?:Challenge;trigger?:Role;start?:number};
export type Positions = [number,number,number];
export type Stops = [number|null,number|null,number|null];
export type SlotState = {
  credit:number; spins:number; normalSpins:number; bigCount:number; regCount:number; best:number;
  spent:number; paid:number; sinceBonus:number; pending:Bonus|null; active:Bonus|null;
  bonusPaid:number; replay:boolean; announced:boolean; chance:Chance|null; highLeft:number; positions:Positions; history:number[]; bonusLog:string[];
};
export type Award = { role:Exclude<Role,'miss'|'chance'>; line:number; payout:number };
export type Board = { positions:Positions; awards:Award[]; payout:number; bonus:Bonus|null; bonusLines:number[]; bonusKinds:Bonus[]; chancePattern:boolean };
export type Spin = { role:Role; stops:Stops; before:SlotState; cost:number; announced:boolean;highTriggered:boolean };
export type Session = { state:SlotState; spin:Spin|null; savedAt:number; layoutVersion:7; visual:SlotVisual };
export type Result = { title:string; message:string; payout:number; replay:boolean; bonusStarted:Bonus|null; bonusEnded:Bonus|null; board:Board; chanceOutcome:'win'|'miss'|null;role:Role;chanceEye:boolean;highLeft:number;highEntered:boolean };
export function initialState():SlotState { return {credit:300,spins:0,normalSpins:0,bigCount:0,regCount:0,best:300,spent:0,paid:0,sinceBonus:0,pending:null,active:null,bonusPaid:0,replay:false,announced:false,chance:null,highLeft:0,positions:[0,0,0],history:[0],bonusLog:[]}; }
export const modulo=(n:number,length=21)=>((n%length)+length)%length;
export function visibleSymbols(reel:number,center:number) { const strip=REEL_STRIPS[reel];return [-1,0,1].map(delta=>strip[modulo(center+delta)]); }
export function evaluateBoard(positions:Positions):Board {
  const cells=positions.map((p,r)=>visibleSymbols(r,p));
  const awards:Award[]=[];let bonus:Bonus|null=null;const bonusLines:number[]=[];const bonusKinds=new Set<Bonus>();
  for(let line=0;line<PAY_LINES.length;line++) {
    const s=PAY_LINES[line].map((row,r)=>cells[r][row]);
    if(s[0]===0&&s[1]===0&&(s[2]===0||s[2]===5)) {bonus=s[2]===0?'BIG':'REG';bonusLines.push(line);bonusKinds.add(bonus);}
    if(s.every(v=>v===2))awards.push({role:'bell',line,payout:6});
    if(s.every(v=>v===1))awards.push({role:'fish',line,payout:10});
    if(s.every(v=>v===4))awards.push({role:'replay',line,payout:0});
  }
  // One cherry award per game, independent of how many lines cross the left symbol.
  const cherryRow=cells[0].indexOf(3);
  if(cherryRow>=0)awards.push({role:'cherry',line:cherryRow,payout:2});
  const chancePattern=cells[0].includes(1)&&!awards.length&&!bonus;
  return {positions:[...positions],awards,payout:Math.max(0,...awards.map(a=>a.payout)),bonus,bonusLines,bonusKinds:[...bonusKinds],chancePattern};
}
const boardCache:Board[]=[];
function allBoards(){if(!boardCache.length)for(let a=0;a<21;a++)for(let b=0;b<21;b++)for(let c=0;c<21;c++)boardCache.push(evaluateBoard([a,b,c]));return boardCache;}
export function legalBoard(board:Board,spin:Spin):boolean {
  if(board.bonusKinds.length>1)return false;
  if(board.awards.some(a=>a.role!==spin.role))return false;
  if(board.bonus && (spin.before.active||spin.role!=='miss'||!spin.before.announced||board.bonus!==spin.before.pending))return false;
  if(spin.role==='chance'&&!board.chancePattern)return false;
  // Replay and bell must be pulled in; rare roles remain timing-dependent.
  return !['replay','bell'].includes(spin.role)||board.awards.some(a=>a.role===spin.role);
}
type ControlContext={boards:Board[];safe:(stops:Stops,pool:Board[])=>boolean};
const contexts=new Map<string,ControlContext>();
function controlContext(spin:Spin):ControlContext {
  const key=`${spin.role}:${spin.before.active}:${spin.before.pending}:${spin.before.announced}`;
  const cached=contexts.get(key);if(cached)return cached;
  const boards=allBoards().filter(b=>legalBoard(b,spin));const memo=new Map<string,boolean>();
  const safe=(stops:Stops,pool:Board[]):boolean=>{
    if(!pool.length)return false;
    const id=stops.map(p=>p===null?'x':p).join(',');const known=memo.get(id);if(known!==undefined)return known;
    const remaining=[0,1,2].filter(r=>stops[r]===null);
    if(!remaining.length){memo.set(id,true);return true;}
    // Every possible future button phase and stop order must retain a legal completion.
    for(const reel of remaining)for(let boundary=0;boundary<21;boundary++){
      let possible=false;
      for(let slip=0;slip<=4;slip++){
        const p=modulo(boundary-slip);const next=[...stops] as Stops;next[reel]=p;
        if(safe(next,pool.filter(b=>b.positions[reel]===p))){possible=true;break;}
      }
      if(!possible){memo.set(id,false);return false;}
    }
    memo.set(id,true);return true;
  };
  const context={boards,safe};contexts.set(key,context);return context;
}
export function beginSpin(state:SlotState,random:()=>number=Math.random,demo:Bonus|null=null):Session {
  const cost=state.active?1:state.replay?0:3;
  if(state.credit<cost)throw new Error('メダルが足りません');
  const before:SlotState={...state,positions:[...state.positions],history:[...state.history],bonusLog:[...state.bonusLog]};
  let pending=state.pending,announced=state.announced;
  let chance=state.chance?{...state.chance}:null;
  const wasHigh=state.highLeft>0;
  // Draw the role first, then its associated bonus and stage transition.
  let role:Role=state.active?'bell':drawRole(random(),chance?CHANCE_REPLAY_RATE:NORMAL_REPLAY_RATE);
  let highTriggered=false;
  if(!state.active&&!pending){
    if(random()<bonusRate(role,wasHigh)){pending=random()<.6?'BIG':'REG';announced=false;}
    else highTriggered=random()<ROLE_RULES[role].high;
  }
  if(!state.active&&!announced&&!chance&&(pending||random()<ROLE_RULES[role].tease)){
    const total=6+Math.floor(random()*5),challenge=chooseChallenge(role,wasHigh,!!pending,random);
    chance={left:total,total,mode:challengeSpec(challenge.id).mode,challenge,trigger:role,start:state.spins};
  }
  if(demo&&!state.active){pending=demo;announced=true;chance=null;role='miss';highTriggered=false;}
  before.pending=pending;before.announced=announced;before.chance=chance;

  const next={...before,credit:state.credit-cost,spent:state.spent+cost,replay:false};
  return {layoutVersion:7,visual:initialVisual(),state:next,spin:{before,role,cost,stops:[null,null,null],announced:!!pending&&announced,highTriggered},savedAt:Date.now()};
}
// Each stop may advance at most four whole symbols from the next available boundary.
// Keep only globally legal completions, then prefer the drawn role over a miss.
export function chooseStop(spin:Spin,reel:number,current:number):number {
  if(reel<0||reel>2||!Number.isFinite(current))throw new Error('Invalid reel position');
  if(spin.stops[reel]!==null)return spin.stops[reel]!;
  const boundary=Math.floor(current);
  const candidates=Array.from({length:5},(_,slip)=>({slip,position:modulo(boundary-slip)}));
  const context=controlContext(spin);
  const pool=context.boards.filter(board=>!spin.stops.some((p,r)=>p!==null&&board.positions[r]!==p));
  const score=new Map<number,number>();
  for(const candidate of candidates){
    const stops=[...spin.stops] as Stops;stops[reel]=candidate.position;
    const matching=pool.filter(board=>board.positions[reel]===candidate.position);
    if(!context.safe(stops,matching))continue;
    for(const board of matching){
      const value=board.bonus?100:board.awards.length?50+board.payout:0;
      score.set(candidate.position,Math.max(score.get(candidate.position)??-1,value));
    }
  }
  const valid=candidates.filter(c=>score.has(c.position));
  if(!valid.length)throw new Error('No legal stop within four symbols');
  const aimed=[3,10,17].find(anchor=>modulo(boundary-anchor)<=1);
  if(reel===0&&spin.stops.every(p=>p===null)&&aimed!==undefined&&!spin.before.active&&!spin.before.announced){
    const lower=modulo(aimed-1);
    const shape=(position:number)=>{
      const cells=visibleSymbols(0,position);
      if(spin.role==='cherry')return cells.includes(3)?100:0;
      if(spin.role==='fish'||spin.role==='chance')return cells.includes(1)&&!cells.includes(0)&&!cells.includes(5)?100:0;
      return position===lower?100:0;
    };
    valid.sort((a,b)=>shape(b.position)-shape(a.position)||(score.get(b.position)!-score.get(a.position)!)||a.slip-b.slip);
  }else valid.sort((a,b)=>(score.get(b.position)!-score.get(a.position)!)||a.slip-b.slip);
  return valid[0].position;
}
export function stopReel(session:Session,reel:number,current:number):Session {
  if(!session.spin||session.spin.stops[reel]!==null)return session;
  const stops=[...session.spin.stops] as Stops;stops[reel]=chooseStop(session.spin,reel,current);
  return {...session,spin:{...session.spin,stops},savedAt:Date.now()};
}
export function settleSpin(session:Session):{session:Session;result:Result} {
  const spin=session.spin;if(!spin||spin.stops.some(p=>p===null))throw new Error('Reels still running');
  const positions=spin.stops as Positions;const board=evaluateBoard(positions);
  if(!legalBoard(board,spin))throw new Error('Illegal award');
  let state={...session.state,positions:[...positions] as Positions,spins:session.state.spins+1,normalSpins:session.state.normalSpins+(session.state.active?0:1),sinceBonus:session.state.active?session.state.sinceBonus:session.state.sinceBonus+1};
  let title='次の一投へ',message='焦らず、いいポイントを探そう♪',bonusStarted:Bonus|null=null,bonusEnded:Bonus|null=null;
  let chanceOutcome:Result['chanceOutcome']=null;
  const replay=board.awards.some(a=>a.role==='replay');
  state.credit+=board.payout;state.paid+=board.payout;state.replay=replay;
  if(state.active) {
    state.bonusPaid+=board.payout;
    if(state.bonusPaid>=(state.active==='BIG'?BIG_LIMIT:REG_LIMIT)){
      bonusEnded=state.active;title=`${state.active} FINISH`;message=`合計${state.bonusPaid}枚払い出し！ また一緒に狙おうね♪`;state.active=null;
    } else {title=board.payout?`＋${board.payout} MEDALS`:'目押しでもう一度！';message='金色のリールを狙って、メダルを増やそう！';}
  } else if(board.bonus) {
    bonusStarted=board.bonus;state.active=board.bonus;state.pending=null;state.bonusPaid=0;state.announced=false;state.chance=null;
    if(board.bonus==='BIG')state.bigCount++;else state.regCount++;
    state.bonusLog=[`${board.bonus} · ${state.sinceBonus}G`,...state.bonusLog].slice(0,8);state.sinceBonus=0;
    title=board.bonus==='BIG'&&board.bonusLines.length>=2?'DOUBLE 7 BONUS！':`${board.bonus} BONUS！`;message='やったね、ひろっち！ 大漁タイム、スタート！';
  } else if(replay){title='REPLAY';message='次のゲームはメダル消費なし！';}
  else if(board.payout){title='NICE CATCH';message=`${board.payout}枚ゲット！ この調子っ♪`;}
  else if(spin.role!=='miss'){title='次こそキャッチ！';message='チェリー・スイカは目押し対象だよ。次こそ狙ってみよう！';}
  const highEntered=spin.highTriggered&&!spin.before.active;
  state.highLeft=spin.before.active?state.highLeft:Math.max(Math.max(0,state.highLeft-1),highEntered?HIGH_GAMES:0);
  const chanceEye=spin.role==='chance'&&board.chancePattern;
  if(chanceEye){title='CHANCE目！';message='スイカまで滑って、揃わず……大物の気配!?';}
  else if(spin.role==='fish'&&!board.payout&&!state.active){title='スイカ取りこぼし';message='次は中・右のビッグベイトも狙おう！ 内部抽選の結果は保持しているよ。';}
  if(highEntered&&!state.chance)message='潮目が変わった！ 高確ステージへ！';
  if(state.chance&&!state.active){
    const left=state.chance.left-1;
    if(left>0){state.chance={...state.chance,left};message=left<=2?'手応えが変わった……次こそ、合わせるよ！':'何か追ってきてる……もう少し探ってみよう！';}
    else {state.chance=null;chanceOutcome=state.pending?'win':'miss';state.announced=!!state.pending;
      title=state.pending?'BONUS CHANCE！':'あっ……抜けちゃった！';message=state.pending?'大物ヒット！ ボーナス図柄を狙ってね！':'惜しいっ、逃げられちゃった。また次の一投へ♪';}
  }
  if(state.pending&&state.announced)message=`${state.pending==='BIG'?'7・7・7':'7・7・BAR'}を狙ってね！ 揃えるまで当選は持ち越すよ。`;
  state.best=Math.max(state.best,state.credit);
  state.history=[...state.history,state.paid-state.spent].slice(-160);
  return {session:{layoutVersion:7,visual:session.visual,state,spin:null,savedAt:Date.now()},result:{title,message,payout:board.payout,replay,bonusStarted,bonusEnded,board,chanceOutcome,role:spin.role,chanceEye,highLeft:state.highLeft,highEntered}};
}
export function initialSession():Session {return {layoutVersion:7,visual:initialVisual(),state:initialState(),spin:null,savedAt:Date.now()};}
export function readSession(value:string|null):Session {
  try {
    const v=JSON.parse(value||'null') as Session;const s=v?.state;
    const integer=(x:unknown)=>Number.isSafeInteger(x)&&Number(x)>=0&&Number(x)<=1e9;
    const bonus=(x:unknown)=>x===null||x==='BIG'||x==='REG';
    if(!s||!['credit','spins','normalSpins','bigCount','regCount','best','spent','paid','sinceBonus','bonusPaid'].every(k=>integer(s[k as keyof SlotState]))||!bonus(s.pending)||!bonus(s.active)||typeof s.replay!=='boolean')throw 0;
    if(s.active&&s.pending)throw 0;
    // v5 already had hidden lead-ups. Preserve their result and remaining games.
    if(v.layoutVersion!==7){if(v.layoutVersion!==5&&v.layoutVersion!==6){s.announced=!!s.pending;s.chance=null;}if(v.layoutVersion!==6)s.highLeft=0;}
    if(!integer(s.highLeft)||s.highLeft>HIGH_GAMES)throw 0;
    if(typeof s.announced!=='boolean'||(s.announced&&!s.pending))throw 0;
    if(s.chance&&(!Number.isInteger(s.chance.left)||!Number.isInteger(s.chance.total)||s.chance.left<1||s.chance.left>s.chance.total||s.chance.total<6||s.chance.total>10||!['lure','float'].includes(s.chance.mode)||s.active||s.announced))throw 0;
    if(s.chance?.challenge&&!validChallenge(s.chance.challenge))delete s.chance.challenge;
    if(!Array.isArray(s.positions)||s.positions.length!==3||!s.positions.every(p=>integer(p)&&p<21))throw 0;
    if(!Array.isArray(s.history)||s.history.length>160||!s.history.every(p=>Number.isSafeInteger(p)&&Math.abs(p)<=1e9)||!Array.isArray(s.bonusLog)||s.bonusLog.length>8||!s.bonusLog.every(t=>typeof t==='string'&&t.length<80))throw 0;
    if(v.spin){const p=v.spin;if(!['miss','replay','bell','fish','cherry','chance'].includes(p.role)||!Array.isArray(p.stops)||p.stops.length!==3||!p.stops.every(n=>n===null||(integer(n)&&n<21))||!p.before||!bonus(p.before.pending)||!bonus(p.before.active)||![0,1,3].includes(p.cost))throw 0;
      // Reconstruct the minimum trusted pre-spin fields used by stop validation.
      p.before={...s,pending:s.pending,active:s.active};
      if(v.layoutVersion!==7){if(v.layoutVersion===6&&p.highTriggered)s.highLeft=HIGH_GAMES;p.highTriggered=false;}else if(typeof p.highTriggered!=='boolean')throw 0;
    }
    if(!validVisual(v.visual))v.visual=initialVisual();
    if(v.layoutVersion!==7){
      // Changing the physical strip invalidates old partial stops. Refund only its charged bet,
      // preserving the pending bonus, wallet totals and all completed game history.
      if(v.spin){s.credit+=v.spin.cost;s.spent=Math.max(0,s.spent-v.spin.cost);s.replay=v.spin.cost===0&&!s.active;v.spin=null;}
      s.positions=[0,0,0];v.layoutVersion=7;
    }
    return v;
  }catch{return initialSession();}
}
