// src/screens/Chat.tsx
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { CharacterProfile } from "./CharacterSettings";
import {
  ALLHANDS_BANTER_ENABLED_KEY,
  ALLHANDS_BANTER_RATE_KEY,
  CHARACTERS_STORAGE_KEY,
  SELECTED_CHARACTER_ID_KEY,
} from "./CharacterSettings";
import PageShell from "../components/PageShell";

type Props = {
  back: () => void;
  goCharacterSettings: () => void;
};

type Msg = {
  role: "user" | "assistant";
  content: string;
  speakerId?: string; // 全員集合ルームで「誰の返答か」
};

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * CharacterProfile は今までの型に加えて color を持つ想定（後方互換）
 */
type CharacterProfileWithColor = CharacterProfile & { color?: string };

function safeLoadCharacters(): CharacterProfileWithColor[] {
  const list = safeJsonParse<CharacterProfileWithColor[]>(
    localStorage.getItem(CHARACTERS_STORAGE_KEY),
    [],
  );
  if (Array.isArray(list) && list.length) return list;

  return [
    {
      id: "tsuduri",
      name: "釣嫁つづり",
      selfName: "つづり",
      callUser: "ひろっち",
      replyLength: "medium",
      description:
        "元気で可愛い、少し甘え＆少し世話焼き。釣りは現実的に頼れる相棒。説教しない。危ないことは心配として止める。",
      color: "#ff7aa2",
    },
  ];
}

function safeLoadSelectedCharacterId(fallback: string) {
  const raw = localStorage.getItem(SELECTED_CHARACTER_ID_KEY);
  return raw && raw.trim() ? raw : fallback;
}

function safeSaveSelectedCharacterId(id: string) {
  try {
    localStorage.setItem(SELECTED_CHARACTER_ID_KEY, id);
  } catch {
    // ignore
  }
}

function historyKey(roomId: string) {
  return `tsuduri_chat_history_v2:${roomId}`;
}

function isRecordLike(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function safeLoadHistory(roomId: string): Msg[] {
  const raw = localStorage.getItem(historyKey(roomId));
  const parsed = safeJsonParse<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];

  const out: Msg[] = [];
  for (const item of parsed) {
    if (!isRecordLike(item)) continue;

    const role = item.role;
    const content = item.content;
    const speakerId = item.speakerId;

    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;

    out.push({
      role: role as "user" | "assistant",
      content,
      speakerId: typeof speakerId === "string" ? speakerId : undefined,
    });
  }
  return out;
}

function safeSaveHistory(roomId: string, messages: Msg[]) {
  try {
    localStorage.setItem(historyKey(roomId), JSON.stringify(messages));
  } catch {
    // ignore
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function readCharacterProfile(
  id: string,
  fallback: CharacterProfileWithColor,
): CharacterProfileWithColor {
  const list = safeLoadCharacters();
  return list.find((c) => c.id === id) ?? fallback;
}

/**
 * 全員集合ルーム用：
 * - user は全キャラ共通で入れる
 * - assistant は「speakerId がそのキャラのもの」だけ入れる
 */
function buildThreadForCharacter(
  allRoomMessages: Msg[],
  speakerId: string,
): { role: "user" | "assistant"; content: string }[] {
  return allRoomMessages
    .filter((m) => (m.role === "user" ? true : m.speakerId === speakerId))
    .map((m) => ({ role: m.role, content: m.content }));
}

async function readErrorBody(res: Response): Promise<string | null> {
  try {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j: unknown = await res.json().catch(() => null);
      if (isRecordLike(j)) {
        if (typeof j.error === "string") return j.error;
        if (typeof j.message === "string") return j.message;
      }
      return JSON.stringify(j);
    }
    const t = await res.text().catch(() => "");
    const s = (t || "").trim();
    if (!s) return null;
    return s.slice(0, 400);
  } catch {
    return null;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeLoadBanterEnabled() {
  try {
    const raw = localStorage.getItem(ALLHANDS_BANTER_ENABLED_KEY);
    if (raw == null) return true;
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

function safeLoadBanterRate() {
  try {
    const raw = localStorage.getItem(ALLHANDS_BANTER_RATE_KEY);
    if (raw == null) return 35;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 35;
    return clamp(Math.round(n), 0, 100);
  } catch {
    return 35;
  }
}

/** ===== 指名検出ユーティリティ ===== */
function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isFishingJudgeText(text: string) {
  return /(釣り行く|釣りいく|迷って|釣行判断|今日どう|明日どう|風|雨|波|潮|満潮|干潮|水温|ポイント)/.test(
    text ?? "",
  );
}

function detectTargetDay(text: string): "today" | "tomorrow" {
  const s = text ?? "";
  if (/(明日|あした|アシタ|tomorrow|明日の|明日行く|明日どう|明日は)/.test(s))
    return "tomorrow";
  return "today";
}

function tailNickname(name: string): string | null {
  const s = (name ?? "").trim();
  if (!s) return null;
  const m = s.match(/([ぁ-んァ-ヶ一-龯a-zA-Z0-9]{2,})$/);
  if (!m?.[1]) return null;
  const nick = m[1].trim();
  return nick || null;
}

function uniqStrings(xs: Array<string | null | undefined>) {
  const set = new Set<string>();
  for (const x of xs) {
    const t = (x ?? "").trim();
    if (!t) continue;
    set.add(t);
  }
  return [...set];
}

function detectMentionedCharacterId(
  text: string,
  characters: CharacterProfileWithColor[],
): string | null {
  const sRaw = (text ?? "").trim();
  if (!sRaw) return null;
  const s = sRaw.replace(/\u3000/g, " ");

  const suffixes = [
    "ちゃん",
    "さん",
    "くん",
    "様",
    "さま",
    "氏",
    "先生",
    "先輩",
  ];
  const suffixRe = `(?:${suffixes.map(escapeRegExp).join("|")})?`;
  const sepRe = `[、,.:：!！?？\\s\\n\\r\\t\\-ー…]*`;

  const candidates = characters.map((c) => {
    const full = (c.name ?? "").trim();
    const tail = full ? tailNickname(full) : null;
    const self = (c.selfName ?? "").trim();
    const keys = uniqStrings([full, tail, self]).filter((k) => k.length >= 2);
    keys.sort((a, b) => b.length - a.length);
    return { id: c.id, keys };
  });

  for (const c of candidates) {
    for (const k of c.keys) {
      const headPatterns = [
        new RegExp(`^${escapeRegExp(k)}${suffixRe}${sepRe}`),
        new RegExp(`^@${escapeRegExp(k)}${suffixRe}${sepRe}`),
      ];
      if (headPatterns.some((re) => re.test(s))) return c.id;
    }
  }

  type Hit = { id: string; index: number; keyLen: number };
  const hits: Hit[] = [];
  for (const c of candidates) {
    for (const k of c.keys) {
      const re = new RegExp(`${escapeRegExp(k)}${suffixRe}(?=${sepRe}|$)`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(s)) !== null) {
        hits.push({ id: c.id, index: m.index, keyLen: k.length });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) =>
    a.index !== b.index ? a.index - b.index : b.keyLen - a.keyLen,
  );
  return hits[0]?.id ?? null;
}

function buildSharedMemoForBanter(leadName: string) {
  return `【共有メモ】先頭は「${leadName}」。あなたは脇役として短い感想/合いの手だけ返す。内容の言い換え復唱は禁止。`;
}

function sanitizeJudgeTriggers(s: string) {
  const replaces: Array<[RegExp, string]> = [
    [/釣行判断/g, "判断"],
    [/釣り行く/g, "出かける"],
    [/釣りいく/g, "出かける"],
    [/今日どう/g, "今日の方針"],
    [/明日どう/g, "明日の方針"],
    [/風/g, "条件A"],
    [/雨/g, "条件B"],
    [/波/g, "条件C"],
    [/潮/g, "条件D"],
    [/満潮/g, "時刻1"],
    [/干潮/g, "時刻2"],
    [/水温/g, "水の温度"],
    [/ポイント/g, "場所候補"],
  ];

  let out = s;
  for (const [re, to] of replaces) out = out.replace(re, to);
  return out;
}

function buildSharedMemoForJudgeFollowers(leadName: string, leadReply: string) {
  const t = (leadReply ?? "").trim();
  if (!t) return `【共有メモ】${leadName}の結論：取得失敗`;

  const firstLine =
    t
      .split("\n")
      .map((x) => x.trim())
      .find(Boolean) ?? "";

  const conclusion = /(行く|様子見|やめる)/.test(firstLine)
    ? firstLine
    : `（結論不明：先頭行=${firstLine.slice(0, 40)}）`;

  const numbers = (t.match(/-?\d+(\.\d+)?/g) ?? []).slice(0, 8).join(", ");
  const numPart = numbers ? ` / 参考数値: ${numbers}` : "";

  return sanitizeJudgeTriggers(
    `【共有メモ】先頭（${leadName}）の結論：${conclusion}${numPart}`,
  );
}

function roleHintForBanter(leadName: string) {
  return `
【あなたの役割（掛け合い：感想係）】
- 先頭「${leadName}」がメイン回答者。あなたは脇役。
- 3〜6行、段落は1〜2個。先頭より短く。
- 先頭の内容を言い換えて復唱しない（要約も最大1文まで）。
- 出せるのは最大2つ：①感想/合いの手 ②質問1つ（任意）
- “自分の気持ち” でOK。情報を盛らない。
`.trim();
}

function rewriteLastUserForJudgeFollower(
  baseThread: { role: "user" | "assistant"; content: string }[],
  day: "today" | "tomorrow",
) {
  const idx = [...baseThread].reverse().findIndex((m) => m.role === "user");
  if (idx < 0) return baseThread;
  const lastUserIndex = baseThread.length - 1 - idx;

  const dayText = day === "tomorrow" ? "明日" : "今日";
  const replaced = `全員集合の相談：${dayText}の予定について、先頭担当の結論に沿って「補足」や「作戦」を短く提案して。結論は変えない。`;

  return baseThread.map((m, i) =>
    i === lastUserIndex ? { ...m, content: replaced } : m,
  );
}

function getCharacterColor(c: CharacterProfileWithColor | undefined | null) {
  const raw = c?.color;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "#ff7aa2";
}

export default function Chat({ back, goCharacterSettings }: Props) {
  const [characters, setCharacters] = useState<CharacterProfileWithColor[]>(
    () => safeLoadCharacters(),
  );
  const fallback = useMemo(() => characters[0], [characters]);

  const [selectedId, setSelectedId] = useState<string>(() =>
    safeLoadSelectedCharacterId(safeLoadCharacters()[0]?.id ?? "tsuduri"),
  );

  const selectedCharacter = useMemo(
    () => readCharacterProfile(selectedId, fallback),
    [selectedId, fallback],
  );

  const [roomMode, setRoomMode] = useState<"single" | "all">("single");
  const roomId = roomMode === "single" ? selectedId : "all";

  const [messages, setMessages] = useState<Msg[]>(() =>
    safeLoadHistory(roomId),
  );
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const scrollBoxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);

  function focusInput() {
    const el = inputRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      try {
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } catch {
        // ignore
      }
    });
  }

  function scrollToBottom(mode: "auto" | "smooth" = "auto") {
    const box = scrollBoxRef.current;
    if (!box) return;

    const run = () => {
      box.scrollTop = box.scrollHeight;
    };

    if (mode === "smooth") {
      box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
      requestAnimationFrame(run);
      setTimeout(run, 0);
      setTimeout(run, 80);
      return;
    }

    requestAnimationFrame(run);
    setTimeout(run, 0);
    setTimeout(run, 80);
  }

  useEffect(() => {
    const onFocus = () => {
      const list = safeLoadCharacters();
      setCharacters(list);

      const newSelected = safeLoadSelectedCharacterId(list[0]?.id ?? "tsuduri");
      setSelectedId(newSelected);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    setMessages(safeLoadHistory(roomId));
    scrollToBottom("auto");
    focusInput();
  }, [roomId]);

  useEffect(() => {
    safeSaveHistory(roomId, messages);
    scrollToBottom("smooth");
  }, [messages, roomId]);

  useEffect(() => {
    safeSaveSelectedCharacterId(selectedId);
  }, [selectedId]);

  const titleName = roomMode === "all" ? "みんな" : selectedCharacter.name;
  const canSend = useMemo(() => !!input.trim() && !loading, [input, loading]);

  function clearHistory() {
    const ok = confirm("会話履歴を消す？（戻せないよ）");
    if (!ok) return;
    setMessages([]);
    try {
      localStorage.removeItem(historyKey(roomId));
    } catch {
      // ignore
    }
    focusInput();
  }

  async function callApiChat(
    payloadMessages: { role: "user" | "assistant"; content: string }[],
    character: CharacterProfileWithColor,
    systemHints: string[] = [],
  ) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: payloadMessages,
        characterProfile: character,
        systemHints,
      }),
    });

    if (!res.ok) {
      const bodyErr = await readErrorBody(res);
      throw new Error(`HTTP ${res.status}${bodyErr ? ` / ${bodyErr}` : ""}`);
    }

    const json: unknown = await res.json().catch(() => null);
    if (!isRecordLike(json) || json.ok !== true) {
      const err =
        isRecordLike(json) && typeof json.error === "string"
          ? json.error
          : "unknown_error";
      throw new Error(err);
    }
    const txt = typeof json.text === "string" ? json.text : "";
    return String(txt ?? "");
  }

  async function sendSingle() {
    const text = input.trim();
    if (!text || loading) return;

    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);

    setInput("");
    focusInput();

    setLoading(true);

    try {
      const thread = next.map((m) => ({ role: m.role, content: m.content }));
      const currentCharacter = readCharacterProfile(
        selectedId,
        selectedCharacter,
      );
      const reply = await callApiChat(thread, currentCharacter, []);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages([
        ...next,
        { role: "assistant", content: `ごめん…🥺\n理由：${msg}` },
      ]);
    } finally {
      setLoading(false);
      focusInput();
    }
  }

  async function sendAllHands() {
    const text = input.trim();
    if (!text || loading) return;

    const activeCharacters = characters;
    if (!activeCharacters.length) {
      alert("キャラがいないよ（キャラ設定で作ってね）");
      return;
    }

    const baseNext: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(baseNext);

    setInput("");
    focusInput();

    setLoading(true);

    const banterEnabled = safeLoadBanterEnabled();
    const banterRate = safeLoadBanterRate();

    try {
      let curMessages = baseNext;

      const mentionedId = detectMentionedCharacterId(text, activeCharacters);
      const judge = isFishingJudgeText(text);
      const day = detectTargetDay(text);

      let leadId: string;
      if (mentionedId) leadId = mentionedId;
      else leadId = shuffle(activeCharacters)[0].id;

      const lead =
        activeCharacters.find((c) => c.id === leadId) ?? activeCharacters[0];
      const rest = shuffle(activeCharacters.filter((c) => c.id !== lead.id));

      const banterCandidate = !!banterEnabled && !judge;
      const banterHit = banterCandidate && Math.random() * 100 < banterRate;

      {
        const thread0 = buildThreadForCharacter(curMessages, lead.id);
        const reply0 = await callApiChat(thread0, lead, []);
        curMessages = [
          ...curMessages,
          { role: "assistant", content: reply0, speakerId: lead.id },
        ];
        setMessages(curMessages);
        await sleep(120);
      }

      const leadName = lead.name ?? "先頭キャラ";
      const leadReply = curMessages[curMessages.length - 1]?.content ?? "";

      const sharedMemoJudge = judge
        ? buildSharedMemoForJudgeFollowers(leadName, leadReply)
        : null;

      for (let i = 0; i < rest.length; i++) {
        const c = rest[i];
        let threadForCall = buildThreadForCharacter(curMessages, c.id);
        const systemHints: string[] = [];

        if (judge) {
          threadForCall = rewriteLastUserForJudgeFollower(threadForCall, day);
          if (sharedMemoJudge) systemHints.push(sharedMemoJudge);
          systemHints.push(
            `【あなたは脇役】先頭の結論は変えない。短く補足だけ。復唱禁止。`,
          );
        } else if (banterHit || mentionedId) {
          systemHints.push(buildSharedMemoForBanter(leadName));
          systemHints.push(roleHintForBanter(leadName));
        } else {
          systemHints.push(buildSharedMemoForBanter(leadName));
          systemHints.push(
            `
【あなたの役割（通常：ちょい足し）】
- 先頭「${leadName}」がメイン。あなたは短く。
- 付け足すなら「別観点を1つ」だけ。
- 先頭の言い換え復唱は禁止。
`.trim(),
          );
        }

        const reply = await callApiChat(threadForCall, c, systemHints);
        curMessages = [
          ...curMessages,
          { role: "assistant", content: reply, speakerId: c.id },
        ];
        setMessages(curMessages);
        await sleep(120);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `ごめん…🥺\n理由：${msg}`,
          speakerId: selectedId,
        },
      ]);
    } finally {
      setLoading(false);
      focusInput();
    }
  }

  async function send() {
    if (roomMode === "all") return sendAllHands();
    return sendSingle();
  }

  const toggleAllHands = () =>
    setRoomMode((m) => (m === "all" ? "single" : "all"));

  const uiButtonStyle: CSSProperties = {
    padding: "6px 10px",
    borderRadius: 12,
    cursor: "pointer",
    height: 34,
    lineHeight: "20px",
    color: "rgba(255,255,255,0.90)",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.06)",
  };

  const uiButtonStyleActive: CSSProperties = {
    ...uiButtonStyle,
    background: "rgba(255,77,109,0.14)",
    color: "#fff",
    border: "1px solid rgba(255,77,109,0.55)",
  };

  const selectStyle: CSSProperties = {
    ...uiButtonStyle,
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    paddingRight: 30,
  };

  return (
    <PageShell
      title={<h1 style={{ margin: 0 }}>💬 {titleName}と話す</h1>}
      maxWidth={1100}
      showBack
      onBack={back}
      titleLayout="left"
      scrollY="hidden"
      contentPadding={"clamp(10px, 2vw, 18px)"}
    >
      <style>{`
        @keyframes tsuduri-dot-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.55; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
        .tsuduri-typing {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 14px;
          max-width: 80%;
        }
        .tsuduri-typing .label {
          font-size: 12px;
          color: rgba(255,255,255,0.70);
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

        .chat-btn.glass{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          height:34px;
          padding: 6px 10px;
          border-radius:12px;
          cursor:pointer;
          user-select:none;
          color: rgba(255,255,255,0.90);
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.18);
        }
        .chat-btn.glass.is-active{
          background: rgba(255,77,109,0.14);
          border: 1px solid rgba(255,77,109,0.55);
          color:#fff;
        }
        .chat-quick{
          display:flex;
          flex-wrap:wrap;
          gap:8px;
          min-width:0;
        }
      `}</style>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minWidth: 0,
          height:
            "calc(100svh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 24px)",
          maxHeight: "100%",
          overflow: "hidden",
        }}
      >
        {/* ヘッダー操作群 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            minWidth: 0,
          }}
        >
          <div style={{ minWidth: 0 }} />

          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              minWidth: 0,
            }}
          >
            <button
              type="button"
              onClick={toggleAllHands}
              title="全員集合にすると1投げに全員が返す"
              className={`chat-btn glass ${roomMode === "all" ? "is-active" : ""}`}
              style={roomMode === "all" ? uiButtonStyleActive : uiButtonStyle}
            >
              {roomMode === "all" ? "👥 全員集合：ON" : "👤 全員集合：OFF"}
            </button>

            {roomMode === "single" && (
              <div
                style={{
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                <select
                  ref={selectRef}
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  title="キャラ切替（履歴も切り替わる）"
                  style={selectStyle}
                  className="glass"
                >
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <span
                  style={{
                    position: "absolute",
                    right: 10,
                    pointerEvents: "none",
                    color: "rgba(255,255,255,0.55)",
                    fontSize: 12,
                    transform: "translateY(-1px)",
                  }}
                >
                  ▼
                </span>
              </div>
            )}

            <button
              onClick={goCharacterSettings}
              title="キャラ管理（掛け合い設定もここ）"
              className="chat-btn glass"
              style={uiButtonStyle}
            >
              🎭
            </button>

            <button
              onClick={clearHistory}
              title="履歴を全消し"
              className="chat-btn glass"
              style={uiButtonStyle}
            >
              🧹
            </button>
          </div>
        </div>

        {/* 履歴（ここだけスクロール） */}
        <div
          ref={scrollBoxRef}
          className="glass glass-strong"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            borderRadius: 14,
            padding: 12,
            minWidth: 0,
          }}
        >
          {messages.length === 0 ? (
            <div style={{ color: "rgba(255,255,255,0.60)", fontSize: 13 }}>
              {roomMode === "all"
                ? "釣嫁たち「ひろっち、今日はどうする？🎣」"
                : `${selectedCharacter.name}「ひろっち、今日はどうする？🎣」`}
            </div>
          ) : (
            messages.map((m, index) => {
              const isUser = m.role === "user";
              const speakerObj =
                !isUser && roomMode === "all"
                  ? characters.find((c) => c.id === m.speakerId)
                  : null;

              const speakerName = speakerObj?.name ?? "だれか";
              const speakerColor =
                roomMode === "all"
                  ? getCharacterColor(speakerObj)
                  : getCharacterColor(selectedCharacter);

              const bubbleBorder = !isUser
                ? `1px solid ${speakerColor}`
                : "1px solid transparent";

              return (
                <div
                  key={index}
                  style={{
                    marginBottom: 10,
                    textAlign: isUser ? "right" : "left",
                  }}
                >
                  {!isUser && roomMode === "all" && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          height: 18,
                          padding: "0 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#111",
                          background: speakerColor,
                          boxShadow: "0 0 0 1px rgba(255,255,255,0.08) inset",
                          userSelect: "none",
                        }}
                        title={speakerName}
                      >
                        {speakerName}
                      </span>
                    </div>
                  )}

                  <span
                    className={!isUser ? "glass" : undefined}
                    style={{
                      display: "inline-block",
                      padding: "10px 12px",
                      borderRadius: 14,
                      background: isUser ? "rgba(255,77,109,0.92)" : undefined,
                      color: "#fff",
                      maxWidth: "80%",
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.65,
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                      border: bubbleBorder,
                    }}
                  >
                    {m.content}
                  </span>
                </div>
              );
            })
          )}

          {loading && (
            <div style={{ marginTop: 6, textAlign: "left" }}>
              <div className="tsuduri-typing glass">
                <span className="label">入力中</span>
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            </div>
          )}
        </div>

        {/* クイック */}
        <div className="chat-quick">
          <button
            type="button"
            onClick={() => {
              setInput("最近元気～？");
              focusInput();
            }}
            className="chat-btn glass"
            style={{ opacity: 0.92, ...uiButtonStyle }}
          >
            😌 元気？
          </button>
          <button
            type="button"
            onClick={() => {
              setInput("今日の釣行判断よろしく！");
              focusInput();
            }}
            className="chat-btn glass"
            style={{ opacity: 0.92, ...uiButtonStyle }}
          >
            🎣 釣行判断：今日
          </button>
          <button
            type="button"
            onClick={() => {
              setInput("明日の釣行判断よろしく！");
              focusInput();
            }}
            className="chat-btn glass"
            style={{ opacity: 0.92, ...uiButtonStyle }}
          >
            🌙 釣行判断：明日
          </button>
        </div>

        {/* 入力欄（常に見える） */}
        <div
          className="glass glass-strong"
          style={{ borderRadius: 14, padding: 10 }}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              minWidth: 0,
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={
                roomMode === "all"
                  ? "みんなに投げかける…"
                  : `${selectedCharacter.name}に話しかける…`
              }
              className="glass"
              style={{
                flex: 1,
                padding: 10,
                minWidth: 0,
                borderRadius: 12,
                color: "#fff",
                outline: "none",
              }}
            />

            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={send}
              disabled={!canSend}
              className="chat-btn glass"
              style={{
                ...uiButtonStyle,
                opacity: canSend ? 1 : 0.55,
                cursor: canSend ? "pointer" : "not-allowed",
              }}
            >
              {loading ? "送信中…" : roomMode === "all" ? "全員に送る" : "送信"}
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
