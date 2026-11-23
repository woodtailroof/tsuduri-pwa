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

export default function AnglersLinks({ pointId }: { pointId: string }) {
  const links = AREA_LINKS[pointId] ?? [];
  if (!links.length) return null;
  return <section aria-label="選択した釣り場周辺のANGLERS釣果" style={{ gridColumn: "1 / -1", minWidth: 0, display: "grid", gap: 6, borderTop: "1px solid rgba(255,255,255,.15)", paddingTop: 9 }}>
    <div style={{ fontSize: 12, fontWeight: 800, color: "#a6e7ed" }}>🎣 周辺の釣果 · ANGLERS</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {links.map(link => <a key={link.areaId} href={`https://anglers.jp/areas/${link.areaId}`} target="_blank" rel="noopener noreferrer"
        aria-label={`${link.name}の釣果をANGLERSで開く（別タブ）`}
        style={{ flex: "1 1 130px", minWidth: 0, minHeight: 44, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(91,216,202,.35)", background: "linear-gradient(135deg, rgba(32,147,138,.27), rgba(20,53,76,.5))", color: "#d7fff6", textDecoration: "none", fontSize: 12, fontWeight: 700, textAlign: "center", overflowWrap: "anywhere", lineHeight: 1.4 }}>
        {link.name} ↗
      </a>)}
    </div>
  </section>;
}
