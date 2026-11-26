import type { Role, Bonus } from './slotGame';
export type Stage = 'harbor'|'surf'|'river'|'sunset'|'festival';
export type Cue = 'quiet'|'cast'|'chase'|'shine'|'float'|'splash'|'crab';
export type SlotVisual = {stage:Stage;actor:number;actorLeft:number;stageLeft:number;tension:number;cue:Cue;tier:'quiet'|'normal'|'rare';outcome:'waiting'|'miss'|'hit'|'replay'|'bonus';seed:number};
export const STAGE_NAMES:Record<Stage,string>={harbor:'のんびり港',surf:'青空サーフ',river:'河口の流れ',sunset:'夕マズメ',festival:'大漁フェスティバル'};
export function initialVisual():SlotVisual{return {stage:'harbor',actor:0,actorLeft:18,stageLeft:15,tension:0,cue:'quiet',tier:'quiet',outcome:'waiting',seed:0};}
export function validVisual(v:unknown):v is SlotVisual {
 const s=v as SlotVisual;return !!s&&Object.keys(STAGE_NAMES).includes(s.stage)&&Number.isInteger(s.actor)&&s.actor>=0&&s.actor<5&&['actorLeft','stageLeft','tension','seed'].every(k=>Number.isSafeInteger(s[k as keyof SlotVisual])&&Number(s[k as keyof SlotVisual])>=0&&Number(s[k as keyof SlotVisual])<1e9)&&['quiet','cast','chase','shine','float','splash','crab'].includes(s.cue)&&['quiet','normal','rare'].includes(s.tier)&&['waiting','miss','hit','replay','bonus'].includes(s.outcome);
}
export function nextVisual(previous:SlotVisual,context:{role:Role;pending:Bonus|null;active:Bonus|null},random:()=>number=Math.random):SlotVisual {
 const v={...previous,actorLeft:Math.max(0,previous.actorLeft-1),stageLeft:Math.max(0,previous.stageLeft-1),tension:Math.max(0,previous.tension-1),outcome:'waiting' as const,seed:previous.seed+1};
 const rare=context.role==='fish'||context.role==='cherry';
 if(rare)v.tension=6+Math.floor(random()*5);
 if(!v.actorLeft){v.actor=(v.actor+1+Math.floor(random()*4))%5;v.actorLeft=14+Math.floor(random()*15);}
 if(context.active)v.stage='festival';
 else if(v.tension||context.pending)v.stage='sunset';
 else if(!v.stageLeft||previous.stage==='festival'||previous.stage==='sunset'){
   const stages:Stage[]=['harbor','surf','river'];v.stage=stages[Math.floor(random()*3)%3];v.stageLeft=12+Math.floor(random()*15);
 }
 const r=random();let cue:Cue='quiet',tier:SlotVisual['tier']='quiet';
 if(rare){tier=r<.85?'rare':'normal';cue=context.role==='cherry'?(r<.45?'float':'splash'):(r<.5?'chase':'splash');}
 else if(context.role==='bell'){cue=r<.35?'shine':r<.65?'cast':'quiet';tier=cue==='quiet'?'quiet':'normal';}
 else if(context.role==='replay'){cue=r<.25?'chase':r<.55?'cast':'quiet';tier=cue==='quiet'?'quiet':'normal';}
 else if(r<.025){cue='splash';tier='rare';} // A dramatic tease can fail; never confirms a bonus.
 else if(r<.16){cue='crab';tier='normal';}
 else if(r<.48){cue='cast';tier='normal';}
 return {...v,cue,tier};
}
export function resolveVisual(v:SlotVisual,context:{payout:number;replay:boolean;bonusStarted:Bonus|null}):SlotVisual {
 return {...v,outcome:context.bonusStarted?'bonus':context.replay?'replay':context.payout?'hit':'miss'};
}
export function visualCaption(v:SlotVisual,phase:number):string {
 if(v.outcome==='bonus')return 'やった！ ボーナス入賞！';
 if(v.outcome==='replay')return 'もう一投、楽しもう！';
 if(v.outcome==='hit')return v.cue==='crab'?'カニが、お宝を連れてきた！':'キャッチ！ いい感じ！';
 if(v.outcome==='miss')return v.cue==='crab'?'カニさん、またね♪':v.tier==='rare'?'あっ……逃げられちゃった！':v.cue==='quiet'?'潮風が気持ちいいね。':'残念、次の一投へ！';
 const captions:Record<Cue,string[]>={quiet:['のんびり、釣り日和。','波の音に耳をすませて。'],cast:['よーし、あそこへ！','アタリ……あるかな？'],chase:['魚影が見えた！','追ってきてる……！'],shine:['何か、きらっとした？','リールが輝いてる！'],float:['ウキをよく見て……','ピクッ！ 今、動いた？'],splash:['大きな波紋……！','何かが、水面に！'],crab:['足元にカニさん！','何を持ってきたのかな？']};
 return captions[v.cue][phase>=2?1:0];
}
