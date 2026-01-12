// src/screens/Archive.tsx
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { db, type CatchRecord } from '../db'
import { exportCatches, importCatches } from '../lib/catchTransfer'
import { getTimeBand } from '../lib/timeband'
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
type DetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ok'
      tideName: string | null
      phase: string
      tide: TideInfo | null
      series: Array<{ unix?: number; cm: number; time?: string }>
      source: TideCacheSource
      isStale: boolean
      shot: Date
      band: string
    }
  | { status: 'error'; message: string }

function useIsMobile(breakpointPx = 820) {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(`(max-width: ${breakpointPx}px)`).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`)

    const onChange = () => setIsMobile(mq.matches)
    onChange()

    // Safari含め互換
    if ('addEventListener' in mq) {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    } else {
      // @ts-expect-error legacy
      mq.addListener(onChange)
      // @ts-expect-error legacy
      return () => mq.removeListener(onChange)
    }
  }, [breakpointPx])

  return isMobile
}

function dayKeyFromISO(iso: string) {
  const d = new Date(iso)
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { d, key }
}

function displayPhaseForHeader(phase: string) {
  const hide = new Set(['上げ', '下げ', '上げ始め', '下げ始め', '止まり'])
  return hide.has(phase) ? '' : phase
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

function sourceLabel(source: TideCacheSource, isStale: boolean) {
  if (source === 'fetch') return { text: '取得', color: '#0a6' }
  if (source === 'cache') return { text: 'キャッシュ', color: '#6cf' }
  return { text: isStale ? '期限切れキャッシュ' : 'キャッシュ', color: '#f6c' }
}

export default function Archive({ back }: Props) {
  const isMobile = useIsMobile(820)

  const glassBoxStyle: CSSProperties = {
    borderRadius: 16,
    padding: 12,
    display: 'grid',
    gap: 10,
  }

  const pillBtnStyle: CSSProperties = {
    borderRadius: 999,
    padding: '8px 12px',
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(0,0,0,0.24)',
    color: 'rgba(255,255,255,0.78)',
    cursor: 'pointer',
    userSelect: 'none',
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    whiteSpace: 'nowrap',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
  }

  const pillBtnStyleDisabled: CSSProperties = {
    ...pillBtnStyle,
    opacity: 0.55,
    cursor: 'not-allowed',
  }

  const segWrapStyle: CSSProperties = {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    alignItems: 'center',
    minWidth: 0,
  }

  const segLabelStyle: CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    cursor: 'pointer',
    userSelect: 'none',
    minWidth: 0,
  }

  const segInputHidden: CSSProperties = {
    position: 'absolute',
    opacity: 0,
    pointerEvents: 'none',
    width: 1,
    height: 1,
  }

  const segPillBase: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    borderRadius: 16,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    minWidth: 0,
    maxWidth: '100%',
    border: '1px solid rgba(255,255,255,0.22)',
    background: 'rgba(255,255,255,0.06)',
    color: '#ddd',
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)',
    WebkitTapHighlightColor: 'transparent',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
  }

  function segPill(checked: boolean): CSSProperties {
    return {
      ...segPillBase,
      border: checked ? '2px solid #ff4d6d' : segPillBase.border,
      background: checked ? 'rgba(255,77,109,0.18)' : segPillBase.background,
      color: checked ? '#fff' : segPillBase.color,
      boxShadow: checked
        ? '0 6px 18px rgba(0,0,0,0.22), inset 0 0 0 1px rgba(255,77,109,0.25)'
        : segPillBase.boxShadow,
    }
  }

  function segDot(checked: boolean): CSSProperties {
    return {
      width: 10,
      height: 10,
      borderRadius: 999,
      flex: '0 0 auto',
      border: checked ? '1px solid rgba(255,77,109,0.9)' : '1px solid rgba(255,255,255,0.35)',
      background: checked ? '#ff4d6d' : 'transparent',
      boxShadow: checked ? '0 0 0 4px rgba(255,77,109,0.16)' : 'none',
    }
  }

  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true)

  const [all, setAll] = useState<CatchRecord[]>([])
  const [allLoading, setAllLoading] = useState(false)

  const [archivePageSize, setArchivePageSize] = useState<10 | 30 | 50>(30)
  const [archiveYear, setArchiveYear] = useState<string>('')
  const [archiveMonth, setArchiveMonth] = useState<string>('')

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<DetailState>({ status: 'idle' })

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
      if (selectedId == null && list.length > 0) setSelectedId(list[0].id ?? null)
    } finally {
      setAllLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const archiveList = useMemo(() => filteredArchive.slice(0, archivePageSize), [filteredArchive, archivePageSize])

  const selectedRecord = useMemo(() => {
    if (selectedId == null) return null
    return filteredArchive.find((r) => r.id === selectedId) ?? null
  }, [filteredArchive, selectedId])

  useEffect(() => {
    if (!selectedRecord || !selectedRecord.id) {
      setDetail({ status: 'idle' })
      return
    }

    const capturedIso = selectedRecord.capturedAt
    if (!capturedIso) {
      setDetail({ status: 'error', message: 'この記録は撮影日時が無いから、タイドを紐づけられないよ' })
      return
    }

    let cancelled = false

    async function run() {
      setDetail({ status: 'loading' })
      try {
        const shot = new Date(capturedIso)
        const { series, source, isStale, tideName } = await getTide736DayCached(FIXED_PORT.pc, FIXED_PORT.hc, shot, { ttlDays: 30 })

        const whenMs = shot.getTime()
        const info = getTideAtTime(series, whenMs)
        const phaseRaw = getTidePhaseFromSeries(series, shot, shot)
        const phaseShown = displayPhaseForHeader(phaseRaw || '不明') || (phaseRaw || '不明')

        if (cancelled) return
        setDetail({
          status: 'ok',
          tideName: tideName ?? null,
          phase: phaseShown,
          tide: info ? { cm: info.cm, trend: info.trend } : null,
          series,
          source,
          isStale,
          shot,
          band: getTimeBand(shot),
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!cancelled) setDetail({ status: 'error', message: msg })
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [selectedRecord])

  async function onDelete(id?: number) {
    if (!id) return
    const ok = confirm('この記録を削除する？（戻せないよ）')
    if (!ok) return
    await db.catches.delete(id)
    await loadAll()
    if (selectedId === id) setSelectedId(null)
  }

  const ellipsis1: CSSProperties = {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  }

  return (
    <PageShell title={<h1 style={{ margin: 0 }}>🧾 全履歴</h1>} maxWidth={1200} showBack onBack={back}>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 10 }}>
        🌊 潮汐基準：{FIXED_PORT.name}（pc:{FIXED_PORT.pc} / hc:{FIXED_PORT.hc}）
        {!online && <span style={{ marginLeft: 10, color: '#f6c' }}>📴 オフライン</span>}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <button type="button" onClick={() => loadAll()} disabled={allLoading} style={allLoading ? pillBtnStyleDisabled : pillBtnStyle} title="全履歴を再読み込み">
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

      {/* フィルタ */}
      <div className="glass glass-strong" style={{ ...glassBoxStyle, marginBottom: 14 }}>
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
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>📦 表示件数</div>

          <div style={segWrapStyle} aria-label="表示件数">
            <label style={segLabelStyle}>
              <input type="radio" name="archivePageSize" checked={archivePageSize === 10} onChange={() => setArchivePageSize(10)} style={segInputHidden} />
              <span style={segPill(archivePageSize === 10)}>
                <span style={segDot(archivePageSize === 10)} aria-hidden="true" />
                10件
              </span>
            </label>

            <label style={segLabelStyle}>
              <input type="radio" name="archivePageSize" checked={archivePageSize === 30} onChange={() => setArchivePageSize(30)} style={segInputHidden} />
              <span style={segPill(archivePageSize === 30)}>
                <span style={segDot(archivePageSize === 30)} aria-hidden="true" />
                30件
              </span>
            </label>

            <label style={segLabelStyle}>
              <input type="radio" name="archivePageSize" checked={archivePageSize === 50} onChange={() => setArchivePageSize(50)} style={segInputHidden} />
              <span style={segPill(archivePageSize === 50)}>
                <span style={segDot(archivePageSize === 50)} aria-hidden="true" />
                50件
              </span>
            </label>
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
          全 {all.length} 件 → 絞り込み {filteredArchive.length} 件（表示 {Math.min(archivePageSize, filteredArchive.length)} 件）
        </div>
      </div>

      {/* ===== PC/スマホでレイアウト分岐 ===== */}
      {isMobile ? (
        // ===== スマホ：縦（一覧→詳細） =====
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            {archiveList.map((r) => {
              const isSel = r.id != null && r.id === selectedId
              const shotDate = r.capturedAt ? new Date(r.capturedAt) : null
              const created = new Date(r.createdAt)
              const thumbUrl = r.photoBlob ? URL.createObjectURL(r.photoBlob) : null

              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id ?? null)}
                  className="glass glass-strong"
                  style={{
                    textAlign: 'left',
                    borderRadius: 16,
                    padding: 12,
                    display: 'grid',
                    gridTemplateColumns: '72px 1fr',
                    gap: 12,
                    alignItems: 'center',
                    border: isSel ? '2px solid #ff4d6d' : '1px solid rgba(255,255,255,0.18)',
                    background: isSel ? 'rgba(255,77,109,0.14)' : 'rgba(255,255,255,0.06)',
                    color: '#eee',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 12,
                      overflow: 'hidden',
                      background: 'rgba(0,0,0,0.18)',
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
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>No Photo</span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', ...ellipsis1 }}>記録：{created.toLocaleString()}</div>

                    <div style={{ fontSize: 12, color: '#6cf', overflowWrap: 'anywhere' }}>
                      📸 {shotDate ? shotDate.toLocaleString() : '（撮影日時なし）'}
                      {shotDate ? ` / 🕒 ${getTimeBand(shotDate)}` : ''}
                    </div>

                    <div style={{ fontSize: 12, color: '#ffd166' }}>{formatResultLine(r)}</div>

                    <div style={{ color: '#eee', overflowWrap: 'anywhere' }}>{r.memo || '（メモ無し）'}</div>

                    {/* ✅ 削除を（メモ無し）の下へ */}
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
                          border: '1px solid rgba(255, 122, 122, 0.35)',
                          padding: '6px 10px',
                          borderRadius: 999,
                          userSelect: 'none',
                          whiteSpace: 'nowrap',
                          background: 'rgba(0,0,0,0.18)',
                          backdropFilter: 'blur(8px)',
                          WebkitBackdropFilter: 'blur(8px)',
                        }}
                        title="削除"
                      >
                        🗑 削除…
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <div>
            <h2 style={{ margin: '6px 0 10px 0' }}>📈 選択中の詳細</h2>

            {!selectedRecord ? (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>一覧から記録を選んでね</div>
            ) : detail.status === 'loading' ? (
              <div style={{ fontSize: 12, color: '#0a6' }}>🌊 tide736：取得中…</div>
            ) : detail.status === 'error' ? (
              <div style={{ fontSize: 12, color: '#ff7a7a' }}>🌊 tide736：表示できない → {detail.message}</div>
            ) : detail.status === 'ok' ? (
              <div className="glass glass-strong" style={{ borderRadius: 16, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>📸 {detail.shot.toLocaleString()}</div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    {!online && (
                      <div style={{ fontSize: 11, color: '#f6c', whiteSpace: 'nowrap' }} title="オフライン">
                        📴 オフライン
                      </div>
                    )}

                    {(() => {
                      const lab = sourceLabel(detail.source, detail.isStale)
                      return (
                        <div style={{ fontSize: 11, color: lab.color, whiteSpace: 'nowrap' }} title="tide736取得元">
                          🌊 {lab.text}
                        </div>
                      )
                    })()}
                  </div>
                </div>

                <div style={{ marginTop: 6, fontSize: 12, color: '#6cf', overflowWrap: 'anywhere' }}>
                  🕒 {detail.band}
                  {detail.tideName ? ` / 🌙 ${detail.tideName}` : ''}
                  {detail.phase ? ` / 🌊 ${detail.phase}` : ''}
                </div>

                <div style={{ marginTop: 6, fontSize: 12, color: '#ffd166' }}>{formatResultLine(selectedRecord)}</div>

                <div style={{ marginTop: 6, fontSize: 12, color: '#7ef', overflowWrap: 'anywhere' }}>
                  🌊 焼津潮位：
                  {detail.tide ? `${detail.tide.cm}cm / ${detail.tide.trend}` : '（データなし）'}
                </div>

                <div style={{ marginTop: 8, overflowWrap: 'anywhere' }}>{selectedRecord.memo || '（メモ無し）'}</div>

                {!detail.tideName && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                    ※潮名（大潮など）が未取得のキャッシュです（オンライン時に自動取得して保存されます）
                  </div>
                )}

                <div style={{ marginTop: 10 }}>
                  {detail.series.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>
                      {!online ? '📴 オフラインで、この日のキャッシュが無いよ（オンライン復帰後に取得できる）' : 'タイドデータが無いよ（取得中 or データなし）'}
                    </div>
                  ) : (
                    <TideGraph series={detail.series} baseDate={detail.shot} highlightAt={detail.shot} yDomain={{ min: -50, max: 200 }} />
                  )}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>一覧から記録を選んでね</div>
            )}
          </div>
        </div>
      ) : (
        // ===== PC：2カラム（左：一覧 / 右：詳細） =====
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(420px, 520px) 1fr',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {/* 左：一覧 */}
          <div style={{ display: 'grid', gap: 10 }}>
            {archiveList.map((r) => {
              const isSel = r.id != null && r.id === selectedId
              const shotDate = r.capturedAt ? new Date(r.capturedAt) : null
              const created = new Date(r.createdAt)
              const thumbUrl = r.photoBlob ? URL.createObjectURL(r.photoBlob) : null

              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id ?? null)}
                  className="glass glass-strong"
                  style={{
                    textAlign: 'left',
                    borderRadius: 16,
                    padding: 12,
                    display: 'grid',
                    gridTemplateColumns: '72px 1fr',
                    gap: 12,
                    alignItems: 'center',
                    border: isSel ? '2px solid #ff4d6d' : '1px solid rgba(255,255,255,0.18)',
                    background: isSel ? 'rgba(255,77,109,0.14)' : 'rgba(255,255,255,0.06)',
                    color: '#eee',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 12,
                      overflow: 'hidden',
                      background: 'rgba(0,0,0,0.18)',
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
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>No Photo</span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', ...ellipsis1 }}>記録：{created.toLocaleString()}</div>

                    <div style={{ fontSize: 12, color: '#6cf', overflowWrap: 'anywhere' }}>
                      📸 {shotDate ? shotDate.toLocaleString() : '（撮影日時なし）'}
                      {shotDate ? ` / 🕒 ${getTimeBand(shotDate)}` : ''}
                    </div>

                    <div style={{ fontSize: 12, color: '#ffd166' }}>{formatResultLine(r)}</div>

                    <div style={{ color: '#eee', overflowWrap: 'anywhere' }}>{r.memo || '（メモ無し）'}</div>

                    {/* ✅ 削除を（メモ無し）の下へ */}
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
                          border: '1px solid rgba(255, 122, 122, 0.35)',
                          padding: '6px 10px',
                          borderRadius: 999,
                          userSelect: 'none',
                          whiteSpace: 'nowrap',
                          background: 'rgba(0,0,0,0.18)',
                          backdropFilter: 'blur(8px)',
                          WebkitBackdropFilter: 'blur(8px)',
                        }}
                        title="削除"
                      >
                        🗑 削除…
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* 右：詳細（sticky） */}
          <div style={{ position: 'sticky', top: 12 }}>
            <h2 style={{ margin: '0 0 10px 0' }}>📈 選択中の詳細</h2>

            {!selectedRecord ? (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>左の一覧から記録を選んでね</div>
            ) : detail.status === 'loading' ? (
              <div style={{ fontSize: 12, color: '#0a6' }}>🌊 tide736：取得中…</div>
            ) : detail.status === 'error' ? (
              <div style={{ fontSize: 12, color: '#ff7a7a' }}>🌊 tide736：表示できない → {detail.message}</div>
            ) : detail.status === 'ok' ? (
              <div className="glass glass-strong" style={{ borderRadius: 16, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>📸 {detail.shot.toLocaleString()}</div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    {!online && (
                      <div style={{ fontSize: 11, color: '#f6c', whiteSpace: 'nowrap' }} title="オフライン">
                        📴 オフライン
                      </div>
                    )}

                    {(() => {
                      const lab = sourceLabel(detail.source, detail.isStale)
                      return (
                        <div style={{ fontSize: 11, color: lab.color, whiteSpace: 'nowrap' }} title="tide736取得元">
                          🌊 {lab.text}
                        </div>
                      )
                    })()}
                  </div>
                </div>

                <div style={{ marginTop: 6, fontSize: 12, color: '#6cf', overflowWrap: 'anywhere' }}>
                  🕒 {detail.band}
                  {detail.tideName ? ` / 🌙 ${detail.tideName}` : ''}
                  {detail.phase ? ` / 🌊 ${detail.phase}` : ''}
                </div>

                <div style={{ marginTop: 6, fontSize: 12, color: '#ffd166' }}>{formatResultLine(selectedRecord)}</div>

                <div style={{ marginTop: 6, fontSize: 12, color: '#7ef', overflowWrap: 'anywhere' }}>
                  🌊 焼津潮位：
                  {detail.tide ? `${detail.tide.cm}cm / ${detail.tide.trend}` : '（データなし）'}
                </div>

                <div style={{ marginTop: 8, overflowWrap: 'anywhere' }}>{selectedRecord.memo || '（メモ無し）'}</div>

                {!detail.tideName && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                    ※潮名（大潮など）が未取得のキャッシュです（オンライン時に自動取得して保存されます）
                  </div>
                )}

                <div style={{ marginTop: 10 }}>
                  {detail.series.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>
                      {!online ? '📴 オフラインで、この日のキャッシュが無いよ（オンライン復帰後に取得できる）' : 'タイドデータが無いよ（取得中 or データなし）'}
                    </div>
                  ) : (
                    <TideGraph series={detail.series} baseDate={detail.shot} highlightAt={detail.shot} yDomain={{ min: -50, max: 200 }} />
                  )}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>左の一覧から記録を選んでね</div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  )
}
