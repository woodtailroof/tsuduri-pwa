import { RUNOFF_PROFILES, type RainSite } from "./runoffProfiles";
export type RainHour = { at: number; rain: number | null; windSpeed: number | null; windDirection: number | null };
export type RainHistory = { site: RainSite; gridLat: number | null; gridLon: number | null; hours: RainHour[]; fetchedAt: number; stale: boolean };
type CachedRain = Omit<RainHistory, "site" | "stale">;
const PREFIX = "tsuduri_rain_history_v1:";
const TTL = 30 * 60_000;
const memory = new Map<string, CachedRain>();
const pending = new Map<string, Promise<RainHistory[]>>();
export function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
export function jstDay(at: number): string { return new Date(at + 9 * 3600_000).toISOString().slice(0,10); }
export function selectedJstTime(day: string, hour: number): number { return Date.parse(`${day}T${String(hour).padStart(2,"0")}:00:00+09:00`); }
export function parseRainResponse(raw: unknown, site: RainSite, fetchedAt: number): RainHistory {
  if (!raw || typeof raw !== "object") throw Error("降雨データ形式が不正です");
  const x = raw as { latitude?: unknown; longitude?: unknown; hourly?: Record<string, unknown[]> };
  const h=x.hourly, times=h?.time;
  if (!Array.isArray(times)) throw Error("降雨の時刻データがありません");
  const hours = times.flatMap((t,i): RainHour[] => {
    const at = nullableNumber(t);
    if (at == null) return [];
    const rain=nullableNumber(h?.precipitation?.[i]);
    return [{ at: at*1000, rain: rain != null && rain>=0 ? rain : null,
      windSpeed: nullableNumber(h?.wind_speed_10m?.[i]), windDirection: nullableNumber(h?.wind_direction_10m?.[i]) }];
  });
  return {site,gridLat:nullableNumber(x.latitude),gridLon:nullableNumber(x.longitude),hours,fetchedAt,stale:false};
}
function read(key: string): CachedRain | null {
  if(memory.has(key)) return memory.get(key)!;
  try {
    const value=JSON.parse(localStorage.getItem(PREFIX+key) ?? "null") as CachedRain | null;
    if (value && Number.isFinite(value.fetchedAt) && Array.isArray(value.hours) && value.hours.every(h=>Number.isFinite(h.at) && (h.rain===null || (typeof h.rain==="number" && Number.isFinite(h.rain) && h.rain>=0)))) return value;
  } catch { /* キャッシュなしでも取得する */ }
  return null;
}
function save(key: string, value: CachedRain) {
  memory.set(key,value);
  if(memory.size>16) memory.delete(memory.keys().next().value!);
  try {
    localStorage.setItem(PREFIX+key,JSON.stringify(value));
    const keys=Object.keys(localStorage).filter(k=>k.startsWith(PREFIX));
    if(keys.length>16) keys.sort((a,b)=>(JSON.parse(localStorage.getItem(a) ?? "{}").fetchedAt ?? 0)-(JSON.parse(localStorage.getItem(b) ?? "{}").fetchedAt ?? 0)).slice(0,keys.length-16).forEach(k=>localStorage.removeItem(k));
  } catch { /* 容量不足でも取得結果を使う */ }
}
export async function getRainHistory(pointId: string, day: string, online=true): Promise<RainHistory[]> {
  const profile=RUNOFF_PROFILES[pointId];
  if(!profile) throw Error("この地点の流域設定がありません");
  const key=`${pointId}:${day}`;
  const existing=pending.get(key);if(existing)return existing;
  const job=(async()=>{
    const now=Date.now(), cached=profile.sites.map(site=>read(`${site.id}:${site.lat}:${site.lon}:${day}`));
    if(cached.every(c=>c && now-c.fetchedAt<=TTL)) return cached.map((c,i)=>({...c!,site:profile.sites[i],stale:false}));
    const fallback=()=>{
      if(!cached.every(Boolean)) throw Error(online ? "降雨履歴を取得できません" : "オフラインで降雨履歴がありません");
      return cached.map((c,i)=>({...c!,site:profile.sites[i],stale:true}));
    };
    if(!online)return fallback();
    const target=selectedJstTime(day,0);
    if(!Number.isFinite(target))throw Error("対象日が不正です");
    const today=selectedJstTime(jstDay(now),0);
    const offset=Math.round((target-today)/86400_000);
    const pastDays=Math.max(0,10-offset),forecastDays=Math.max(1,offset+1);
    if(pastDays>92 || forecastDays>11)return fallback();
    const url=new URL("https://api.open-meteo.com/v1/jma");
    url.search=new URLSearchParams({latitude:profile.sites.map(s=>s.lat).join(","),longitude:profile.sites.map(s=>s.lon).join(","),hourly:"precipitation,wind_speed_10m,wind_direction_10m",past_days:String(pastDays),forecast_days:String(forecastDays),timezone:"Asia/Tokyo",timeformat:"unixtime",wind_speed_unit:"ms"}).toString();
    try {
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
      let raw: unknown;
      try {const response=await fetch(url.toString(),{signal:controller.signal});if(!response.ok)throw Error(`rain_http_${response.status}`);raw=await response.json();} finally {clearTimeout(timer);}
      if(!Array.isArray(raw) || raw.length!==profile.sites.length)throw Error("流域の降雨データが不足しています");
      const rows=raw.map((x,i)=>parseRainResponse(x,profile.sites[i],Date.now()));
      rows.forEach(r=>{r.hours=r.hours.filter(h=>h.at>=target-10*86400_000 && h.at<=target+86400_000);});
      rows.forEach((r,i)=>save(`${profile.sites[i].id}:${profile.sites[i].lat}:${profile.sites[i].lon}:${day}`,r));
      return rows;
    } catch {return fallback();}
  })();
  pending.set(key,job);try{return await job;}finally{pending.delete(key);}
}
