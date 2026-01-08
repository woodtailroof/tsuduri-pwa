// src/screens/CharacterSettings.tsx
import { useEffect, useMemo, useState } from 'react'

type Props = {
  back: () => void
}

export type ReplyLength = 'short' | 'medium' | 'long'

export type CharacterProfile = {
  id: string
  name: string // 表示名（キャラ名）
  selfName: string // 一人称
  callUser: string // ユーザー呼称
  replyLength: ReplyLength // 返答の長さ
  description: string // 自由記述（人格の核）

  // ✅ 追加：バッジ/枠線用カラー
  color?: string // '#RRGGBB'
}

// ✅ 全員集合の掛け合い頻度（%）を保存するキー（既に実装済みならそのままでOK）
export const ALLHANDS_BANTER_RATE_KEY = 'tsuduri_allhands_banter_rate_v1'

export const CHARACTERS_STORAGE_KEY = 'tsuduri_characters_v2'
export const SELECTED_CHARACTER_ID_KEY = 'tsuduri_selected_character_id_v2'

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

const DEFAULT_CHARACTER: CharacterProfile = {
  id: 'tsuduri',
  name: '釣嫁つづり',
  selfName: 'つづり',
  callUser: 'ひろっち',
  replyLength: 'medium',
  color: '#ff7aa2',
  description:
    '元気で可愛い、少し甘え＆少し世話焼き。釣りは現実的に頼れる相棒。説教しない。危ないことは心配として止める。返答は会話っぽく、たまに軽い冗談。',
}

function normalizeHexColor(s: any, fallback: string) {
  const v = String(s ?? '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v
  return fallback
}

/**
 * ✅ UI編集用 normalize
 * - 「空文字を許す」ことで、最後の1文字を消してもデフォルトが復活しない
 * - ただし replyLength / id / color は最低限整形する
 */
function normalizeCharacterForDraft(x: any): CharacterProfile {
  const base = DEFAULT_CHARACTER
  const replyLength: ReplyLength =
    x?.replyLength === 'short' || x?.replyLength === 'medium' || x?.replyLength === 'long' ? x.replyLength : base.replyLength

  return {
    id: typeof x?.id === 'string' && x.id.trim() ? x.id : uid(),

    // ✅ ここがポイント：空でもOK（UIの入力を邪魔しない）
    name: typeof x?.name === 'string' ? x.name : '',
    selfName: typeof x?.selfName === 'string' ? x.selfName : '',
    callUser: typeof x?.callUser === 'string' ? x.callUser : '',
    description: typeof x?.description === 'string' ? x.description : '',

    replyLength,
    color: normalizeHexColor(x?.color, base.color ?? '#ff7aa2'),
  }
}

/**
 * ✅ 保存/実運用用 normalize
 * - 最終的に空ならデフォルトで埋める（壊れた状態で保存しない）
 */
function normalizeCharacterForSave(x: any): CharacterProfile {
  const draft = normalizeCharacterForDraft(x)
  const base = DEFAULT_CHARACTER

  return {
    ...draft,
    name: draft.name.trim() ? draft.name : base.name,
    selfName: draft.selfName.trim() ? draft.selfName : base.selfName,
    callUser: draft.callUser.trim() ? draft.callUser : base.callUser,
    description: typeof x?.description === 'string' ? x.description : base.description,
    color: normalizeHexColor(draft.color, base.color ?? '#ff7aa2'),
  }
}

function safeLoadCharacters(): CharacterProfile[] {
  try {
    const raw = localStorage.getItem(CHARACTERS_STORAGE_KEY)
    if (!raw) return [DEFAULT_CHARACTER]
    const j = JSON.parse(raw)
    if (!Array.isArray(j)) return [DEFAULT_CHARACTER]

    const list = j.map((c: any) => normalizeCharacterForSave(c))

    // id 重複を軽く除去
    const seen = new Set<string>()
    const uniq: CharacterProfile[] = []
    for (const c of list) {
      if (seen.has(c.id)) continue
      seen.add(c.id)
      uniq.push(c)
    }
    return uniq.length ? uniq : [DEFAULT_CHARACTER]
  } catch {
    return [DEFAULT_CHARACTER]
  }
}

function safeSaveCharacters(chars: CharacterProfile[]) {
  try {
    localStorage.setItem(CHARACTERS_STORAGE_KEY, JSON.stringify(chars))
  } catch {
    // ignore
  }
}

function safeLoadSelectedId(fallback: string) {
  try {
    const raw = localStorage.getItem(SELECTED_CHARACTER_ID_KEY)
    if (raw && raw.trim()) return raw
  } catch {
    // ignore
  }
  return fallback
}

function safeSaveSelectedId(id: string) {
  try {
    localStorage.setItem(SELECTED_CHARACTER_ID_KEY, id)
  } catch {
    // ignore
  }
}

function isSame(a: CharacterProfile, b: CharacterProfile) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export default function CharacterSettings({ back }: Props) {
  const [characters, setCharacters] = useState<CharacterProfile[]>(() => safeLoadCharacters())
  const [selectedId, setSelectedId] = useState<string>(() => {
    const initial = safeLoadCharacters()
    return safeLoadSelectedId(initial[0]?.id ?? DEFAULT_CHARACTER.id)
  })

  const selected = useMemo(() => characters.find((c) => c.id === selectedId) ?? characters[0], [characters, selectedId])

  const [saved, setSaved] = useState<CharacterProfile>(() => selected ?? DEFAULT_CHARACTER)
  const [draft, setDraft] = useState<CharacterProfile>(() => normalizeCharacterForDraft(selected ?? DEFAULT_CHARACTER))

  // 選択が変わったら編集対象も切り替える
  useEffect(() => {
    const cur = characters.find((c) => c.id === selectedId) ?? characters[0]
    if (!cur) return
    setSaved(cur)
    setDraft(normalizeCharacterForDraft(cur))
    safeSaveSelectedId(cur.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  // characters が変わったら保存
  useEffect(() => {
    safeSaveCharacters(characters)
  }, [characters])

  const dirty = useMemo(() => !isSame(saved, normalizeCharacterForSave(draft)), [saved, draft])

  function updateDraft(patch: Partial<CharacterProfile>) {
    // ✅ draftは空文字を許したまま更新
    setDraft((p) => normalizeCharacterForDraft({ ...p, ...patch }))
  }

  function save() {
    const fixed = normalizeCharacterForSave(draft)
    setCharacters((prev) => prev.map((c) => (c.id === fixed.id ? fixed : c)))
    setSaved(fixed)
    setDraft(normalizeCharacterForDraft(fixed))
    alert('キャラ設定を保存したよ')
  }

  function saveAndBack() {
    const fixed = normalizeCharacterForSave(draft)
    setCharacters((prev) => prev.map((c) => (c.id === fixed.id ? fixed : c)))
    setSaved(fixed)
    setDraft(normalizeCharacterForDraft(fixed))
    back()
  }

  function handleBack() {
    if (dirty) {
      const ok = confirm('キャラ設定が未保存だよ。保存せずに戻る？')
      if (!ok) return
    }
    back()
  }

  function createNew() {
    const base = DEFAULT_CHARACTER
    const c: CharacterProfile = {
      ...base,
      id: uid(),
      name: `新キャラ${characters.length + 1}`,
      description: 'このキャラはどんな子？（自由に書いてね）',
    }
    setCharacters((prev) => [c, ...prev])
    setSelectedId(c.id)
  }

  function duplicateCurrent() {
    const cur = characters.find((c) => c.id === selectedId) ?? characters[0]
    if (!cur) return
    const copy: CharacterProfile = {
      ...cur,
      id: uid(),
      name: `${cur.name}（コピー）`,
    }
    setCharacters((prev) => [copy, ...prev])
    setSelectedId(copy.id)
  }

  function deleteCurrent() {
    if (characters.length <= 1) {
      alert('最後の1人は消せないよ（最低1キャラは必要）')
      return
    }
    const cur = characters.find((c) => c.id === selectedId)
    if (!cur) return
    const ok = confirm(`「${cur.name}」を削除する？（戻せないよ）`)
    if (!ok) return

    const next = characters.filter((c) => c.id !== cur.id)
    setCharacters(next)
    setSelectedId(next[0].id)
  }

  return (
    <div style={{ padding: 24, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>🎭 キャラ管理</h1>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {dirty && (
            <span style={{ fontSize: 12, color: '#ffb' }} title="未保存の変更があります">
              ● 未保存
            </span>
          )}
          <button onClick={handleBack}>← 戻る</button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#777' }}>
        ※ キャラはローカルに保存されます。会話画面でキャラ切替すると、履歴もキャラごとに切り替わります。
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 14, alignItems: 'start' }}>
        {/* Left: list */}
        <div
          style={{
            border: '1px solid #333',
            borderRadius: 12,
            padding: 12,
            background: '#0f0f0f',
            color: '#ddd',
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={createNew} style={{ flex: 1 }}>
              ➕ 新規
            </button>
            <button type="button" onClick={duplicateCurrent} style={{ flex: 1 }}>
              🧬 複製
            </button>
          </div>

          <button type="button" onClick={deleteCurrent} style={{ opacity: 0.9 }}>
            🗑 選択中を削除
          </button>

          <hr style={{ opacity: 0.25, margin: '6px 0' }} />

          <div style={{ fontSize: 12, color: '#aaa' }}>キャラ一覧（クリックで選択）</div>

          <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
            {characters.map((c) => {
              const active = c.id === selectedId
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 10px',
                    borderRadius: 10,
                    border: '1px solid #333',
                    background: active ? '#1b1b1b' : '#111',
                    color: active ? '#fff' : '#ddd',
                    cursor: 'pointer',
                  }}
                  title={c.description?.slice(0, 80)}
                >
                  <div style={{ fontWeight: 800 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
                    一人称: {c.selfName} / 呼称: {c.callUser}
                  </div>
                  <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>長さ: {c.replyLength}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: editor */}
        <div
          style={{
            border: '1px solid #333',
            borderRadius: 12,
            padding: 12,
            background: '#0f0f0f',
            color: '#ddd',
            display: 'grid',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: '#aaa' }}>選択中：</div>
            <div style={{ fontWeight: 800 }}>{draft.name || '（未入力）'}</div>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button type="button" onClick={save} disabled={!dirty} title="保存">
                💾 保存
              </button>
              <button type="button" onClick={saveAndBack} title="保存して戻る">
                ✅ 保存して戻る
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: '#bbb' }}>
              名前（表示名）：
              <input value={draft.name} onChange={(e) => updateDraft({ name: e.target.value })} style={{ marginLeft: 8, width: 220 }} />
            </label>

            <label style={{ fontSize: 12, color: '#bbb' }}>
              自称（一人称）：
              <input
                value={draft.selfName}
                onChange={(e) => updateDraft({ selfName: e.target.value })}
                style={{ marginLeft: 8, width: 140 }}
              />
            </label>

            <label style={{ fontSize: 12, color: '#bbb' }}>
              ユーザー呼称：
              <input
                value={draft.callUser}
                onChange={(e) => updateDraft({ callUser: e.target.value })}
                style={{ marginLeft: 8, width: 140 }}
              />
            </label>
          </div>

          <label style={{ fontSize: 12, color: '#bbb' }}>
            返答の長さ：
            <select
              value={draft.replyLength}
              onChange={(e) => updateDraft({ replyLength: e.target.value as ReplyLength })}
              style={{ marginLeft: 8 }}
            >
              <option value="short">短め</option>
              <option value="medium">標準</option>
              <option value="long">長め</option>
            </select>
            <span style={{ marginLeft: 10, fontSize: 11, color: '#777' }}>※ここは max_output_tokens に直結（体感差が出る）</span>
          </label>

          {/* カラー */}
          <label style={{ fontSize: 12, color: '#bbb' }}>
            テーマカラー：
            <input
              type="color"
              value={normalizeHexColor(draft.color, DEFAULT_CHARACTER.color ?? '#ff7aa2')}
              onChange={(e) => updateDraft({ color: e.target.value })}
              style={{ marginLeft: 8, verticalAlign: 'middle' }}
            />
            <span style={{ marginLeft: 8, fontSize: 11, color: '#777' }}>{normalizeHexColor(draft.color, DEFAULT_CHARACTER.color ?? '#ff7aa2')}</span>
          </label>

          <label style={{ fontSize: 12, color: '#bbb' }}>
            キャラクター設定（自由記述）：
            <textarea
              value={draft.description}
              onChange={(e) => updateDraft({ description: e.target.value })}
              rows={10}
              style={{ width: '100%', marginTop: 6, lineHeight: 1.5 }}
              placeholder="性格・距離感・雰囲気・釣りとの関係…好きに書いてOK"
            />
            <div style={{ fontSize: 11, color: '#777', marginTop: 6 }}>
              コツ：ルールを増やしすぎず、「どんな子か」の雰囲気だけ書くと生き物っぽくなるよ。
            </div>
          </label>

          <div style={{ fontSize: 12, color: '#777' }}>
            保存先：localStorage key = <code>{CHARACTERS_STORAGE_KEY}</code> / 選択中 =<code style={{ marginLeft: 6 }}>{SELECTED_CHARACTER_ID_KEY}</code>
          </div>
        </div>
      </div>
    </div>
  )
}
