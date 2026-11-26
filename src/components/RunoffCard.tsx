import { RISK_LABELS, type RunoffRisk } from "../lib/runoffRisk";
export default function RunoffCard({ risk, loading=false }: { risk: RunoffRisk; loading?: boolean }) {
  const alert=risk.status==="ok" && (risk.debrisLevel ?? 0)>=2;
  const fmt=(v: number | null)=>v==null?"不明":`${v.toFixed(1)}mm`;
  return <details style={{ marginTop: 8, padding: "8px 10px", borderRadius: 12, minWidth: 0, background: alert?"rgba(180,115,36,.18)":"rgba(82,148,167,.12)", border: `1px solid ${alert?"rgba(255,196,105,.35)":"rgba(137,206,223,.2)"}`, color: alert?"#ffe1a3":"#c3e9f1", fontSize: 12 }}>
    <summary style={{ cursor: "pointer", minHeight: 24, lineHeight: 1.5, fontWeight: 800 }}>
      🌿 {loading?"降雨履歴を確認中…":risk.label}{!loading && risk.stale ? "（古いキャッシュ）" : ""} <span style={{ fontWeight: 400, fontSize: 10 }}>根拠を見る</span>
    </summary>
    {!loading && <div style={{ display: "grid", gap: 9, paddingTop: 8, maxHeight: 260, overflowY: "auto", overflowWrap: "anywhere", lineHeight: 1.6 }}>
      <div>{risk.message}</div>
      <div style={{ fontSize: 11 }}>対象：{new Date(risk.at).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})} ／ JMAモデル履歴・予報（実測ではありません）</div>
      {risk.status==="ok" && <div>濁りの可能性：{RISK_LABELS[risk.turbidityLevel ?? 0]} ／ 釣りやすさ：{risk.comfortPenalty?`暫定 −${risk.comfortPenalty}点`:"追加減点なし"}<br />濁り単独では魚種共通の釣れそう度を下げません。</div>}
      {risk.metrics.map(m=><div key={m.siteId} style={{ padding: 8, borderRadius: 8, background: "rgba(0,0,0,.16)" }}>
        <strong>{m.name}</strong>
        <div>24h {fmt(m.rain24)} ／ 48h {fmt(m.rain48)}<br />72h {fmt(m.rain72)} ／ 7日 {fmt(m.rain168)}</div>
        <div>72h内の最大時間雨量：{m.maxHour==null?"不明":`${m.maxHour.toFixed(1)}mm/h`}</div>
        <div>最終有効雨：{m.lastRainHours==null ? "7日内に確認なし（欠損時は不明）" : `${m.lastRainHours}時間前`} ／ 雨前の乾燥：{m.dryBeforeHours==null?"不明":`${m.dryAtLeast?"少なくとも":""}${m.dryBeforeHours}時間`}</div>
        <div style={{ opacity:.7 }}>有効雨は0.5mm/h以上の暫定定義。乾燥はそれ未満。取得時点で予報の時刻：72h内 {m.forecastHours72}時間。格子 {m.gridLat ?? "?"}, {m.gridLon ?? "?"}</div>
      </div>)}
      {risk.basis.map((text,i)=><div key={i}>・{text}</div>)}
      <div style={{ opacity:.7,fontSize:11 }}>{risk.note}</div>
    </div>}
  </details>;
}
