export type BaitRoute='win'|'miss'|'retry';
export type BaitPreview={game:0|1|2;stops:boolean[];cycle:number;route:BaitRoute;done:boolean};
export const initialBaitPreview=(route:BaitRoute='win'):BaitPreview=>({game:0,stops:[false,false,false],cycle:0,route,done:false});
export function advanceBait(s:BaitPreview,action:'lever'|number):BaitPreview{
 const full=s.stops.every(Boolean);
 if(action==='lever'){
  if(s.game===0)return {...s,game:1};
  if(!full)return s;
  if(s.game===1)return {...s,game:2,stops:[false,false,false]};
  if(s.route==='retry'&&s.cycle===0)return {...s,game:1,cycle:1,stops:[false,false,false],done:false};
  return s;
 }
 if(!s.game||s.done||action<0||action>2||s.stops[action])return s;
 const stops=[...s.stops];stops[action]=true;
 return {...s,stops,done:s.game===2&&stops.every(Boolean)};
}
export function baitOutcome(s:BaitPreview){return !s.done?'waiting':s.route==='miss'||s.route==='retry'&&s.cycle===0?'miss':'win';}
