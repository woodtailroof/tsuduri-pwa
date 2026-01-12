// src/screens/Settings.tsx
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
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
import { CHARACTER_OPTIONS, DEFAULT_SETTINGS, useAppSettings } from '../lib/appSettings'

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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export default function Settings({ back }: Props) {
  const { settings, set, reset } = useAppSettings()

  // 既存：キャッシュ管理系
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null) // key or action
  const [stats, setStats] = useState<{
    count: number
    approxKB: number
    newestFetchedAt: string | null
    oldestFetchedAt: string | null
  } | null>(null)
  const [entries, setEntries] = useState<TideCacheEntry[]>([])
  const [days, setDays] = useState<30 | 60 | 90 | 180>(30)

  // 共通UI
  const pill: CSSProperties = {
    borderRadius: 999,
    padding: '10px 12px',
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(0,0,0,0.24)',
    color: 'rgba(255,255,255,0.82)',
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

  const pillDisabled: CSSProperties = {
    ...pill,
    opacity: 0.55,
    cursor: 'not-allowed',
  }

  const sectionTitle: CSSProperties = {
    margin: 0,
    fontSize: 16,
    fontWeight: 900,
  }

  async function refresh() {
    setLoading(true)
    try {
      const s = await getTideCacheStats()
      setStats(s)
      const list = await listTideCacheEntries()
      setEntries(list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const approxMB = useMemo(() => {
    const kb = stats?.approxKB ?? 0
    return Math.round((kb / 1024) * 100) / 100
  }, [stats])

  // ✅「N日前より前」を Date に変換（deleteTideCacheOlderThan が Date 想定のため）
  const cutoffDate = useMemo(() => {
    const ms = Date.now() - days * 24 * 60 * 60 * 1000
    return new Date(ms)
  }, [days])

  return (
    <PageShell
      title={<h1 style={{ margin: 0, fontSize: 'clamp(20px, 5.5vw, 32px)' }}>⚙ 総合設定</h1>}
      subtitle={
        <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.72)' }}>
          ここで「キャラ」「見た目」「キャッシュ」をまとめて調整できるよ。
        </div>
      }
      maxWidth={980}
      showBack
      onBack={back}
    >
      <div style={{ display: 'grid', gap: 16 }}>
        {/* =======================
            👧 キャラ
        ======================= */}
        <div className="glass glass-strong" style={{ borderRadius: 16, padding: 14, display: 'grid', gap: 12 }}>
          <h2 style={sectionTitle}>👧 キャラクター</h2>

          <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={settings.characterEnabled}
              onChange={(e) => set({ characterEnabled: e.target.checked })}
            />
            <span style={{ color: 'rgba(255,255,255,0.85)' }}>キャラを表示する</span>
          </label>

          <div style={{ display: 'grid', gap: 10, opacity: settings.characterEnabled ? 1 : 0.5 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>切替：</div>

              <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="characterMode"
                  checked={settings.characterMode === 'fixed'}
                  disabled={!settings.characterEnabled}
                  onChange={() => set({ characterMode: 'fixed' })}
                />
                <span>固定</span>
              </label>

              <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="characterMode"
                  checked={settings.characterMode === 'random'}
                  disabled={!settings.characterEnabled}
                  onChange={() => set({ characterMode: 'random' })}
                />
                <span>ランダム（画面遷移ごと）</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>固定キャラ：</div>

              <select
                value={settings.fixedCharacterId}
                disabled={!settings.characterEnabled || settings.characterMode !== 'fixed'}
                onChange={(e) => set({ fixedCharacterId: e.target.value })}
              >
                {CHARACTER_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>

              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                ※チャット画面と連動させるのも、この仕組みを土台にできるよ
              </div>
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>大きさ</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)' }}>{Math.round(settings.characterScale * 100)}%</div>
              </div>
              <input
                type="range"
                min={0.7}
                max={2.0}
                step={0.05}
                disabled={!settings.characterEnabled}
                value={settings.characterScale}
                onChange={(e) => set({ characterScale: clamp(Number(e.target.value), 0.7, 2.0) })}
              />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                目安：スマホは 120%〜160% あたりが「推し」が効きやすい
              </div>
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>不透明度</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)' }}>{Math.round(settings.characterOpacity * 100)}%</div>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                disabled={!settings.characterEnabled}
                value={settings.characterOpacity}
                onChange={(e) => set({ characterOpacity: clamp(Number(e.target.value), 0, 1) })}
              />
            </div>
          </div>
        </div>

        {/* =======================
            🪟 表示
        ======================= */}
        <div className="glass glass-strong" style={{ borderRadius: 16, padding: 14, display: 'grid', gap: 12 }}>
          <h2 style={sectionTitle}>🪟 表示</h2>

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>背景の暗幕（bgDim）</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)' }}>{Math.round(settings.bgDim * 100)}%</div>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={settings.bgDim}
              onChange={(e) => set({ bgDim: clamp(Number(e.target.value), 0, 1) })}
            />
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
              低いほど「背景映え」/ 高いほど「情報が読みやすい」
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>背景ぼかし（bgBlur）</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)' }}>{settings.bgBlur}px</div>
            </div>
            <input
              type="range"
              min={0}
              max={24}
              step={1}
              value={settings.bgBlur}
              onChange={(e) => set({ bgBlur: clamp(Number(e.target.value), 0, 24) })}
            />
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>情報レイヤーの「板」（透過）</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)' }}>{Math.round(settings.infoPanelAlpha * 100)}%</div>
            </div>
            <input
              type="range"
              min={0}
              max={0.85}
              step={0.05}
              value={settings.infoPanelAlpha}
              onChange={(e) => set({ infoPanelAlpha: clamp(Number(e.target.value), 0, 1) })}
            />
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
              文字は薄くせず、背面だけ敷くよ（読みやすさアップ）
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" style={pill} onClick={() => set({ bgDim: 0.45, infoPanelAlpha: 0 })}>
              🎨 背景寄り
            </button>
            <button type="button" style={pill} onClick={() => set({ bgDim: 0.55, infoPanelAlpha: 0.15 })}>
              ⚖ 標準
            </button>
            <button type="button" style={pill} onClick={() => set({ bgDim: 0.68, infoPanelAlpha: 0.25 })}>
              📖 読みやすさ寄り
            </button>
          </div>
        </div>

        {/* =======================
            🌊 キャッシュ（既存機能）
        ======================= */}
        <div className="glass glass-strong" style={{ borderRadius: 16, padding: 14, display: 'grid', gap: 12 }}>
          <h2 style={sectionTitle}>🌊 tide736 キャッシュ</h2>

          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>
            基準：{FIXED_PORT.name}（pc:{FIXED_PORT.pc} / hc:{FIXED_PORT.hc}）
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              style={loading || !!busy ? pillDisabled : pill}
              disabled={loading || !!busy}
              onClick={() => refresh()}
              title="キャッシュ状況を再読込"
            >
              ↻ 更新
            </button>

            <button
              type="button"
              style={!!busy ? pillDisabled : pill}
              disabled={!!busy}
              onClick={async () => {
                const ok = confirm('tide736 キャッシュをすべて削除する？（戻せない）')
                if (!ok) return
                setBusy('deleteAll')
                try {
                  await deleteTideCacheAll()
                  await refresh()
                  alert('全部消したよ')
                } finally {
                  setBusy(null)
                }
              }}
              title="キャッシュ全削除"
            >
              🗑 全削除
            </button>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>古いの削除：</span>
              <select value={days} onChange={(e) => setDays(Number(e.target.value) as any)}>
                <option value={30}>30日</option>
                <option value={60}>60日</option>
                <option value={90}>90日</option>
                <option value={180}>180日</option>
              </select>
              <button
                type="button"
                style={!!busy ? pillDisabled : pill}
                disabled={!!busy}
                onClick={async () => {
                  setBusy('deleteOld')
                  try {
                    // ✅ ここが修正点：Date を渡す
                    await deleteTideCacheOlderThan(cutoffDate)
                    await refresh()
                    alert(`古いキャッシュ（${days}日より前）を削除したよ`)
                  } finally {
                    setBusy(null)
                  }
                }}
                title={`cutoff: ${cutoffDate.toISOString()}`}
              >
                実行
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
              {stats
                ? `件数: ${stats.count} / 容量(概算): ${stats.approxKB}KB（約 ${approxMB}MB）`
                : loading
                  ? '読み込み中…'
                  : '—'}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)' }}>
              newest: {fmtIso(stats?.newestFetchedAt ?? null)} / oldest: {fmtIso(stats?.oldestFetchedAt ?? null)}
            </div>
          </div>

          <hr style={{ opacity: 0.2 }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontWeight: 800 }}>キャッシュ一覧</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
              ※ 1行ずつ削除 or 日付を強制再取得できるよ
            </div>
          </div>

          {entries.length === 0 ? (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{loading ? '読み込み中…' : 'キャッシュがまだ無いよ'}</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {entries.slice(0, 80).map((e) => (
                <div
                  key={e.key}
                  style={{
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.14)',
                    background: 'rgba(255,255,255,0.06)',
                    padding: 10,
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', overflowWrap: 'anywhere' }}>
                      {e.day}（{e.pc}:{e.hc}）
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>fetched: {fmtIso(e.fetchedAt)}</div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      style={busy === e.key ? pillDisabled : pill}
                      disabled={busy === e.key}
                      onClick={async () => {
                        const ok = confirm(`このキャッシュを削除する？\n${e.key}`)
                        if (!ok) return
                        setBusy(e.key)
                        try {
                          await deleteTideCacheByKey(e.key)
                          await refresh()
                        } finally {
                          setBusy(null)
                        }
                      }}
                    >
                      🗑 削除
                    </button>

                    <button
                      type="button"
                      style={busy === `force:${e.key}` ? pillDisabled : pill}
                      disabled={busy === `force:${e.key}`}
                      onClick={async () => {
                        const ok = confirm(`この日を強制再取得する？（オンライン必須）\n${e.day}`)
                        if (!ok) return
                        setBusy(`force:${e.key}`)
                        try {
                          await forceRefreshTide736Day(e.pc, e.hc, e.day)
                          await refresh()
                          alert('再取得したよ')
                        } catch (err) {
                          console.error(err)
                          alert('再取得に失敗…（オフライン or 制限の可能性）')
                        } finally {
                          setBusy(null)
                        }
                      }}
                    >
                      ↻ 強制再取得
                    </button>

                    {e.tideName != null && (
                      <div style={{ fontSize: 12, color: '#ffd166', display: 'inline-flex', alignItems: 'center' }}>
                        🌙 {e.tideName}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {entries.length > 80 && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                  ※ 多すぎると重くなるから、とりあえず先頭80件まで表示してるよ（必要ならページングする）
                </div>
              )}
            </div>
          )}
        </div>

        {/* =======================
            🔁 全リセット
        ======================= */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            style={pill}
            onClick={() => {
              const ok = confirm('表示/キャラ設定を初期値に戻す？（キャッシュは触らない）')
              if (!ok) return
              reset()
              alert('初期値に戻したよ')
            }}
          >
            🔁 表示/キャラを初期化
          </button>

          <button
            type="button"
            style={pill}
            onClick={() => {
              set(DEFAULT_SETTINGS)
              alert('設定を保存し直したよ')
            }}
            title="設定を正規化して保存し直す"
          >
            ✅ 設定を保存し直す
          </button>
        </div>
      </div>
    </PageShell>
  )
}
