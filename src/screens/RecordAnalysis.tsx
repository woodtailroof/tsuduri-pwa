// src/screens/RecordAnalysis.tsx
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { db, type CatchRecord } from '../db'
import { getTimeBand } from '../lib/timeband'
import { FIXED_PORT } from '../points'
import { getTideAtTime } from '../lib/tide736'
import { getTide736DayCached, type TideCacheSource } from '../lib/tide736Cache'
import { getTidePhaseFromSeries } from '../lib/tidePhase736'
import PageShell from '../components/PageShell'

type Props = {
  back: () => void
}

type AnalysisTideInfo = {
  tideName?: string | null
  phase?: string
  cm?: number
  trend?: string
  dayKey?: string
  source?: TideCacheSource
  isStale?: boolean
}

type AnalysisMetric = 'catchRate' | 'avgSize' | 'effortBias'
type AnalysisGroup =
  | 'tideName'
  | 'phase'
  | 'trend'
  | 'timeBand'
  | 'tideName_timeBand'
  | 'phase_timeBand'
  | 'species'
  | 'species_timeBand'

type TidePoint = { unix?: number; cm: number; time?: string }

function dayKeyFromISO(iso: string) {
  const d = new Date(iso)
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { d, key }
}

function displayPhaseForHeader(phase: string) {
  const hide = new Set(['上げ', '下げ', '上げ始め', '下げ始め', '止まり'])
  return hide.has(phase) ? '' : phase
}

function mean(xs: number[]) {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function stddev(xs: number[]) {
  if (xs.length <= 1) return 0
  const m = mean(xs)
  const v = xs.reduce((a, x) => a + (x - m) * (x - m), 0) / xs.length
  return Math.sqrt(v)
}

function zScore(x: number, m: number, sd: number) {
  if (!Number.isFinite(sd) || sd === 0) return 0
  return (x - m) / sd
}

function wilsonLowerBound(success: number, total: number, z = 1.96) {
  if (total <= 0) return 0
  const phat = success / total
  const z2 = z * z
  const denom = 1 + z2 / total
  const center = phat + z2 / (2 * total)
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total)
  return (center - margin) / denom
}

function formatPercent(x: number) {
  if (!Number.isFinite(x)) return '0%'
  return `${Math.round(x * 1000) / 10}%`
}

function formatDeltaPercent(x: number) {
  if (!Number.isFinite(x)) return '+0.0%'
  const v = Math.round(x * 1000) / 10
  return `${v >= 0 ? '+' : ''}${v}%`
}

export default function RecordAnalysis({ back }: Props) {
  const glassBoxStyle: CSSProperties = { borderRadius: 16, padding: 12, display: 'grid', gap: 10 }

  const [all, setAll] = useState<CatchRecord[]>([])
  const [allLoading, setAllLoading] = useState(false)

  const [archiveYear, setArchiveYear] = useState<string>('')
  const [archiveMonth, setArchiveMonth] = useState<string>('')

  const [analysisMetric, setAnalysisMetric] = useState<AnalysisMetric>('catchRate')
  const [analysisGroup, setAnalysisGroup] = useState<AnalysisGroup>('tideName_timeBand')
  const [analysisMinN, setAnalysisMinN] = useState<1 | 3 | 5 | 10>(3)
  const [analysisIncludeUnknown, setAnalysisIncludeUnknown] = useState(false)

  const [analysisTideMap, setAnalysisTideMap] = useState<Record<number, AnalysisTideInfo>>({})
  const [analysisTideLoading, setAnalysisTideLoading] = useState(false)
  const [analysisTideProgress, setAnalysisTideProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [analysisTideError, setAnalysisTideError] = useState<string>('')

  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true)

  useEffect(() => {
    const onUp = () => setOnline(true)
    const onDown = () => setOnline(false)
    window.addEventListener('online', onUp)
    window.addEventListener('offline', onDown)
    return () => {
      window.removeEventListener('online', onUp)
      window.removeEventListener('offline', onDown)
    }
  }, [])

  async function loadAll() {
    setAllLoading(true)
    try {
      const list = await db.catches.orderBy('createdAt').reverse().toArray()
      setAll(list)
    } finally {
      setAllLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const yearMonthsMap = useMemo(() => {
    const map = new Map<number, Set<number>>()
    for (const r of all) {
      const iso = r.capturedAt ?? r.createdAt
      const d = new Date(iso)
      const t = d.getTime()
      if (!Number.isFinite(t)) continue
      const y = d.getFullYear()
      const m = d.getMonth() + 1
      if (!map.has(y)) map.set(y, new Set<number>())
      map.get(y)!.add(m)
    }
    const out: Record<number, number[]> = {}
    for (const [y, set] of map.entries()) out[y] = Array.from(set).sort((a, b) => a - b)
    return out
  }, [all])

  const years = useMemo(() => {
    const ys = Object.keys(yearMonthsMap)
      .map((x) => Number(x))
      .filter(Number.isFinite)
    return ys.sort((a, b) => b - a)
  }, [yearMonthsMap])

  const monthsForSelectedYear = useMemo(() => {
    if (!archiveYear) return null
    const y = Number(archiveYear)
    if (!Number.isFinite(y)) return null
    return yearMonthsMap[y] ?? []
  }, [archiveYear, yearMonthsMap])

  useEffect(() => {
    if (!archiveYear) return
    const y = Number(archiveYear)
    if (!Number.isFinite(y)) return
    const months = yearMonthsMap[y] ?? []

    if (!archiveMonth) return
    const m = Number(archiveMonth)
    if (!Number.isFinite(m)) {
      setArchiveMonth('')
      return
    }
    if (!months.includes(m)) setArchiveMonth('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiveYear, yearMonthsMap])

  const filteredArchive = useMemo(() => {
    let list = all

    if (archiveYear) {
      const y = Number(archiveYear)
      if (Number.isFinite(y)) {
        list = list.filter((r) => {
          const iso = r.capturedAt ?? r.createdAt
          const d = new Date(iso)
          return d.getFullYear() === y
        })
      }
    }

    if (archiveMonth) {
      const m = Number(archiveMonth)
      if (Number.isFinite(m) && m >= 1 && m <= 12) {
        list = list.filter((r) => {
          const iso = r.capturedAt ?? r.createdAt
          const d = new Date(iso)
          return d.getMonth() + 1 === m
        })
      }
    }

    return list
  }, [all, archiveYear, archiveMonth])

  const analysisTargets = useMemo(() => {
    return filteredArchive.filter((r) => r.id && r.capturedAt) as Array<CatchRecord & { id: number; capturedAt: string }>
  }, [filteredArchive])

  useEffect(() => {
    if (analysisTargets.length === 0) {
      setAnalysisTideMap({})
      setAnalysisTideLoading(false)
      setAnalysisTideProgress({ done: 0, total: 0 })
      setAnalysisTideError('')
      return
    }

    let cancelled = false

    async function run() {
      setAnalysisTideLoading(true)
      setAnalysisTideError('')
      setAnalysisTideProgress({ done: 0, total: 0 })

      try {
        const byDay = new Map<string, Array<CatchRecord & { id: number; capturedAt: string }>>()
        for (const r of analysisTargets) {
          const { key } = dayKeyFromISO(r.capturedAt)
          byDay.set(key, [...(byDay.get(key) ?? []), r])
        }

        const entries = Array.from(byDay.entries())
        setAnalysisTideProgress({ done: 0, total: entries.length })

        const nextMap: Record<number, AnalysisTideInfo> = {}

        for (let i = 0; i < entries.length; i++) {
          if (cancelled) return

          const [key, records] = entries[i]
          const anyDate = new Date(records[0].capturedAt)

          const { series, source, isStale, tideName } = await getTide736DayCached(FIXED_PORT.pc, FIXED_PORT.hc, anyDate, { ttlDays: 30 })

          for (const r of records) {
            const shot = new Date(r.capturedAt)
            const whenMs = shot.getTime()
            const info = getTideAtTime(series as TidePoint[], whenMs)
            const phaseRaw = getTidePhaseFromSeries(series as TidePoint[], shot, shot)
            const phase = phaseRaw ? phaseRaw : '不明'

            nextMap[r.id] = { dayKey: key, tideName: tideName ?? null, phase, cm: info?.cm, trend: info?.trend, source, isStale }
          }

          setAnalysisTideProgress({ done: i + 1, total: entries.length })
        }

        if (!cancelled) setAnalysisTideMap(nextMap)
      } catch (e) {
        console.error(e)
        const msg = e instanceof Error ? e.message : String(e)
        if (!cancelled) setAnalysisTideError(msg)
      } finally {
        if (!cancelled) setAnalysisTideLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [analysisTargets])

  function labelForRecord(r: CatchRecord): string {
    const id = r.id
    const tide = id != null ? analysisTideMap[id] : undefined

    const shotIso = r.capturedAt ?? r.createdAt
    const shot = new Date(shotIso)
    const band = Number.isFinite(shot.getTime()) ? getTimeBand(shot) : '不明'

    const tideName = tide?.tideName ?? '（潮名なし）'
    const phase = tide?.phase ? tide.phase : '（フェーズなし）'
    const phaseShown = phase ? displayPhaseForHeader(phase) || phase : '（フェーズなし）'
    const trend = tide?.trend ?? '（上げ下げなし）'
    const sp = r.species?.trim() ? r.species.trim() : '不明'

    switch (analysisGroup) {
      case 'tideName':
        return tideName
      case 'phase':
        return phaseShown
      case 'trend':
        return trend
      case 'timeBand':
        return band
      case 'tideName_timeBand':
        return `${tideName} × ${band}`
      case 'phase_timeBand':
        return `${phaseShown} × ${band}`
      case 'species':
        return sp
      case 'species_timeBand':
        return `${sp} × ${band}`
      default:
        return '不明'
    }
  }

  const analysisRecords = useMemo(() => {
    let list = analysisTargets as CatchRecord[]
    if (!analysisIncludeUnknown) list = list.filter((r) => r.result === 'caught' || r.result === 'skunk')
    return list
  }, [analysisTargets, analysisIncludeUnknown])

  const baseline = useMemo(() => {
    const rs = analysisRecords
    const total = rs.length
    const caught = rs.filter((r) => r.result === 'caught').length
    const skunk = rs.filter((r) => r.result === 'skunk').length
    const unknown = total - caught - skunk

    const denom = analysisIncludeUnknown ? total : caught + skunk
    const catchRate = denom > 0 ? caught / denom : 0

    const sizeList = rs
      .filter((r) => r.result === 'caught' && typeof r.sizeCm === 'number' && Number.isFinite(r.sizeCm))
      .map((r) => r.sizeCm as number)

    const avgSize = sizeList.length > 0 ? mean(sizeList) : 0
    return { total, caught, skunk, unknown, catchRate, avgSize }
  }, [analysisRecords, analysisIncludeUnknown])

  const analysisTable = useMemo(() => {
    const map = new Map<string, { label: string; total: number; caught: number; skunk: number; unknown: number; sizeList: number[] }>()

    for (const r of analysisRecords) {
      const lab = labelForRecord(r)
      const cur = map.get(lab) ?? { label: lab, total: 0, caught: 0, skunk: 0, unknown: 0, sizeList: [] as number[] }

      cur.total += 1
      if (r.result === 'caught') {
        cur.caught += 1
        if (typeof r.sizeCm === 'number' && Number.isFinite(r.sizeCm)) cur.sizeList.push(r.sizeCm)
      } else if (r.result === 'skunk') {
        cur.skunk += 1
      } else {
        cur.unknown += 1
      }

      map.set(lab, cur)
    }

    const rows = Array.from(map.values())
      .filter((x) => x.total >= analysisMinN)
      .map((x) => {
        const denom = analysisIncludeUnknown ? x.total : x.caught + x.skunk
        const rate = denom > 0 ? x.caught / denom : 0
        const wilson = wilsonLowerBound(x.caught, denom)
        const avgSize = x.sizeList.length > 0 ? mean(x.sizeList) : 0

        return {
          ...x,
          denom,
          catchRate: rate,
          catchRateDelta: (rate - baseline.catchRate) * 100,
          wilsonLower: wilson,
          avgSize,
          avgSizeDelta: avgSize - baseline.avgSize,
        }
      })

    const totals = rows.map((r) => r.total)
    const m = mean(totals)
    const sd = stddev(totals)
    const withZ = rows.map((r) => ({ ...r, z: zScore(r.total, m, sd) }))

    const sorted = [...withZ].sort((a, b) => {
      if (analysisMetric === 'effortBias') return b.z - a.z
      if (analysisMetric === 'avgSize') {
        const aHas = a.sizeList.length > 0
        const bHas = b.sizeList.length > 0
        if (aHas !== bHas) return aHas ? -1 : 1
        if (b.avgSize !== a.avgSize) return b.avgSize - a.avgSize
        return b.total - a.total
      }
      if (b.wilsonLower !== a.wilsonLower) return b.wilsonLower - a.wilsonLower
      if (b.denom !== a.denom) return b.denom - a.denom
      return b.catchRate - a.catchRate
    })

    return sorted
  }, [analysisRecords, analysisMetric, analysisGroup, analysisMinN, analysisIncludeUnknown, baseline.catchRate, baseline.avgSize, analysisTideMap])

  const analysisTop = useMemo(() => analysisTable.slice(0, 10), [analysisTable])
  const analysisBottom = useMemo(() => [...analysisTable].slice(-10).reverse(), [analysisTable])

  return (
    <PageShell
      title={<h1 style={{ margin: 0, fontSize: 'clamp(20px, 6vw, 32px)', lineHeight: 1.15 }}>📈 偏差分析</h1>}
      maxWidth={1100}
      showBack
      onBack={back}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
          🌊 潮汐基準：{FIXED_PORT.name}（pc:{FIXED_PORT.pc} / hc:{FIXED_PORT.hc}）
          {!online && <span style={{ marginLeft: 10, color: '#f6c' }}>📴 オフライン</span>}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => loadAll()} disabled={allLoading}>
            {allLoading ? '読み込み中…' : '↻ 更新'}
          </button>
          <button
            type="button"
            onClick={() => {
              setAnalysisTideMap({})
              setAnalysisTideError('')
            }}
            title="分析用の潮データをリセット（必要なら再取得）"
          >
            リセット
          </button>
        </div>

        {all.length === 0 && !allLoading ? (
          <p>まだ記録がないよ</p>
        ) : (
          <>
            <div className="glass glass-strong" style={{ ...glassBoxStyle }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>🔎 絞り込み</div>

                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)' }}>
                  年：
                  <select value={archiveYear} onChange={(e) => setArchiveYear(e.target.value)} style={{ marginLeft: 8 }}>
                    <option value="">すべて</option>
                    {years.map((y) => (
                      <option key={y} value={String(y)}>
                        {y}年
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)' }}>
                  月：
                  <select
                    value={archiveMonth}
                    onChange={(e) => setArchiveMonth(e.target.value)}
                    style={{ marginLeft: 8 }}
                    disabled={!!archiveYear && (monthsForSelectedYear?.length ?? 0) === 0}
                  >
                    <option value="">すべて</option>
                    {archiveYear && monthsForSelectedYear
                      ? monthsForSelectedYear.map((m) => (
                          <option key={m} value={String(m)}>
                            {m}月
                          </option>
                        ))
                      : Array.from({ length: 12 }).map((_, i) => {
                          const m = i + 1
                          return (
                            <option key={m} value={String(m)}>
                              {m}月
                            </option>
                          )
                        })}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setArchiveYear('')
                    setArchiveMonth('')
                  }}
                  style={{ marginLeft: 'auto' }}
                >
                  リセット
                </button>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)' }}>
                  指標：
                  <select value={analysisMetric} onChange={(e) => setAnalysisMetric(e.target.value as AnalysisMetric)} style={{ marginLeft: 8 }}>
                    <option value="catchRate">釣れた率（Wilsonで安定）</option>
                    <option value="avgSize">平均サイズ（釣れた＆サイズあり）</option>
                    <option value="effortBias">行きがち偏り（Z）</option>
                  </select>
                </label>

                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)' }}>
                  区切り：
                  <select value={analysisGroup} onChange={(e) => setAnalysisGroup(e.target.value as AnalysisGroup)} style={{ marginLeft: 8 }}>
                    <option value="tideName_timeBand">潮名 × 時間帯</option>
                    <option value="phase_timeBand">フェーズ × 時間帯</option>
                    <option value="tideName">潮名（大潮など）</option>
                    <option value="phase">フェーズ</option>
                    <option value="trend">上げ/下げ</option>
                    <option value="timeBand">時間帯</option>
                    <option value="species">魚種</option>
                    <option value="species_timeBand">魚種 × 時間帯</option>
                  </select>
                </label>

                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)' }}>
                  最低件数：
                  <select value={analysisMinN} onChange={(e) => setAnalysisMinN(Number(e.target.value) as 1 | 3 | 5 | 10)} style={{ marginLeft: 8 }}>
                    <option value={1}>1</option>
                    <option value={3}>3</option>
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                  </select>
                </label>

                <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={analysisIncludeUnknown} onChange={(e) => setAnalysisIncludeUnknown(e.target.checked)} />
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)' }}>結果未入力も含める（未入力＝ボウズ扱い）</span>
                </label>
              </div>

              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>
                対象：絞り込み {filteredArchive.length} 件（分析対象（撮影日時あり）：{analysisTargets.length} 件）
              </div>

              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>
                ベースライン：釣れた率 {formatPercent(baseline.catchRate)}（{baseline.caught}/{analysisIncludeUnknown ? baseline.total : baseline.caught + baseline.skunk}） / 平均サイズ{' '}
                {baseline.avgSize ? `${Math.round(baseline.avgSize * 10) / 10}cm` : '—'}
              </div>

              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>✅ 上位は “運じゃなく再現性” 寄りにするため、釣れた率は Wilson 下限で並べてるよ😼</div>
            </div>

            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
              🌊 分析用 tide736：
              {analysisTideLoading ? (
                <> 取得中…（{analysisTideProgress.done}/{analysisTideProgress.total} 日）</>
              ) : analysisTideError ? (
                <span style={{ color: '#ff7a7a' }}> 取得失敗 → {analysisTideError}</span>
              ) : (
                <span style={{ color: '#0a6' }}> OK（{Object.keys(analysisTideMap).length}件に付与）</span>
              )}
              {!online && <span style={{ marginLeft: 10, color: '#f6c' }}>📴 オフライン</span>}
            </div>

            <div style={{ display: 'grid', gap: 16 }}>
              <div className="glass glass-strong" style={{ borderRadius: 16, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>🏆 上位（強い条件）</div>

                {analysisTop.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>※条件の種類が少ないか、最低件数（minN）が高すぎるかも</div>
                ) : (
                  <ol style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6 }}>
                    {analysisTop.map((r) => (
                      <li key={r.label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <span style={{ color: '#ffd166', overflowWrap: 'anywhere' }}>{r.label}</span>
                          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>
                            n={r.total}
                            {analysisMetric === 'catchRate' && <> / 釣れた率 {formatPercent(r.catchRate)}（Δ{formatDeltaPercent(r.catchRateDelta)}）</>}
                            {analysisMetric === 'avgSize' && (
                              <>
                                {' '}
                                / 平均 {r.sizeList.length ? `${Math.round(r.avgSize * 10) / 10}cm` : '—'}（Δ{Math.round(r.avgSizeDelta * 10) / 10}cm）
                              </>
                            )}
                            {analysisMetric === 'effortBias' && <> / Z={r.z.toFixed(2)}</>}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div className="glass glass-strong" style={{ borderRadius: 16, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>🧊 下位（弱い条件）</div>

                {analysisBottom.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>—</div>
                ) : (
                  <ol style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6 }}>
                    {analysisBottom.map((r) => (
                      <li key={r.label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <span style={{ color: 'rgba(255,255,255,0.78)', overflowWrap: 'anywhere' }}>{r.label}</span>
                          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>
                            n={r.total}
                            {analysisMetric === 'catchRate' && <> / 釣れた率 {formatPercent(r.catchRate)}（Δ{formatDeltaPercent(r.catchRateDelta)}）</>}
                            {analysisMetric === 'avgSize' && (
                              <>
                                {' '}
                                / 平均 {r.sizeList.length ? `${Math.round(r.avgSize * 10) / 10}cm` : '—'}（Δ{Math.round(r.avgSizeDelta * 10) / 10}cm）
                              </>
                            )}
                            {analysisMetric === 'effortBias' && <> / Z={r.z.toFixed(2)}</>}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </PageShell>
  )
}
