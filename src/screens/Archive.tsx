// src/screens/Archive.tsx
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { db, type CatchRecord } from '../db'
import { exportCatches, importCatches } from '../lib/catchTransfer'
import { getTimeBand } from '../lib/timeband'
import { FIXED_PORT } from '../points'
import PageShell from '../components/PageShell'
import TideGraph from '../components/TideGraph'
import { getTideAtTime } from '../lib/tide736'
import { getTide736DayCached, type TideCacheSource } from '../lib/tide736Cache'
import { getTidePhaseFromSeries } from '../lib/tidePhase736'
import { useMediaQuery } from '../lib/useMediaQuery'

type Props = { back: () => void }

type TidePoint = { unix?: number; cm: number; time?: string }

type DetailTideInfo = {
  series: TidePoint[]
  tideName: string | null
  phaseRaw: string
  phaseShown: string
  cm: number | null
  trend: string | null
  source: TideCacheSource | null
  isStale: boolean
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function dayKeyFromISO(iso: string) {
  const d = new Date(iso)
  const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  return { d, key }
}

function displayPhaseForHeader(phase: string) {
  const hide = new Set(['上げ', '下げ', '上げ始め', '下げ始め', '止まり'])
  return hide.has(phase) ? '' : phase
}

function formatResultLine(r: CatchRecord) {
  if (r.result === 'caught') {
    const sp = r.species?.trim() ? r.species.trim() : '不明'
    const sz = typeof r.sizeCm === 'number' && Number.isFinite(r.sizeCm) ? `${r.sizeCm}cm` : 'サイズ不明'
    return `🎣 釣れた：${sp} / ${sz}`
  }
  if (r.result === 'skunk') return '😇 釣れなかった（ボウズ）'
  return '❔ 結果未入力'
}

function sourceLabel(source: TideCacheSource | null, isStale: boolean) {
  if (!source) return null
  if (source === 'fetch') return { text: '取得', color: '#0a6' }
  if (source === 'cache') return { text: 'キャッシュ', color: '#6cf' }
  return { text: isStale ? '期限切れキャッシュ' : 'キャッシュ', color: '#f6c' }
}

function safeShotISO(r: CatchRecord) {
  return r.capturedAt ?? r.createdAt
}

function isValidDate(d: Date) {
  return Number.isFinite(d.getTime())
}

function thumbUrlFromRecord(r: CatchRecord) {
  if (!r.photoBlob) return null
  try {
    return URL.createObjectURL(r.photoBlob)
  } catch {
    return null
  }
}

export default function Archive({ back }: Props) {
  // PC/スマホ判定（広さ + タッチ優先）
  const isNarrow = useMediaQuery('(max-width: 900px)')
  const isCoarse = useMediaQuery('(pointer: coarse)')
  const isMobile = isNarrow || isCoarse

  const [all, setAll] = useState<CatchRecord[]>([])
  const [allLoading, setAllLoading] = useState(false)
  const [loadedOnce, setLoadedOnce] = useState(false)

  const [pageSize, setPageSize] = useState<10 | 30 | 50>(30)
  const [year, setYear] = useState<string>('')
  const [month, setMonth] = useState<string>('')

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string>('')
  const [detailTide, setDetailTide] = useState<DetailTideInfo | null>(null)

  // ===== 共通スタイル =====
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

  const pillBtnStyleActive: CSSProperties = {
    ...pillBtnStyle,
    border: '2px solid #ff4d6d',
    background: 'rgba(255,77,109,0.16)',
    color: '#fff',
    boxShadow: '0 8px 22px rgba(0,0,0,0.22), inset 0 0 0 1px rgba(255,77,109,0.25)',
  }

  const pillBtnStyleDisabled: CSSProperties = {
    ...pillBtnStyle,
    opacity: 0.55,
    cursor: 'not-allowed',
  }

  const glassBoxStyle: CSSProperties = {
    borderRadius: 16,
    padding: 12,
    display: 'grid',
    gap: 10,
  }

  const ellipsis1: CSSProperties = {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  }

  async function loadAll() {
    setAllLoading(true)
    try {
      const list = await db.catches.orderBy('createdAt').reverse().toArray()
      setAll(list)
      setLoadedOnce(true)
    } finally {
      setAllLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  // 年月マップ
  const yearMonthsMap = useMemo(() => {
    const map = new Map<number, Set<number>>()
    for (const r of all) {
      const iso = safeShotISO(r)
      const d = new Date(iso)
      if (!isValidDate(d)) continue
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
    return Object.keys(yearMonthsMap)
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => b - a)
  }, [yearMonthsMap])

  const monthsForSelectedYear = useMemo(() => {
    if (!year) return null
    const y = Number(year)
    if (!Number.isFinite(y)) return null
    return yearMonthsMap[y] ?? []
  }, [year, yearMonthsMap])

  useEffect(() => {
    if (!year) return
    const y = Number(year)
    if (!Number.isFinite(y)) return

    const months = yearMonthsMap[y] ?? []
    if (!month) return

    const m = Number(month)
    if (!Number.isFinite(m)) {
      setMonth('')
      return
    }
    if (!months.includes(m)) setMonth('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, yearMonthsMap])

  const filtered = useMemo(() => {
    let list = all

    if (year) {
      const y = Number(year)
      if (Number.isFinite(y)) {
        list = list.filter((r) => {
          const d = new Date(safeShotISO(r))
          return isValidDate(d) && d.getFullYear() === y
        })
      }
    }

    if (month) {
      const m = Number(month)
      if (Number.isFinite(m) && m >= 1 && m <= 12) {
        list = list.filter((r) => {
          const d = new Date(safeShotISO(r))
          return isValidDate(d) && d.getMonth() + 1 === m
        })
      }
    }

    return list
  }, [all, year, month])

  const listShown = useMemo(() => filtered.slice(0, pageSize), [filtered, pageSize])

  // 初期選択（PCは常設詳細があるので、先頭を自動選択）
  useEffect(() => {
    if (isMobile) return
    if (selectedId != null) return
    const first = listShown.find((r) => r.id != null)?.id ?? null
    if (first != null) setSelectedId(first)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, listShown])

  const selected = useMemo(() => {
    if (selectedId == null) return null
    return all.find((r) => r.id === selectedId) ?? null
  }, [all, selectedId])

  async function onDelete(id?: number) {
    if (!id) return
    const ok = confirm('この記録を削除する？（戻せないよ）')
    if (!ok) return

    await db.catches.delete(id)
    await loadAll()

    if (selectedId === id) {
      setSelectedId(null)
      setDetailTide(null)
      setDetailError('')
      setDetailLoading(false)
      setSheetOpen(false)
    }
  }

  // 選択レコードの潮データ取得（選ばれた分だけ）
  useEffect(() => {
    let cancelled = false

    async function run() {
      setDetailError('')
      setDetailTide(null)

      if (!selected) return

      if (!selected.capturedAt) {
        setDetailTide({
          series: [],
          tideName: null,
          phaseRaw: '',
          phaseShown: '',
          cm: null,
          trend: null,
          source: null,
          isStale: false,
        })
        return
      }

      const shot = new Date(selected.capturedAt)
      if (!isValidDate(shot)) {
        setDetailError('撮影日時が壊れてるかも…')
        return
      }

      setDetailLoading(true)
      try {
        const { series, source, isStale, tideName } = await getTide736DayCached(FIXED_PORT.pc, FIXED_PORT.hc, shot, { ttlDays: 30 })
        const info = getTideAtTime(series, shot.getTime())
        const phaseRaw = series.length ? getTidePhaseFromSeries(series, shot, shot) : ''
        const phaseShown = phaseRaw ? displayPhaseForHeader(phaseRaw) || phaseRaw : ''

        if (!cancelled) {
          setDetailTide({
            series,
            tideName: tideName ?? null,
            phaseRaw,
            phaseShown,
            cm: info?.cm ?? null,
            trend: info?.trend ?? null,
            source,
            isStale,
          })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!cancelled) setDetailError(msg)
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [selectedId])

  function openDetail(r: CatchRecord) {
    if (r.id == null) return
    setSelectedId(r.id)
    if (isMobile) setSheetOpen(true)
  }

  const headerActions = (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
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
  )

  // ===== 詳細ビュー（PC右ペイン / スマホシート共通） =====
  function DetailView({ record }: { record: CatchRecord }) {
    const shotIso = safeShotISO(record) // ✅ これを未使用にしない
    const shot = record.capturedAt ? new Date(record.capturedAt) : null
    const created = new Date(record.createdAt)

    const band = shot && isValidDate(shot) ? getTimeBand(shot) : '不明'
    const dk = record.capturedAt ? dayKeyFromISO(record.capturedAt) : null

    const lab = detailTide ? sourceLabel(detailTide.source, detailTide.isStale) : null

    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)' }}>
          🌊 潮汐基準：{FIXED_PORT.name}（pc:{FIXED_PORT.pc} / hc:{FIXED_PORT.hc}）
        </div>

        <div className="glass glass-strong" style={{ borderRadius: 16, padding: 12, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontWeight: 900, overflowWrap: 'anywhere' }}>
              📌 選択中：{dk ? dk.key : '（撮影日時なし）'}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {detailLoading && <span style={{ fontSize: 12, color: '#0a6' }}>🌊 tide736：取得中…</span>}
              {!!detailError && (
                <span style={{ fontSize: 12, color: '#ff7a7a' }} title="取得失敗">
                  🌊 tide736：失敗 → {detailError}
                </span>
              )}
              {!detailLoading && !detailError && lab && (
                <span style={{ fontSize: 12, color: lab.color }} title="tide736取得元">
                  🌊 {lab.text}
                </span>
              )}
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>🕒 記録：{isValidDate(created) ? created.toLocaleString() : record.createdAt}</div>

          <div style={{ fontSize: 12, color: '#6cf', overflowWrap: 'anywhere' }}>
            📸{' '}
            {shot && isValidDate(shot)
              ? shot.toLocaleString()
              : `（撮影日時なし / 参照: ${isValidDate(new Date(shotIso)) ? new Date(shotIso).toLocaleString() : shotIso}）`}
            {shot && isValidDate(shot) ? ` / 🕒 ${band}` : ''}
            {detailTide?.tideName ? ` / 🌙 ${detailTide.tideName}` : ''}
            {detailTide?.phaseShown ? ` / 🌊 ${detailTide.phaseShown}` : ''}
          </div>

          <div style={{ fontSize: 12, color: '#ffd166' }}>{formatResultLine(record)}</div>

          <div style={{ fontSize: 12, color: '#7ef', overflowWrap: 'anywhere' }}>
            🌊 焼津潮位：
            {record.capturedAt
              ? detailLoading
                ? '取得中…'
                : detailError
                  ? '取得失敗（上の理由）'
                  : detailTide?.cm != null && detailTide?.trend
                    ? `${detailTide.cm}cm / ${detailTide.trend}`
                    : '（データなし）'
              : '（撮影日時がないため紐づけ不可）'}
          </div>

          <div style={{ color: '#eee', overflowWrap: 'anywhere' }}>{record.memo || '（メモなし）'}</div>

          {/* ✅ 削除ボタンは “メモの下” */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button"
              onClick={() => onDelete(record.id)}
              style={{
                fontSize: 12,
                color: '#ff7a7a',
                border: '1px solid rgba(255, 122, 122, 0.35)',
                padding: '6px 10px',
                borderRadius: 999,
                background: 'rgba(0,0,0,0.18)',
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
              title="削除"
            >
              🗑 削除
            </button>
          </div>
        </div>

        {/* グラフ */}
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 900 }}>📈 タイドグラフ</div>

          {!record.capturedAt ? (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>撮影日時が無いから、この記録はタイドを紐づけられないよ</div>
          ) : detailTide && detailTide.series.length > 0 && shot ? (
            <TideGraph series={detailTide.series} baseDate={shot} highlightAt={shot} yDomain={{ min: -50, max: 200 }} />
          ) : (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>
              {detailLoading ? '準備中…' : detailError ? 'グラフの準備に失敗…' : 'この日のタイドデータがまだ無いよ（取得待ち/なし）'}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ===== スマホ用ボトムシート =====
  function BottomSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
    if (!open) return null

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.62)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          display: 'grid',
          alignItems: 'end',
        }}
        onClick={onClose}
      >
        <div
          className="glass glass-strong"
          style={{
            width: '100%',
            maxHeight: '85svh',
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            padding: 12,
            boxShadow: '0 -14px 40px rgba(0,0,0,0.35)',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div style={{ fontWeight: 900 }}>📌 記録の詳細</div>
            <button type="button" onClick={onClose} style={pillBtnStyle}>
              ✕ 閉じる
            </button>
          </div>

          <div style={{ height: 8 }} />

          <div style={{ overflowY: 'auto', paddingRight: 2, maxHeight: 'calc(85svh - 58px)' }}>{children}</div>
        </div>
      </div>
    )
  }

  return (
    <PageShell
      title={<h1 style={{ margin: 0, fontSize: 'clamp(20px, 6vw, 32px)', lineHeight: 1.15 }}>🧾 全履歴</h1>}
      maxWidth={1100}
      showBack
      onBack={back}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        {headerActions}

        <div className="glass glass-strong" style={{ ...glassBoxStyle }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>🔎 絞り込み</div>

            <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)' }}>
              年：
              <select value={year} onChange={(e) => setYear(e.target.value)} style={{ marginLeft: 8 }}>
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
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                style={{ marginLeft: 8 }}
                disabled={!!year && (monthsForSelectedYear?.length ?? 0) === 0}
                title={year ? '選択中の年に存在する月だけ出すよ' : '年を選ばなくても月で絞れるよ'}
              >
                <option value="">すべて</option>

                {year && monthsForSelectedYear
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
                setYear('')
                setMonth('')
              }}
              style={{ marginLeft: 'auto' }}
              title="絞り込みを解除"
            >
              リセット
            </button>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>📦 表示件数</div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" onClick={() => setPageSize(10)} style={pageSize === 10 ? pillBtnStyleActive : pillBtnStyle}>
                10件
              </button>
              <button type="button" onClick={() => setPageSize(30)} style={pageSize === 30 ? pillBtnStyleActive : pillBtnStyle}>
                30件
              </button>
              <button type="button" onClick={() => setPageSize(50)} style={pageSize === 50 ? pillBtnStyleActive : pillBtnStyle}>
                50件
              </button>
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            全 {all.length} 件 → 絞り込み {filtered.length} 件（表示 {Math.min(pageSize, filtered.length)} 件）
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', minWidth: 0 }}>
          <div style={{ flex: isMobile ? '1 1 auto' : '0 0 520px', minWidth: 0 }}>
            {allLoading && !loadedOnce ? (
              <p>読み込み中…</p>
            ) : all.length === 0 ? (
              <p>まだ記録がないよ</p>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {listShown.map((r) => {
                  const shotDate = r.capturedAt ? new Date(r.capturedAt) : null
                  const created = new Date(r.createdAt)
                  const thumbUrl = thumbUrlFromRecord(r)
                  const isSel = r.id != null && r.id === selectedId

                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => openDetail(r)}
                      className="glass glass-strong"
                      style={{
                        borderRadius: 16,
                        padding: 12,
                        display: 'grid',
                        gridTemplateColumns: '72px 1fr',
                        gap: 12,
                        alignItems: 'center',
                        textAlign: 'left',
                        cursor: 'pointer',
                        border: isSel && !isMobile ? '2px solid #ff4d6d' : '1px solid rgba(255,255,255,0.12)',
                        background: isSel && !isMobile ? 'rgba(255,77,109,0.10)' : 'rgba(255,255,255,0.06)',
                      }}
                      aria-pressed={isSel}
                      title="この記録を開く"
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
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', ...ellipsis1 }}>
                          記録：{isValidDate(created) ? created.toLocaleString() : r.createdAt}
                        </div>

                        <div style={{ fontSize: 12, color: '#6cf', overflowWrap: 'anywhere' }}>
                          📸 {shotDate && isValidDate(shotDate) ? shotDate.toLocaleString() : '（撮影日時なし）'}
                          {shotDate && isValidDate(shotDate) ? ` / 🕒 ${getTimeBand(shotDate)}` : ''}
                        </div>

                        <div style={{ fontSize: 12, color: '#ffd166' }}>{formatResultLine(r)}</div>

                        <div style={{ color: '#eee', overflowWrap: 'anywhere' }}>{r.memo || '（メモなし）'}</div>

                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                          {isMobile ? 'タップで詳細（タイド）を表示' : 'クリックで右に詳細'}
                        </div>
                      </div>
                    </button>
                  )
                })}

                {filtered.length > pageSize && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                    ※「表示件数」を増やすと、もっと下まで見れるよ（スクロール長くなるから段階にしてる）
                  </div>
                )}
              </div>
            )}
          </div>

          {!isMobile && (
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              {selected ? (
                <DetailView record={selected} />
              ) : (
                <div className="glass glass-strong" style={{ borderRadius: 16, padding: 12, color: 'rgba(255,255,255,0.72)' }}>
                  左の履歴を選択すると、ここにタイドグラフが出るよ
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {isMobile && (
        <BottomSheet
          open={sheetOpen}
          onClose={() => {
            setSheetOpen(false)
          }}
        >
          {selected ? <DetailView record={selected} /> : <div style={{ color: 'rgba(255,255,255,0.72)' }}>記録を選択してね</div>}
        </BottomSheet>
      )}
    </PageShell>
  )
}
