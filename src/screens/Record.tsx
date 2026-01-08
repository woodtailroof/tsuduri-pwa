// src/pages/Record.tsx

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import exifr from 'exifr'
import { db, type CatchRecord, type CatchResult } from '../db'
import { exportCatches, importCatches } from '../lib/catchTransfer'
import { getTimeBand } from '../lib/timeband'
import { countByTide, countByTimeBand, countByTideAndTimeBand } from '../lib/stats'
import { FIXED_PORT } from '../points'
import { getTideAtTime } from '../lib/tide736'
import { getTide736DayCached, type TideCacheSource } from '../lib/tide736Cache'
import { getTidePhaseFromSeries } from '../lib/tidePhase736'
import TideGraph from '../components/TideGraph'
import PageShell from '../components/PageShell'

type Props = {
  back: () => void
}

type TideInfo = { cm: number; trend: string }
type TideState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; map: Record<number, TideInfo> }
  | { status: 'error'; message: string }

type TidePoint = { unix?: number; cm: number; time?: string }

type ViewMode = 'recent' | 'archive' | 'analysis'

type AnalysisTideInfo = {
  tideName?: string | null
  phase?: string // 上げ/下げ/大潮などではなく、潮汐フェーズ（getTidePhaseFromSeries）
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

function dayKeyFromISO(iso: string) {
  const d = new Date(iso)
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { d, key }
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toDateTimeLocalValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function parseDateTimeLocalValue(v: string): Date | null {
  if (!v || !v.includes('T')) return null
  const [ds, ts] = v.split('T')
  if (!ds || !ts) return null
  const [y, m, d] = ds.split('-').map(Number)
  const [hh, mm] = ts.split(':').map(Number)
  if (![y, m, d, hh, mm].every(Number.isFinite)) return null
  if (m < 1 || m > 12) return null
  if (d < 1 || d > 31) return null
  if (hh < 0 || hh > 23) return null
  if (mm < 0 || mm > 59) return null
  return new Date(y, m - 1, d, hh, mm, 0, 0)
}

function displayPhaseForHeader(phase: string) {
  // 「上げ/下げ」は潮位のところにだけ出す（重複防止）
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

// ✅ 小サンプル過大評価を抑える（caught率ランキング用）
// Wilson score interval lower bound
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

function formatResultLine(r: CatchRecord) {
  if (r.result === 'caught') {
    const sp = r.species?.trim() ? r.species!.trim() : '不明'
    const sz = typeof r.sizeCm === 'number' && Number.isFinite(r.sizeCm) ? `${r.sizeCm}cm` : 'サイズ不明'
    return `🎣 釣れた：${sp} / ${sz}`
  }
  if (r.result === 'skunk') return '😇 釣れなかった（ボウズ）'
  return '❔ 結果未入力'
}

export default function Record({ back }: Props) {
  // =========================
  // ✅ 共通：ピルボタン見た目
  // =========================
  const pillBtnStyle: CSSProperties = {
    borderRadius: 999,
    padding: '8px 12px',
    border: '1px solid #333',
    background: '#111',
    color: '#bbb',
    cursor: 'pointer',
    userSelect: 'none',
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    whiteSpace: 'nowrap',
  }

  const pillBtnStyleDisabled: CSSProperties = {
    ...pillBtnStyle,
    opacity: 0.6,
    cursor: 'not-allowed',
  }

  const pillBtnStyleActive: CSSProperties = {
    ...pillBtnStyle,
    border: '2px solid #ff4d6d',
    background: '#1a1115',
    color: '#eee',
  }

  const [viewMode, setViewMode] = useState<ViewMode>('recent')

  const [photo, setPhoto] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const [capturedAt, setCapturedAt] = useState<Date | null>(null)
  const [exifNote, setExifNote] = useState<string>('')

  const [manualMode, setManualMode] = useState(false)
  const [manualValue, setManualValue] = useState('')
  const [allowUnknown, setAllowUnknown] = useState(false)

  // ✅ 釣果入力
  const [result, setResult] = useState<CatchResult>('skunk')
  const [species, setSpecies] = useState('')
  const [sizeCm, setSizeCm] = useState('')

  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)

  // 最近5件（従来どおり）
  const [recent, setRecent] = useState<CatchRecord[]>([])

  // 全件（アーカイブ＆分析用）
  const [all, setAll] = useState<CatchRecord[]>([])
  const [allLoading, setAllLoading] = useState(false)
  const [allLoadedOnce, setAllLoadedOnce] = useState(false)

  // ✅ アーカイブ表示制御
  const [archivePageSize, setArchivePageSize] = useState<10 | 30 | 50>(30)
  const [archiveYear, setArchiveYear] = useState<string>('') // '' = 全年
  const [archiveMonth, setArchiveMonth] = useState<string>('') // '' = 全月（1〜12）

  const [tideState, setTideState] = useState<TideState>({ status: 'idle' })
  const [daySeriesMap, setDaySeriesMap] = useState<Record<string, TidePoint[]>>({})
  const [daySourceMap, setDaySourceMap] = useState<Record<string, TideCacheSource>>({})
  const [dayStaleMap, setDayStaleMap] = useState<Record<string, boolean>>({})
  const [dayTideNameMap, setDayTideNameMap] = useState<Record<string, string | null>>({})

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const sliderRef = useRef<HTMLDivElement | null>(null)

  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true)

  // ===== 偏差分析用の状態 =====
  const [analysisMetric, setAnalysisMetric] = useState<AnalysisMetric>('catchRate')
  const [analysisGroup, setAnalysisGroup] = useState<AnalysisGroup>('tideName_timeBand')
  const [analysisMinN, setAnalysisMinN] = useState<1 | 3 | 5 | 10>(3)
  const [analysisIncludeUnknown, setAnalysisIncludeUnknown] = useState(false) // result未入力を分析対象に含めるか（含める場合はskunk扱い）

  const [analysisTideMap, setAnalysisTideMap] = useState<Record<number, AnalysisTideInfo>>({})
  const [analysisTideLoading, setAnalysisTideLoading] = useState(false)
  const [analysisTideProgress, setAnalysisTideProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [analysisTideError, setAnalysisTideError] = useState<string>('')

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

  async function loadRecent() {
    const list = await db.catches.orderBy('createdAt').reverse().limit(5).toArray()
    setRecent(list)
  }

  async function loadAll() {
    setAllLoading(true)
    try {
      const list = await db.catches.orderBy('createdAt').reverse().toArray()
      setAll(list)
      setAllLoadedOnce(true)
    } finally {
      setAllLoading(false)
    }
  }

  useEffect(() => {
    loadRecent()
  }, [])

  // 必要になった時だけ全件をロード（重さ対策）
  useEffect(() => {
    if ((viewMode === 'archive' || viewMode === 'analysis') && !allLoadedOnce && !allLoading) {
      loadAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode])

  useEffect(() => {
    if (recent.length === 0) {
      setSelectedId(null)
      return
    }
    const exists = selectedId != null && recent.some((r) => r.id === selectedId)
    if (!exists) setSelectedId(recent[0].id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recent])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function resetPhotoStates() {
    setPhoto(null)
    setPreviewUrl(null)
    setCapturedAt(null)
    setExifNote('')
    setManualMode(false)
    setManualValue('')
    setAllowUnknown(false)
  }

  function resetResultStates() {
    setResult('skunk')
    setSpecies('')
    setSizeCm('')
  }

  const sizeCmNumber = useMemo(() => {
    const v = Number(sizeCm)
    if (!Number.isFinite(v)) return null
    if (v <= 0) return null
    return Math.round(v * 10) / 10
  }, [sizeCm])

  async function onSave() {
    setSaving(true)
    try {
      const record: CatchRecord = {
        createdAt: new Date().toISOString(),
        capturedAt: capturedAt ? capturedAt.toISOString() : undefined,
        pointId: FIXED_PORT.id,

        memo,

        photoName: photo?.name,
        photoType: photo?.type,
        photoBlob: photo ?? undefined,

        // ✅ 結果
        result,
        species: result === 'caught' ? (species.trim() || '不明') : undefined,
        sizeCm: result === 'caught' ? (sizeCmNumber ?? undefined) : undefined,
      }

      await db.catches.add(record)

      resetPhotoStates()
      resetResultStates()
      setMemo('')

      await loadRecent()
      if (allLoadedOnce) await loadAll()

      alert('記録したよ！')
    } catch (e) {
      console.error(e)
      alert('保存に失敗したよ…')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(id?: number) {
    if (!id) return
    const ok = confirm('この記録を削除する？（戻せないよ）')
    if (!ok) return
    await db.catches.delete(id)
    await loadRecent()
    if (allLoadedOnce) await loadAll()
  }

  // ✅ tide736取得（最近5件、同一日まとめ）+ 潮名もキャッシュ経由（最近5件だけ）
  useEffect(() => {
    let cancelled = false

    async function run() {
      const targets = recent.filter((r) => r.id && r.capturedAt)
      if (targets.length === 0) {
        setTideState({ status: 'idle' })
        setDaySeriesMap({})
        setDaySourceMap({})
        setDayStaleMap({})
        setDayTideNameMap({})
        return
      }

      setTideState({ status: 'loading' })

      const byDay = new Map<string, CatchRecord[]>()
      for (const r of targets) {
        const { key } = dayKeyFromISO(r.capturedAt!)
        byDay.set(key, [...(byDay.get(key) ?? []), r])
      }

      const nextMap: Record<number, TideInfo> = {}
      const nextSeriesMap: Record<string, TidePoint[]> = {}
      const nextSourceMap: Record<string, TideCacheSource> = {}
      const nextStaleMap: Record<string, boolean> = {}
      const nextTideNameMap: Record<string, string | null> = {}

      try {
        for (const [key, records] of byDay.entries()) {
          const anyDate = new Date(records[0].capturedAt!)

          const { series, source, isStale, tideName } = await getTide736DayCached(FIXED_PORT.pc, FIXED_PORT.hc, anyDate, { ttlDays: 30 })

          nextSeriesMap[key] = series
          nextSourceMap[key] = source
          nextStaleMap[key] = isStale
          nextTideNameMap[key] = tideName ?? null

          for (const r of records) {
            const whenMs = new Date(r.capturedAt!).getTime()
            const info = getTideAtTime(series, whenMs)
            if (info && r.id) nextMap[r.id] = { cm: info.cm, trend: info.trend }
          }
        }

        if (!cancelled) {
          setDaySeriesMap(nextSeriesMap)
          setDaySourceMap(nextSourceMap)
          setDayStaleMap(nextStaleMap)
          setDayTideNameMap(nextTideNameMap)
          setTideState({ status: 'ok', map: nextMap })
        }
      } catch (e) {
        console.error(e)
        const msg = e instanceof Error ? e.message : String(e)
        if (!cancelled) {
          setDaySeriesMap({})
          setDaySourceMap({})
          setDayStaleMap({})
          setDayTideNameMap({})
          setTideState({ status: 'error', message: msg })
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [recent])

  const selected = useMemo(() => {
    if (selectedId == null) return null
    return recent.find((r) => r.id === selectedId) ?? null
  }, [recent, selectedId])

  const selectedShot = selected?.capturedAt ? dayKeyFromISO(selected.capturedAt).d : null
  const selectedDayKey = selected?.capturedAt ? dayKeyFromISO(selected.capturedAt).key : null
  const selectedSeries = selectedDayKey ? daySeriesMap[selectedDayKey] ?? [] : []
  const selectedTideName = selectedDayKey ? dayTideNameMap[selectedDayKey] ?? null : null

  const selectedSource = selectedDayKey ? daySourceMap[selectedDayKey] ?? null : null
  const selectedIsStale = selectedDayKey ? dayStaleMap[selectedDayKey] ?? false : false

  const selectedTide = tideState.status === 'ok' && selected?.id ? tideState.map[selected.id] : undefined

  const selectedPhaseRaw =
    selectedShot && selectedSeries.length > 0
      ? getTidePhaseFromSeries(selectedSeries, selectedShot, selectedShot)
      : selectedShot
        ? '不明'
        : ''
  const selectedPhase = displayPhaseForHeader(selectedPhaseRaw)

  // 最近5件の統計（従来どおり）
  const tideStats = countByTide(recent)
  const timeStats = countByTimeBand(recent)
  const comboStats = countByTideAndTimeBand(recent)

  const bestTide = tideStats[0]
  const bestTime = timeStats[0]
  const bestCombo = comboStats[0]

  function sourceLabel(source: TideCacheSource | null, isStale: boolean) {
    if (!source) return null
    if (source === 'fetch') return { text: '取得', color: '#0a6' }
    if (source === 'cache') return { text: 'キャッシュ', color: '#6cf' }
    return { text: isStale ? '期限切れキャッシュ' : 'キャッシュ', color: '#f6c' }
  }

  const resultOk = result === 'skunk' || (result === 'caught' && (sizeCm.trim() === '' || sizeCmNumber != null))
  const canSave = !saving && !(photo && manualMode && !manualValue && !allowUnknown) && resultOk

  // ✅ recent 以外の時は登録フォームを隠す
  const showRegisterForm = viewMode === 'recent'

  // ✅ アーカイブ：年 → 月の対応表を作る（年を選んだら、その年に存在する月だけ出す）
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
    for (const [y, set] of map.entries()) {
      out[y] = Array.from(set).sort((a, b) => a - b)
    }
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

  // ✅ 年を変えた時、選択中の月がその年に存在しなければ月をリセット（事故防止）
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

  // ✅ アーカイブ：年/月フィルタ
  const filteredArchive = useMemo(() => {
    let list = all

    // capturedAt 優先（無い時は createdAt）
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

  const archiveList = useMemo(() => filteredArchive.slice(0, archivePageSize), [filteredArchive, archivePageSize])

  // ============================================================
  // ✅ 偏差分析：全データに tide736 を付与（キャッシュ優先）
  // ============================================================
  const analysisTargets = useMemo(() => {
    return filteredArchive.filter((r) => r.id && r.capturedAt) as Array<CatchRecord & { id: number; capturedAt: string }>
  }, [filteredArchive])

  useEffect(() => {
    if (viewMode !== 'analysis') return
    if (!allLoadedOnce) return
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
            const info = getTideAtTime(series, whenMs)
            const phaseRaw = getTidePhaseFromSeries(series, shot, shot)
            const phase = phaseRaw ? phaseRaw : '不明'

            nextMap[r.id] = {
              dayKey: key,
              tideName: tideName ?? null,
              phase,
              cm: info?.cm,
              trend: info?.trend,
              source,
              isStale,
            }
          }

          setAnalysisTideProgress({ done: i + 1, total: entries.length })
        }

        if (!cancelled) {
          setAnalysisTideMap(nextMap)
        }
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
  }, [viewMode, allLoadedOnce, analysisTargets])

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
    if (!analysisIncludeUnknown) {
      list = list.filter((r) => r.result === 'caught' || r.result === 'skunk')
    }
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
  const analysisBottom = useMemo(() => {
    if (analysisMetric === 'effortBias') return [...analysisTable].slice(-10).reverse()
    if (analysisMetric === 'avgSize') return [...analysisTable].slice(-10).reverse()
    return [...analysisTable].slice(-10).reverse()
  }, [analysisTable, analysisMetric])

  return (
    <PageShell title={<h1 style={{ margin: 0 }}>📸 釣果を記録</h1>} maxWidth={1100}>
      {/* 全体を縦flexにして「モードで高さが暴れない」土台にする */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#666' }}>
          🌊 潮汐基準：{FIXED_PORT.name}（pc:{FIXED_PORT.pc} / hc:{FIXED_PORT.hc}）
          {!online && <span style={{ marginLeft: 10, color: '#f6c' }}>📴 オフライン</span>}
        </div>

        {tideState.status === 'loading' && <div style={{ fontSize: 12, color: '#0a6' }}>🌊 tide736：取得中…</div>}
        {tideState.status === 'error' && <div style={{ fontSize: 12, color: '#b00' }}>🌊 tide736：取得失敗 → {tideState.message}</div>}

        {/* モード切替 */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => setViewMode('recent')} style={viewMode === 'recent' ? pillBtnStyleActive : pillBtnStyle}>
            🗂 最近5件
          </button>

          <button type="button" onClick={() => setViewMode('archive')} style={viewMode === 'archive' ? pillBtnStyleActive : pillBtnStyle}>
            📚 全履歴
          </button>

          <button type="button" onClick={() => setViewMode('analysis')} style={viewMode === 'analysis' ? pillBtnStyleActive : pillBtnStyle}>
            📈 偏差分析
          </button>

          {(viewMode === 'archive' || viewMode === 'analysis') && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' }}>
              <button
                type="button"
                onClick={() => loadAll()}
                disabled={allLoading}
                style={allLoading ? pillBtnStyleDisabled : pillBtnStyle}
                title="全履歴を再読み込み"
              >
                {allLoading ? '読み込み中…' : '↻ 全履歴更新'}
              </button>

              <button type="button" onClick={exportCatches} style={pillBtnStyle} title="釣果（写真含む）をZIPで保存">
                📤 釣果をエクスポート
              </button>

              <label style={pillBtnStyle} title="ZIPから釣果（写真含む）を復元（端末内データは置き換え）">
                📥 釣果をインポート
                <input
                  type="file"
                  accept=".zip"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return

                    const ok = confirm('既存の釣果はすべて削除され、ZIPの内容で置き換えられるよ。続ける？')
                    if (!ok) {
                      e.currentTarget.value = ''
                      return
                    }

                    try {
                      await importCatches(file)
                      alert('インポート完了！')
                      location.reload()
                    } catch (err) {
                      console.error(err)
                      alert('インポート失敗…（ZIPが壊れてる or 形式違いかも）')
                    } finally {
                      e.currentTarget.value = ''
                    }
                  }}
                />
              </label>
            </div>
          )}
        </div>

        {/* ✅ recent のときだけ登録フォームを表示 */}
        {showRegisterForm && (
          <>
            <hr style={{ margin: '6px 0', opacity: 0.3 }} />

            {/* 写真選択 */}
            <div>
              <label>
                写真を選ぶ<br />
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    if (!e.target.files || !e.target.files[0]) return
                    const file = e.target.files[0]
                    setPhoto(file)
                    setPreviewUrl(URL.createObjectURL(file))

                    setCapturedAt(null)
                    setExifNote('')
                    setManualMode(false)
                    setManualValue('')
                    setAllowUnknown(false)

                    try {
                      const dt = await exifr.parse(file, { pick: ['DateTimeOriginal', 'CreateDate'] })
                      const date = (dt as any)?.DateTimeOriginal ?? (dt as any)?.CreateDate ?? null

                      if (date instanceof Date) {
                        setCapturedAt(date)
                        setExifNote('')
                        setManualMode(false)
                        setManualValue(toDateTimeLocalValue(date))
                      } else {
                        setCapturedAt(null)
                        setExifNote('撮影日時が見つからなかったよ（手動入力できます）')
                        setManualMode(true)
                        setManualValue('')
                      }
                    } catch {
                      setCapturedAt(null)
                      setExifNote('EXIFの読み取りに失敗したよ（手動入力できます）')
                      setManualMode(true)
                      setManualValue('')
                    }
                  }}
                />
              </label>
            </div>

            {photo && <p style={{ margin: 0 }}>選択中：{photo.name}</p>}

            <div style={{ fontSize: 12, color: '#555' }}>
              {capturedAt ? <>📅 撮影日時：{capturedAt.toLocaleString()}</> : <>📅 撮影日時：（不明）</>}
              {exifNote && <div style={{ marginTop: 4, color: '#b00' }}>{exifNote}</div>}
            </div>

            {/* 手動日時入力 UI */}
            {photo && (
              <div
                style={{
                  border: '1px solid #333',
                  borderRadius: 12,
                  padding: 12,
                  background: '#0f0f0f',
                  color: '#ddd',
                  display: 'grid',
                  gap: 10,
                  maxWidth: 520,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={manualMode}
                      onChange={(e) => {
                        const on = e.target.checked
                        setManualMode(on)
                        if (on) {
                          if (capturedAt) setManualValue(toDateTimeLocalValue(capturedAt))
                        } else {
                          if (!capturedAt) setManualValue('')
                          setAllowUnknown(false)
                        }
                      }}
                    />
                    <span style={{ fontSize: 12, color: '#bbb' }}>撮影日時を手動で補正する</span>
                  </label>

                  {!manualMode && !capturedAt && <div style={{ fontSize: 12, color: '#f6c' }}>※EXIFが無いので、ONにして入力するとタイドに紐づくよ</div>}
                </div>

                {manualMode && (
                  <>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <label style={{ fontSize: 12, color: '#bbb' }}>
                        手動撮影日時（ローカル）：
                        <input
                          type="datetime-local"
                          value={manualValue}
                          onChange={(e) => {
                            const v = e.target.value
                            setManualValue(v)
                            const d = parseDateTimeLocalValue(v)
                            setCapturedAt(d)
                            if (d) setAllowUnknown(false)
                          }}
                          style={{ marginLeft: 8 }}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => {
                          const now = new Date()
                          const v = toDateTimeLocalValue(now)
                          setManualValue(v)
                          setCapturedAt(now)
                          setAllowUnknown(false)
                        }}
                      >
                        今にする
                      </button>
                    </div>

                    {!manualValue && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input type="checkbox" checked={allowUnknown} onChange={(e) => setAllowUnknown(e.target.checked)} />
                        <span style={{ fontSize: 12, color: '#bbb' }}>不明のまま保存する（タイド紐づけ無し）</span>
                      </label>
                    )}

                    {!manualValue && !allowUnknown && <div style={{ fontSize: 12, color: '#f6c' }}>※日時を入れるか、「不明のまま保存」をONにしてね</div>}
                  </>
                )}
              </div>
            )}

            {/* プレビュー */}
            {previewUrl && (
              <div style={{ border: '1px solid #333', borderRadius: 12, padding: 10, background: '#0f0f0f', maxWidth: 680 }}>
                <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>プレビュー</div>
                <div
                  style={{
                    width: '100%',
                    maxHeight: 420,
                    overflow: 'hidden',
                    borderRadius: 10,
                    background: '#111',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <img src={previewUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: '#777' }}>※保存される写真はオリジナルのまま（表示だけ縮小）</div>
              </div>
            )}

            {/* 釣果 */}
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>🎣 釣果</div>

              <div
                style={{
                  border: '1px solid #333',
                  borderRadius: 12,
                  padding: 12,
                  background: '#0f0f0f',
                  color: '#ddd',
                  maxWidth: 620,
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                    <input type="radio" name="result" checked={result === 'caught'} onChange={() => setResult('caught')} />
                    <span>釣れた</span>
                  </label>

                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                    <input type="radio" name="result" checked={result === 'skunk'} onChange={() => setResult('skunk')} />
                    <span>釣れなかった（ボウズ）</span>
                  </label>
                </div>

                {result === 'caught' && (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <label style={{ fontSize: 12, color: '#bbb' }}>
                        魚種：
                        <input value={species} onChange={(e) => setSpecies(e.target.value)} placeholder="例：シーバス" style={{ marginLeft: 8, width: 220 }} />
                      </label>

                      <label style={{ fontSize: 12, color: '#bbb' }}>
                        大きさ（cm）：
                        <input
                          value={sizeCm}
                          onChange={(e) => setSizeCm(e.target.value)}
                          placeholder="例：52"
                          inputMode="decimal"
                          style={{ marginLeft: 8, width: 120 }}
                        />
                      </label>
                    </div>

                    {sizeCm.trim() !== '' && sizeCmNumber == null && <div style={{ fontSize: 12, color: '#f6c' }}>※サイズは数字で入れてね（例：52 / 12.5）</div>}

                    <div style={{ fontSize: 12, color: '#888' }}>※魚種が空なら「不明」として保存するよ（後で分析に使えるからね）</div>
                  </div>
                )}
              </div>
            </div>

            {/* メモ */}
            <div>
              <label>
                ひとことメモ<br />
                <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} style={{ width: '100%', overflowWrap: 'anywhere' }} placeholder="渋かった…でも一匹！とか" />
              </label>
            </div>

            {/* 保存 */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={onSave} disabled={!canSave}>
                {saving ? '保存中...' : '💾 記録する'}
              </button>
              <button onClick={back}>← 戻る</button>
            </div>

            <hr style={{ margin: '6px 0', opacity: 0.3 }} />
          </>
        )}

        {/* ===== 最近5件モード ===== */}
        {viewMode === 'recent' && (
          <>
            <h2 style={{ margin: 0 }}>🗂 最近の釣果（スワイプで選択）</h2>

            {recent.length === 0 ? (
              <p>まだ記録がないよ</p>
            ) : (
              <>
                <div
                  ref={sliderRef}
                  style={{
                    display: 'flex',
                    gap: 12,
                    overflowX: 'auto',
                    overflowY: 'hidden',
                    paddingBottom: 8,
                    scrollSnapType: 'x mandatory',
                    WebkitOverflowScrolling: 'touch',
                    minWidth: 0,
                  }}
                >
                  {recent.map((r) => {
                    const isSel = r.id != null && r.id === selectedId
                    const thumbUrl = r.photoBlob ? URL.createObjectURL(r.photoBlob) : null
                    const shotDate = r.capturedAt ? new Date(r.capturedAt) : null
                    const tide = tideState.status === 'ok' && r.id ? tideState.map[r.id] : undefined

                    const dk = r.capturedAt ? dayKeyFromISO(r.capturedAt).key : null
                    const series = dk ? daySeriesMap[dk] ?? [] : []
                    const tideName = dk ? dayTideNameMap[dk] ?? null : null

                    const phaseRaw = shotDate && series.length > 0 ? getTidePhaseFromSeries(series, shotDate, shotDate) : ''
                    const phase = displayPhaseForHeader(phaseRaw)

                    return (
                      <button
                        key={r.id}
                        onClick={() => setSelectedId(r.id ?? null)}
                        style={{
                          scrollSnapAlign: 'start',
                          minWidth: 280,
                          maxWidth: 340,
                          textAlign: 'left',
                          borderRadius: 14,
                          border: isSel ? '2px solid #ff4d6d' : '1px solid #333',
                          background: isSel ? '#1a1115' : '#111',
                          color: '#eee',
                          padding: 12,
                          display: 'grid',
                          gridTemplateColumns: '72px 1fr',
                          gap: 12,
                          alignItems: 'center',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                        aria-pressed={isSel}
                        title="この釣果を選択"
                      >
                        <div
                          style={{
                            width: 72,
                            height: 72,
                            borderRadius: 12,
                            overflow: 'hidden',
                            background: '#222',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {thumbUrl ? (
                            <img
                              src={thumbUrl}
                              alt="thumb"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onLoad={() => URL.revokeObjectURL(thumbUrl)}
                            />
                          ) : (
                            <span style={{ fontSize: 12, color: '#999' }}>No Photo</span>
                          )}
                        </div>

                        <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: '#bbb' }}>記録：{new Date(r.createdAt).toLocaleString()}</div>

                          {shotDate && <div style={{ fontSize: 12, color: '#aaa' }}>📸 {shotDate.toLocaleString()}</div>}

                          {shotDate && (
                            <div style={{ fontSize: 12, color: '#6cf' }}>
                              🕒 {getTimeBand(shotDate)}
                              {tideName ? ` / 🌙 ${tideName}` : ''}
                              {phase ? ` / 🌊 ${phase}` : ''}
                            </div>
                          )}

                          <div style={{ fontSize: 12, color: '#ffd166' }}>{formatResultLine(r)}</div>

                          <div style={{ fontSize: 12, color: '#7ef' }}>
                            🌊 焼津潮位：
                            {tideState.status === 'loading'
                              ? '取得中…'
                              : tideState.status === 'error'
                                ? '失敗'
                                : tide
                                  ? `${tide.cm}cm / ${tide.trend}`
                                  : '（なし）'}
                          </div>

                          <div style={{ color: '#eee', overflowWrap: 'anywhere' }}>{r.memo || '（メモなし）'}</div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <span
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                onDelete(r.id)
                              }}
                              style={{
                                fontSize: 12,
                                color: '#ff7a7a',
                                border: '1px solid #552',
                                padding: '4px 8px',
                                borderRadius: 999,
                                userSelect: 'none',
                              }}
                              title="削除"
                            >
                              🗑 削除
                            </span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                <div style={{ fontSize: 12, color: '#777' }}>👆 横にスワイプして釣果を選ぶ（赤枠が選択中）</div>
              </>
            )}

            <hr style={{ margin: '6px 0', opacity: 0.3 }} />

            <h2 style={{ margin: 0 }}>📈 タイドグラフ（選択中の釣果）</h2>

            {!selected ? (
              <p>釣果を選択してね</p>
            ) : !selectedShot ? (
              <p>この釣果は撮影日時が無いから、タイドを紐づけられないよ</p>
            ) : (
              <>
                <div style={{ border: '1px solid #333', borderRadius: 12, padding: 12, background: '#0f0f0f', color: '#ddd' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 12, color: '#aaa' }}>📸 {selectedShot.toLocaleString()}</div>

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      {!online && (
                        <div style={{ fontSize: 11, color: '#f6c', whiteSpace: 'nowrap' }} title="オフライン">
                          📴 オフライン
                        </div>
                      )}

                      {tideState.status === 'ok' && selectedSource &&
                        (() => {
                          const lab = sourceLabel(selectedSource, selectedIsStale)
                          if (!lab) return null
                          return (
                            <div style={{ fontSize: 11, color: lab.color, whiteSpace: 'nowrap' }} title="tide736取得元">
                              🌊 {lab.text}
                            </div>
                          )
                        })()}
                    </div>
                  </div>

                  <div style={{ marginTop: 6, fontSize: 12, color: '#6cf' }}>
                    🕒 {getTimeBand(selectedShot)}
                    {selectedTideName ? ` / 🌙 ${selectedTideName}` : ''}
                    {selectedPhase ? ` / 🌊 ${selectedPhase}` : ''}
                  </div>

                  <div style={{ marginTop: 6, fontSize: 12, color: '#ffd166' }}>{formatResultLine(selected)}</div>

                  <div style={{ marginTop: 6, fontSize: 12, color: '#7ef' }}>
                    🌊 焼津潮位：
                    {tideState.status === 'loading'
                      ? '取得中…'
                      : tideState.status === 'error'
                        ? '取得失敗（上に理由）'
                        : selectedTide
                          ? `${selectedTide.cm}cm / ${selectedTide.trend}`
                          : '（データなし）'}
                  </div>

                  <div style={{ marginTop: 8, overflowWrap: 'anywhere' }}>{selected.memo || '（メモなし）'}</div>

                  {!online && selectedSource === 'stale-cache' && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#f6c' }}>
                      ⚠ オフラインのため、期限切れキャッシュで表示中（オンライン復帰後に再取得できます）
                    </div>
                  )}

                  {!selectedTideName && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
                      ※潮名（大潮など）が未取得のキャッシュです（オンライン時に自動取得して保存されます）
                    </div>
                  )}
                </div>

                {selectedSeries.length === 0 ? (
                  <p>
                    {!online
                      ? '📴 オフラインで、この日のキャッシュが無いよ（オンライン復帰後に取得できる）'
                      : 'タイドデータを準備中だよ（取得中 or データなし）'}
                  </p>
                ) : (
                  <TideGraph series={selectedSeries} baseDate={selectedShot} highlightAt={selectedShot} yDomain={{ min: -50, max: 200 }} />
                )}
              </>
            )}

            <hr style={{ margin: '6px 0', opacity: 0.3 }} />

            <h2 style={{ margin: 0 }}>📊 最近5件の傾向</h2>

            {recent.length === 0 ? (
              <p>データがまだ足りないよ</p>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>🌊 潮別</div>
                  <ul style={{ paddingLeft: 16, margin: 0 }}>
                    {tideStats.slice(0, 3).map((s) => (
                      <li key={s.phase}>
                        🌊 {s.phase}：{s.count} 回
                      </li>
                    ))}
                  </ul>
                  {bestTide && (
                    <div style={{ marginTop: 6, color: '#c36' }}>
                      💬 つづり：「最近は <strong>{bestTide.phase}</strong> が一番いい感じ。次もそこ意識しよ？♡」
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>🕒 時間帯</div>
                  <ul style={{ paddingLeft: 16, margin: 0 }}>
                    {timeStats.slice(0, 3).map((s) => (
                      <li key={s.band}>
                        🕒 {s.band}：{s.count} 回
                      </li>
                    ))}
                  </ul>
                  {bestTime && (
                    <div style={{ marginTop: 6, color: '#c36' }}>
                      💬 つづり：「時間帯だと <strong>{bestTime.band}</strong> がいい感じかも…♡」
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>🔥 最強コンボ</div>
                  <ul style={{ paddingLeft: 16, margin: 0 }}>
                    {comboStats.slice(0, 3).map((s) => (
                      <li key={`${s.phase}_${s.band}`}>
                        🔥 {s.phase} × {s.band}：{s.count} 回
                      </li>
                    ))}
                  </ul>
                  {bestCombo && (
                    <div style={{ marginTop: 6, color: '#c36' }}>
                      💬 つづり：「最近の当たりは <strong>{bestCombo.phase} × {bestCombo.band}</strong>！ 次それ狙お？♡」
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== 全履歴モード ===== */}
        {viewMode === 'archive' && (
          <>
            <h2 style={{ margin: 0 }}>📚 全履歴（年→月対応 & 件数切替）</h2>

            {allLoading && !allLoadedOnce ? (
              <p>読み込み中…</p>
            ) : all.length === 0 ? (
              <p>まだ記録がないよ</p>
            ) : (
              <>
                <div style={{ border: '1px solid #333', borderRadius: 12, padding: 12, background: '#0f0f0f', color: '#ddd', display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: '#aaa' }}>🔎 絞り込み</div>

                    <label style={{ fontSize: 12, color: '#bbb' }}>
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

                    <label style={{ fontSize: 12, color: '#bbb' }}>
                      月：
                      <select
                        value={archiveMonth}
                        onChange={(e) => setArchiveMonth(e.target.value)}
                        style={{ marginLeft: 8 }}
                        disabled={!!archiveYear && (monthsForSelectedYear?.length ?? 0) === 0}
                        title={archiveYear ? '選択中の年に存在する月だけ出すよ' : '年を選ばなくても月で絞れるよ'}
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
                      title="絞り込みを解除"
                    >
                      リセット
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: '#aaa' }}>📦 表示件数</div>

                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                      <input type="radio" name="archivePageSize" checked={archivePageSize === 10} onChange={() => setArchivePageSize(10)} />
                      <span style={{ fontSize: 12, color: '#bbb' }}>10件</span>
                    </label>

                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                      <input type="radio" name="archivePageSize" checked={archivePageSize === 30} onChange={() => setArchivePageSize(30)} />
                      <span style={{ fontSize: 12, color: '#bbb' }}>30件</span>
                    </label>

                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                      <input type="radio" name="archivePageSize" checked={archivePageSize === 50} onChange={() => setArchivePageSize(50)} />
                      <span style={{ fontSize: 12, color: '#bbb' }}>50件</span>
                    </label>
                  </div>

                  <div style={{ fontSize: 12, color: '#777' }}>
                    全 {all.length} 件 → 絞り込み {filteredArchive.length} 件（表示 {Math.min(archivePageSize, filteredArchive.length)} 件）
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  {archiveList.map((r) => {
                    const shotDate = r.capturedAt ? new Date(r.capturedAt) : null
                    const created = new Date(r.createdAt)
                    const thumbUrl = r.photoBlob ? URL.createObjectURL(r.photoBlob) : null

                    return (
                      <div
                        key={r.id}
                        style={{
                          border: '1px solid #333',
                          borderRadius: 12,
                          padding: 12,
                          background: '#0f0f0f',
                          color: '#ddd',
                          display: 'grid',
                          gridTemplateColumns: '72px 1fr',
                          gap: 12,
                          alignItems: 'center',
                        }}
                      >
                        <div
                          style={{
                            width: 72,
                            height: 72,
                            borderRadius: 12,
                            overflow: 'hidden',
                            background: '#222',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {thumbUrl ? (
                            <img
                              src={thumbUrl}
                              alt="thumb"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onLoad={() => URL.revokeObjectURL(thumbUrl)}
                            />
                          ) : (
                            <span style={{ fontSize: 12, color: '#999' }}>No Photo</span>
                          )}
                        </div>

                        <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: '#bbb' }}>記録：{created.toLocaleString()}</div>

                          <div style={{ fontSize: 12, color: '#6cf' }}>
                            📸 {shotDate ? shotDate.toLocaleString() : '（撮影日時なし）'}
                            {shotDate ? ` / 🕒 ${getTimeBand(shotDate)}` : ''}
                          </div>

                          <div style={{ fontSize: 12, color: '#ffd166' }}>{formatResultLine(r)}</div>

                          <div style={{ color: '#eee', overflowWrap: 'anywhere' }}>{r.memo || '（メモなし）'}</div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button
                              type="button"
                              onClick={() => onDelete(r.id)}
                              style={{
                                fontSize: 12,
                                color: '#ff7a7a',
                                border: '1px solid #552',
                                padding: '6px 10px',
                                borderRadius: 999,
                                background: '#111',
                                cursor: 'pointer',
                              }}
                            >
                              🗑 削除
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {filteredArchive.length > archivePageSize && <div style={{ fontSize: 12, color: '#777' }}>※「表示件数」を増やすと、もっと下まで見れるよ（スクロール長くなるから段階にしてる）</div>}
              </>
            )}
          </>
        )}

        {/* ===== 偏差分析モード ===== */}
        {viewMode === 'analysis' && (
          <>
            <h2 style={{ margin: 0 }}>📈 偏差分析（勝てる条件を出す）</h2>

            {!allLoadedOnce && allLoading ? (
              <p>読み込み中…</p>
            ) : filteredArchive.length === 0 ? (
              <p>まだ記録がないよ</p>
            ) : (
              <>
                <div style={{ border: '1px solid #333', borderRadius: 12, padding: 12, background: '#0f0f0f', color: '#ddd', display: 'grid', gap: 10 }}>
                  <div style={{ fontSize: 12, color: '#aaa' }}>
                    対象：絞り込み {filteredArchive.length} 件（分析対象（撮影日時あり）：{analysisTargets.length} 件）
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <label style={{ fontSize: 12, color: '#bbb' }}>
                      指標：
                      <select value={analysisMetric} onChange={(e) => setAnalysisMetric(e.target.value as AnalysisMetric)} style={{ marginLeft: 8 }}>
                        <option value="catchRate">釣れた率（Wilsonで安定）</option>
                        <option value="avgSize">平均サイズ（釣れた＆サイズあり）</option>
                        <option value="effortBias">行きがち偏り（Z）</option>
                      </select>
                    </label>

                    <label style={{ fontSize: 12, color: '#bbb' }}>
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

                    <label style={{ fontSize: 12, color: '#bbb' }}>
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
                      <span style={{ fontSize: 12, color: '#bbb' }}>結果未入力も含める（未入力＝ボウズ扱い）</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        setAnalysisTideMap({})
                        setAnalysisTideError('')
                      }}
                      style={{ marginLeft: 'auto' }}
                      title="分析用の潮データをリセット（必要なら再取得）"
                    >
                      リセット
                    </button>
                  </div>

                  <div style={{ fontSize: 12, color: '#aaa' }}>
                    ベースライン：釣れた率 {formatPercent(baseline.catchRate)}（{baseline.caught}/{analysisIncludeUnknown ? baseline.total : baseline.caught + baseline.skunk}） / 平均サイズ{' '}
                    {baseline.avgSize ? `${Math.round(baseline.avgSize * 10) / 10}cm` : '—'}
                  </div>

                  <div style={{ fontSize: 12, color: '#888' }}>✅ 上位は “運じゃなく再現性” 寄りにするため、釣れた率は Wilson 下限で並べてるよ😼</div>
                </div>

                <div style={{ fontSize: 12, color: '#aaa' }}>
                  🌊 分析用 tide736：
                  {analysisTideLoading ? (
                    <> 取得中…（{analysisTideProgress.done}/{analysisTideProgress.total} 日）</>
                  ) : analysisTideError ? (
                    <span style={{ color: '#b00' }}> 取得失敗 → {analysisTideError}</span>
                  ) : (
                    <span style={{ color: '#0a6' }}> OK（{Object.keys(analysisTideMap).length}件に付与）</span>
                  )}
                  {!online && <span style={{ marginLeft: 10, color: '#f6c' }}>📴 オフライン</span>}
                </div>

                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ border: '1px solid #333', borderRadius: 12, padding: 12, background: '#111', color: '#ddd' }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>🏆 上位（強い条件）</div>

                    {analysisTop.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#aaa' }}>※条件の種類が少ないか、最低件数（minN）が高すぎるかも</div>
                    ) : (
                      <ol style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6 }}>
                        {analysisTop.map((r) => (
                          <li key={r.label}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                              <span style={{ color: '#ffd166', overflowWrap: 'anywhere' }}>{r.label}</span>
                              <span style={{ fontSize: 12, color: '#aaa' }}>
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

                  <div style={{ border: '1px solid #333', borderRadius: 12, padding: 12, background: '#111', color: '#ddd' }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>🧊 下位（弱い条件）</div>

                    {analysisBottom.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#aaa' }}>—</div>
                    ) : (
                      <ol style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6 }}>
                        {analysisBottom.map((r) => (
                          <li key={r.label}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                              <span style={{ color: '#bbb', overflowWrap: 'anywhere' }}>{r.label}</span>
                              <span style={{ fontSize: 12, color: '#aaa' }}>
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
          </>
        )}

        {/* 下部ナビ */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <button onClick={back}>← 戻る</button>
        </div>
      </div>
    </PageShell>
  )
}
