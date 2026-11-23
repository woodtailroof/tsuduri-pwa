import { useEffect, useMemo, useState } from "react";
import type { TripRecord, TripFish, TripPhoto, TidePoint } from "../db";
import { historyTimeline, durationLabel, localDay } from "../lib/tripHistoryTimeline";
import { getTide736DayCached } from "../lib/tide736Cache";
import { getTideAtTime } from "../lib/tide736";
import { FIXED_PORT } from "../points";
import TideGraph from "./TideGraph";

const COLORS = { start: "#70dcff", catch: "#ffd166", end: "#c6a5ff" };
const LABELS = { start: "開始", catch: "釣果", end: "終了" };
type DayTide = { series: TidePoint[]; error?: boolean };
type Props = {
  trip: TripRecord; fish: TripFish[]; photos: TripPhoto[];
  photoUrl: (id: number) => string | null;
  onPhoto: (id: number) => void;
  fishLabel: (fish: TripFish) => string;
};
export default function TripHistoryTimeline({ trip, fish, photos, photoUrl, onPhoto, fishLabel }: Props) {
  const timeline = useMemo(() => historyTimeline(trip, fish, photos), [trip, fish, photos]);
  const [tides, setTides] = useState<Record<string, DayTide>>({});
  const datesKey = timeline.days.map(localDay).join(",");
  useEffect(() => {
    let cancelled = false;
    setTides({});
    // 各イベント当日の潮を取得。翌日の釣果を前日の潮曲線へ重ねない。
    void Promise.all(datesKey.split(",").filter(Boolean).map(async (day) => {
      let tide: DayTide;
      try {
        const result = await getTide736DayCached(FIXED_PORT.pc, FIXED_PORT.hc, new Date(`${day}T12:00:00`), { ttlDays: 30 });
        tide = { series: result.series };
      } catch { tide = { series: [], error: true }; }
      if (!cancelled) setTides(previous => ({ ...previous, [day]: tide }));
    }));
    return () => { cancelled = true; };
  }, [datesKey]);
  return <section className="glass glass-strong" style={{ padding: 16, borderRadius: 18, display: "grid", gap: 16, minWidth: 0 }}>
    <header><strong>🎣 この釣行のタイムライン</strong><div style={{ fontSize: 11, opacity: .7, marginTop: 5 }}>記録した時刻と、焼津の予測潮位を重ねて振り返る</div></header>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
      {[ ["総釣行時間", durationLabel(timeline.duration)], [timeline.unknownCatches ? "最初の時刻付き釣果まで" : "最初の釣果まで", trip.outcome === "skunk" ? "釣果なし" : durationLabel(timeline.firstCatchMinutes)] ].map(([label,value]) => <div key={label} style={{ padding: 12, borderRadius: 12, background: "rgba(114,165,255,.1)", border: "1px solid rgba(170,190,255,.2)" }}><div style={{ fontSize: 11, opacity: .75 }}>{label}</div><strong style={{ display: "block", marginTop: 6, fontSize: 19 }}>{value}</strong></div>)}
    </div>
    <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
      {timeline.events.map(event => {
        const tide = event.at ? tides[localDay(event.at)] : undefined;
        const info = event.at && tide?.series.length ? getTideAtTime(tide.series, event.at.getTime()) : null;
        const savedTrend = event.fish?.caughtTideTrend;
        const trend = info?.trend ?? (savedTrend === "up" ? "上げ" : savedTrend === "down" ? "下げ" : savedTrend === "flat" ? "止まり" : null);
        const src = event.photo?.id != null ? photoUrl(event.photo.id) : null;
        const offset = event.at && timeline.start && event.at >= timeline.start ? (event.at.getTime()-timeline.start.getTime())/60000 : null;
        return <li key={event.id} style={{ borderLeft: `3px solid ${COLORS[event.role]}`, padding: "8px 10px", background: "rgba(0,0,0,.15)", borderRadius: "0 10px 10px 0", display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: COLORS[event.role], fontSize: 12, fontWeight: 800 }}>{LABELS[event.role]} <span style={{ fontSize: 16, marginLeft: 6 }}>{event.at ? event.at.toLocaleTimeString("ja-JP", {hour:"2-digit",minute:"2-digit"}) : "時刻不明"}</span></div>
            {event.at && <div style={{ fontSize: 11, opacity: .7, marginTop: 3 }}>{event.at.toLocaleDateString("ja-JP")} {offset != null && event.role !== "start" ? `・開始から${durationLabel(offset)}` : ""}</div>}
            {event.fish && <div style={{ fontSize: 12, marginTop: 5, overflowWrap: "anywhere" }}>{fishLabel(event.fish).split(" / 釣れた")[0]}</div>}
            <div style={{ fontSize: 12, opacity: .8, marginTop: 5 }}>{event.at ? info ? `🌊 ${Math.round(info.cm)}cm ・${info.trend}` : trend ? `🌊 ${trend}（保存値）` : tide ? "潮データなし" : "潮データ取得中…" : "日時を追記すると潮と照合できます"}</div>
          </div>
          {src && <button type="button" onClick={() => event.photo?.id != null && onPhoto(event.photo.id)} aria-label={`${LABELS[event.role]}の写真を拡大`} style={{ padding: 0, border: `1px solid ${COLORS[event.role]}`, borderRadius: 10, overflow: "hidden", width: 66, height: 66, flexShrink: 0, cursor: "zoom-in", background: "transparent" }}><img src={src} alt={`${LABELS[event.role]}の写真`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></button>}
        </li>;
      })}
    </ol>
    {trip.outcome === "skunk" && <div style={{ fontSize: 12, opacity: .8 }}>今回は釣果なし。開始から終了までの釣行記録です。</div>}
    {timeline.unknownCatches > 0 && <div style={{ fontSize: 12, color: "#ffd166" }}>時刻不明の釣果：{timeline.unknownCatches}件。時間帯・潮の実績には含めません。</div>}
    {timeline.days.map(day => {
      const key = localDay(day), tide = tides[key];
      const events = timeline.events.filter(e => e.at && localDay(e.at) === key);
      return <div key={key} style={{ minWidth: 0 }}>
        {tide?.series.length ? <TideGraph series={tide.series} baseDate={day} height={185} markers={events.map(e => ({ at: e.at!, label: LABELS[e.role], color: COLORS[e.role] }))} fishingRange={timeline.start && timeline.end && timeline.end >= timeline.start ? {start:timeline.start,end:timeline.end} : null} /> : <div style={{ fontSize: 12, opacity: .7 }}>{key}：{tide ? "潮グラフを取得できませんでした" : "潮グラフを準備中…"}</div>}
      </div>;
    })}
    <div style={{ fontSize: 11, opacity: .65 }}>水色：開始 ／ 黄：釣果 ／ 紫：終了。帯は釣行時間。時刻が近い点の詳細は上の一覧で確認できます。潮は焼津の予測値です。</div>
  </section>;
}
