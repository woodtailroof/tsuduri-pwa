// src/lib/stats.ts

import type { CatchRecord } from '../db'
import { getTidePhase, type TidePhase } from './tide'
import { getTimeBand, type TimeBand } from './timeband'

export type TideStats = {
  phase: TidePhase
  count: number
}

export type TimeBandStats = {
  band: TimeBand
  count: number
}

export type ComboStats = {
  phase: TidePhase
  band: TimeBand
  count: number
}

// ✅ 追加：釣果（釣れた/ボウズ/未入力）の集計
export type ResultStats = {
  result: 'caught' | 'skunk' | 'unknown'
  count: number
}

// ✅ 追加：分析向け行（グループ別）
export type GroupCatchStats = {
  label: string
  total: number
  caught: number
  skunk: number
  unknown: number

  // 釣れた率（unknownを含めるかでdenomが変わる）
  denom: number
  catchRate: number
  wilsonLower: number

  // サイズ（釣れた＆sizeあり）
  avgSize: number
  sizeN: number
}

export function countByTide(records: CatchRecord[]): TideStats[] {
  const map = new Map<TidePhase, number>()

  for (const r of records) {
    if (!r.capturedAt) continue
    const phase = getTidePhase(new Date(r.capturedAt))
    map.set(phase, (map.get(phase) ?? 0) + 1)
  }

  return Array.from(map.entries())
    .map(([phase, count]) => ({ phase, count }))
    .sort((a, b) => b.count - a.count)
}

export function countByTimeBand(records: CatchRecord[]): TimeBandStats[] {
  const map = new Map<TimeBand, number>()

  for (const r of records) {
    if (!r.capturedAt) continue
    const band = getTimeBand(new Date(r.capturedAt))
    map.set(band, (map.get(band) ?? 0) + 1)
  }

  return Array.from(map.entries())
    .map(([band, count]) => ({ band, count }))
    .sort((a, b) => b.count - a.count)
}

export function countByTideAndTimeBand(records: CatchRecord[]): ComboStats[] {
  const map = new Map<string, number>()

  for (const r of records) {
    if (!r.capturedAt) continue
    const date = new Date(r.capturedAt)
    const phase = getTidePhase(date)
    const band = getTimeBand(date)
    const key = `${phase}__${band}`
    map.set(key, (map.get(key) ?? 0) + 1)
  }

  return Array.from(map.entries())
    .map(([key, count]) => {
      const [phase, band] = key.split('__')
      return { phase: phase as TidePhase, band: band as TimeBand, count }
    })
    .sort((a, b) => b.count - a.count)
}

/* ============================================================
 * ✅ ここから追加：釣果（caught/skunk）を使った分析用ユーティリティ
 * ============================================================ */

export function countByResult(records: CatchRecord[]): ResultStats[] {
  const map = new Map<ResultStats['result'], number>()
  map.set('caught', 0)
  map.set('skunk', 0)
  map.set('unknown', 0)

  for (const r of records) {
    const v = r.result === 'caught' ? 'caught' : r.result === 'skunk' ? 'skunk' : 'unknown'
    map.set(v, (map.get(v) ?? 0) + 1)
  }

  return Array.from(map.entries())
    .map(([result, count]) => ({ result, count }))
    .sort((a, b) => b.count - a.count)
}

function mean(xs: number[]) {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

// Wilson score interval lower bound（小サンプル過大評価を抑える）
export function wilsonLowerBound(success: number, total: number, z = 1.96) {
  if (total <= 0) return 0
  const phat = success / total
  const z2 = z * z
  const denom = 1 + z2 / total
  const center = phat + z2 / (2 * total)
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total)
  return (center - margin) / denom
}

/**
 * ✅ グループ別に「釣れた率 / Wilson下限 / 平均サイズ」を出す
 * - getLabel: レコード→グループ名
 * - includeUnknownAsSkunk:
 *    true なら unknown も分母に入れる（＝未入力はボウズ扱い）
 *    false なら caught/skunk のみで率を計算
 * - minN: 最低件数フィルタ
 */
export function summarizeByGroup(
  records: CatchRecord[],
  getLabel: (r: CatchRecord) => string,
  opts?: {
    includeUnknownAsSkunk?: boolean
    minN?: number
  }
): GroupCatchStats[] {
  const includeUnknownAsSkunk = opts?.includeUnknownAsSkunk ?? false
  const minN = opts?.minN ?? 1

  const map = new Map<
    string,
    { label: string; total: number; caught: number; skunk: number; unknown: number; sizes: number[] }
  >()

  for (const r of records) {
    const label = getLabel(r)
    const cur =
      map.get(label) ?? { label, total: 0, caught: 0, skunk: 0, unknown: 0, sizes: [] as number[] }

    cur.total += 1

    if (r.result === 'caught') {
      cur.caught += 1
      if (typeof r.sizeCm === 'number' && Number.isFinite(r.sizeCm)) cur.sizes.push(r.sizeCm)
    } else if (r.result === 'skunk') {
      cur.skunk += 1
    } else {
      cur.unknown += 1
    }

    map.set(label, cur)
  }

  const rows: GroupCatchStats[] = Array.from(map.values())
    .filter((x) => x.total >= minN)
    .map((x) => {
      const denom = includeUnknownAsSkunk ? x.total : x.caught + x.skunk
      const catchRate = denom > 0 ? x.caught / denom : 0
      const avgSize = x.sizes.length > 0 ? mean(x.sizes) : 0

      return {
        label: x.label,
        total: x.total,
        caught: x.caught,
        skunk: x.skunk,
        unknown: x.unknown,
        denom,
        catchRate,
        wilsonLower: wilsonLowerBound(x.caught, denom),
        avgSize,
        sizeN: x.sizes.length,
      }
    })

  return rows
}

/**
 * ✅ よく使うラベル関数（オプション）
 * - tide / timeband / combo / species で簡単に切れる
 */
export function labelByTide(r: CatchRecord) {
  if (!r.capturedAt) return '不明'
  return getTidePhase(new Date(r.capturedAt))
}

export function labelByTimeBand(r: CatchRecord) {
  if (!r.capturedAt) return '不明'
  return getTimeBand(new Date(r.capturedAt))
}

export function labelByTideAndTimeBand(r: CatchRecord) {
  if (!r.capturedAt) return '不明'
  const d = new Date(r.capturedAt)
  return `${getTidePhase(d)} × ${getTimeBand(d)}`
}

export function labelBySpecies(r: CatchRecord) {
  const sp = r.species?.trim()
  return sp ? sp : '不明'
}

export function labelBySpeciesAndTimeBand(r: CatchRecord) {
  const sp = labelBySpecies(r)
  const band = r.capturedAt ? getTimeBand(new Date(r.capturedAt)) : '不明'
  return `${sp} × ${band}`
}
