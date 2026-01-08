// src/lib/tide736.ts

export type TidePoint = { unix?: number; cm: number; time?: string }

/**
 * 1日分の潮位 series を取得
 * 本番は Cloudflare Pages Functions 側で /tide736/get_tide.php をプロキシする前提
 */
export async function fetchTide736Day(pc: string, hc: string, date: Date) {
  const yr = date.getFullYear()
  const mn = date.getMonth() + 1
  const dy = date.getDate()

  // ✅ same-origin の /tide736/get_tide.php を叩く（本番では Functions が受ける）
  const url = new URL('/tide736/get_tide.php', window.location.origin)
  url.searchParams.set('pc', pc)
  url.searchParams.set('hc', hc)
  url.searchParams.set('yr', String(yr))
  url.searchParams.set('mn', String(mn))
  url.searchParams.set('dy', String(dy))
  url.searchParams.set('rg', 'day')

  const res = await fetch(url.toString())
  const ct = res.headers.get('content-type') || ''
  const text = await res.text()

  // 先にHTTPエラーを拾う（HTMLが返ってくる系もここで見える）
  if (!res.ok) {
    throw new Error(`tide736 HTTP ${res.status} (${ct}): ${text.slice(0, 120)}`)
  }

  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`tide736 JSON parse failed (${ct}): ${text.slice(0, 120)}`)
  }

  if (!json?.status) {
    // Functions 側が status:false を返したケースもここで分かる
    const err = typeof json?.error === 'string' ? `: ${json.error}` : ''
    throw new Error(`tide736 status=false${err}`)
  }

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
 * 撮影時刻に一番近い潮位と上げ/下げを返す
 */
export function getTideAtTime(tideSeries: TidePoint[], whenMs: number) {
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
 * 潮名（大潮 / 中潮 / 小潮 / 長潮 / 若潮）を取得
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
  const ct = res.headers.get('content-type') || ''
  const text = await res.text()

  if (!res.ok) return null

  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    // JSONじゃない時は諦める
    return null
  }

  if (!json?.status) return null

  const key = `${yr}-${String(mn).padStart(2, '0')}-${String(dy).padStart(2, '0')}`

  const title = json?.tide?.chart?.[key]?.moon?.title
  if (typeof title === 'string' && title.length > 0) {
    return title
  }

  const fallback = json?.tide?.moon?.title
  if (typeof fallback === 'string' && fallback.length > 0) {
    return fallback
  }

  // content-type 変でも JSON返ってくる場合があるので、ここではログ出さずnull
  void ct
  return null
}
