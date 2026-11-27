export type Role='miss'|'replay'|'bell'|'fish'|'cherry'|'chance';
export const NORMAL_REPLAY_RATE=1/7.3, CHANCE_REPLAY_RATE=.72;
export const HIGH_GAMES=20;
export type RoleRule={label:string;rate:number;pay:number;bonus:number;highBonus:number;high:number;tease:number};
// Original play balance, not a reproduction of any manufacturer's probabilities.
export const ROLE_RULES:Record<Role,RoleRule>={
 replay:{label:'リプレイ',rate:NORMAL_REPLAY_RATE,pay:0,bonus:1/2048,highBonus:1/1024,high:0,tease:1/400},
 bell:{label:'ベル（金色リール）',rate:1/6,pay:6,bonus:1/2048,highBonus:1/1024,high:0,tease:1/400},
 cherry:{label:'チェリー（赤ウキ）',rate:1/80,pay:2,bonus:.22,highBonus:.40,high:.45,tease:.55},
 fish:{label:'スイカ（ビッグベイト）',rate:1/45,pay:10,bonus:.10,highBonus:.20,high:.28,tease:.35},
 chance:{label:'チャンス目',rate:1/160,pay:0,bonus:.45,highBonus:.70,high:.08,tease:.85},
 miss:{label:'ハズレ',rate:0,pay:0,bonus:1/12000,highBonus:1/6000,high:0,tease:1/600},
};
export const isRare=(role:Role)=>role==='cherry'||role==='fish'||role==='chance';
export function bonusRate(role:Role,high=false){return high?ROLE_RULES[role].highBonus:ROLE_RULES[role].bonus;}
export function drawRole(random:number,replayRate=NORMAL_REPLAY_RATE):Role {
 let threshold=replayRate;if(random<threshold)return 'replay';
 for(const role of ['bell','fish','cherry','chance'] as const){threshold+=ROLE_RULES[role].rate;if(random<threshold)return role;}
 return 'miss';
}

// Constant throughout NABU RUSH: no opening-game or continuation-count advantage.
export const RUSH_RARE_RATE=.09;
export function drawRushRole(value:number):Role {
 if(value<.03)return 'cherry';
 if(value<.075)return 'fish';
 if(value<RUSH_RARE_RATE)return 'chance';
 return 'bell';
}
export function bonusPayout(role:Role){return role==='bell'||role==='fish'?15:role==='cherry'?8:0;}
