import { useState } from "react";

const AREA_LINKS: Record<string, readonly { name: string; areaId: number }[]> = {
  fishuna: [{ name: "親水広場", areaId: 3145 }],
  oohama: [
    { name: "浜川河口", areaId: 3143 },
    { name: "大浜海岸", areaId: 3858 },
    { name: "安倍川河口", areaId: 3141 },
  ],
  "mochimune-port": [{ name: "用宗広野海岸公園", areaId: 3162 }],
  tomoe: [{ name: "巴川河口", areaId: 2298 }],
};

export default function AnglersLinks({ pointId, isMobile = false }: { pointId: string; isMobile?: boolean }) {
  const [selected, setSelected] = useState<{ pointId: string; name: string; areaId: number } | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const active = selected?.pointId === pointId ? selected : null;
  const activeUrl = active ? `https://anglers.jp/areas/${active.areaId}` : "";
  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(activeUrl);
      setCopyStatus("コピーしました。Safariのアドレス欄に貼り付けて開いてね。");
    } catch {
      setCopyStatus("コピーできませんでした。下のURLを長押ししてコピーしてね。");
    }
  }
  const links = AREA_LINKS[pointId] ?? [];
  if (!links.length) return null;
  return <section aria-label="選択した釣り場周辺のANGLERS釣果" style={{ gridColumn: "1 / -1", minWidth: 0, display: "grid", gap: 6, borderTop: "1px solid rgba(255,255,255,.15)", paddingTop: 9 }}>
    <div style={{ fontSize: 12, fontWeight: 800, color: "#a6e7ed" }}>🎣 周辺の釣果 · ANGLERS</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {links.map(link => <a key={link.areaId} href={`https://anglers.jp/areas/${link.areaId}`} target="_blank" rel="noopener noreferrer"
        onClick={event => {
          if (!isMobile) return;
          event.preventDefault();
          setCopyStatus("");
          setSelected({ pointId, ...link });
        }}
        aria-label={isMobile ? `${link.name}のWebページURLを表示` : `${link.name}の釣果をANGLERSで開く（別タブ）`}
        style={{ flex: "1 1 130px", minWidth: 0, minHeight: 44, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(91,216,202,.35)", background: "linear-gradient(135deg, rgba(32,147,138,.27), rgba(20,53,76,.5))", color: "#d7fff6", textDecoration: "none", fontSize: 12, fontWeight: 700, textAlign: "center", overflowWrap: "anywhere", lineHeight: 1.4 }}>
        {link.name} ↗
      </a>)}
    </div>
    {isMobile && active && <div style={{ display: "grid", gap: 8, background: "rgba(0,0,0,.2)", padding: 10, borderRadius: 12, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <strong style={{ fontSize: 12 }}>{active.name}をWebで見る</strong>
        <button type="button" onClick={() => setSelected(null)} aria-label="URLの表示を閉じる" style={{ color: "white", background: "transparent", border: "1px solid #ffffff44", borderRadius: 8, minHeight: 32, padding: "4px 8px" }}>閉じる</button>
      </div>
      <div style={{ fontSize: 11, opacity: .8, lineHeight: 1.6 }}>URLをコピーしてSafariなどのブラウザーのアドレス欄に貼り付けてね。リンクからANGLERSアプリが起動する場合の開き方です。</div>
      <input aria-label="ANGLERSのWebページURL" readOnly value={activeUrl} onFocus={event => event.target.select()} style={{ boxSizing: "border-box", width: "100%", minWidth: 0, fontSize: 16, padding: 8, color: "#fff", background: "rgba(0,0,0,.25)", border: "1px solid #ffffff33", borderRadius: 8 }} />
      <button type="button" onClick={() => void copyUrl()} style={{ minHeight: 44, borderRadius: 10, border: "1px solid #5bd8ca77", background: "rgba(32,147,138,.35)", color: "#d7fff6", fontWeight: 700 }}>📋 URLをコピー</button>
      <div role="status" style={{ fontSize: 11, color: "#d7fff6", lineHeight: 1.5 }}>{copyStatus}</div>
    </div>}
  </section>;
}
