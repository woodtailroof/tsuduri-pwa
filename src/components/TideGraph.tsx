// src/components/TideGraph.tsx

type TidePoint = { unix?: number; cm: number; time?: string }

type Props = {
  series: TidePoint[]
  baseDate: Date
  highlightAt?: Date | null
  height?: number
  // ✅ Y軸レンジ固定（cm）
  yDomain?: { min: number; max: number } | null
}

type Pt = { min: number; cm: number; src: TidePoint }

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

/**
 * time(HH:mm) 優先、unixはfallback
 */
function toMinutes(p: TidePoint): number | null {
  if (p.time) {
    const [hh, mm] = p.time.split(':').map(Number)
    if (Number.isFinite(hh) && Number.isFinite(mm)) return hh * 60 + mm
  }
  if (typeof p.unix === 'number') {
    const ms = p.unix < 1e12 ? p.unix * 1000 : p.unix
    const d = new Date(ms)
    return d.getHours() * 60 + d.getMinutes()
  }
  return null
}

/** いい感じの目盛り幅 */
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

export default function TideGraph({
  series,
  baseDate,
  highlightAt = null,
  height = 140,
  yDomain = null,
}: Props) {
  const width = 360

  const padTop = 12
  const padBottom = 16
  const padRight = 10
  const padLeft = 46

  const innerW = width - padLeft - padRight
  const innerH = height - padTop - padBottom

  if (!series || series.length === 0) {
    return (
      <div style={{ border: '1px solid #333', borderRadius: 12, padding: 12, color: '#aaa' }}>
        タイドデータなし
      </div>
    )
  }

  const ptsTime: Pt[] = []
  for (const p of series) {
    const m = toMinutes(p)
    if (m == null) continue
    ptsTime.push({ min: clamp(m, 0, 1440), cm: p.cm, src: p })
  }

  const useIndex = ptsTime.length < 3
  const ptsBase: Pt[] = useIndex
    ? series.map((p, i) => ({ min: i, cm: p.cm, src: p }))
    : ptsTime

  const ptsSorted = [...ptsBase].sort((a, b) => a.min - b.min)

  const ptsUniq: Pt[] = []
  for (const p of ptsSorted) {
    const last = ptsUniq[ptsUniq.length - 1]
    if (last && last.min === p.min) ptsUniq[ptsUniq.length - 1] = p
    else ptsUniq.push(p)
  }

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

  let hi: Pt | null = null
  if (highlightAt) {
    const targetMin = highlightAt.getHours() * 60 + highlightAt.getMinutes()
    let best = Infinity
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

  const ticksX = [0, 6, 12, 18, 24].map((h) => ({
    label: `${h}`,
    x: xToPx(useIndex ? clamp((ptsUniq.length - 1) * (h / 24), 0, ptsUniq.length - 1) : h * 60),
  }))

  return (
    <div style={{ border: '1px solid #333', borderRadius: 12, padding: 12, background: '#111' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ color: '#eee', fontWeight: 700 }}>タイドグラフ</div>
        <div style={{ color: '#aaa', fontSize: 12 }}>{baseDate.toLocaleDateString()}</div>
      </div>

      <svg width="100%" viewBox={`0 0 ${width} ${height}`}>
        {yTicks.map((v) => {
          const y = yToPx(v)
          return (
            <g key={v}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#1f1f1f" />
              <text x={padLeft - 6} y={y + 3} textAnchor="end" fontSize={10} fill="#888">
                {Math.round(v)}
              </text>
            </g>
          )
        })}

        {ticksX.map((t) => (
          <g key={t.label}>
            <line x1={t.x} y1={padTop} x2={t.x} y2={height - padBottom} stroke="#222" />
            <text x={t.x} y={height - 2} textAnchor="middle" fontSize={10} fill="#888">
              {t.label}
            </text>
          </g>
        ))}

        <polyline
          points={polyPoints}
          fill="none"
          stroke="#00e0a8"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {hiX != null && hiY != null && hi && (
          <>
            <line x1={hiX} y1={padTop} x2={hiX} y2={height - padBottom} stroke="#ff4d6d" strokeDasharray="4 4" />
            <circle cx={hiX} cy={hiY} r={6} fill="#ff4d6d" />
          </>
        )}
      </svg>
    </div>
  )
}
