// src/lib/tide736.ts

export type TidePoint = { unix?: number; cm: number; time?: string }

/**
 * 1日分の潮位 series を取得（既存）
 */
export async function fetchTide736Day(pc: string, hc: string, date: Date) {
  const yr = date.getFullYear()
  const mn = date.getMonth() + 1
  const dy = date.getDate()

  const url = new URL('/tide736/get_tide.php', window.location.origin)
  url.searchParams.set('pc', pc)
  url.searchParams.set('hc', hc)
  url.searchParams.set('yr', String(yr))
  url.searchParams.set('mn', String(mn))
  url.searchParams.set('dy', String(dy))
  url.searchParams.set('rg', 'day')

  const res = await fetch(url.toString())
  const text = await res.text()

  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`tide736 JSON parse failed: ${text.slice(0, 120)}`)
  }

  if (!res.ok) throw new Error(`tide736 HTTP ${res.status}`)
  if (!json?.status) throw new Error(`tide736 status=false`)

  // tide 配列の場所が2パターンある
  const direct = json?.tide?.tide
  if (Array.isArray(direct) && direct.length > 0) {
    return direct as TidePoint[]
  }

  const key = `${yr}-${String(mn).padStart(2, '0')}-${String(dy).padStart(2, '0')}`
  const chart = json?.tide?.chart?.[key]?.tide
  if (Array.isArray(chart) && chart.length > 0) {
    return chart as TidePoint[]
  }

  return []
}

/**
 * 撮影時刻に一番近い潮位と上げ/下げを返す（既存）
 */
export function getTideAtTime(
  tideSeries: TidePoint[],
  whenMs: number
) {
  if (tideSeries.length === 0) return null

  const target = new Date(whenMs)

  let bestIdx = 0
  let bestDist = Number.POSITIVE_INFINITY

  for (let i = 0; i < tideSeries.length; i++) {
    const row = tideSeries[i]

    let rowMs: number | null = null

    if (typeof row.unix === 'number') {
      rowMs = row.unix < 1e12 ? row.unix * 1000 : row.unix
    }

    if (rowMs == null && row.time) {
      const [hh, mm] = row.time.split(':').map(Number)
      const d = new Date(target)
      d.setHours(hh, mm, 0, 0)
      rowMs = d.getTime()
    }

    if (rowMs == null) continue

    const dist = Math.abs(rowMs - whenMs)
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }

  const cur = tideSeries[bestIdx]
  const prev = tideSeries[Math.max(0, bestIdx - 1)]
  const next = tideSeries[Math.min(tideSeries.length - 1, bestIdx + 1)]

  const delta = (next?.cm ?? cur.cm) - (prev?.cm ?? cur.cm)
  const trend = delta > 0 ? '上げ' : delta < 0 ? '下げ' : '止まり'

  return { cm: cur.cm, trend }
}

/**
 * ✅ 追加：潮名（大潮 / 中潮 / 小潮 / 長潮 / 若潮）を取得
 *
 * tide736 の CHART 配下：
 *   tide.chart["YYYY-MM-DD"].moon.title
 */
export async function fetchTide736TideName(
  pc: string,
  hc: string,
  date: Date
): Promise<string | null> {
  const yr = date.getFullYear()
  const mn = date.getMonth() + 1
  const dy = date.getDate()

  const url = new URL('/tide736/get_tide.php', window.location.origin)
  url.searchParams.set('pc', pc)
  url.searchParams.set('hc', hc)
  url.searchParams.set('yr', String(yr))
  url.searchParams.set('mn', String(mn))
  url.searchParams.set('dy', String(dy))
  url.searchParams.set('rg', 'day')

  const res = await fetch(url.toString())
  const text = await res.text()

  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }

  if (!res.ok || !json?.status) return null

  const key = `${yr}-${String(mn).padStart(2, '0')}-${String(dy).padStart(2, '0')}`

  // 本命：chart[day].moon.title
  const title = json?.tide?.chart?.[key]?.moon?.title
  if (typeof title === 'string' && title.length > 0) {
    return title
  }

  // 念のため直下パターンも見る（保険）
  const fallback = json?.tide?.moon?.title
  if (typeof fallback === 'string' && fallback.length > 0) {
    return fallback
  }

  return null
}
