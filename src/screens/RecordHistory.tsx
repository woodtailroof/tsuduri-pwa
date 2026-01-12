// src/screens/RecordHistory.tsx

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import PageShell from '../components/PageShell'
import { db, type CatchRecord } from '../db'
import { exportCatches, importCatches } from '../lib/catchTransfer'
import { getTimeBand } from '../lib/timeband'

type Props = {
  back: () => void
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

export default function RecordHistory({ back }: Props) {
  const glassBoxStyle: CSSProperties = {
    borderRadius: 16,
    padding: 12,
    display: 'grid',
    gap: 10,
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

  const [all, setAll] = useState<CatchRecord[]>([])
  const [allLoading, setAllLoading] = useState(false)
  const [allLoadedOnce, setAllLoadedOnce] = useState(false)

  const [archivePageSize, setArchivePageSize] = useState<10 | 30 | 50>(30)
  const [archiveYear, setArchiveYear] = useState<string>('')
  const [archiveMonth, setArchiveMonth] = useState<string>('')

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

  async function onDelete(id?: number) {
    if (!id) return
    const ok = confirm('この記録を削除する？（戻せないよ）')
    if (!ok) return
    await db.catches.delete(id)
    await loadAll()
  }

  const ellipsis1: CSSProperties = {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  }

  return (
    <PageShell title={<h1 style={{ margin: 0, fontSize: 'clamp(20px, 6vw, 32px)', lineHeight: 1.15 }}>📚 全履歴</h1>} maxWidth={1100} showBack onBack={back}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => loadAll()} disabled={allLoading} title="全履歴を再読み込み">
            {allLoading ? '読み込み中…' : '↻ 全履歴更新'}
          </button>

          <button type="button" onClick={exportCatches} title="釣果（写真含む）をZIPで保存">
            📤 釣果をエクスポート
          </button>

          <label title="ZIPから釣果（写真含む）を復元（端末内データは置き換え）" style={{ cursor: 'pointer' }}>
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

        {allLoading && !allLoadedOnce ? (
          <p>読み込み中…</p>
        ) : all.length === 0 ? (
          <p>まだ記録がないよ</p>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 10 }}>
              {archiveList.map((r) => {
                const shotDate = r.capturedAt ? new Date(r.capturedAt) : null
                const created = new Date(r.createdAt)
                const thumbUrl = r.photoBlob ? URL.createObjectURL(r.photoBlob) : null

                return (
                  <div
                    key={r.id}
                    className="glass glass-strong"
                    style={{
                      borderRadius: 16,
                      padding: 12,
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

                      <div style={{ color: '#eee', overflowWrap: 'anywhere' }}>{r.memo || '（メモなし）'}</div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button
                          type="button"
                          onClick={() => onDelete(r.id)}
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
                        >
                          🗑 削除
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {filteredArchive.length > archivePageSize && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                ※「表示件数」を増やすと、もっと下まで見れるよ（スクロール長くなるから段階にしてる）
              </div>
            )}
          </>
        )}
      </div>
    </PageShell>
  )
}
