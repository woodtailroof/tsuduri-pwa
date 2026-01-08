// src/lib/tidePhase736.ts

export type TidePoint = { unix?: number; cm: number; time?: string }

function toMs(p: TidePoint, baseDate: Date): number | null {
  if (typeof p.unix === 'number') {
    return p.unix < 1e12 ? p.unix * 1000 : p.unix
  }
  if (p.time) {
    const [hh, mm] = p.time.split(':').map(Number)
    if (Number.isFinite(hh) && Number.isFinite(mm)) {
      const d = new Date(baseDate)
      d.setHours(hh, mm, 0, 0)
      return d.getTime()
    }
  }
  return null
}

function sign(n: number) {
  return n > 0 ? 1 : n < 0 ? -1 : 0
}

type Extremum = { kind: 'high' | 'low'; t: number; cm: number }

function extractExtrema(series: TidePoint[], baseDate: Date) {
  const xs: { t: number; cm: number }[] = []
  for (const p of series) {
    const t = toMs(p, baseDate)
    if (t == null) continue
    xs.push({ t, cm: p.cm })
  }
  xs.sort((a, b) => a.t - b.t)
  if (xs.length < 3) return { xs, extrema: [] as Extremum[] }

  const extrema: Extremum[] = []
  for (let i = 1; i < xs.length - 1; i++) {
    const a = xs[i - 1]
    const b = xs[i]
    const c = xs[i + 1]
    const s1 = sign(b.cm - a.cm)
    const s2 = sign(c.cm - b.cm)
    if (s1 === 0 || s2 === 0) continue
    if (s1 > 0 && s2 < 0) extrema.push({ kind: 'high', t: b.t, cm: b.cm })
    if (s1 < 0 && s2 > 0) extrema.push({ kind: 'low', t: b.t, cm: b.cm })
  }

  return { xs, extrema }
}

function nearestIdx(xs: { t: number; cm: number }[], whenMs: number) {
  let best = 0
  let bestDist = Number.POSITIVE_INFINITY
  for (let i = 0; i < xs.length; i++) {
    const d = Math.abs(xs[i].t - whenMs)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

/**
 * tide736の系列から「上げ/下げ/満潮前/干潮前/上げ始め/下げ始め」を返す
 * - beforeHighMin: 次の満潮までこの分数以内 → 満潮前
 * - beforeLowMin : 次の干潮までこの分数以内 → 干潮前
 * - afterHighMin : 満潮からこの分数以内 → 下げ始め
 * - afterLowMin  : 干潮からこの分数以内 → 上げ始め
 */
export function getTidePhaseFromSeries(
  series: TidePoint[],
  baseDate: Date,
  when: Date,
  opt?: {
    beforeHighMin?: number
    beforeLowMin?: number
    afterHighMin?: number
    afterLowMin?: number
  }
) {
  const beforeHighMin = opt?.beforeHighMin ?? 90
  const beforeLowMin = opt?.beforeLowMin ?? 90
  const afterHighMin = opt?.afterHighMin ?? 60
  const afterLowMin = opt?.afterLowMin ?? 60

  const whenMs = when.getTime()
  const { xs, extrema } = extractExtrema(series, baseDate)
  if (xs.length < 2) return '不明'

  // 傾き（上げ/下げ）
  const i = nearestIdx(xs, whenMs)
  const prev = xs[Math.max(0, i - 1)]
  const next = xs[Math.min(xs.length - 1, i + 1)]
  const slope = next.cm - prev.cm
  const rising = slope > 0
  const falling = slope < 0

  // 次/前の極値を探す
  const prevHigh = [...extrema].reverse().find((e) => e.kind === 'high' && e.t <= whenMs) ?? null
  const nextHigh = extrema.find((e) => e.kind === 'high' && e.t >= whenMs) ?? null
  const prevLow = [...extrema].reverse().find((e) => e.kind === 'low' && e.t <= whenMs) ?? null
  const nextLow = extrema.find((e) => e.kind === 'low' && e.t >= whenMs) ?? null

  const minsToNextHigh =
    nextHigh ? Math.round((nextHigh.t - whenMs) / 60000) : Number.POSITIVE_INFINITY
  const minsToNextLow =
    nextLow ? Math.round((nextLow.t - whenMs) / 60000) : Number.POSITIVE_INFINITY
  const minsFromPrevHigh =
    prevHigh ? Math.round((whenMs - prevHigh.t) / 60000) : Number.POSITIVE_INFINITY
  const minsFromPrevLow =
    prevLow ? Math.round((whenMs - prevLow.t) / 60000) : Number.POSITIVE_INFINITY

  // ラベル決定
  if (rising) {
    if (minsFromPrevLow <= afterLowMin) return '上げ始め'
    if (minsToNextHigh <= beforeHighMin) return '満潮前'
    return '上げ'
  }
  if (falling) {
    if (minsFromPrevHigh <= afterHighMin) return '下げ始め'
    if (minsToNextLow <= beforeLowMin) return '干潮前'
    return '下げ'
  }

  // ほぼ止まり
  // 近い方の極値名を返す
  const nearHigh = Math.min(minsToNextHigh, minsFromPrevHigh)
  const nearLow = Math.min(minsToNextLow, minsFromPrevLow)
  if (nearHigh < nearLow) return '満潮付近'
  if (nearLow < nearHigh) return '干潮付近'
  return '止まり'
}
