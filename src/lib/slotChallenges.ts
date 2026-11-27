import {bonusRate,ROLE_RULES,type Role} from './slotRules';
export const CHALLENGES=[
 {id:'bigbait',title:'ビッグベイトチャレンジ！',goal:'水面を割る一撃を引き出せ！',mode:'lure',skills:[4,3,3,1,5],intro:'大きなルアーに、夢を乗せて！',attempt:'追ってきた……食わせる間を作って！',climax:'今！ 水面を割るのは……!?',win:'大物キャッチ！ BONUS CHANCE！',lose:'見切られちゃった……次こそ！'},
 {id:'distance',title:'大遠投をかませ！',goal:'沖のナブラまで届け！',mode:'lure',skills:[4,5,2,1,4],intro:'狙うは、あの沖のナブラ！',attempt:'風を読んで……フルキャスト！',climax:'もうひと伸び！ 届けーっ！',win:'ナブラ直撃！ BONUS CHANCE！',lose:'あと少し、届かなかった！'},
 {id:'skipping',title:'スキッピングで狙え！',goal:'桟橋の奥へルアーを滑り込ませろ！',mode:'lure',skills:[5,1,4,2,3],intro:'低い弾道で、あの隙間へ！',attempt:'一跳ね、二跳ね……もっと奥へ！',climax:'最後の隙間……通せる!?',win:'ピンポイント攻略！ BONUS CHANCE！',lose:'あっ、手前で止まっちゃった！'},
 {id:'float',title:'沈むウキを見極めろ！',goal:'本命のアタリに合わせろ！',mode:'float',skills:[3,2,5,4,2],intro:'静かに……ウキをよく見て。',attempt:'ピクッ……まだ、もう少し！',climax:'沈んだ！ 今、合わせて！',win:'合わせ成功！ BONUS CHANCE！',lose:'早かった!? すっぽ抜けちゃった！'},
 {id:'light',title:'足元のヌシを釣り上げろ！',goal:'小さなアタリを逃すな！',mode:'lure',skills:[4,2,3,5,3],intro:'足元にも、大物の気配！',attempt:'そーっと落として……コツッ！',climax:'潜られる前に、引き上げて！',win:'ヌシ登場！ BONUS CHANCE！',lose:'根に戻られちゃった……！'},
] as const;
export type ChallengeId=typeof CHALLENGES[number]['id'];
export type Challenge={id:ChallengeId;actor:number;stars:number;expectation:number;skill:number};
export function challengeSpec(id:ChallengeId){return CHALLENGES.find(c=>c.id===id)!;}
function affinity(role:Role,id:ChallengeId){return role==='fish'&&id==='bigbait'?4:role==='cherry'&&id==='float'?3:role==='chance'&&(id==='skipping'||id==='distance')?3:1;}
// The outcome is already drawn. Winner/loser selection weights differ, so skilled
// character + challenge combinations really are more likely to accompany a win.
export function chooseChallenge(role:Role,high:boolean,winning:boolean,random:()=>number=Math.random):Challenge {
 const candidates=CHALLENGES.flatMap(c=>c.skills.map((skill,actor)=>({id:c.id,actor,skill,base:affinity(role,c.id)})));
 const weights=candidates.map(c=>c.base*(winning?c.skill**2:(6-c.skill)**2));
 let pick=random()*weights.reduce((a,b)=>a+b,0),index=weights.length-1;
 for(let i=0;i<weights.length;i++){pick-=weights[i];if(pick<0){index=i;break;}}
 return rateChallenge(role,high,candidates[index].id,candidates[index].actor);
}
export function rateChallenge(role:Role,high:boolean,id:ChallengeId,actor:number):Challenge {
 const candidates=CHALLENGES.flatMap(c=>c.skills.map((skill,actor)=>({id:c.id,actor,skill,base:affinity(role,c.id)})));
 const winTotal=candidates.reduce((sum,c)=>sum+c.base*c.skill**2,0),loseTotal=candidates.reduce((sum,c)=>sum+c.base*(6-c.skill)**2,0);
 const chosen=candidates.find(c=>c.id===id&&c.actor===actor)!;
 const raw=bonusRate(role,high),prior=raw/(raw+(1-raw)*ROLE_RULES[role].tease),a=prior*chosen.base*chosen.skill**2/winTotal,b=(1-prior)*chosen.base*(6-chosen.skill)**2/loseTotal;
 const expectation=a/(a+b),stars=expectation>=.72?5:expectation>=.48?4:expectation>=.28?3:expectation>=.12?2:1;
 return {id:chosen.id,actor:chosen.actor,skill:chosen.skill,expectation,stars};
}

export function validChallenge(v:unknown):v is Challenge {
 const c=v as Challenge;return !!c&&CHALLENGES.some(s=>s.id===c.id)&&Number.isInteger(c.actor)&&c.actor>=0&&c.actor<5&&Number.isInteger(c.stars)&&c.stars>=1&&c.stars<=5&&Number.isInteger(c.skill)&&c.skill>=1&&c.skill<=5&&Number.isFinite(c.expectation)&&c.expectation>=0&&c.expectation<=1;
}
