// src/lib/characterStore.ts

export type CharacterProfile = {
  id: string
  label: string
  selfName: string
  callUser: string
  temperature: number
  sweetness: number
  teasing: number
  chuni: number
  emoji: number
  systemNote: string

  // 追加
  volume: number // 0-100
  affection: number // 0-100
  formality: number // 0-100
}

type CharacterState = {
  version: 1
  activeId: string
  characters: CharacterProfile[]
}

export type ChatMsg = {
  role: 'user' | 'assistant'
  content: string
  // 全員集合ルーム用（誰の発言か）
  speakerId?: string
  speakerLabel?: string
}

const CHARACTER_STATE_KEY = 'tsuduri_character_state_v1'

// ルーム別履歴（キャラごと / 全員集合）
const CHAT_KEY_PREFIX = 'tsuduri_chat_history_v2:'
export const ALL_HANDS_ROOM_ID = '__all_hands__'

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function genId() {
  const g = (globalThis as any)
  if (g?.crypto?.randomUUID) return g.crypto.randomUUID()
  return `c_${Date.now()}_${Math.floor(Math.random() * 1e9)}`
}

export const PRESETS: CharacterProfile[] = [
  {
    id: 'tsuduri',
    label: '釣嫁つづり（標準）',
    selfName: 'つづり',
    callUser: 'ひろっち',
    temperature: 0.92,
    sweetness: 70,
    teasing: 25,
    chuni: 15,
    emoji: 3,
    volume: 65,
    affection: 55,
    formality: 20,
    systemNote: '元気で可愛い、少し甘え＆少し世話焼き。釣りは現実的に頼れる相棒。説教禁止、心配として言う。',
  },
  {
    id: 'cool',
    label: 'クール相棒（落ち着き）',
    selfName: 'つづり',
    callUser: 'ひろっち',
    temperature: 0.55,
    sweetness: 20,
    teasing: 10,
    chuni: 5,
    emoji: 1,
    volume: 35,
    affection: 30,
    formality: 55,
    systemNote: '短く端的。判断は明確。距離は近いがベタベタしない。',
  },
  {
    id: 'hyper',
    label: 'ハイテンション（元気爆盛り）',
    selfName: 'つづり',
    callUser: 'ひろっち',
    temperature: 1.05,
    sweetness: 55,
    teasing: 35,
    chuni: 20,
    emoji: 5,
    volume: 70,
    affection: 60,
    formality: 15,
    systemNote: 'ノリ良くテンポ重視。煽りは軽め。会話を前に転がす。',
  },
]

function normalizeProfile(x: any, fallback: CharacterProfile): CharacterProfile {
  return {
    id: typeof x?.id === 'string' && x.id.trim() ? x.id : fallback.id,
    label: typeof x?.label === 'string' && x.label.trim() ? x.label : fallback.label,
    selfName: typeof x?.selfName === 'string' && x.selfName.trim() ? x.selfName : fallback.selfName,
    callUser: typeof x?.callUser === 'string' && x.callUser.trim() ? x.callUser : fallback.callUser,
    temperature: clamp(Number(x?.temperature ?? fallback.temperature), 0.2, 1.2),
    sweetness: clamp(Number(x?.sweetness ?? fallback.sweetness), 0, 100),
    teasing: clamp(Number(x?.teasing ?? fallback.teasing), 0, 100),
    chuni: clamp(Number(x?.chuni ?? fallback.chuni), 0, 100),
    emoji: clamp(Number(x?.emoji ?? fallback.emoji), 0, 6),
    volume: clamp(Number(x?.volume ?? fallback.volume), 0, 100),
    affection: clamp(Number(x?.affection ?? fallback.affection), 0, 100),
    formality: clamp(Number(x?.formality ?? fallback.formality), 0, 100),
    systemNote: typeof x?.systemNote === 'string' ? x.systemNote : fallback.systemNote,
  }
}

function defaultState(): CharacterState {
  // 初回はプリセット3体を複製して保存（idは衝突回避で作り直す）
  const clones = PRESETS.map((p) => ({ ...p, id: genId() }))
  return { version: 1, activeId: clones[0].id, characters: clones }
}

export function loadCharacterState(): CharacterState {
  try {
    const raw = localStorage.getItem(CHARACTER_STATE_KEY)
    if (!raw) return defaultState()
    const j = JSON.parse(raw)
    if (!j || typeof j !== 'object') return defaultState()

    const arr = Array.isArray((j as any).characters) ? (j as any).characters : []
    const normalized = arr
      .map((c: any) => normalizeProfile(c, PRESETS[0]))
      .map((c: CharacterProfile) => ({ ...c, id: typeof c.id === 'string' && c.id ? c.id : genId() }))

    if (!normalized.length) return defaultState()

    const activeId = typeof (j as any).activeId === 'string' ? (j as any).activeId : normalized[0].id
    const exists = normalized.some((c) => c.id === activeId)
    return {
      version: 1,
      activeId: exists ? activeId : normalized[0].id,
      characters: normalized,
    }
  } catch {
    return defaultState()
  }
}

export function saveCharacterState(state: CharacterState) {
  try {
    localStorage.setItem(CHARACTER_STATE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

export function listCharacters(): CharacterProfile[] {
  return loadCharacterState().characters
}

export function getActiveCharacterId(): string {
  return loadCharacterState().activeId
}

export function setActiveCharacterId(id: string) {
  const st = loadCharacterState()
  if (!st.characters.some((c) => c.id === id)) return
  saveCharacterState({ ...st, activeId: id })
}

export function getCharacterById(id: string): CharacterProfile | null {
  const st = loadCharacterState()
  return st.characters.find((c) => c.id === id) ?? null
}

export function getActiveCharacter(): CharacterProfile {
  const st = loadCharacterState()
  return st.characters.find((c) => c.id === st.activeId) ?? st.characters[0]
}

export function upsertCharacter(profile: CharacterProfile) {
  const st = loadCharacterState()
  const idx = st.characters.findIndex((c) => c.id === profile.id)
  const next = [...st.characters]
  if (idx >= 0) next[idx] = profile
  else next.push(profile)
  const activeId = st.activeId && next.some((c) => c.id === st.activeId) ? st.activeId : next[0].id
  saveCharacterState({ ...st, characters: next, activeId })
}

export function deleteCharacter(id: string) {
  const st = loadCharacterState()
  if (st.characters.length <= 1) return // 最後の1体は削除不可
  const next = st.characters.filter((c) => c.id !== id)
  const activeId = st.activeId === id ? next[0].id : st.activeId
  saveCharacterState({ ...st, characters: next, activeId })
  // キャラ履歴も消す
  try {
    localStorage.removeItem(chatKey(id))
  } catch {
    // ignore
  }
}

export function createCharacterFromPreset(preset: CharacterProfile, labelSuffix?: string) {
  const id = genId()
  const p: CharacterProfile = {
    ...preset,
    id,
    label: labelSuffix ? `${preset.label}${labelSuffix}` : preset.label,
  }
  upsertCharacter(p)
  return p
}

export function chatKey(roomId: string) {
  return `${CHAT_KEY_PREFIX}${roomId}`
}

export function loadChatHistory(roomId: string): ChatMsg[] {
  try {
    const raw = localStorage.getItem(chatKey(roomId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: String(m.content),
        speakerId: typeof m.speakerId === 'string' ? m.speakerId : undefined,
        speakerLabel: typeof m.speakerLabel === 'string' ? m.speakerLabel : undefined,
      }))
  } catch {
    return []
  }
}

export function saveChatHistory(roomId: string, messages: ChatMsg[]) {
  try {
    localStorage.setItem(chatKey(roomId), JSON.stringify(messages))
  } catch {
    // ignore
  }
}

export function clearChatHistory(roomId: string) {
  try {
    localStorage.removeItem(chatKey(roomId))
  } catch {
    // ignore
  }
}
