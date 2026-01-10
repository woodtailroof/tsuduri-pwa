// src/screens/Weather.tsx

import { useEffect, useMemo, useState } from 'react'
import { FIXED_PORT } from '../points'
import TideGraph from '../components/TideGraph'
import { getTide736DayCached, type TideCacheSource, dayKey as dayKeyFromDate } from '../lib/tide736Cache'
import type { TidePoint } from '../db'
import PageShell from '../components/PageShell'

type Props = {
  back: () => void
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function toDateInputValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function parseDateInputValue(v: string): Date | null {
  if (!v) return null
  const [y, m, d] = v.split('-').map(Number)
  if (![y, m, d].every(Number.isFinite)) return null
  if (m < 1 || m > 12) return null
  if (d < 1 || d > 31) return null
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function formatHMFromMinutes(totalMin: number) {
  const m = clamp(Math.round(totalMin), 0, 1440)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${pad2(h)}:${pad2(mm)}`
}

/**
 * TideGraph と同じ思想：time(HH:mm) 優先、unixはfallback
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

type Pt = { min: number; cm: number }
type TideExtreme = { kind: 'high' | 'low'; min: number; cm: number }

/**
 * 満潮/干潮：単純なスロープ反転（TideGraphと同等）
 * 表示は 満潮2 / 干潮2
 */
function extractExtremesBySlope(series: TidePoint[]): TideExtreme[] {
  const pts: Pt[] = []
  for (const p of series) {
    const m = toMinutes(p)
    if (m == null) continue
    pts.push({ min: clamp(m, 0, 1440), cm: p.cm })
  }
  if (pts.length < 3) return []

  pts.sort((a, b) => a.min - b.min)

  // 同一分は最後を採用
  const uniq: Pt[] = []
  for (const p of pts) {
    const last = uniq[uniq.length - 1]
    if (last && last.min === p.min) uniq[uniq.length - 1] = p
    else uniq.push(p)
  }

  // 0:00/24:00補完
  if (uniq.length >= 2) {
    const first = uniq[0]
    const last = uniq[uniq.length - 1]
    if (first.min > 0) uniq.unshift({ min: 0, cm: first.cm })
    if (last.min < 1440) uniq.push({ min: 1440, cm: last.cm })
  }

  const EPS_CM = 1
  const raw: TideExtreme[] = []
  let prevSlope = 0 // -1 down, +1 up, 0 flat

  for (let i = 1; i < uniq.length; i++) {
    const d = uniq[i].cm - uniq[i - 1].cm
    const slope = Math.abs(d) <= EPS_CM ? 0 : d > 0 ? 1 : -1

    if (i >= 2) {
      const a = prevSlope
      const b = slope
      const mid = uniq[i - 1]
      if (a > 0 && b < 0) raw.push({ kind: 'high', min: mid.min, cm: mid.cm })
      else if (a < 0 && b > 0) raw.push({ kind: 'low', min: mid.min, cm: mid.cm })
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

  const highs = merged
    .filter((e) => e.kind === 'high')
    .sort((a, b) => a.min - b.min)
    .slice(0, 2)
  const lows = merged
    .filter((e) => e.kind === 'low')
    .sort((a, b) => a.min - b.min)
    .slice(0, 2)

  return [...highs, ...lows].sort((a, b) => a.min - b.min)
}

function sourceLabel(source: TideCacheSource | null, isStale: boolean) {
  if (!source) return null
  if (source === 'fetch') return { text: '取得', color: '#0a6' }
  if (source === 'cache') return { text: 'キャッシュ', color: '#6cf' }
  return { text: isStale ? '期限切れキャッシュ' : 'キャッシュ', color: '#f6c' }
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; series: TidePoint[]; tideName: string | null; source: TideCacheSource; isStale: boolean; dayKey: string }
  | { status: 'error'; message: string }

export default function Weather({ back }: Props) {
  const [tab, setTab] = useState<'today' | 'tomorrow' | 'pick'>('today')
  const [picked, setPicked] = useState<string>(toDateInputValue(new Date()))

  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [state, setState] = useState<LoadState>({ status: 'idle' })

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

  const targetDate = useMemo(() => {
    const now = new Date()
    if (tab === 'today') return startOfDay(now)
    if (tab === 'tomorrow') {
      const t = startOfDay(now)
      t.setDate(t.getDate() + 1)
      return t
    }
    const d = parseDateInputValue(picked)
    return d ? startOfDay(d) : startOfDay(now)
  }, [tab, picked])

  // pickタブに入ったら、表示してる日付もピッカーに反映
  useEffect(() => {
    if (tab !== 'pick') return
    setPicked(toDateInputValue(targetDate))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setState({ status: 'loading' })
      try {
        const res = await getTide736DayCached(FIXED_PORT.pc, FIXED_PORT.hc, targetDate, { ttlDays: 30 })
        const dayKey = dayKeyFromDate(targetDate)
        if (!cancelled) {
          setState({
            status: 'ok',
            series: res.series ?? [],
            tideName: res.tideName ?? null,
            source: res.source,
            isStale: res.isStale,
            dayKey,
          })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!cancelled) setState({ status: 'error', message: msg })
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [targetDate])

  const now = new Date()
  const highlightAt = useMemo(() => {
    if (sameDay(targetDate, now)) return now
    return null
  }, [targetDate, now])

  const extremes = useMemo(() => {
    if (state.status !== 'ok') return []
    return extractExtremesBySlope(state.series ?? [])
  }, [state])

  const highs = extremes.filter((e) => e.kind === 'high')
  const lows = extremes.filter((e) => e.kind === 'low')

  const tabBtnStyle = (active: boolean) => ({
    borderRadius: 999,
    padding: '8px 12px',
    border: active ? '2px solid #ff4d6d' : '1px solid var(--ui-border)',
    background: active ? 'rgba(255,77,109,0.18)' : 'var(--ui-surface)',
    color: active ? '#fff' : 'var(--ui-text)',
    cursor: 'pointer',
  })

  return (
    <PageShell
      title={<h1 style={{ margin: 0 }}>☀️ Weather（釣行判断）</h1>}
      subtitle={
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ui-text-mute)' }}>
          🌊 潮汐基準：{FIXED_PORT.name}（pc:{FIXED_PORT.pc} / hc:{FIXED_PORT.hc}）
          {!online && <span style={{ marginLeft: 10, color: '#f6c' }}>📴 オフライン</span>}
        </div>
      }
      maxWidth={980}
      showBack
      onBack={back}
    >
      {/* タブ */}
      <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
        <button onClick={() => setTab('today')} style={tabBtnStyle(tab === 'today')}>
          今日
        </button>
        <button onClick={() => setTab('tomorrow')} style={tabBtnStyle(tab === 'tomorrow')}>
          明日
        </button>
        <button onClick={() => setTab('pick')} style={tabBtnStyle(tab === 'pick')}>
          日付指定
        </button>

        {tab === 'pick' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ui-text-dim)', minWidth: 0 }}>
            <span style={{ fontSize: 12 }}>📅</span>
            <input
              type="date"
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              style={{
                background: 'var(--ui-surface)',
                color: 'var(--ui-text)',
                border: '1px solid var(--ui-border)',
                borderRadius: 10,
                padding: '6px 10px',
                maxWidth: '100%',
              }}
            />
          </label>
        )}
      </div>

      {/* 状態 */}
      {state.status === 'loading' && <div style={{ marginTop: 10, fontSize: 12, color: '#0a6' }}>🌊 tide736：取得中…</div>}
      {state.status === 'error' && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#b00' }}>🌊 tide736：取得失敗 → {state.message}</div>
      )}

      {/* サマリー */}
      <div
        style={{
          marginTop: 16,
          border: '1px solid var(--ui-border)',
          borderRadius: 12,
          padding: 12,
          background: 'var(--ui-surface-2)',
          color: 'var(--ui-text)',
          minWidth: 0,
          backdropFilter: 'blur(8px)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--ui-text-mute)', minWidth: 0 }}>📅 {targetDate.toLocaleDateString()}</div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
            {state.status === 'ok' &&
              (() => {
                const lab = sourceLabel(state.source, state.isStale)
                if (!lab) return null
                return (
                  <div style={{ fontSize: 11, color: lab.color, whiteSpace: 'nowrap' }} title="tide736取得元">
                    🌊 {lab.text}
                  </div>
                )
              })()}
            {!online && (
              <div style={{ fontSize: 11, color: '#f6c', whiteSpace: 'nowrap' }} title="オフライン">
                📴 オフライン
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 6, fontSize: 12, color: '#6cf' }}>
          🌙 潮名：
          {state.status === 'ok' ? (state.tideName ? ` ${state.tideName}` : ' （未取得）') : ' -'}
        </div>

        {state.status === 'ok' && !state.tideName && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ui-text-mute)' }}>
            ※潮名（大潮など）が未取得のキャッシュです（TTL切れで再取得されたタイミングで入ります）
          </div>
        )}

        {state.status === 'ok' && !online && state.source === 'stale-cache' && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#f6c' }}>
            ⚠ オフラインのため、期限切れキャッシュで表示中（オンライン復帰後に再取得できます）
          </div>
        )}
      </div>

      {/* 満潮/干潮 */}
      <div style={{ marginTop: 12, display: 'grid', gap: 10, minWidth: 0 }}>
        <div
          style={{
            border: '1px solid var(--ui-border)',
            borderRadius: 12,
            padding: 12,
            background: 'var(--ui-surface)',
            color: 'var(--ui-text)',
            minWidth: 0,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>🟡 満潮 / 🔵 干潮</div>

          {state.status !== 'ok' ? (
            <div style={{ fontSize: 12, color: 'var(--ui-text-mute)' }}>データ準備中…</div>
          ) : state.series.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--ui-text-mute)' }}>
              {!online ? '📴 オフラインで、この日のキャッシュが無いよ（オンライン復帰後に取得できる）' : '潮位データが無いよ'}
            </div>
          ) : extremes.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--ui-text-mute)' }}>極値がうまく取れなかったよ（データ不足かも）</div>
          ) : (
            <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
              <div style={{ color: 'var(--ui-text-dim)' }}>
                🟡 満潮：
                {highs.length ? (
                  highs.map((e, i) => (
                    <span key={`h-${e.min}-${e.cm}`}>
                      {i > 0 ? ' / ' : ' '}
                      {formatHMFromMinutes(e.min)}（{Math.round(e.cm)}cm）
                    </span>
                  ))
                ) : (
                  <span> -</span>
                )}
              </div>
              <div style={{ color: 'var(--ui-text-dim)' }}>
                🔵 干潮：
                {lows.length ? (
                  lows.map((e, i) => (
                    <span key={`l-${e.min}-${e.cm}`}>
                      {i > 0 ? ' / ' : ' '}
                      {formatHMFromMinutes(e.min)}（{Math.round(e.cm)}cm）
                    </span>
                  ))
                ) : (
                  <span> -</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* グラフ */}
        <div style={{ minWidth: 0 }}>
          {state.status === 'ok' && state.series.length > 0 ? (
            <TideGraph series={state.series} baseDate={targetDate} highlightAt={highlightAt} yDomain={{ min: -50, max: 200 }} />
          ) : (
            <TideGraph series={[]} baseDate={targetDate} highlightAt={null} yDomain={{ min: -50, max: 200 }} />
          )}
        </div>
      </div>

      {state.status === 'ok' && (
        <div style={{ marginTop: 18, fontSize: 12, color: 'var(--ui-text-mute)', minWidth: 0, overflowWrap: 'anywhere' }}>
          key: {FIXED_PORT.pc}:{FIXED_PORT.hc}:{state.dayKey}
        </div>
      )}
    </PageShell>
  )
}
