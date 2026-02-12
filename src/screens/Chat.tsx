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
    const role = (item as any).role;
    const content = (item as any).content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;
    out.push({ role: role as "user" | "assistant", content });
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

function readCharacterProfile(
  id: string,
  fallback: CharacterProfileWithColor,
): CharacterProfileWithColor {
  const list = safeLoadCharacters();
  return list.find((c) => c.id === id) ?? fallback;
}

async function readErrorBody(res: Response): Promise<string | null> {
  try {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j: unknown = await res.json().catch(() => null);
      if (isRecordLike(j)) {
        if (typeof (j as any).error === "string") return (j as any).error;
        if (typeof (j as any).message === "string") return (j as any).message;
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

/**
 * ============================
 * 釣行判断検知（サーバ側と揃える）
 * ============================
 */
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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * ============================
 * Open-Meteo（ブラウザ直叩き）
 * - “共有IP巻き込み”を避けるため client 側で取得
 * - Daily endpoint で軽量化
 * - localStorage キャッシュ（デイキー+TTL）
 * ============================
 */
const WEATHER_CACHE_PREFIX = "tsuduri_openmeteo_daily_v1:";
const OPENMETEO_TTL_MS = 30 * 60 * 1000; // 30分

type WeatherDailySummary = {
  tempMin: number;
  tempMax: number;
  windMax: number;
  gustMax: number;
  rainProbMax: number;
  rainSum: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function safeNumber(x: unknown) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function cacheGet(key: string): { ts: number; text: string } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw) as any;
    if (!obj || typeof obj !== "object") return null;
    if (typeof obj.ts !== "number") return null;
    if (typeof obj.text !== "string") return null;
    return { ts: obj.ts, text: obj.text };
  } catch {
    return null;
  }
}

function cacheSet(key: string, value: { ts: number; text: string }) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

async function fetchOpenMeteoDaily(lat: number, lon: number) {
  const tz = "Asia/Tokyo";
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lon))}` +
    `&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max` +
    `&forecast_days=2` +
    `&timezone=${encodeURIComponent(tz)}` +
    `&wind_speed_unit=ms`;

  const res = await fetch(url, { method: "GET" });
  const text = await res.text().catch(() => "");

  if (!res.ok) {
    const head = (text || "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (res.status === 429)
      throw new Error(`openmeteo_rate_limited_429${head ? `:${head}` : ""}`);
    throw new Error(`openmeteo_http_${res.status}${head ? `:${head}` : ""}`);
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`openmeteo_json_parse_failed:${text.slice(0, 160)}`);
  }
  return json;
}

function summarizeDaily(json: any, day: string): WeatherDailySummary {
  const d = json?.daily;
  const times: string[] = d?.time ?? [];
  const idx = times.findIndex((t) => typeof t === "string" && t === day);
  if (idx < 0) {
    return {
      tempMin: 0,
      tempMax: 0,
      windMax: 0,
      gustMax: 0,
      rainProbMax: 0,
      rainSum: 0,
    };
  }

  const tmin = safeNumber(d?.temperature_2m_min?.[idx]);
  const tmax = safeNumber(d?.temperature_2m_max?.[idx]);
  const pop = safeNumber(d?.precipitation_probability_max?.[idx]);
  const psum = safeNumber(d?.precipitation_sum?.[idx]);
  const wmax = safeNumber(d?.wind_speed_10m_max?.[idx]);
  const gmax = safeNumber(d?.wind_gusts_10m_max?.[idx]);

  return {
    tempMin: round1(tmin),
    tempMax: round1(tmax),
    windMax: round1(wmax),
    gustMax: round1(gmax),
    rainProbMax: Math.round(clamp(pop, 0, 100)),
    rainSum: round1(Math.max(0, psum)),
  };
}

async function buildClientWeatherMemo(
  targetDay: "today" | "tomorrow",
): Promise<string> {
  // 焼津周辺（サーバ側と揃える）
  const YAIZU = { lat: 34.868, lon: 138.3236 };

  const today = new Date();
  const t = new Date(today);
  if (targetDay === "tomorrow") t.setDate(t.getDate() + 1);

  const day = dayKey(t);
  const cacheKey = `${WEATHER_CACHE_PREFIX}${YAIZU.lat},${YAIZU.lon}:${day}`;

  const now = Date.now();
  const cached = cacheGet(cacheKey);
  if (cached && now - cached.ts <= OPENMETEO_TTL_MS) {
    return cached.text;
  }

  const json = await fetchOpenMeteoDaily(YAIZU.lat, YAIZU.lon);
  const s = summarizeDaily(json, day);

  const label = targetDay === "tomorrow" ? "明日" : "今日";
  // dailyなので雨は “日合計” が基本。釣行判断には十分。
  const memo = `
【Weather：${label}（焼津周辺の目安 / 単位：風m/s・雨mm/日）】
- 気温 ${s.tempMin}〜${s.tempMax}℃
- 風 最大 ${s.windMax}（突風 ${s.gustMax}）m/s
- 雨 確率最大 ${s.rainProbMax}%（合計 ${s.rainSum}mm）
`.trim();

  cacheSet(cacheKey, { ts: now, text: memo });
  return memo;
}

export default function Chat({ back, goCharacterSettings }: Props) {
  const [characters, setCharacters] = useState<CharacterProfileWithColor[]>(
    () => safeLoadCharacters(),
  );
  const fallback = useMemo(
    () => characters[0] ?? safeLoadCharacters()[0],
    [characters],
  );

  const [selectedId, setSelectedId] = useState<string>(() =>
    safeLoadSelectedCharacterId(safeLoadCharacters()[0]?.id ?? "tsuduri"),
  );

  const selectedCharacter = useMemo(
    () => readCharacterProfile(selectedId, fallback),
    [selectedId, fallback],
  );

  // 単体チャット：履歴キーはキャラID
  const roomId = selectedId;

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

  // 他画面でキャラ編集したあと戻ってきたとき反映
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

  // キャラ切替で履歴切替
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
    clientWeatherMemo: string | null,
  ) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: payloadMessages,
        characterProfile: character,
        systemHints: [],
        clientWeatherMemo, // ✅ 釣行判断の天気はクライアントから渡す
      }),
    });

    if (!res.ok) {
      const bodyErr = await readErrorBody(res);
      throw new Error(`HTTP ${res.status}${bodyErr ? ` / ${bodyErr}` : ""}`);
    }

    const json: unknown = await res.json().catch(() => null);
    if (!isRecordLike(json) || (json as any).ok !== true) {
      const err =
        isRecordLike(json) && typeof (json as any).error === "string"
          ? (json as any).error
          : "unknown_error";
      throw new Error(err);
    }

    const txt =
      typeof (json as any).text === "string" ? (json as any).text : "";
    return String(txt ?? "");
  }

  async function send() {
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

      // ✅ 釣行判断なら、先にブラウザでOpen-Meteoを取得して“メモ”化
      let clientWeatherMemo: string | null = null;
      if (isFishingJudgeText(text)) {
        const targetDay = detectTargetDay(text);
        try {
          clientWeatherMemo = await buildClientWeatherMemo(targetDay);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          clientWeatherMemo = `【Weather】取得失敗（${msg}）`;
        }
      }

      const reply = await callApiChat(
        thread,
        currentCharacter,
        clientWeatherMemo,
      );
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

  const uiButtonStyle: CSSProperties = {
    padding: "6px 10px",
    borderRadius: 12,
    cursor: "pointer",
    height: 34,
    lineHeight: "20px",
    color: "rgba(255,255,255,0.90)",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(17,17,17,var(--glass-alpha,0.22))",
    userSelect: "none",
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
      title={<h1 style={{ margin: 0 }}>💬 {selectedCharacter.name}と話す</h1>}
      maxWidth={1100}
      showBack
      onBack={back}
      titleLayout="left"
      scrollY="hidden"
      contentPadding={"clamp(10px, 2vw, 18px)"}
      displayCharacterId={selectedId} // ✅ 選択キャラと表示キャラをリンク
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
          background: rgba(17,17,17,var(--glass-alpha,0.22));
          border: 1px solid rgba(255,255,255,0.18);
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
          height: "calc(100dvh - var(--shell-header-h))",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 12,
            minWidth: 0,
            flexWrap: "wrap",
          }}
        >
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

          <button
            onClick={goCharacterSettings}
            title="キャラ管理"
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

        <div
          ref={scrollBoxRef}
          className="glass glass-strong"
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            borderRadius: 14,
            padding: 12,
            minWidth: 0,
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
          }}
        >
          {messages.length === 0 ? (
            <div style={{ color: "rgba(255,255,255,0.60)", fontSize: 13 }}>
              {selectedCharacter.name}「ひろっち、今日はどうする？🎣」
            </div>
          ) : (
            messages.map((m, index) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={index}
                  style={{
                    marginBottom: 10,
                    textAlign: isUser ? "right" : "left",
                  }}
                >
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
                      border: !isUser
                        ? "1px solid rgba(255,255,255,0.16)"
                        : "1px solid transparent",
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

        <div className="chat-quick">
          <button
            type="button"
            onClick={() => {
              setInput("元気にしてる？");
              focusInput();
            }}
            className="chat-btn glass"
            style={{ opacity: 0.92, ...uiButtonStyle }}
          >
            😌 元気にしてる？
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
            🎣 今日の釣行判断
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
            🌙 明日の釣行判断
          </button>
        </div>

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
              placeholder={`${selectedCharacter.name}に話しかける…`}
              className="glass"
              style={{
                flex: 1,
                padding: 10,
                minWidth: 0,
                borderRadius: 12,
                color: "rgba(255,255,255,0.92)",
                outline: "none",
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(17,17,17,var(--glass-alpha,0.22))",
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
              {loading ? "送信中…" : "送信"}
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
