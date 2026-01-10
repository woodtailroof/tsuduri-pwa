// src/components/TideGraph.tsx

type TidePoint = { unix?: number; cm: number; time?: string }

type Props = {
  series: TidePoint[]
  baseDate: Date
  highlightAt?: Date | null
  height?: number
  // ✅ 追加：Y軸レンジ固定（cm）
  yDomain?: { min: number; max: number } | null
}

type Pt = { min: number; cm: number; src: TidePoint }
type TideExtreme = { kind: 'high' | 'low'; min: number; cm: number }

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function formatHMFromMinutes(totalMin: number) {
  const m = clamp(Math.round(totalMin), 0, 1440)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${pad2(h)}:${pad2(mm)}`
}

/**
 * ✅ time(HH:mm) を最優先（ズレ/跳ねの主因を潰す）
 * unix は fallback（秒/ms両対応）
 */
function toMinutes(p: TidePoint): number | null {
  if (p.time) {
    const [hh, mm] = p.time.split(':').map((v) => Number(v))
    if (Number.isFinite(hh) && Number.isFinite(mm)) return hh * 60 + mm
  }
  if (typeof p.unix === 'number') {
    const ms = p.unix < 1e12 ? p.unix * 1000 : p.unix
    const d = new Date(ms)
    return d.getHours() * 60 + d.getMinutes()
  }
  return null
}

/** いい感じの目盛り幅（1/2/5 * 10^n） */
function niceStep(range: number, targetTicks = 5) {
  if (range <= 0) return 1
  const rough = range / targetTicks
  const pow = Math.pow(10, Math.floor(Math.log10(rough)))
  const n = rough / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * pow
}

function buildYTicks(min: number, max: number, targetTicks = 5) {
  const range = max - min
  const step = niceStep(range, targetTicks)
  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = start; v <= end + step * 0.5; v += step) ticks.push(v)
  return { ticks, start, end }
}

/**
 * 極値抽出：単純なスロープ反転
 * - EPSで横ばいを吸収
 * - 近接はマージ
 * - 表示は満潮2 / 干潮2
 */
function extractExtremesBySlope(pts: Pt[]): TideExtreme[] {
  if (pts.length < 3) return []

  const EPS_CM = 1
  const raw: TideExtreme[] = []
  let prevSlope = 0 // -1:down, +1:up, 0:flat

  for (let i = 1; i < pts.length; i++) {
    const d = pts[i].cm - pts[i - 1].cm
    const slope = Math.abs(d) <= EPS_CM ? 0 : d > 0 ? 1 : -1

    if (i >= 2) {
      const a = prevSlope
      const b = slope
      if (a > 0 && b < 0) raw.push({ kind: 'high', min: pts[i - 1].min, cm: pts[i - 1].cm })
      else if (a < 0 && b > 0) raw.push({ kind: 'low', min: pts[i - 1].min, cm: pts[i - 1].cm })
    }

    if (slope !== 0) prevSlope = slope
  }

  // 近接重複をマージ（5分以内）
  const MERGE_MIN = 5
  const merged: TideExtreme[] = []
  for (const e of raw) {
    const last = merged[merged.length - 1]
    if (last && last.kind === e.kind && Math.abs(e.min - last.min) <= MERGE_MIN) {
      const pick = e.kind === 'high' ? (e.cm >= last.cm ? e : last) : e.cm <= last.cm ? e : last
      merged[merged.length - 1] = pick
    } else {
      merged.push(e)
    }
  }

  const highs = merged.filter((e) => e.kind === 'high').sort((a, b) => a.min - b.min).slice(0, 2)
  const lows = merged.filter((e) => e.kind === 'low').sort((a, b) => a.min - b.min).slice(0, 2)

  return [...highs, ...lows].sort((a, b) => a.min - b.min)
}

function trianglePath(x: number, y: number, dir: 'up' | 'down', size: number) {
  const s = size
  if (dir === 'up') return `M ${x} ${y - s} L ${x + s} ${y + s} L ${x - s} ${y + s} Z`
  return `M ${x} ${y + s} L ${x + s} ${y - s} L ${x - s} ${y - s} Z`
}

export default function TideGraph({
  series,
  baseDate,
  highlightAt = null,
  height = 140,
  yDomain = null,
}: Props) {
  const width = 360

  // 左にY軸ラベル分の余白
  const padTop = 12
  const padBottom = 16
  const padRight = 10
  const padLeft = 46

  const innerW = width - padLeft - padRight
  const innerH = height - padTop - padBottom

  if (!series || series.length === 0) {
    return (
      <div
        style={{
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 12,
          padding: 12,
          color: 'rgba(255,255,255,0.60)',
          background: 'rgba(17,17,17,0.35)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        タイドデータなし
      </div>
    )
  }

  // ✅ time/unix から分が取れる点だけ集める（欠損点での“跳ね”を防ぐ）
  const ptsTime: Pt[] = []
  for (const p of series) {
    const m = toMinutes(p)
    if (m == null) continue
    ptsTime.push({ min: clamp(m, 0, 1440), cm: p.cm, src: p })
  }

  // ほぼあり得ない保険：時間が取れない時だけ index モード
  const useIndex = ptsTime.length < 3
  const ptsBase: Pt[] = useIndex ? series.map((p, i) => ({ min: i, cm: p.cm, src: p })) : ptsTime

  // ✅ 時刻順にソート
  const ptsSorted = [...ptsBase].sort((a, b) => a.min - b.min)

  // ✅ 同一分が複数ある場合、最後の点を採用（暴れ防止）
  const ptsUniq: Pt[] = []
  for (const p of ptsSorted) {
    const last = ptsUniq[ptsUniq.length - 1]
    if (last && last.min === p.min) ptsUniq[ptsUniq.length - 1] = p
    else ptsUniq.push(p)
  }

  // ✅ 0:00 / 24:00 を補完（始点終点が欠ける日での“跳ね”を抑える）
  if (!useIndex && ptsUniq.length >= 2) {
    const first = ptsUniq[0]
    const last = ptsUniq[ptsUniq.length - 1]
    if (first.min > 0) ptsUniq.unshift({ min: 0, cm: first.cm, src: first.src })
    if (last.min < 1440) ptsUniq.push({ min: 1440, cm: last.cm, src: last.src })
  }

  const minX = 0
  const maxX = useIndex ? Math.max(0, ptsUniq.length - 1) : 1440

  const cms = ptsUniq.map((p) => p.cm)
  const minY0 = Math.min(...cms)
  const maxY0 = Math.max(...cms)

  // ✅ 縦軸レンジ：指定があれば固定、なければ自動
  let yMin: number
  let yMax: number
  if (yDomain) {
    yMin = yDomain.min
    yMax = yDomain.max
  } else {
    const yPad = Math.max(5, Math.round((maxY0 - minY0) * 0.08))
    yMin = minY0 - yPad
    yMax = maxY0 + yPad
  }

  const { ticks: yTicks, start: yStart, end: yEnd } = buildYTicks(yMin, yMax, 5)

  const xToPx = (m: number) => padLeft + ((m - minX) / (maxX - minX || 1)) * innerW
  const yToPx = (cm: number) => padTop + (1 - (cm - yStart) / (yEnd - yStart || 1)) * innerH

  const polyPoints = ptsUniq
    .map((p) => `${xToPx(p.min).toFixed(2)},${yToPx(p.cm).toFixed(2)}`)
    .join(' ')

  // ✅ 極値（indexモードでは出さない）
  const extremes = useIndex ? [] : extractExtremesBySlope(ptsUniq)

  // ✅ ハイライト（撮影時刻に一番近い点）
  let hi: Pt | null = null
  if (highlightAt) {
    const targetMin = highlightAt.getHours() * 60 + highlightAt.getMinutes()
    let best = Number.POSITIVE_INFINITY
    for (const p of ptsUniq) {
      const d = Math.abs(p.min - targetMin)
      if (d < best) {
        best = d
        hi = p
      }
    }
  }

  const hiX = hi ? xToPx(hi.min) : null
  const hiY = hi ? yToPx(hi.cm) : null

  // X軸目盛り（0/6/12/18/24）
  const ticksX = [0, 6, 12, 18, 24].map((h) => ({
    label: `${h}`,
    x: xToPx(
      useIndex ? clamp((ptsUniq.length - 1) * (h / 24), 0, Math.max(0, ptsUniq.length - 1)) : h * 60
    ),
  }))

  const FONT_Y = 10
  const FONT_X = 10
  const FONT_LABEL = 10

  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 12,
        padding: 12,
        background: 'rgba(17,17,17,0.35)', // ✅ 透過
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ color: '#eee', fontSize: 13, fontWeight: 700 }}>タイドグラフ</div>
        <div style={{ color: 'rgba(255,255,255,0.60)', fontSize: 12 }}>{baseDate.toLocaleDateString()}</div>
      </div>

      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ marginTop: 10, display: 'block' }}>
        <rect x="0" y="0" width={width} height={height} fill="transparent" />

        {/* Y軸：水平グリッド + 目盛り */}
        {yTicks.map((v) => {
          const y = yToPx(v)
          return (
            <g key={`y-${v}`}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="rgba(255,255,255,0.10)" />
              <text x={padLeft - 6} y={y + 3} textAnchor="end" fontSize={FONT_Y} fill="rgba(255,255,255,0.55)">
                {Math.round(v)}
              </text>
            </g>
          )
        })}

        {/* X軸：縦グリッド + 目盛り */}
        {ticksX.map((t) => (
          <g key={t.label}>
            <line x1={t.x} y1={padTop} x2={t.x} y2={height - padBottom} stroke="rgba(255,255,255,0.10)" />
            <text x={t.x} y={height - 2} textAnchor="middle" fontSize={FONT_X} fill="rgba(255,255,255,0.55)">
              {t.label}
            </text>
          </g>
        ))}

        {/* 潮位0cm基準線（範囲内だけ） */}
        {0 >= yStart && 0 <= yEnd && (
          <line
            x1={padLeft}
            y1={yToPx(0)}
            x2={width - padRight}
            y2={yToPx(0)}
            stroke="rgba(255,255,255,0.18)"
            strokeDasharray="3 4"
          />
        )}

        {/* 波（折れ線） */}
        <polyline points={polyPoints} fill="none" stroke="#00e0a8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* 満潮/干潮マーカー + ラベル */}
        {extremes.map((e, i) => {
          const x0 = xToPx(e.min)
          const y0 = yToPx(e.cm)

          const up = e.kind === 'high'
          const dyBase = up ? -18 : 18
          const dyAlt = (i % 2) * (up ? -10 : 10)
          const yLabel = clamp(y0 + dyBase + dyAlt, padTop + 12, height - padBottom - 8)

          const edgeL = x0 < padLeft + 40
          const edgeR = x0 > width - padRight - 40
          const anchor = edgeL ? 'start' : edgeR ? 'end' : 'middle'
          const xLabel =
            anchor === 'start'
              ? clamp(x0 + 10, padLeft + 2, width - padRight - 2)
              : anchor === 'end'
              ? clamp(x0 - 10, padLeft + 2, width - padRight - 2)
              : clamp(x0, padLeft + 2, width - padRight - 2)

          const label = `${formatHMFromMinutes(e.min)} (${Math.round(e.cm)}cm)`
          const c = e.kind === 'high' ? '#ffd166' : '#4cc9f0'

          const dotR = 5
          const triSize = 2.6

          return (
            <g key={`${e.kind}-${e.min}-${e.cm}`}>
              <circle cx={x0} cy={y0} r={dotR} fill={c} />
              <path d={trianglePath(x0, y0, e.kind === 'high' ? 'up' : 'down', triSize)} fill="rgba(17,17,17,0.90)" />
              <text x={xLabel} y={yLabel} textAnchor={anchor} fontSize={FONT_LABEL} fill={c}>
                {label}
              </text>
            </g>
          )
        })}

        {/* ハイライト（撮影時刻） + ラベル */}
        {hiX != null && hiY != null && hi != null && (
          <>
            <line x1={hiX} y1={padTop} x2={hiX} y2={height - padBottom} stroke="#ff4d6d" strokeDasharray="4 4" />
            <circle cx={hiX} cy={hiY} r="5.5" fill="#ff4d6d" />
            <circle cx={hiX} cy={hiY} r="9" fill="transparent" stroke="#ff4d6d" />

            {(() => {
              const label = `${formatHMFromMinutes(hi.min)} (${Math.round(hi.cm)}cm)`
              const x = clamp(hiX + 10, padLeft + 2, width - padRight - 2)
              const y = clamp(hiY + 18, padTop + 12, height - padBottom - 6)
              const anchor = hiX > width - padRight - 70 ? 'end' : 'start'
              const x2 = anchor === 'end' ? clamp(hiX - 10, padLeft + 2, width - padRight - 2) : x

              return (
                <text
                  x={x2}
                  y={y}
                  textAnchor={anchor}
                  fontSize={11}
                  fill="#ff4d6d"
                  stroke="rgba(17,17,17,0.85)"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {label}
                </text>
              )
            })()}
          </>
        )}

        {/* max/min表示 */}
        <text x={padLeft} y={padTop + 12} fontSize={10} fill="rgba(255,255,255,0.55)">
          max {Math.round(maxY0)}cm
        </text>
        <text x={padLeft} y={height - padBottom - 4} fontSize={10} fill="rgba(255,255,255,0.55)">
          min {Math.round(minY0)}cm
        </text>
      </svg>

      {highlightAt && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.60)' }}>
          📸 撮影時刻付近をマーキング：{highlightAt.toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}
