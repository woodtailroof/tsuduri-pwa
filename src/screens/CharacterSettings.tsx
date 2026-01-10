// src/screens/CharacterSettings.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import PageShell from '../components/PageShell'

export type ReplyLength = 'short' | 'medium' | 'long'

export type CharacterProfile = {
  id: string
  name: string
  selfName?: string
  callUser?: string
  replyLength?: ReplyLength
  description?: string
  color?: string
}

// ✅ 既存キー（プロジェクト内で参照されてる前提）
export const CHARACTERS_STORAGE_KEY = 'tsuduri_characters_v2'
export const SELECTED_CHARACTER_ID_KEY = 'tsuduri_selected_character_id_v2'

// ✅ 既存（rate）はすでに使ってる前提
export const ALLHANDS_BANTER_RATE_KEY = 'tsuduri_allhands_banter_rate_v1'

// ✅ 新規：ON/OFF をキャラ管理へ移動
export const ALLHANDS_BANTER_ENABLED_KEY = 'tsuduri_allhands_banter_enabled_v1'

// ちょい保険
const BACKUP_KEY = 'tsuduri_characters_backup_v1'

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function uid() {
  return `c_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

function normalizeColor(s: string) {
  const t = (s ?? '').trim()
  if (!t) return '#ff7aa2'
  return t
}

function defaultCharacter(): CharacterProfile {
  return {
    id: uid(),
    name: '新しい釣嫁',
    selfName: 'わたし',
    callUser: 'ひろっち',
    replyLength: 'medium',
    description: '性格・口調・距離感などを書いてね。',
    color: '#ff7aa2',
  }
}

function safeLoadCharacters(): CharacterProfile[] {
  const list = safeJsonParse<CharacterProfile[]>(localStorage.getItem(CHARACTERS_STORAGE_KEY), [])
  if (Array.isArray(list) && list.length) return list
  return [
    {
      id: 'tsuduri',
      name: '釣嫁つづり',
      selfName: 'つづり',
      callUser: 'ひろっち',
      replyLength: 'medium',
      description: '元気で可愛い、少し甘え＆少し世話焼き。釣りは現実的に頼れる相棒。説教しない。危ないことは心配として止める。',
      color: '#ff7aa2',
    },
  ]
}

function safeSaveCharacters(list: CharacterProfile[]) {
  try {
    localStorage.setItem(CHARACTERS_STORAGE_KEY, JSON.stringify(list))
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ at: new Date().toISOString(), list }))
  } catch {
    // ignore
  }
}

function safeLoadSelectedId(fallback: string) {
  try {
    const raw = localStorage.getItem(SELECTED_CHARACTER_ID_KEY)
    return raw && raw.trim() ? raw : fallback
  } catch {
    return fallback
  }
}

function safeSaveSelectedId(id: string) {
  try {
    localStorage.setItem(SELECTED_CHARACTER_ID_KEY, id)
  } catch {
    // ignore
  }
}

function safeLoadBanterEnabled() {
  try {
    const raw = localStorage.getItem(ALLHANDS_BANTER_ENABLED_KEY)
    if (raw == null) return true
    return raw === '1' || raw === 'true'
  } catch {
    return true
  }
}

function safeSaveBanterEnabled(v: boolean) {
  try {
    localStorage.setItem(ALLHANDS_BANTER_ENABLED_KEY, v ? '1' : '0')
  } catch {
    // ignore
  }
}

function safeLoadBanterRate() {
  try {
    const raw = localStorage.getItem(ALLHANDS_BANTER_RATE_KEY)
    if (raw == null) return 35
    const n = Number(raw)
    if (!Number.isFinite(n)) return 35
    return clamp(Math.round(n), 0, 100)
  } catch {
    return 35
  }
}

function safeSaveBanterRate(n: number) {
  try {
    localStorage.setItem(ALLHANDS_BANTER_RATE_KEY, String(clamp(Math.round(n), 0, 100)))
  } catch {
    // ignore
  }
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 500)
}

export default function CharacterSettings({ back }: { back: () => void }) {
  const [list, setList] = useState<CharacterProfile[]>(() => safeLoadCharacters())
  const [selectedId, setSelectedId] = useState<string>(() => safeLoadSelectedId(safeLoadCharacters()[0]?.id ?? 'tsuduri'))

  const [banterEnabled, setBanterEnabled] = useState<boolean>(() => safeLoadBanterEnabled())
  const [banterRate, setBanterRate] = useState<number>(() => safeLoadBanterRate())

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const selected = useMemo(() => list.find((c) => c.id === selectedId) ?? list[0], [list, selectedId])

  useEffect(() => {
    if (!list.length) {
      const next = safeLoadCharacters()
      setList(next)
      setSelectedId(next[0]?.id ?? 'tsuduri')
      return
    }
    const exists = list.some((c) => c.id === selectedId)
    if (!exists) setSelectedId(list[0]?.id ?? 'tsuduri')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list])

  useEffect(() => {
    safeSaveSelectedId(selectedId)
  }, [selectedId])

  useEffect(() => {
    safeSaveBanterEnabled(banterEnabled)
  }, [banterEnabled])

  useEffect(() => {
    safeSaveBanterRate(banterRate)
  }, [banterRate])

  function updateSelected(patch: Partial<CharacterProfile>) {
    setList((prev) =>
      prev.map((c) => {
        if (c.id !== selectedId) return c
        return { ...c, ...patch }
      })
    )
  }

  function createNew() {
    const c = defaultCharacter()
    const next = [c, ...list]
    setList(next)
    setSelectedId(c.id)
  }

  function duplicate() {
    if (!selected) return
    const copy: CharacterProfile = {
      ...selected,
      id: uid(),
      name: `${selected.name}（複製）`,
    }
    const next = [copy, ...list]
    setList(next)
    setSelectedId(copy.id)
  }

  function removeSelected() {
    if (!selected) return
    const ok = confirm(`「${selected.name}」を削除する？（戻せないよ）`)
    if (!ok) return
    const next = list.filter((c) => c.id !== selected.id)
    setList(next)
    setSelectedId(next[0]?.id ?? '')
  }

  function saveOnly() {
    const fixed = list.map((c) => ({
      ...c,
      name: (c.name ?? '').trim() || '（無名）',
      selfName: (c.selfName ?? '').trim(),
      callUser: (c.callUser ?? '').trim(),
      replyLength: (c.replyLength ?? 'medium') as ReplyLength,
      description: String(c.description ?? ''),
      color: normalizeColor(String(c.color ?? '#ff7aa2')),
    }))
    safeSaveCharacters(fixed)
    alert('保存したよ！')
  }

  function saveAndBack() {
    const fixed = list.map((c) => ({
      ...c,
      name: (c.name ?? '').trim() || '（無名）',
      selfName: (c.selfName ?? '').trim(),
      callUser: (c.callUser ?? '').trim(),
      replyLength: (c.replyLength ?? 'medium') as ReplyLength,
      description: String(c.description ?? ''),
      color: normalizeColor(String(c.color ?? '#ff7aa2')),
    }))
    safeSaveCharacters(fixed)
    back()
  }

  function exportJson() {
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      characters: list,
      selectedId,
      allhands: { banterEnabled, banterRate },
    }
    downloadText(`tsuduri_characters_export_${Date.now()}.json`, JSON.stringify(payload, null, 2))
  }

  async function importJson(file: File) {
    const text = await file.text()
    const parsed = safeJsonParse<any>(text, null)

    // 形式ゆるめ対応
    const importedList: CharacterProfile[] =
      parsed?.characters && Array.isArray(parsed.characters)
        ? parsed.characters
        : Array.isArray(parsed)
          ? parsed
          : []

    if (!importedList.length) {
      alert('インポート失敗：形式が違うかも')
      return
    }

    const ok = confirm('インポートすると、現在のキャラ一覧は置き換えになるよ。続ける？')
    if (!ok) return

    const cleaned = importedList
      .filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string')
      .map((c) => ({
        id: String(c.id),
        name: String(c.name),
        selfName: typeof c.selfName === 'string' ? c.selfName : 'わたし',
        callUser: typeof c.callUser === 'string' ? c.callUser : 'ひろっち',
        replyLength: (c.replyLength as ReplyLength) ?? 'medium',
        description: typeof c.description === 'string' ? c.description : '',
        color: normalizeColor(typeof c.color === 'string' ? c.color : '#ff7aa2'),
      }))

    setList(cleaned)
    setSelectedId(parsed?.selectedId && typeof parsed.selectedId === 'string' ? parsed.selectedId : cleaned[0]?.id ?? cleaned[0].id)

    // 掛け合い設定も一緒に入ってたら反映
    const be = parsed?.allhands?.banterEnabled
    const br = parsed?.allhands?.banterRate
    if (typeof be === 'boolean') setBanterEnabled(be)
    if (Number.isFinite(Number(br))) setBanterRate(clamp(Number(br), 0, 100))

    safeSaveCharacters(cleaned)
    alert('インポート完了！')
  }

  function restoreFromBackup() {
    const raw = localStorage.getItem(BACKUP_KEY)
    const parsed = safeJsonParse<any>(raw, null)
    const backupList = parsed?.list
    if (!Array.isArray(backupList) || !backupList.length) {
      alert('バックアップが見つからないよ')
      return
    }
    const ok = confirm('直近バックアップから復元する？（現在の内容は上書き）')
    if (!ok) return
    setList(backupList as CharacterProfile[])
    const firstId = (backupList[0] as any)?.id
    setSelectedId(typeof firstId === 'string' ? firstId : selectedId)
    safeSaveCharacters(backupList as CharacterProfile[])
    alert('復元したよ！')
  }

  // ===== 透過UI共通 =====
  const glassCard: React.CSSProperties = {
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(0,0,0,0.18)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 14,
  }

  const sectionTitle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255,255,255,0.60)',
    marginBottom: 6,
  }

  const smallHint: React.CSSProperties = {
    fontSize: 11,
    color: 'rgba(255,255,255,0.50)',
    lineHeight: 1.6,
  }

  const btn: React.CSSProperties = {
    width: '100%',
    textAlign: 'center',
    padding: '10px 12px',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.90)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    cursor: 'pointer',
  }

  const btnRow: React.CSSProperties = {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(0,0,0,0.22)',
    color: '#fff',
    padding: '10px 12px',
    outline: 'none',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    paddingRight: 34,
  }

  return (
    <PageShell
      title={
        <div>
          <h1 style={{ margin: 0 }}>🎭 キャラ管理</h1>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 6, lineHeight: 1.6 }}>
            ※キャラはローカル（端末ごと）に保存されます。別端末へはエクスポート/インポートで移せるよ。
          </div>
        </div>
      }
      maxWidth={1100}
      showBack
      onBack={back}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14, alignItems: 'start', minWidth: 0 }}>
        {/* 左：操作＆一覧 */}
        <div style={{ ...glassCard, padding: 12, minWidth: 0 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <button type="button" onClick={createNew} style={btn}>
              ➕ 新規
            </button>
            <button type="button" onClick={duplicate} style={btn}>
              🧬 複製
            </button>
            <button type="button" onClick={removeSelected} style={btn}>
              🗑 選択中を削除
            </button>

            <div style={{ height: 1, background: 'rgba(255,255,255,0.10)', margin: '2px 0' }} />

            <button type="button" onClick={exportJson} style={btn}>
              📦 エクスポート
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={btn}
              title="JSONをインポートしてキャラ一覧を置き換え"
            >
              📥 インポート
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.currentTarget.value = ''
                if (!f) return
                await importJson(f)
              }}
            />

            <button type="button" onClick={restoreFromBackup} style={{ ...btn, opacity: 0.9 }}>
              🛟 直近バックアップから復元
            </button>

            <div style={{ ...smallHint }}>
              保存先: localStorage key = {CHARACTERS_STORAGE_KEY} / 選択中 = {SELECTED_CHARACTER_ID_KEY}
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.10)', margin: '12px 0' }} />

          <div style={sectionTitle}>キャラ一覧（クリックで選択）</div>

          <div style={{ display: 'grid', gap: 10 }}>
            {list.map((c) => {
              const isSel = c.id === selectedId
              const color = normalizeColor(c.color ?? '#ff7aa2')
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    borderRadius: 14,
                    border: isSel ? `1px solid rgba(255,77,109,0.65)` : '1px solid rgba(255,255,255,0.12)',
                    background: isSel ? 'rgba(255,77,109,0.12)' : 'rgba(0,0,0,0.16)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    padding: 12,
                    cursor: 'pointer',
                    color: '#fff',
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: color,
                        boxShadow: '0 0 0 4px rgba(255,255,255,0.06)',
                        flex: '0 0 auto',
                      }}
                    />
                    <div style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {c.name}
                    </div>
                  </div>

                  <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>
                    一人称: {c.selfName || '—'} / 呼称: {c.callUser || '—'}
                    <br />
                    長さ: {c.replyLength || 'medium'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* 右：編集 */}
        <div style={{ ...glassCard, padding: 12, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
              選択中： <strong style={{ color: '#fff' }}>{selected?.name ?? '—'}</strong>
            </div>

            <div style={btnRow}>
              <button type="button" onClick={saveOnly} style={{ ...btn, width: 'auto', padding: '10px 14px' }}>
                💾 保存
              </button>
              <button type="button" onClick={saveAndBack} style={{ ...btn, width: 'auto', padding: '10px 14px' }}>
                ✅ 保存して戻る
              </button>
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.10)', margin: '12px 0' }} />

          {/* ✅ 全員集合：掛け合い設定（ここに移動） */}
          <div style={{ ...glassCard, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 900 }}>🗣 全員集合：掛け合い</div>
                <div style={smallHint}>全員集合モードで「後ろ2人が感想係になる」挙動のON/OFFと頻度。</div>
              </div>

              <button
                type="button"
                onClick={() => setBanterEnabled((v) => !v)}
                style={{
                  ...btn,
                  width: 'auto',
                  padding: '10px 14px',
                  border: banterEnabled ? '1px solid rgba(255,77,109,0.65)' : '1px solid rgba(255,255,255,0.14)',
                  background: banterEnabled ? 'rgba(255,77,109,0.14)' : 'rgba(255,255,255,0.06)',
                }}
                title="掛け合い ON/OFF"
              >
                {banterEnabled ? '🗣 掛け合い：ON' : '🤐 掛け合い：OFF'}
              </button>
            </div>

            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)' }}>頻度</div>
              <input
                type="range"
                min={0}
                max={100}
                value={banterRate}
                onChange={(e) => setBanterRate(Number(e.target.value))}
                style={{ width: 220 }}
                disabled={!banterEnabled}
              />
              <div style={{ width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: banterEnabled ? '#fff' : 'rgba(255,255,255,0.45)' }}>
                {banterRate}%
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.10)', margin: '12px 0' }} />

          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 12, minWidth: 0 }}>
              <div style={{ minWidth: 0 }}>
                <div style={sectionTitle}>名前（表示名）</div>
                <input value={selected?.name ?? ''} onChange={(e) => updateSelected({ name: e.target.value })} style={inputStyle} />
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sectionTitle}>自称（一人称）</div>
                <input value={selected?.selfName ?? ''} onChange={(e) => updateSelected({ selfName: e.target.value })} style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 12, minWidth: 0 }}>
              <div style={{ minWidth: 0 }}>
                <div style={sectionTitle}>ユーザー呼び</div>
                <input value={selected?.callUser ?? ''} onChange={(e) => updateSelected({ callUser: e.target.value })} style={inputStyle} />
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sectionTitle}>返答の長さ</div>
                <div style={{ position: 'relative' }}>
                  <select
                    value={(selected?.replyLength ?? 'medium') as ReplyLength}
                    onChange={(e) => updateSelected({ replyLength: e.target.value as ReplyLength })}
                    style={selectStyle}
                  >
                    <option value="short">短め</option>
                    <option value="medium">標準</option>
                    <option value="long">長め</option>
                  </select>
                  <span
                    style={{
                      position: 'absolute',
                      right: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                      color: 'rgba(255,255,255,0.55)',
                      fontSize: 12,
                    }}
                  >
                    ▼
                  </span>
                </div>
                <div style={{ marginTop: 6, ...smallHint }}>※max_output_tokens に直結（体感差が出る）</div>
              </div>
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={sectionTitle}>テーマカラー</div>
              <input
                value={selected?.color ?? ''}
                onChange={(e) => updateSelected({ color: e.target.value })}
                style={inputStyle}
                placeholder="#ff7aa2"
              />
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ ...smallHint }}>プレビュー</span>
                <span
                  aria-hidden="true"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    background: normalizeColor(selected?.color ?? '#ff7aa2'),
                    boxShadow: '0 0 0 4px rgba(255,255,255,0.06)',
                  }}
                />
              </div>
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={sectionTitle}>キャラクター設定（自由記述）</div>
              <textarea
                value={selected?.description ?? ''}
                onChange={(e) => updateSelected({ description: e.target.value })}
                rows={10}
                style={{
                  ...inputStyle,
                  resize: 'vertical',
                  minHeight: 220,
                  lineHeight: 1.7,
                }}
              />
              <div style={{ marginTop: 6, ...smallHint }}>コツ：ルールを増やしすぎず、“雰囲気”を先に書くと安定しやすいよ。</div>
            </div>

            <div style={{ ...smallHint }}>
              保存先: localStorage key = {CHARACTERS_STORAGE_KEY} / 選択中 = {SELECTED_CHARACTER_ID_KEY}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
