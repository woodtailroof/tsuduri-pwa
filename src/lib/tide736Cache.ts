// src/lib/tide736Cache.ts

import { db, type TideCacheEntry, type TidePoint } from '../db'
import { fetchTide736Day, fetchTide736TideName } from './tide736'

export type TideCacheSource = 'cache' | 'fetch' | 'stale-cache'

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

export function dayKey(date: Date) {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  return `${y}-${pad2(m)}-${pad2(d)}`
}

export function makeCacheKey(pc: string, hc: string, date: Date) {
  return `${pc}:${hc}:${dayKey(date)}`
}

function diffDays(fromISO: string, to: Date) {
  const from = new Date(fromISO).getTime()
  const toMs = to.getTime()
  const ms = Math.max(0, toMs - from)
  return ms / (1000 * 60 * 60 * 24)
}

type GetOpts = {
  ttlDays?: number
}

/**
 * ✅ 1日分潮位 + 潮名（大潮など）をキャッシュ経由で取得
 */
export async function getTide736DayCached(
  pc: string,
  hc: string,
  date: Date,
  opts: GetOpts = {}
): Promise<{
  series: TidePoint[]
  tideName: string | null
  source: TideCacheSource
  isStale: boolean
}> {
  const ttlDays = opts.ttlDays ?? 30
  const key = makeCacheKey(pc, hc, date)
  const day = dayKey(date)
  const now = new Date()

  const cached = await db.tideCache.get(key)

  const online = typeof navigator !== 'undefined' ? navigator.onLine : true

  // キャッシュがあって期限内 → それを使う
  if (cached) {
    const age = diffDays(cached.fetchedAt, now)
    const isStale = age > ttlDays

    if (!isStale) {
      return {
        series: cached.series ?? [],
        tideName: cached.tideName ?? null,
        source: 'cache',
        isStale: false,
      }
    }

    // 期限切れだがオフライン → 期限切れキャッシュで返す
    if (!online) {
      return {
        series: cached.series ?? [],
        tideName: cached.tideName ?? null,
        source: 'stale-cache',
        isStale: true,
      }
    }

    // 期限切れ＆オンライン → 再取得して更新
    const fresh = await fetchAndUpsert(pc, hc, date, key, day)
    return {
      series: fresh.series,
      tideName: fresh.tideName,
      source: 'fetch',
      isStale: false,
    }
  }

  // キャッシュなし
  if (!online) {
    return { series: [], tideName: null, source: 'cache', isStale: true }
  }

  const fresh = await fetchAndUpsert(pc, hc, date, key, day)
  return {
    series: fresh.series,
    tideName: fresh.tideName,
    source: 'fetch',
    isStale: false,
  }
}

async function fetchAndUpsert(pc: string, hc: string, date: Date, key: string, day: string) {
  // series と tideName を同日・同条件で取る
  const [series, tideName] = await Promise.all([
    fetchTide736Day(pc, hc, date),
    fetchTide736TideName(pc, hc, date),
  ])

  const entry: TideCacheEntry = {
    key,
    pc,
    hc,
    day,
    series: series ?? [],
    tideName: tideName ?? null,
    fetchedAt: new Date().toISOString(),
  }

  await db.tideCache.put(entry)

  return { series: entry.series, tideName: entry.tideName ?? null }
}

/**
 * ✅ キャッシュを強制更新（キャッシュ無視で再取得して上書き）
 */
export async function forceRefreshTide736Day(pc: string, hc: string, date: Date) {
  const key = makeCacheKey(pc, hc, date)
  const day = dayKey(date)
  await fetchAndUpsert(pc, hc, date, key, day)
}

/**
 * ✅ キャッシュ統計（Settings用）
 */
export async function getTideCacheStats(): Promise<{
  count: number
  approxKB: number
  newestFetchedAt: string | null
  oldestFetchedAt: string | null
}> {
  const all = await db.tideCache.toArray()
  const count = all.length

  if (count === 0) {
    return { count: 0, approxKB: 0, newestFetchedAt: null, oldestFetchedAt: null }
  }

  let newest = all[0].fetchedAt
  let oldest = all[0].fetchedAt
  let approxChars = 0

  for (const e of all) {
    if (e.fetchedAt > newest) newest = e.fetchedAt
    if (e.fetchedAt < oldest) oldest = e.fetchedAt

    // series の JSON 文字数 + tideName の文字数で概算
    try {
      approxChars += JSON.stringify(e.series ?? []).length
    } catch {
      approxChars += 0
    }
    approxChars += (e.tideName ?? '').length
  }

  const approxKB = Math.round(approxChars / 1024)

  return { count, approxKB, newestFetchedAt: newest, oldestFetchedAt: oldest }
}

/**
 * ✅ キャッシュ一覧（Settings用）
 */
export async function listTideCacheEntries(opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 50
  // fetchedAt降順
  const list = await db.tideCache.orderBy('fetchedAt').reverse().limit(limit).toArray()
  return list
}

/**
 * ✅ key指定削除
 */
export async function deleteTideCacheByKey(key: string) {
  await db.tideCache.delete(key)
}

/**
 * ✅ 全削除
 */
export async function deleteTideCacheAll() {
  await db.tideCache.clear()
}

/**
 * ✅ n日より古いキャッシュ削除
 */
export async function deleteTideCacheOlderThan(days: number) {
  const now = new Date()
  const all = await db.tideCache.toArray()
  const targets = all.filter((e) => diffDays(e.fetchedAt, now) > days)
  const keys = targets.map((e) => e.key)
  await db.tideCache.bulkDelete(keys)
  return keys.length
}
