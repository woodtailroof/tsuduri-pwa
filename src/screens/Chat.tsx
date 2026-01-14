// src/screens/Chat.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import PageShell from "../components/PageShell";
import {
  ALL_HANDS_ROOM_ID,
  loadChatHistory,
  saveChatHistory,
  clearChatHistory,
  listCharacters,
  getActiveCharacterId,
  setActiveCharacterId,
  type CharacterProfile,
  type ChatMsg,
} from "../lib/characterStore";

type Props = {
  back: () => void;
  goCharacterSettings: () => void;
};

type Msg = ChatMsg;

const GLASS_BG = "rgba(17,17,17,var(--glass-alpha,0.22))";
const GLASS_BG_STRONG = "rgba(17,17,17,var(--glass-alpha-strong,0.35))";
const GLASS_BLUR = "blur(var(--glass-blur,0px))";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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
    text ?? ""
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

/**
 * ✅ 指名検出（characterStore版）
 * label / selfName をキーにする
 */
function detectMentionedCharacterId(
  text: string,
  characters: CharacterProfile[]
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
    const full = (c.label ?? "").trim();
    const tail = full ? tailNickname(full) : null;
    const self = (c.selfName ?? "").trim();
    const keys = uniqStrings([full, tail, self]).filter(
      (k) => (k ?? "").trim().length >= 2
    );
    keys.sort((a, b) => b.length - a.length);
    return { id: c.id, keys };
  });

  // 先頭指名（強）
  for (const c of candidates) {
    for (const k of c.keys) {
      const headPatterns = [
        new RegExp(`^${escapeRegExp(k)}${suffixRe}${sepRe}`),
        new RegExp(`^@${escapeRegExp(k)}${suffixRe}${sepRe}`),
      ];
      if (headPatterns.some((re) => re.test(s))) return c.id;
    }
  }

  // 文中指名（弱）
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
    a.index !== b.index ? a.index - b.index : b.keyLen - a.keyLen
  );
  return hits[0]?.id ?? null;
}

/**
 * 全員集合ルーム用：
 * - user は全キャラ共通で入れる
 * - assistant は speakerId がそのキャラのものだけ入れる
 */
function buildThreadForCharacter(allRoomMessages: Msg[], speakerId: string) {
  return allRoomMessages
    .filter((m) => {
      if (m.role === "user") return true;
      if (m.role === "assistant") return m.speakerId === speakerId;
      return false;
    })
    .map((m) => ({ role: m.role, content: m.content }));
}

async function readErrorBody(res: Response): Promise<string | null> {
  try {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = await res.json().catch(() => null);
      if (j?.error) return String(j.error);
      if (j?.message) return String(j.message);
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

/** APIに送る “キャラ” を client 側で整形（後方互換のために寄せる） */
function toApiCharacter(profile: CharacterProfile) {
  // serverがどの形を期待してても拾えるよう、名前候補を多めに持たせる
  const name = profile.label;
  return {
    id: profile.id,

    // よくあるキー
    name,
    label: profile.label,
    selfName: profile.selfName,
    self: profile.selfName,
    callUser: profile.callUser,

    // “人格メモ”
    description: profile.systemNote,
    prompt: profile.systemNote,
    systemNote: profile.systemNote,

    // ノブ類
    temperature: profile.temperature,
    sweetness: profile.sweetness,
    teasing: profile.teasing,
    chuni: profile.chuni,
    emoji: profile.emoji,

    volume: profile.volume,
    affection: profile.affection,
    formality: profile.formality,

    // 画像
    imageSrc: profile.imageSrc,
  };
}

export default function Chat({ back, goCharacterSettings }: Props) {
  const [characters, setCharacters] = useState<CharacterProfile[]>(() =>
    listCharacters()
  );
  const [selectedId, setSelectedId] = useState<string>(() =>
    getActiveCharacterId()
  );

  const selectedCharacter = useMemo(() => {
    const list = characters.length ? characters : listCharacters();
    const hit = list.find((c) => c.id === selectedId);
    return hit ?? list[0];
  }, [characters, selectedId]);

  const [roomMode, setRoomMode] = useState<"single" | "all">("single");
  const roomId = roomMode === "single" ? selectedId : ALL_HANDS_ROOM_ID;

  const [messages, setMessages] = useState<Msg[]>(() =>
    loadChatHistory(roomId)
  );
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const scrollBoxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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

  // チャット欄だけスクロール
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // 画面復帰でキャラ最新化
  useEffect(() => {
    const onFocus = () => {
      const list = listCharacters();
      setCharacters(list);
      const active = getActiveCharacterId();
      setSelectedId(active);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // ルーム切替
  useEffect(() => {
    setMessages(loadChatHistory(roomId));
    scrollToBottom("auto");
    focusInput();
  }, [roomId]);

  // 保存
  useEffect(() => {
    saveChatHistory(roomId, messages);
    scrollToBottom("smooth");
  }, [messages, roomId]);

  // 選択キャラ保存（activeId）
  useEffect(() => {
    setActiveCharacterId(selectedId);
  }, [selectedId]);

  const titleName =
    roomMode === "all" ? "みんな" : selectedCharacter?.label ?? "つづり";
  const canSend = useMemo(() => !!input.trim() && !loading, [input, loading]);

  function clearHistoryUI() {
    const ok = confirm("会話履歴を消す？（戻せないよ）");
    if (!ok) return;
    clearChatHistory(roomId);
    setMessages([]);
    focusInput();
  }

  async function callApiChat(
    payloadMessages: { role: "user" | "assistant"; content: string }[],
    character: CharacterProfile,
    systemHints: string[] = []
  ) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: payloadMessages,
        characterProfile: toApiCharacter(character),
        systemHints,
      }),
    });

    if (!res.ok) {
      const bodyErr = await readErrorBody(res);
      throw new Error(`HTTP ${res.status}${bodyErr ? ` / ${bodyErr}` : ""}`);
    }

    const json = await res.json().catch(() => null);
    if (!json?.ok)
      throw new Error(json?.error ? String(json.error) : "unknown_error");
    return String(json.text ?? "");
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
      const reply = await callApiChat(thread, selectedCharacter, []);
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

    const activeCharacters = characters.length ? characters : listCharacters();
    if (!activeCharacters.length) {
      alert("キャラがいないよ（キャラ設定で作ってね）");
      return;
    }

    const baseNext: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(baseNext);

    setInput("");
    focusInput();
    setLoading(true);

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

      // 1) 先頭
      {
        const thread0 = buildThreadForCharacter(curMessages, lead.id);
        const reply0 = await callApiChat(thread0, lead, []);
        curMessages = [
          ...curMessages,
          {
            role: "assistant",
            content: reply0,
            speakerId: lead.id,
            speakerLabel: lead.label,
          },
        ];
        setMessages(curMessages);
        await sleep(120);
      }

      const leadName = lead.label ?? "先頭キャラ";

      // 2) 後続（今回は“掛け合い最適化ロジック”は残したまま、最低限のヒントだけ渡す）
      for (let i = 0; i < rest.length; i++) {
        const c = rest[i];
        const threadForCall = buildThreadForCharacter(curMessages, c.id);

        const systemHints: string[] = [];
        if (judge) {
          const dayText = day === "tomorrow" ? "明日" : "今日";
          systemHints.push(
            `【全員集合】先頭は「${leadName}」。あなたは脇役。結論は変えない。${dayText}の作戦を短く補足。復唱禁止。`
          );
        } else if (mentionedId) {
          systemHints.push(
            `【全員集合】先頭は「${leadName}」。あなたは短い合いの手＋1つだけ追加観点。復唱禁止。`
          );
        } else {
          systemHints.push(
            `【全員集合】先頭は「${leadName}」。あなたは短く。復唱禁止。`
          );
        }

        const reply = await callApiChat(threadForCall, c, systemHints);
        curMessages = [
          ...curMessages,
          {
            role: "assistant",
            content: reply,
            speakerId: c.id,
            speakerLabel: c.label,
          },
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

  const uiButtonStyle: React.CSSProperties = {
    padding: "6px 10px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: GLASS_BG,
    color: "rgba(255,255,255,0.82)",
    cursor: "pointer",
    height: 34,
    lineHeight: "20px",
    backdropFilter: GLASS_BLUR,
    WebkitBackdropFilter: GLASS_BLUR,
  };

  const uiButtonStyleActive: React.CSSProperties = {
    ...uiButtonStyle,
    background: GLASS_BG_STRONG,
    color: "#fff",
    border: "1px solid rgba(255,77,109,0.55)",
  };

  const selectStyle: React.CSSProperties = {
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
          background: ${GLASS_BG};
          border: 1px solid rgba(255,255,255,0.14);
          color: #fff;
          max-width: 80%;
          backdrop-filter: ${GLASS_BLUR};
          -webkit-backdrop-filter: ${GLASS_BLUR};
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
      `}</style>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minWidth: 0,
          height: "calc(100dvh - 120px)",
          overflow: "hidden",
        }}
      >
        {/* ヘッダー行 */}
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
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  title="キャラ切替（履歴も切り替わる）"
                  style={selectStyle}
                >
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
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
              title="キャラ管理"
              style={uiButtonStyle}
            >
              🎭
            </button>

            <button
              onClick={clearHistoryUI}
              title="履歴を全消し"
              style={uiButtonStyle}
            >
              🧹
            </button>
          </div>
        </div>

        {/* メッセージ */}
        <div
          ref={scrollBoxRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 14,
            padding: 12,
            background: GLASS_BG,
            backdropFilter: GLASS_BLUR,
            WebkitBackdropFilter: GLASS_BLUR,
            minWidth: 0,
          }}
        >
          {messages.length === 0 ? (
            <div style={{ color: "rgba(255,255,255,0.60)", fontSize: 13 }}>
              {roomMode === "all"
                ? "釣嫁たち「ひろっち、今日はどうする？🎣」"
                : `${
                    selectedCharacter?.label ?? "つづり"
                  }「ひろっち、今日はどうする？🎣」`}
            </div>
          ) : (
            messages.map((m, index) => {
              const isUser = m.role === "user";
              const speakerObj =
                !isUser && roomMode === "all"
                  ? characters.find((c) => c.id === m.speakerId)
                  : null;
              const speakerName =
                speakerObj?.label ?? m.speakerLabel ?? "だれか";

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
                          background: "rgba(255,255,255,0.75)",
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
                    style={{
                      display: "inline-block",
                      padding: "10px 12px",
                      borderRadius: 14,
                      background: isUser ? "rgba(255,77,109,0.92)" : GLASS_BG,
                      color: "#fff",
                      maxWidth: "80%",
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.65,
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                      border: "1px solid rgba(255,255,255,0.14)",
                      backdropFilter: GLASS_BLUR,
                      WebkitBackdropFilter: GLASS_BLUR,
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, minWidth: 0 }}>
          <button
            type="button"
            onClick={() => {
              setInput("最近元気～？");
              focusInput();
            }}
            style={{ opacity: 0.9, ...uiButtonStyle }}
          >
            😌 元気？
          </button>
          <button
            type="button"
            onClick={() => {
              setInput("今日の釣行判断よろしく！");
              focusInput();
            }}
            style={{ opacity: 0.9, ...uiButtonStyle }}
          >
            🎣 釣行判断：今日
          </button>
          <button
            type="button"
            onClick={() => {
              setInput("明日の釣行判断よろしく！");
              focusInput();
            }}
            style={{ opacity: 0.9, ...uiButtonStyle }}
          >
            🌙 釣行判断：明日
          </button>
        </div>

        {/* 入力行 */}
        <div
          style={{
            flex: "0 0 auto",
            padding: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 14,
            background: GLASS_BG,
            backdropFilter: GLASS_BLUR,
            WebkitBackdropFilter: GLASS_BLUR,
          }}
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
                  : `${selectedCharacter?.label ?? "つづり"}に話しかける…`
              }
              style={{
                flex: 1,
                padding: 10,
                minWidth: 0,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: GLASS_BG,
                color: "#fff",
                backdropFilter: GLASS_BLUR,
                WebkitBackdropFilter: GLASS_BLUR,
              }}
            />

            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={send}
              disabled={!canSend}
              style={uiButtonStyle}
            >
              {loading ? "送信中…" : roomMode === "all" ? "全員に送る" : "送信"}
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
