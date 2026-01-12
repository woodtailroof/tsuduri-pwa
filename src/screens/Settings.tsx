// src/screens/Settings.tsx
import { useEffect, useMemo, useState } from 'react'
import { FIXED_PORT } from '../points'
import {
  deleteTideCacheAll,
  deleteTideCacheByKey,
  deleteTideCacheOlderThan,
  forceRefreshTide736Day,
  getTideCacheStats,
  listTideCacheEntries,
} from '../lib/tide736Cache'
import type { TideCacheEntry } from '../db'
import PageShell from '../components/PageShell'

type Props = {
  back: () => void
}

function fmtIso(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function Settings({ back }: Props) {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null) // key or action
  const [stats, setStats] = useState<{
    count: number
    approxKB: number
    newestFetchedAt: string | null
    oldestFetchedAt: string | null
  } | null>(null)

  const [entries, setEntries] = useState<TideCacheEntry[]>([])
  const [limit, setLimit] = useState(50)
  const [olderThanDays, setOlderThanDays] = useState(60)

  // =========================
  // ✅ 透過 “Glass” スタイル群
  // =========================
  const glassCard: React.CSSProperties = {
    border: '1px solid rgba(255,255,255,0.16)',
    borderRadius: 14,
    padding: 12,
    background: 'rgba(15,15,15,0.45)',
    color: '#e8e8e8',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
  }

  const glassInset: React.CSSProperties = {
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 14,
    padding: 10,
    background: 'rgba(0,0,0,0.25)',
    color: '#e8e8e8',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
  }

  const uiBtnBase: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.16)',
    background: 'rgba(0,0,0,0.25)',
    color: '#eaeaea',
    cursor: 'pointer',
    lineHeight: 1.1,
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  }

  const uiBtnDisabled: React.CSSProperties = {
    ...uiBtnBase,
    opacity: 0.55,
    cursor: 'not-allowed',
  }

  const uiField: React.CSSProperties = {
    height: 36,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(0,0,0,0.22)',
    color: '#fff',
    padding: '0 10px',
    outline: 'none',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  }

  const hrStyle: React.CSSProperties = { margin: '6px 0', opacity: 0.18 }

  async function reload() {
    setLoading(true)
    try {
      const s = await getTideCacheStats()
      const list = await listTideCacheEntries({ limit })
      setStats(s)
      setEntries(list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit])

  const header = useMemo(() => {
    const pc = FIXED_PORT.pc
    const hc = FIXED_PORT.hc
    return `🌊 tide736キャッシュ管理（${FIXED_PORT.name} / pc:${pc} hc:${hc}）`
  }, [])

  return (
    <PageShell title={<h1 style={{ margin: 0 }}>⚙ 設定</h1>} maxWidth={1100} showBack onBack={back}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        {/* Top actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          {/* ✅ ここにあった戻るボタンは撤去（右上固定の戻るに統一） */}
        </div>

        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', overflowWrap: 'anywhere' }}>{header}</div>

        <hr style={hrStyle} />

        {/* Stats */}
        <h2 style={{ margin: 0 }}>📦 キャッシュ状況</h2>

        {loading && <div style={{ fontSize: 12, color: '#9ff3c7' }}>読み込み中…</div>}

        {!loading && stats && (
          <div style={{ ...glassCard, display: 'grid', gap: 6, maxWidth: 720 }}>
            <div>
              件数：<strong>{stats.count}</strong>
            </div>
            <div style={{ overflowWrap: 'anywhere', color: 'rgba(255,255,255,0.82)' }}>
              概算容量：<strong>{stats.approxKB} KB</strong>（seriesのJSON文字数＋潮名文字数から概算）
            </div>
            <div>
              最終更新：<strong>{fmtIso(stats.newestFetchedAt)}</strong>
            </div>
            <div>
              最古更新：<strong>{fmtIso(stats.oldestFetchedAt)}</strong>
            </div>
          </div>
        )}

        {/* Controls */}
        <div style={{ ...glassInset, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', minWidth: 0 }}>
          <button
            style={busy != null ? uiBtnDisabled : uiBtnBase}
            onClick={async () => {
              const ok = confirm('キャッシュを全削除する？（戻せないよ）')
              if (!ok) return
              setBusy('deleteAll')
              try {
                await deleteTideCacheAll()
                await reload()
                alert('キャッシュを全削除したよ')
              } finally {
                setBusy(null)
              }
            }}
            disabled={busy != null}
          >
            {busy === 'deleteAll' ? '削除中…' : '🧹 キャッシュ全削除'}
          </button>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>古いキャッシュ削除：</span>

            <input
              type="number"
              min={1}
              value={olderThanDays}
              onChange={(e) => setOlderThanDays(Number(e.target.value))}
              style={{ ...uiField, width: 90 }}
              disabled={busy != null}
            />

            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>日より古い</span>

            <button
              style={busy != null ? uiBtnDisabled : uiBtnBase}
              onClick={async () => {
                const ok = confirm(`${olderThanDays}日より古いキャッシュを削除する？`)
                if (!ok) return
                setBusy('deleteOld')
                try {
                  const n = await deleteTideCacheOlderThan(olderThanDays)
                  await reload()
                  alert(`古いキャッシュを ${n} 件削除したよ`)
                } finally {
                  setBusy(null)
                }
              }}
              disabled={busy != null}
            >
              {busy === 'deleteOld' ? '削除中…' : '🗑 実行'}
          </button>
          </div>

          <button style={busy != null ? uiBtnDisabled : uiBtnBase} onClick={reload} disabled={busy != null}>
            🔄 更新
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>表示件数：</span>
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ ...uiField, width: 96 }} disabled={busy != null}>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        <hr style={hrStyle} />

        {/* List */}
        <h2 style={{ margin: 0 }}>📄 キャッシュ一覧</h2>

        {(!entries || entries.length === 0) && !loading ? (
          <div style={{ color: 'rgba(255,255,255,0.65)' }}>キャッシュはまだ無いよ</div>
        ) : (
          <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
            {entries.map((e) => {
              const label = `${e.day} （pc:${e.pc} / hc:${e.hc}）`
              const refreshKey = `refresh:${e.key}`

              return (
                <div key={e.key} style={{ ...glassCard, display: 'grid', gap: 6, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
                    <div style={{ fontWeight: 800, overflowWrap: 'anywhere' }}>{label}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{fmtIso(e.fetchedAt)}</div>
                  </div>

                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
                    series：{Array.isArray(e.series) ? e.series.length : 0} 点
                  </div>

                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>潮名：{e.tideName ? e.tideName : '—'}</div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
                    <button
                      style={busy != null ? uiBtnDisabled : uiBtnBase}
                      onClick={async () => {
                        const ok = confirm(`${label} のキャッシュを削除する？`)
                        if (!ok) return
                        setBusy(e.key)
                        try {
                          await deleteTideCacheByKey(e.key)
                          await reload()
                        } finally {
                          setBusy(null)
                        }
                      }}
                      disabled={busy != null}
                    >
                      {busy === e.key ? '処理中…' : '🗑 削除'}
                    </button>

                    <button
                      style={busy != null ? uiBtnDisabled : uiBtnBase}
                      onClick={async () => {
                        const ok = confirm(`${label} を再取得する？（キャッシュ無視）`)
                        if (!ok) return
                        setBusy(refreshKey)
                        try {
                          const d = new Date(`${e.day}T00:00:00`)
                          await forceRefreshTide736Day(e.pc, e.hc, d)
                          await reload()
                          alert('再取得したよ')
                        } catch (err) {
                          console.error(err)
                          alert('再取得に失敗したよ…（ネット状況も確認してね）')
                        } finally {
                          setBusy(null)
                        }
                      }}
                      disabled={busy != null}
                    >
                      {busy === refreshKey ? '再取得中…' : '🌊 再取得'}
                    </button>

                    <div
                      style={{
                        marginLeft: 'auto',
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.45)',
                        overflowWrap: 'anywhere',
                        minWidth: 0,
                      }}
                    >
                      key: {e.key}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.62)' }}>
          ※「概算容量」は正確なIndexedDB使用量ではなく、seriesのJSON文字数＋潮名文字数からの目安だよ
        </div>
      </div>
    </PageShell>
  )
}
