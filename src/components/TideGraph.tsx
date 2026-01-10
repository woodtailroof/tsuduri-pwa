// src/components/TideGraph.tsx

type TidePoint = { unix?: number; cm: number; time?: string }

type Props = {
  series: TidePoint[]
  baseDate: Date
  highlightAt?: Date | null
  height?: number
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
      <div
        style={{
          border: '1px solid var(--ui-border)',
          borderRadius: 12,
          padding: 12,
          background: 'var(--ui-surface)',
          color: 'var(--ui-text-mute)',
        }}
      >
        タイドデータなし
      </div>
    )
  }

  const pts: Pt[] = []
  for (const p of series) {
    const m = toMinutes(p)
    if (m == null) continue
    pts.push({ min: clamp(m, 0, 1440), cm: p.cm, src: p })
  }
  pts.sort((a, b) => a.min - b.min)

  const cms = pts.map((p) => p.cm)
  const minY0 = Math.min(...cms)
  const maxY0 = Math.max(...cms)

  const yMin = yDomain?.min ?? minY0 - 10
  const yMax = yDomain?.max ?? maxY0 + 10

  const xToPx = (m: number) => padLeft + (m / 1440) * innerW
  const yToPx = (cm: number) => padTop + (1 - (cm - yMin) / (yMax - yMin)) * innerH

  const polyPoints = pts.map((p) => `${xToPx(p.min)},${yToPx(p.cm)}`).join(' ')

  return (
    <div
      style={{
        border: '1px solid var(--ui-border)',
        borderRadius: 12,
        padding: 12,
        background: 'var(--ui-surface)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ color: 'var(--ui-text)', fontWeight: 700 }}>タイドグラフ</div>
        <div style={{ color: 'var(--ui-text-mute)', fontSize: 12 }}>{baseDate.toLocaleDateString()}</div>
      </div>

      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
        <polyline
          points={polyPoints}
          fill="none"
          stroke="#00e0a8"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

      {highlightAt && (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ui-text-mute)' }}>
          📸 撮影時刻付近をマーキング：{highlightAt.toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}
