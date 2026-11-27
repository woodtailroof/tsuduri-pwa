import {isRare} from './slotRules';
import {validChallenge,type Challenge} from './slotChallenges';
import type { Role, Bonus, Chance, FishingMode } from './slotGame';
export type Stage = 'harbor'|'surf'|'river'|'sunset'|'festival'|'tide';
export type Cue = 'quiet'|'cast'|'chase'|'shine'|'float'|'splash'|'crab';
export type SlotVisual = {stage:Stage;actor:number;actorLeft:number;stageLeft:number;tension:number;cue:Cue;tier:'quiet'|'normal'|'rare';outcome:'waiting'|'miss'|'hit'|'replay'|'bonus'|'confirmed'|'escape';seed:number;fishing?:FishingMode;chanceLeft?:number;chanceTotal?:number;challenge?:Challenge;challengeStart?:number;highLeft?:number};
export const STAGE_NAMES:Record<Stage,string>={harbor:'のんびり港',surf:'青空サーフ',river:'河口の流れ',sunset:'夕マズメ',festival:'大漁フェスティバル',tide:'潮目チャンス（高確）'};
export function initialVisual():SlotVisual{return {stage:'harbor',actor:0,actorLeft:18,stageLeft:15,tension:0,cue:'quiet',tier:'quiet',outcome:'waiting',seed:0,fishing:'lure',chanceLeft:0,chanceTotal:0};}
export function validVisual(v:unknown):v is SlotVisual {
 const s=v as SlotVisual;return !!s&&Object.keys(STAGE_NAMES).includes(s.stage)&&Number.isInteger(s.actor)&&s.actor>=0&&s.actor<5&&['actorLeft','stageLeft','tension','seed'].every(k=>Number.isSafeInteger(s[k as keyof SlotVisual])&&Number(s[k as keyof SlotVisual])>=0&&Number(s[k as keyof SlotVisual])<1e9)&&['quiet','cast','chase','shine','float','splash','crab'].includes(s.cue)&&['quiet','normal','rare'].includes(s.tier)&&['waiting','miss','hit','replay','bonus','confirmed','escape'].includes(s.outcome)&&(s.fishing===undefined||s.fishing==='lure'||s.fishing==='float')&&[s.chanceLeft??0,s.chanceTotal??0].every(n=>Number.isInteger(n)&&n>=0&&n<=10)&&(!s.challenge||validChallenge(s.challenge))&&Number.isInteger(s.highLeft??0)&&(s.highLeft??0)>=0&&(s.highLeft??0)<=20;
}
export function nextVisual(previous:SlotVisual,context:{role:Role;pending:Bonus|null;active:Bonus|null;chance?:Chance|null;announced?:boolean;highLeft?:number},random:()=>number=Math.random):SlotVisual {
 const v={...previous,actorLeft:Math.max(0,previous.actorLeft-1),stageLeft:Math.max(0,previous.stageLeft-1),tension:Math.max(0,previous.tension-1),outcome:'waiting' as const,seed:previous.seed+1};
 const rare=isRare(context.role);
 if(rare)v.tension=6+Math.floor(random()*5);
 if(!v.actorLeft&&!context.chance){v.actor=(v.actor+1+Math.floor(random()*4))%5;v.actorLeft=14+Math.floor(random()*15);}
 if(context.chance?.challenge)v.actor=context.chance.challenge.actor;
 if(context.active)v.stage='festival';
 else if(context.pending||context.chance)v.stage='sunset';
 else if(context.highLeft)v.stage='tide';
 else if(!v.stageLeft||previous.stage==='festival'||previous.stage==='sunset'||previous.stage==='tide'){
   const stages:Stage[]=['harbor','surf','river'];v.stage=stages[Math.floor(random()*3)%3];v.stageLeft=12+Math.floor(random()*15);
 }
 const r=random();let cue:Cue='quiet',tier:SlotVisual['tier']='quiet';
 if(rare){tier=r<.85?'rare':'normal';cue=context.role==='cherry'?'float':context.role==='chance'?'shine':'chase';}
 else if(context.role==='bell'){cue=r<.35?'shine':r<.65?'cast':'quiet';tier=cue==='quiet'?'quiet':'normal';}
 else if(context.role==='replay'){cue=r<.25?'chase':r<.55?'cast':'quiet';tier=cue==='quiet'?'quiet':'normal';}
 else if(r<.025){cue='splash';tier='rare';} // A dramatic tease can fail; never confirms a bonus.
 else if(r<.16){cue='crab';tier='normal';}
 else if(r<.48){cue='cast';tier='normal';}
 return {...v,cue:context.chance?(context.chance.mode==='float'?'float':'chase'):cue,tier:context.chance?'rare':tier,fishing:context.chance?.mode??(context.pending?(previous.fishing??'lure'):((v.stage==='harbor'||v.stage==='river')?'float':'lure')),chanceLeft:context.chance?.left??0,chanceTotal:context.chance?.total??0,challenge:context.chance?.challenge,challengeStart:context.chance?.start,highLeft:context.highLeft??0};
}
export function resolveVisual(v:SlotVisual,context:{payout:number;replay:boolean;bonusStarted:Bonus|null;chanceOutcome?:'win'|'miss'|null;highLeft?:number;highEntered?:boolean}):SlotVisual {
 return {...v,highLeft:context.highLeft??v.highLeft,stage:!v.chanceLeft&&context.highLeft&&!context.bonusStarted?'tide':v.stage,outcome:context.chanceOutcome==='win'?'confirmed':context.chanceOutcome==='miss'?'escape':context.bonusStarted?'bonus':context.replay?'replay':context.payout?'hit':'miss'};
}
export function visualCaption(v:SlotVisual,phase:number):string {
 if(v.outcome==='confirmed')return '大物ヒット！ ボーナス図柄を狙って！';
 if(v.outcome==='escape')return 'あっ……抜けた！ 次の一投でリベンジ！';
 if(v.chanceLeft&&v.outcome!=='bonus')return v.chanceLeft<=2?'引きが強くなった……今、合わせる！':v.fishing==='float'?'ピクピク……おっ!? ウキが動いてる！':'追ってきてる……巻く手を止めないで！';
 if(v.outcome==='bonus')return 'やった！ ボーナス入賞！';
 if(v.outcome==='replay')return 'もう一投、楽しもう！';
 if(v.outcome==='hit')return v.cue==='crab'?'カニが、お宝を連れてきた！':'キャッチ！ いい感じ！';
 if(v.outcome==='miss')return v.cue==='crab'?'カニさん、またね♪':v.tier==='rare'?'あっ……逃げられちゃった！':v.cue==='quiet'?'潮風が気持ちいいね。':'残念、次の一投へ！';
 const captions:Record<Cue,string[]>={quiet:['のんびり、釣り日和。','波の音に耳をすませて。'],cast:['よーし、あそこへ！','アタリ……あるかな？'],chase:['魚影が見えた！','追ってきてる……！'],shine:['何か、きらっとした？','リールが輝いてる！'],float:['ウキをよく見て……','ピクッ！ 今、動いた？'],splash:['大きな波紋……！','何かが、水面に！'],crab:['足元にカニさん！','何を持ってきたのかな？']};
 return captions[v.cue][phase>=2?1:0];
}
