import { RUNOFF_PROFILES } from "./runoffProfiles";
import type { RainHistory } from "./rainHistory";
const HOUR=3600_000;
export type HistoryWave = { at: number; waveHeight: number; wavePeriod: number | null };
export type RainMetrics = { siteId: string; name: string; rain24: number | null; rain48: number | null; rain72: number | null; rain168: number | null; maxHour: number | null; lastRainHours: number | null; dryBeforeHours: number | null; dryAtLeast: boolean; forecastHours72: number; gridLat: number | null; gridLon: number | null };
export type RunoffRisk = { status: "ok" | "unknown"; at: number; pointId: string; debrisLevel: number | null; turbidityLevel: number | null; comfortPenalty: number; label: string; message: string; basis: string[]; metrics: RainMetrics[]; stale: boolean; note: string };
export const RISK_LABELS=["低め", "やや低め", "注意", "警戒", "強く警戒"];
function level(value: number) {return value<5 ? 0 : value<10 ? 1 : value<20 ? 2 : value<40 ? 3 : 4;}
export function rainMetrics(data: RainHistory, target: number): RainMetrics {
  const at=Math.floor(target/HOUR)*HOUR;
  const map=new Map(data.hours.map(h=>[h.at,h]));
  function sum(n: number) {
    let total=0;
    for(let i=0;i<n;i++){const value=map.get(at-i*HOUR)?.rain;if(value==null || !Number.isFinite(value))return null;total+=value;}
    return Math.round(total*10)/10;
  }
  const wet=data.hours.filter(h=>h.at<=at && h.at>at-168*HOUR && h.rain!=null && h.rain>=.5).sort((a,b)=>a.at-b.at);
  const last=wet[wet.length-1];
  let start=last?.at;
  for(let i=wet.length-2;i>=0;i--){if(start!-wet[i].at>6*HOUR)break;start=wet[i].at;}
  let dry: number | null=null, dryAtLeast=false;
  if(start!=null){
    dry=0;
    for(let i=1;i<=168;i++){
      const rain=map.get(start-i*HOUR)?.rain;
      if(rain==null){dryAtLeast=true;if(dry===0)dry=null;break;}
      if(rain>=.5)break;
      dry++;
      if(i===168)dryAtLeast=true;
    }
  }
  const window=data.hours.filter(h=>h.at<=at && h.at>at-72*HOUR && h.rain!=null);
  return {siteId:data.site.id,name:data.site.name,rain24:sum(24),rain48:sum(48),rain72:sum(72),rain168:sum(168),maxHour:sum(72)==null?null:Math.max(0,...window.map(h=>h.rain!)),lastRainHours:last?(at-last.at)/HOUR:null,dryBeforeHours:dry,dryAtLeast,forecastHours72:window.filter(h=>h.at>Math.floor(data.fetchedAt/HOUR)*HOUR).length,gridLat:data.gridLat,gridLon:data.gridLon};
}
export function unknownRunoff(pointId: string, at: number, reason="必要な降雨履歴が揃っていません"): RunoffRisk {
  return {status:"unknown",pointId,at,debrisLevel:null,turbidityLevel:null,comfortPenalty:0,label:"降雨影響は不明",message:reason,basis:[],metrics:[],stale:false,note:RUNOFF_PROFILES[pointId]?.note ?? "地点設定なし"};
}
/** 科学的確率ではなく、時間減衰を使うルールベースの暫定的な出発前確認指標。 */
export function assessRunoff(pointId: string, target: number, histories: RainHistory[], waves: HistoryWave[]=[]): RunoffRisk {
  const at=Math.floor(target/HOUR)*HOUR, profile=RUNOFF_PROFILES[pointId];
  if(!profile || !Number.isFinite(at))return unknownRunoff(pointId,target);
  const ordered=profile.sites.map(site=>histories.find(h=>h.site.id===site.id));
  if(ordered.some(h=>!h))return unknownRunoff(pointId,at,"流域の代表点データが不足しています");
  const data=ordered as RainHistory[], metrics=data.map(h=>rainMetrics(h,at));
  if(metrics.some(m=>m.rain168==null))return {...unknownRunoff(pointId,at,"過去7日分に欠損・範囲外の時刻があります。雨なしとは判定していません。"),metrics};
  let debris=0,turbidity=0;
  const basis: string[]=[];
  // 代表点を足し算せず、最も懸念のある点を採用。同じ格子でも重複加算しない。
  for(let i=0;i<data.length;i++){
    const site=profile.sites[i],m=metrics[i];
    let d=0,t=0;
    for(const h of new Map(data[i].hours.map(h=>[h.at,h])).values()){
      if(h.at>at || h.at<=at-168*HOUR || h.rain==null)continue;
      const rawAge=(at-h.at)/HOUR;
      const age=Math.max(0,rawAge-site.holdHours);
      // 7日窓の末尾24hで0へ滑らかに落とし、境界を越えた瞬間の急落を防ぐ。
      const fade=Math.min(1,Math.max(0,(168-rawAge)/24));
      d+=h.rain*2**(-age/profile.debrisHalfLife)*fade;
      t+=h.rain*2**(-age/profile.turbidityHalfLife)*fade;
    }
    const dryBoost=m.dryBeforeHours!=null && m.dryBeforeHours>=72 ? 1.25 : 1;
    const intensityBoost=m.maxHour!=null && m.maxHour>=10 ? 1.15 : 1;
    debris=Math.max(debris,d*site.weight*profile.exposure*dryBoost*intensityBoost);
    turbidity=Math.max(turbidity,t*site.weight*profile.exposure);
    basis.push(`${m.name}：直近72h ${m.rain72!.toFixed(1)}mm／最終有効雨${m.lastRainHours==null ? "は7日内になし" : `から${m.lastRainHours}時間`}${dryBoost>1?"・雨前の乾燥72時間以上":""}`);
  }
  const rainDebrisLevel=level(debris);
  let debrisLevel=rainDebrisLevel,turbidityLevel=level(turbidity);
  const lastRain=Math.min(...metrics.map(m=>m.lastRainHours ?? Infinity));
  const relevant=waves.filter(w=>w.at<=at && w.at>at-24*HOUR && Number.isFinite(w.waveHeight));
  const peak=relevant.length?Math.max(...relevant.map(w=>w.waveHeight)):null;
  if(pointId==="oohama" && peak!=null && peak>=1){
    turbidityLevel=Math.max(turbidityLevel,relevant.some(w=>w.waveHeight>=1.5 || (w.waveHeight>=1 && (w.wavePeriod ?? 0)>=8))?2:1);
    basis.push(`過去24hの海上モデル最大${peak.toFixed(2)}m：砂泥の巻き上がりの参考`);
    if(rainDebrisLevel>=2 && lastRain<=96){debrisLevel=Math.min(4,debrisLevel+1);basis.push("降雨の懸念と波が重なり、ゴミの再浮遊にも注意（量は未観測）");}
  }
  // 風は滞留の補助情報。風・波による既存減点をゴミとしてもう一度加算しない。
  const wind=data[0].hours.filter(h=>h.at<=at && h.at>at-6*HOUR && h.windSpeed!=null && h.windDirection!=null);
  if(profile.onshoreFrom!=null && rainDebrisLevel>=2 && wind.some(h=>h.windSpeed!>=3 && Math.abs(((h.windDirection!-profile.onshoreFrom!+540)%360)-180)<=60))basis.push("直近に海側からの風：漂流物の岸寄りへの移動に注意（沿岸流は未評価）");
  const stale=data.some(h=>h.stale);
  const penalty=stale?0:[0,0,8,16,24][rainDebrisLevel];
  const label=`ゴミを伴う濁り：${RISK_LABELS[debrisLevel]}`;
  const message=debrisLevel>=2 ? "流域の降雨履歴から、枝葉などを伴う濁りが残る可能性があります。風・波が落ち着いても、ルアーへの付着など現況を確認してね。" : "取得した降雨履歴では、ゴミを伴う濁りを強く疑う材料は少なめ。透明な海やゴミなしを保証するものではありません。";
  return {status:"ok",pointId,at,debrisLevel,turbidityLevel,comfortPenalty:penalty,label,message,basis,metrics,stale,note:`${profile.note} 半減時間・係数・乾燥補正は未検証の暫定値。流量・水質・ゴミは未観測。${stale?"期限切れキャッシュのため減点には使いません。":""}`};
}
export function runoffHint(risk: RunoffRisk): string {
  const point=RUNOFF_PROFILES[risk.pointId]?.name ?? risk.pointId;
  return `【降雨履歴によるゴミ濁りの参考：${point}／対象${new Date(risk.at).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})}】\n${risk.label}。${risk.message}\n${risk.basis.join("\n")}\n濁り単独で全魚種の期待を下げない。ゴミは操作性の懸念として扱う。モデル履歴・予報であり実測ではない。${risk.metrics.some(m=>m.forecastHours72>0)?"対象時刻までの予報降雨を含む。":""}${risk.note}`;
}
