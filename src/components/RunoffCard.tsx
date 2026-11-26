import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RISK_LABELS, type RunoffRisk } from "../lib/runoffRisk";
export default function RunoffCard({ risk, loading=false, isMobile=false }: { risk: RunoffRisk; loading?: boolean; isMobile?: boolean }) {
  const [open,setOpen]=useState(false);
  const dialogRef=useRef<HTMLDialogElement>(null);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const titleId=useId();
  useEffect(()=>{
    if(!open || isMobile)return;
    const dialog=dialogRef.current;
    const trigger=triggerRef.current;
    if(dialog && !dialog.open)dialog.showModal();
    return ()=>{ if(dialog?.open)dialog.close(); if(trigger?.isConnected)trigger.focus(); };
  },[open,isMobile]);
  const alert=risk.status==="ok" && (risk.debrisLevel ?? 0)>=2;
  const fmt=(v: number | null)=>v==null?"不明":`${v.toFixed(1)}mm`;
  const label=<>{loading?"降雨履歴を確認中…":risk.label}{!loading && risk.stale ? "（古いキャッシュ）" : ""}</>;
  const details=loading ? <div>降雨履歴を確認中…</div> : <div style={{ display: "grid", gap: 9, paddingTop: 8, maxHeight: isMobile ? 260 : "calc(100dvh - 240px)", overflowY: "auto", overflowWrap: "anywhere", lineHeight: 1.6 }}>
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
    </div>;
  const cardStyle={ marginTop:8,padding:"8px 10px",borderRadius:12,minWidth:0,background:alert?"rgba(180,115,36,.18)":"rgba(82,148,167,.12)",border:`1px solid ${alert?"rgba(255,196,105,.35)":"rgba(137,206,223,.2)"}`,color:alert?"#ffe1a3":"#c3e9f1",fontSize:12 };
  if(isMobile)return <details style={cardStyle}>
    <summary style={{cursor:"pointer",minHeight:24,lineHeight:1.5,fontWeight:800}}>🌿 {label} <span style={{fontWeight:400,fontSize:10}}>根拠を見る</span></summary>
    {details}
  </details>;
  return <>
    <div style={cardStyle}>
      <button type="button" ref={triggerRef} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,width:"100%",minHeight:28,padding:0,border:0,background:"transparent",color:"inherit",textAlign:"left",cursor:"pointer",fontSize:12,lineHeight:1.5,fontWeight:800}}>
        <span>🌿 {label}</span><span style={{fontWeight:400,fontSize:11,whiteSpace:"nowrap"}}>根拠を見る ↗</span>
      </button>
    </div>
    {open && typeof document!=="undefined" && createPortal(<dialog ref={dialogRef} aria-labelledby={titleId}
      onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)} onClick={event=>{if(event.target===event.currentTarget)setOpen(false);}}
      style={{position:"fixed",inset:0,margin:"auto",boxSizing:"border-box",width:"min(760px, calc(100vw - 48px))",maxHeight:"calc(100dvh - 64px)",padding:0,border:"1px solid rgba(156,200,224,.4)",borderRadius:18,background:"#202a39",color:"#edf6ff",boxShadow:"0 24px 90px rgba(0,0,0,.55)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,.15)"}}>
        <h2 id={titleId} style={{margin:0,fontSize:17}}>🌿 ゴミ濁りの詳細</h2>
        <button type="button" autoFocus onClick={()=>setOpen(false)} style={{padding:"8px 14px",minHeight:40,borderRadius:10,border:"1px solid rgba(255,255,255,.3)",background:"rgba(255,255,255,.07)",color:"inherit",cursor:"pointer"}}>閉じる</button>
      </div>
      <div style={{padding:"12px 20px 20px",fontSize:13}}><strong style={{color:alert?"#ffe1a3":"#c3e9f1"}}>{label}</strong>{details}</div>
    </dialog>,document.body)}
  </>;

}
