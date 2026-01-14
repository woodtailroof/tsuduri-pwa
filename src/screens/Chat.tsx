// src/screens/Chat.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import PageShell from "../components/PageShell";
import {
  ALL_HANDS_ROOM_ID,
  type ChatMsg,
  type CharacterProfile,
  getActiveCharacter,
  getActiveCharacterId,
  listCharacters,
  loadChatHistory,
  saveChatHistory,
  setActiveCharacterId,
} from "../lib/characterStore";

type Props = {
  back: () => void;
  goCharacterSettings: () => void;
};

type RoomMode = "single" | "all";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

export default function Chat({ back, goCharacterSettings }: Props) {
  // ✅ characterStore.ts を正とする（unknown化を防ぐ）
  const [characters, setCharacters] = useState<CharacterProfile[]>(() =>
    listCharacters()
  );
  const [roomMode, setRoomMode] = useState<RoomMode>("single");

  // ✅ activeId も characterStore.ts を正とする
  const [selectedId, setSelectedId] = useState<string>(() =>
    getActiveCharacterId()
  );

  const selectedCharacter = useMemo(() => {
    const hit = characters.find((c) => c.id === selectedId);
    return hit ?? characters[0] ?? getActiveCharacter();
  }, [characters, selectedId]);

  const roomId = roomMode === "all" ? ALL_HANDS_ROOM_ID : selectedId;

  const [messages, setMessages] = useState<ChatMsg[]>(() =>
    loadChatHistory(roomId)
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

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

  // ✅ 画面全体はスクロールさせない（チャット欄だけ）
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ✅ 画面復帰時にキャラ一覧/選択を同期（Settingsで作ったキャラが反映される）
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

  // ✅ ルーム切替で履歴ロード
  useEffect(() => {
    setMessages(loadChatHistory(roomId));
    scrollToBottom("auto");
    focusInput();
  }, [roomId]);

  // ✅ 履歴保存
  useEffect(() => {
    saveChatHistory(roomId, messages);
    scrollToBottom("smooth");
  }, [messages, roomId]);

  // ✅ 選択キャラ保存（activeId）
  useEffect(() => {
    setActiveCharacterId(selectedId);
  }, [selectedId]);

  const titleName = roomMode === "all" ? "みんな" : selectedCharacter.label;
  const canSend = useMemo(() => !!input.trim() && !loading, [input, loading]);

  function clearHistory() {
    const ok = confirm("会話履歴を消す？（戻せないよ）");
    if (!ok) return;
    setMessages([]);
    saveChatHistory(roomId, []);
    focusInput();
  }

  async function callApiChat(
    payload: { role: "user" | "assistant"; content: string }[],
    character: CharacterProfile
  ) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: payload,
        characterProfile: character,
        systemHints: [],
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

    const next: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next);

    setInput("");
    focusInput();

    setLoading(true);
    try {
      const thread = next.map((m) => ({ role: m.role, content: m.content }));
      const reply = await callApiChat(thread, selectedCharacter);
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

    const list = listCharacters();
    if (!list.length) {
      alert("キャラがいないよ（設定で作ってね）");
      return;
    }

    const baseNext: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(baseNext);

    setInput("");
    focusInput();

    setLoading(true);
    try {
      let cur = baseNext;

      // 先頭は active に寄せる（自然）
      const lead = list.find((c) => c.id === getActiveCharacterId()) ?? list[0];
      const rest = list.filter((c) => c.id !== lead.id);

      // 1) 先頭
      {
        const reply0 = await callApiChat(
          cur.map((m) => ({ role: m.role, content: m.content })),
          lead
        );
        cur = [
          ...cur,
          {
            role: "assistant",
            content: reply0,
            speakerId: lead.id,
            speakerLabel: lead.label,
          },
        ];
        setMessages(cur);
        await sleep(120);
      }

      // 2) 後続（とりあえず全員普通に返す。掛け合い最適化は次の段階で戻す）
      for (const c of rest) {
        const reply = await callApiChat(
          cur.map((m) => ({ role: m.role, content: m.content })),
          c
        );
        cur = [
          ...cur,
          {
            role: "assistant",
            content: reply,
            speakerId: c.id,
            speakerLabel: c.label,
          },
        ];
        setMessages(cur);
        await sleep(120);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `ごめん…🥺\n理由：${msg}` },
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

  const uiButtonStyle: React.CSSProperties = {
    padding: "6px 10px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.82)",
    cursor: "pointer",
    height: 34,
    lineHeight: "20px",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  };

  const uiButtonStyleActive: React.CSSProperties = {
    ...uiButtonStyle,
    background: "rgba(255,77,109,0.14)",
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
        {/* ヘッダー */}
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
              onClick={() =>
                setRoomMode((m) => (m === "all" ? "single" : "all"))
              }
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
              title="設定"
              style={uiButtonStyle}
            >
              ⚙️
            </button>

            <button
              onClick={clearHistory}
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
            background: "rgba(0,0,0,0.20)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            minWidth: 0,
          }}
        >
          {messages.length === 0 ? (
            <div style={{ color: "rgba(255,255,255,0.60)", fontSize: 13 }}>
              {roomMode === "all"
                ? "釣嫁たち「ひろっち、今日はどうする？🎣」"
                : `${selectedCharacter.label}「ひろっち、今日はどうする？🎣」`}
            </div>
          ) : (
            messages.map((m, index) => {
              const isUser = m.role === "user";
              const who =
                !isUser && roomMode === "all"
                  ? characters.find((c) => c.id === m.speakerId)
                  : null;
              const speakerName = who?.label ?? m.speakerLabel ?? "だれか";

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
                        fontSize: 12,
                        color: "rgba(255,255,255,0.70)",
                        marginBottom: 6,
                      }}
                    >
                      {speakerName}
                    </div>
                  )}

                  <span
                    style={{
                      display: "inline-block",
                      padding: "10px 12px",
                      borderRadius: 14,
                      background: isUser
                        ? "rgba(255,77,109,0.92)"
                        : "rgba(0,0,0,0.22)",
                      color: "#fff",
                      maxWidth: "80%",
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.65,
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                      border: "1px solid rgba(255,255,255,0.14)",
                      backdropFilter: "blur(10px)",
                      WebkitBackdropFilter: "blur(10px)",
                    }}
                  >
                    {m.content}
                  </span>
                </div>
              );
            })
          )}

          {loading && (
            <div
              style={{
                marginTop: 6,
                textAlign: "left",
                color: "rgba(255,255,255,0.75)",
              }}
            >
              入力中…
            </div>
          )}
        </div>

        {/* 入力行 */}
        <div
          style={{
            flex: "0 0 auto",
            padding: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 14,
            background: "rgba(0,0,0,0.18)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
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
                  : `${selectedCharacter.label}に話しかける…`
              }
              style={{
                flex: 1,
                padding: 10,
                minWidth: 0,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.22)",
                color: "#fff",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
              disabled={false}
            />

            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={send}
              disabled={!canSend}
              style={{
                ...uiButtonStyle,
                opacity: canSend ? 1 : 0.5,
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
