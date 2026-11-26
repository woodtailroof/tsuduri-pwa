import { getFishingPoint } from "../points";
import { getRainHistory, jstDay } from "./rainHistory";
import { assessRunoff, unknownRunoff, runoffHint } from "./runoffRisk";
import { getMarineWaveForecast } from "./marineWave";
import { buildFishingForecast } from "./fishingForecast";
export async function fishingConditionsHint(pointId: string, at: number, online=true): Promise<string> {
  const point=getFishingPoint(pointId), day=jstDay(at);
  const [rain,wave]=await Promise.allSettled([
    getRainHistory(point.id,day,online),
    point.waveExposure==="none" ? Promise.resolve(null) : getMarineWaveForecast(point.id,point.weatherLat,point.weatherLon,day,{online}),
  ]);
  const marine=wave.status==="fulfilled" ? wave.value : null;
  const risk=rain.status==="fulfilled" ? assessRunoff(point.id,at,rain.value,marine?.history ?? []) : unknownRunoff(point.id,at,"降雨履歴を取得できず、ゴミ濁りは不明。通常の風雨・潮情報を参照してください。");
  const hour=new Date(at+9*3600_000).getUTCHours();
  const f=buildFishingForecast({point,selectedHour:hour,weather:[],tideSeries:[],tideName:null,marineWaveHours:marine?.hours ?? [],runoffRisk:risk});
  return `${runoffHint(risk)}\n【${point.name}・波の操作性】${f.conditions.wave.label}：${f.conditions.wave.basis?.join("／")}。${marine?.isStale?"波は期限切れキャッシュの参考値。":""}海上モデルの操作性の目安で、岸際の実測や安全の保証ではない。ゴミ・濁り・波から魚が釣れないと断定しない。`;
}
