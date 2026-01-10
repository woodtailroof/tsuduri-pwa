// src/screens/Chat.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CharacterProfile } from './CharacterSettings'
import { ALLHANDS_BANTER_RATE_KEY, CHARACTERS_STORAGE_KEY, SELECTED_CHARACTER_ID_KEY } from './CharacterSettings'
import PageShell from '../components/PageShell'

type Props = {
  back: () => void
  goCharacterSettings: () => void
}

type Msg = {
  role: 'user' | 'assistant'
  content: string
  speakerId?: string // 全員集合ルームで「誰の返答か」
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/**
 * CharacterProfile は今までの型に加えて color を持つ想定（後方互換）
 */
type CharacterProfileWithColor = CharacterProfile & { color?: string }

function safeLoadCharacters(): CharacterProfileWithColor[] {
  const list = safeJsonParse<CharacterProfileWithColor[]>(localStorage.getItem(CHARACTERS_STORAGE_KEY), [])
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
    } as any,
  ]
}

function safeLoadSelectedCharacterId(fallback: string) {
  const raw = localStorage.getItem(SELECTED_CHARACTER_ID_KEY)
  return raw && raw.trim() ? raw : fallback
}

function safeSaveSelectedCharacterId(id: string) {
  try {
    localStorage.setItem(SELECTED_CHARACTER_ID_KEY, id)
  } catch {
    // ignore
  }
}

function historyKey(roomId: string) {
  return `tsuduri_chat_history_v2:${roomId}`
}

function safeLoadHistory(roomId: string): Msg[] {
  const raw = localStorage.getItem(historyKey(roomId))
  const parsed = safeJsonParse<any[]>(raw, [])
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((x) => x && (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string')
    .map((x) => ({
      role: x.role as Msg['role'],
      content: String(x.content),
      speakerId: typeof x.speakerId === 'string' ? x.speakerId : undefined,
    }))
}

function safeSaveHistory(roomId: string, messages: Msg[]) {
  try {
    localStorage.setItem(historyKey(roomId), JSON.stringify(messages))
  } catch {
    // ignore
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function readCharacterProfile(id: string, fallback: CharacterProfileWithColor): CharacterProfileWithColor {
  const list = safeLoadCharacters()
  return list.find((c) => c.id === id) ?? fallback
}

/**
 * 全員集合ルーム用：
 * - user は全キャラ共通で入れる
 * - assistant は「speakerId がそのキャラのもの」だけ入れる
 */
function buildThreadForCharacter(allRoomMessages: Msg[], speakerId: string): { role: 'user' | 'assistant'; content: string }[] {
  return allRoomMessages
    .filter((m) => {
      if (m.role === 'user') return true
      if (m.role === 'assistant') return m.speakerId === speakerId
      return false
    })
    .map((m) => ({ role: m.role, content: m.content }))
}

async function readErrorBody(res: Response): Promise<string | null> {
  try {
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      const j = await res.json().catch(() => null)
      if (j?.error) return String(j.error)
      if (j?.message) return String(j.message)
      return JSON.stringify(j)
    }
    const t = await res.text().catch(() => '')
    const s = (t || '').trim()
    if (!s) return null
    return s.slice(0, 400)
  } catch {
    return null
  }
}

/** ===== 全員集合: 掛け合い設定 ===== */
const ALLHANDS_BANTER_ENABLED_KEY = 'tsuduri_allhands_banter_enabled_v1'

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
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

/** ===== 指名検出ユーティリティ ===== */
function shuffle<T>(arr: T[]) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isFishingJudgeText(text: string) {
  return /(釣り行く|釣りいく|迷って|釣行判断|今日どう|明日どう|風|雨|波|潮|満潮|干潮|水温|ポイント)/.test(text ?? '')
}

function detectTargetDay(text: string): 'today' | 'tomorrow' {
  const s = text ?? ''
  if (/(明日|あした|アシタ|tomorrow|明日の|明日行く|明日どう|明日は)/.test(s)) return 'tomorrow'
  return 'today'
}

/**
 * ✅ 表示名から「呼び名っぽい末尾」だけ抜く
 */
function tailNickname(name: string): string | null {
  const s = (name ?? '').trim()
  if (!s) return null
  const m = s.match(/([ぁ-んァ-ヶ一-龯a-zA-Z0-9]{2,})$/)
  if (!m?.[1]) return null
  const nick = m[1].trim()
  return nick || null
}

function uniqStrings(xs: Array<string | null | undefined>) {
  const set = new Set<string>()
  for (const x of xs) {
    const t = (x ?? '').trim()
    if (!t) continue
    set.add(t)
  }
  return [...set]
}

/**
 * ✅ 指名検出（強化版）
 */
function detectMentionedCharacterId(text: string, characters: CharacterProfileWithColor[]): string | null {
  const sRaw = (text ?? '').trim()
  if (!sRaw) return null
  const s = sRaw.replace(/\u3000/g, ' ')

  const suffixes = ['ちゃん', 'さん', 'くん', '様', 'さま', '氏', '先生', '先輩']
  const suffixRe = `(?:${suffixes.map(escapeRegExp).join('|')})?`
  const sepRe = `[、,.:：!！?？\\s\\n\\r\\t\\-ー…]*`

  const candidates = characters.map((c) => {
    const full = (c.name ?? '').trim()
    const tail = full ? tailNickname(full) : null
    const self = (c.selfName ?? '').trim()
    const keys = uniqStrings([full, tail, self]).filter((k) => (k ?? '').trim().length >= 2)
    keys.sort((a, b) => b.length - a.length)
    return { id: c.id, keys }
  })

  // 1) 先頭指名（強）
  for (const c of candidates) {
    for (const k of c.keys) {
      const headPatterns = [new RegExp(`^${escapeRegExp(k)}${suffixRe}${sepRe}`), new RegExp(`^@${escapeRegExp(k)}${suffixRe}${sepRe}`)]
      if (headPatterns.some((re) => re.test(s))) return c.id
    }
  }

  // 2) 文中指名（弱）: 最初に出たもの優先
  type Hit = { id: string; index: number; keyLen: number }
  const hits: Hit[] = []
  for (const c of candidates) {
    for (const k of c.keys) {
      const re = new RegExp(`${escapeRegExp(k)}${suffixRe}(?=${sepRe}|$)`, 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(s)) !== null) {
        hits.push({ id: c.id, index: m.index, keyLen: k.length })
        if (m.index === re.lastIndex) re.lastIndex++
      }
    }
  }
  if (!hits.length) return null
  hits.sort((a, b) => (a.index !== b.index ? a.index - b.index : b.keyLen - a.keyLen))
  return hits[0]?.id ?? null
}

/**
 * ✅ 共有メモ（掛け合い用）
 * “要点を載せない” のがポイント（復唱の燃料を渡さない）
 */
function buildSharedMemoForBanter(leadName: string) {
  return `【共有メモ】先頭は「${leadName}」。あなたは脇役として短い感想/合いの手だけ返す。内容の言い換え復唱は禁止。`
}

/**
 * 共有メモ（釣行判断用）：トリガー語をサニタイズして渡す
 */
function sanitizeJudgeTriggers(s: string) {
  const replaces: Array<[RegExp, string]> = [
    [/釣行判断/g, '判断'],
    [/釣り行く/g, '出かける'],
    [/釣りいく/g, '出かける'],
    [/今日どう/g, '今日の方針'],
    [/明日どう/g, '明日の方針'],
    [/風/g, '条件A'],
    [/雨/g, '条件B'],
    [/波/g, '条件C'],
    [/潮/g, '条件D'],
    [/満潮/g, '時刻1'],
    [/干潮/g, '時刻2'],
    [/水温/g, '水の温度'],
    [/ポイント/g, '場所候補'],
  ]

  let out = s
  for (const [re, to] of replaces) out = out.replace(re, to)
  return out
}

function buildSharedMemoForJudgeFollowers(leadName: string, leadReply: string) {
  const t = (leadReply ?? '').trim()
  if (!t) return `【共有メモ】${leadName}の結論：取得失敗`
  const firstLine =
    t
      .split('\n')
      .map((x) => x.trim())
      .find(Boolean) ?? ''
  const conclusion = /(行く|様子見|やめる)/.test(firstLine) ? firstLine : `（結論不明：先頭行=${firstLine.slice(0, 40)}）`
  const numbers = (t.match(/-?\d+(\.\d+)?/g) ?? []).slice(0, 8).join(', ')
  const numPart = numbers ? ` / 参考数値: ${numbers}` : ''
  return sanitizeJudgeTriggers(`【共有メモ】先頭（${leadName}）の結論：${conclusion}${numPart}`)
}

/**
 * 指名/掛け合いのときの役割ヒント
 */
function roleHintForBanter(leadName: string) {
  return `
【あなたの役割（掛け合い：感想係）】
- 先頭「${leadName}」がメイン回答者。あなたは脇役。
- 3〜6行、段落は1〜2個。先頭より短く。
- 先頭の内容を言い換えて復唱しない（要約も最大1文まで）。
- 出せるのは最大2つ：①感想/合いの手 ②質問1つ（任意）
- “自分の気持ち” でOK。情報を盛らない。
`.trim()
}

/**
 * 釣行判断のとき、後続2人には「釣行判断モードを起動しない」ために
 * 最後のユーザー文を差し替える（ただし意味は保つ）
 */
function rewriteLastUserForJudgeFollower(baseThread: { role: 'user' | 'assistant'; content: string }[], day: 'today' | 'tomorrow') {
  const idx = [...baseThread].reverse().findIndex((m) => m.role === 'user')
  if (idx < 0) return baseThread
  const lastUserIndex = baseThread.length - 1 - idx

  const dayText = day === 'tomorrow' ? '明日' : '今日'
  const replaced = `全員集合の相談：${dayText}の予定について、先頭担当の結論に沿って「補足」や「作戦」を短く提案して。結論は変えない。`

  return baseThread.map((m, i) => (i === lastUserIndex ? { ...m, content: replaced } : m))
}

/** 色取得（後方互換） */
function getCharacterColor(c: CharacterProfileWithColor | undefined | null) {
  const raw = (c as any)?.color
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return '#ff7aa2'
}

export default function Chat({ back, goCharacterSettings }: Props) {
  const [characters, setCharacters] = useState<CharacterProfileWithColor[]>(() => safeLoadCharacters())

  const fallback = useMemo(() => characters[0], [characters])
  const [selectedId, setSelectedId] = useState<string>(() => safeLoadSelectedCharacterId(safeLoadCharacters()[0]?.id ?? 'tsuduri'))

  const selectedCharacter = useMemo(() => readCharacterProfile(selectedId, fallback), [selectedId, fallback])

  const [roomMode, setRoomMode] = useState<'single' | 'all'>('single')
  const roomId = roomMode === 'single' ? selectedId : 'all'

  const [messages, setMessages] = useState<Msg[]>(() => safeLoadHistory(roomId))
  const [input, setInput] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  const [banterEnabled, setBanterEnabled] = useState<boolean>(() => safeLoadBanterEnabled())
  const [banterRate, setBanterRate] = useState<number>(() => safeLoadBanterRate())

  const scrollBoxRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const selectRef = useRef<HTMLSelectElement | null>(null)

  function focusInput() {
    const el = inputRef.current
    if (!el) return
    requestAnimationFrame(() => {
      try {
        el.focus()
        const len = el.value.length
        el.setSelectionRange(len, len)
      } catch {
        // ignore
      }
    })
  }

  function scrollToBottom(mode: 'auto' | 'smooth' = 'auto') {
    const box = scrollBoxRef.current
    if (!box) return

    const run = () => {
      box.scrollTop = box.scrollHeight
    }

    if (mode === 'smooth') {
      box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' })
      requestAnimationFrame(run)
      setTimeout(run, 0)
      setTimeout(run, 80)
      return
    }

    requestAnimationFrame(run)
    setTimeout(run, 0)
    setTimeout(run, 80)
  }

  // ✅ 画面全体はスクロールさせない（チャット欄だけ）
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const onFocus = () => {
      const list = safeLoadCharacters()
      setCharacters(list)

      const newSelected = safeLoadSelectedCharacterId(list[0]?.id ?? 'tsuduri')
      setSelectedId(newSelected)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  useEffect(() => {
    setMessages(safeLoadHistory(roomId))
    scrollToBottom('auto')
    focusInput()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  useEffect(() => {
    safeSaveHistory(roomId, messages)
    scrollToBottom('smooth')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, roomId])

  useEffect(() => {
    safeSaveSelectedCharacterId(selectedId)
  }, [selectedId])

  useEffect(() => {
    safeSaveBanterEnabled(banterEnabled)
  }, [banterEnabled])

  useEffect(() => {
    safeSaveBanterRate(banterRate)
  }, [banterRate])

  const titleName = roomMode === 'all' ? '釣嫁全員集合' : selectedCharacter.name
  const canSend = useMemo(() => !!input.trim() && !loading, [input, loading])

  function clearHistory() {
    const ok = confirm('会話履歴を消す？（戻せないよ）')
    if (!ok) return
    setMessages([])
    try {
      localStorage.removeItem(historyKey(roomId))
    } catch {
      // ignore
    }
    focusInput()
  }

  async function callApiChat(payloadMessages: { role: 'user' | 'assistant'; content: string }[], character: CharacterProfileWithColor, systemHints: string[] = []) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: payloadMessages,
        characterProfile: character,
        systemHints,
      }),
    })

    if (!res.ok) {
      const bodyErr = await readErrorBody(res)
      throw new Error(`HTTP ${res.status}${bodyErr ? ` / ${bodyErr}` : ''}`)
    }

    const json = await res.json().catch(() => null)
    if (!json?.ok) throw new Error(json?.error ? String(json.error) : 'unknown_error')
    return String(json.text ?? '')
  }

  async function sendSingle() {
    const text = input.trim()
    if (!text || loading) return

    const next: Msg[] = [...messages, { role: 'user', content: text }]
    setMessages(next)

    setInput('')
    focusInput()

    setLoading(true)

    try {
      const thread = next.map((m) => ({ role: m.role, content: m.content }))
      const currentCharacter = readCharacterProfile(selectedId, selectedCharacter)
      const reply = await callApiChat(thread, currentCharacter, [])
      setMessages([...next, { role: 'assistant', content: reply }])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setMessages([...next, { role: 'assistant', content: `ごめん…🥺\n理由：${msg}` }])
    } finally {
      setLoading(false)
      focusInput()
    }
  }

  async function sendAllHands() {
    const text = input.trim()
    if (!text || loading) return

    const activeCharacters = characters
    if (!activeCharacters.length) {
      alert('キャラがいないよ（キャラ設定で作ってね）')
      return
    }

    const baseNext: Msg[] = [...messages, { role: 'user', content: text }]
    setMessages(baseNext)

    setInput('')
    focusInput()

    setLoading(true)

    try {
      let curMessages = baseNext

      const mentionedId = detectMentionedCharacterId(text, activeCharacters)
      const judge = isFishingJudgeText(text)
      const day = detectTargetDay(text)

      // 指名が取れたら必ずその子を先頭に
      let leadId: string
      if (mentionedId) leadId = mentionedId
      else leadId = shuffle(activeCharacters)[0].id

      const lead = activeCharacters.find((c) => c.id === leadId) ?? activeCharacters[0]
      const rest = shuffle(activeCharacters.filter((c) => c.id !== lead.id))

      // ✅ 掛け合い判定：
      // - judge は邪魔しない（固定ロール）
      // - 指名は “むしろ掛け合い向き”：後ろ2人は感想係にする
      const banterCandidate = !!banterEnabled && !judge
      const banterHit = banterCandidate && Math.random() * 100 < banterRate

      // 1) 先頭（メイン）
      {
        const thread0 = buildThreadForCharacter(curMessages, lead.id)
        const reply0 = await callApiChat(thread0, lead, [])
        curMessages = [...curMessages, { role: 'assistant', content: reply0, speakerId: lead.id }]
        setMessages(curMessages)
        await sleep(120)
      }

      const leadName = lead.name ?? '先頭キャラ'
      const leadReply = curMessages[curMessages.length - 1]?.content ?? ''

      const sharedMemoJudge = judge ? buildSharedMemoForJudgeFollowers(leadName, leadReply) : null

      // 2) 後続
      for (let i = 0; i < rest.length; i++) {
        const c = rest[i]
        let threadForCall = buildThreadForCharacter(curMessages, c.id)
        const systemHints: string[] = []

        if (judge) {
          threadForCall = rewriteLastUserForJudgeFollower(threadForCall, day)
          if (sharedMemoJudge) systemHints.push(sharedMemoJudge)
          systemHints.push(`【あなたは脇役】先頭の結論は変えない。短く補足だけ。復唱禁止。`)
        } else if (banterHit || mentionedId) {
          // ✅ 掛け合いヒット もしくは 指名あり：後ろ2人は必ず感想係
          systemHints.push(buildSharedMemoForBanter(leadName))
          systemHints.push(roleHintForBanter(leadName))
        } else {
          // 通常：軽い補足（でも復唱防止）
          systemHints.push(buildSharedMemoForBanter(leadName))
          systemHints.push(
            `
【あなたの役割（通常：ちょい足し）】
- 先頭「${leadName}」がメイン。あなたは短く。
- 付け足すなら「別観点を1つ」だけ。
- 先頭の言い換え復唱は禁止。
`.trim()
          )
        }

        const reply = await callApiChat(threadForCall, c, systemHints)
        curMessages = [...curMessages, { role: 'assistant', content: reply, speakerId: c.id }]
        setMessages(curMessages)
        await sleep(120)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setMessages((prev) => [...prev, { role: 'assistant', content: `ごめん…🥺\n理由：${msg}`, speakerId: selectedId }])
    } finally {
      setLoading(false)
      focusInput()
    }
  }

  async function send() {
    if (roomMode === 'all') return sendAllHands()
    return sendSingle()
  }

  const toggleAllHands = () => setRoomMode((m) => (m === 'all' ? 'single' : 'all'))

  // =========
  // ✅ “透過ガラスUI” 共通
  // =========
  const glassPanel: React.CSSProperties = {
    border: '1px solid var(--line)',
    borderRadius: 14,
    background: 'rgba(10, 10, 12, 0.42)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
  }

  const glassButton: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 10,
    border: '1px solid var(--line)',
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.88)',
    cursor: 'pointer',
    height: 34,
    lineHeight: '20px',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
  }

  const glassButtonActive: React.CSSProperties = {
    ...glassButton,
    background: 'rgba(255, 77, 109, 0.14)',
    border: '1px solid rgba(255, 77, 109, 0.55)',
    color: '#fff',
  }

  const selectStyle: React.CSSProperties = {
    ...glassButton,
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    paddingRight: 30,
  }

  return (
    <PageShell title={<h1 style={{ margin: 0 }}>💬 {titleName}と話す</h1>} maxWidth={1100} showBack onBack={back}>
      <style>{`
        @keyframes tsuduri-dot-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.55; }
          40% { transform: translateY(-4px); opacity: 1; }
        }

        /* ✅ チャット欄のスクロールバーを消す（スクロール自体は生きる） */
        .chat-scroll {
          scrollbar-width: none; /* Firefox */
        }
        .chat-scroll::-webkit-scrollbar {
          width: 0;
          height: 0;
        }

        .tsuduri-typing {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 14px;
          background: rgba(10,10,12,0.55);
          border: 1px solid var(--line);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: #fff;
          max-width: 80%;
        }
        .tsuduri-typing .label {
          font-size: 12px;
          color: rgba(255,255,255,0.72);
          margin-right: 6px;
          user-select: none;
        }
        .tsuduri-typing .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #fff;
          animation: tsuduri-dot-bounce 1.05s infinite;
        }
        .tsuduri-typing .dot:nth-child(2) { animation-delay: 0.12s; }
        .tsuduri-typing .dot:nth-child(3) { animation-delay: 0.24s; }
      `}</style>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minWidth: 0,

          // ✅ PageShellの中で“画面っぽく”使う
          // 親がスクロール領域でも、Chat自体はここで完結させる
          height: 'min(820px, calc(100svh - 170px))',
          overflow: 'hidden',
        }}
      >
        {/* ヘッダー行 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div style={{ minWidth: 0 }} />

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
            <button
              type="button"
              onClick={toggleAllHands}
              title="全員集合にすると1投げに全員が返す"
              style={roomMode === 'all' ? glassButtonActive : glassButton}
            >
              {roomMode === 'all' ? '👥 全員集合：ON' : '👤 全員集合：OFF'}
            </button>

            {roomMode === 'all' && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 10px',
                  borderRadius: 12,
                  border: '1px solid var(--line)',
                  background: 'rgba(10,10,12,0.35)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  color: 'rgba(255,255,255,0.78)',
                }}
                title="掛け合い（感想/合いの手）の出やすさ"
              >
                <button
                  type="button"
                  onClick={() => setBanterEnabled((v) => !v)}
                  style={banterEnabled ? glassButtonActive : glassButton}
                  title="掛け合い ON/OFF"
                >
                  {banterEnabled ? '🗣 掛け合い：ON' : '🤐 掛け合い：OFF'}
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>頻度</span>
                  <input type="range" min={0} max={100} value={banterRate} onChange={(e) => setBanterRate(Number(e.target.value))} style={{ width: 140 }} disabled={!banterEnabled} />
                  <span style={{ width: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: banterEnabled ? '#fff' : 'rgba(255,255,255,0.45)' }}>
                    {banterRate}%
                  </span>
                </div>
              </div>
            )}

            {roomMode === 'single' && (
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <select ref={selectRef} value={selectedId} onChange={(e) => setSelectedId(e.target.value)} title="キャラ切替（履歴も切り替わる）" style={selectStyle}>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <span
                  style={{
                    position: 'absolute',
                    right: 10,
                    pointerEvents: 'none',
                    color: 'rgba(255,255,255,0.55)',
                    fontSize: 12,
                    transform: 'translateY(-1px)',
                  }}
                >
                  ▼
                </span>
              </div>
            )}

            <button onClick={goCharacterSettings} title="キャラ管理" style={glassButton}>
              🎭
            </button>

            <button onClick={clearHistory} title="履歴を全消し" style={glassButton}>
              🧹
            </button>
          </div>
        </div>

        {/* メッセージ */}
        <div
          ref={scrollBoxRef}
          className="chat-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: 12,
            minWidth: 0,

            // ✅ ガラス化
            ...glassPanel,
          }}
        >
          {messages.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>
              {roomMode === 'all' ? '釣嫁たち「ひろっち、今日はどうする？🎣」' : `${selectedCharacter.name}「ひろっち、今日はどうする？🎣」`}
            </div>
          ) : (
            messages.map((m, index) => {
              const isUser = m.role === 'user'
              const speakerObj = !isUser && roomMode === 'all' ? characters.find((c) => c.id === m.speakerId) : null
              const speakerName = speakerObj?.name ?? 'だれか'
              const speakerColor = getCharacterColor(speakerObj)

              const assistColor = roomMode === 'all' ? speakerColor : getCharacterColor(selectedCharacter)

              const bubbleBorder = !isUser ? `1px solid rgba(255,255,255,0.12)` : '1px solid transparent'
              const bubbleGlow = !isUser ? `0 0 0 1px ${assistColor}33 inset` : 'none'

              return (
                <div key={index} style={{ marginBottom: 10, textAlign: isUser ? 'right' : 'left' }}>
                  {!isUser && roomMode === 'all' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          height: 18,
                          padding: '0 8px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 800,
                          color: '#111',
                          background: speakerColor,
                          boxShadow: '0 0 0 1px rgba(255,255,255,0.12) inset',
                          userSelect: 'none',
                        }}
                        title={speakerName}
                      >
                        {speakerName}
                      </span>
                    </div>
                  )}

                  <span
                    style={{
                      display: 'inline-block',
                      padding: '10px 12px',
                      borderRadius: 14,
                      maxWidth: 'min(80%, 900px)',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.65,
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word',

                      border: bubbleBorder,
                      boxShadow: bubbleGlow,

                      // ✅ “ベタ黒”をやめてガラスへ
                      background: isUser ? 'rgba(255, 77, 109, 0.82)' : 'rgba(10, 10, 12, 0.38)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      color: '#fff',
                    }}
                  >
                    {m.content}
                  </span>
                </div>
              )
            })
          )}

          {loading && (
            <div style={{ marginTop: 6, textAlign: 'left' }}>
              <div className="tsuduri-typing">
                <span className="label">入力中</span>
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            </div>
          )}
        </div>

        {/* クイックボタン */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minWidth: 0 }}>
          <button
            type="button"
            onClick={() => {
              setInput('最近元気～？')
              focusInput()
            }}
            style={{ opacity: 0.95, ...glassButton }}
          >
            😌 元気？
          </button>
          <button
            type="button"
            onClick={() => {
              setInput('今日の釣行判断よろしく！')
              focusInput()
            }}
            style={{ opacity: 0.95, ...glassButton }}
          >
            🎣 釣行判断：今日
          </button>
          <button
            type="button"
            onClick={() => {
              setInput('明日の釣行判断よろしく！')
              focusInput()
            }}
            style={{ opacity: 0.95, ...glassButton }}
          >
            🌙 釣行判断：明日
          </button>
        </div>

        {/* 入力行（常に固定） */}
        <div
          style={{
            flex: '0 0 auto',
            padding: 10,
            ...glassPanel,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder={roomMode === 'all' ? 'みんなに投げかける…（例：みやび、起きてる？）' : `${selectedCharacter.name}に話しかける…`}
              style={{
                flex: 1,
                padding: 10,
                minWidth: 0,
                borderRadius: 10,
                border: '1px solid var(--line)',
                background: 'rgba(0,0,0,0.25)',
                color: '#fff',
                outline: 'none',
              }}
              disabled={false}
            />

            <button
              onMouseDown={(e) => {
                e.preventDefault()
              }}
              onClick={send}
              disabled={!canSend}
              style={{
                ...glassButton,
                opacity: canSend ? 1 : 0.6,
                cursor: canSend ? 'pointer' : 'not-allowed',
              }}
            >
              {loading ? '送信中…' : roomMode === 'all' ? '全員に送る' : '送信'}
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
