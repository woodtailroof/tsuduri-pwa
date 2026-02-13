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
    const role = item.role;
    const content = item.content;
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
 * ===== 釣行判断判定（Chat側）=====
 * サーバ（Cloudflare Functions）から Open-Meteo を叩かず、
 * 釣行判断っぽい時だけブラウザから取得して systemHints に入れる。
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

function clampNum(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type WeatherSummary = {
  tempMin: number;
  tempMax: number;
  windAvg: number;
  windMax: number;
  gustMax: number;
  rainMaxProb: number;
  rainMaxMm: number;
  cloudAvg: number;
  weatherCodeMode: number | null;
  conditionText: string; // ✅ 概況（晴れ/くもり/雨など）
};

const OPENMETEO_TTL_MS = 10 * 60 * 1000;
const OPENMETEO_CACHE_KEY_PREFIX = "tsuduri_openmeteo_cache_v2:";

// WMO weather_code（Open-Meteo準拠）をざっくり日本語に
function weatherCodeToJp(code: number): string {
  if (!Number.isFinite(code)) return "不明";
  // Thunderstorm
  if ([95, 96, 99].includes(code)) return "雷";
  // Drizzle
  if ([51, 53, 55, 56, 57].includes(code)) return "霧雨";
  // Rain
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "雨";
  // Freezing rain
  if ([66, 67].includes(code)) return "凍雨";
  // Snow
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "雪";
  // Fog
  if ([45, 48].includes(code)) return "霧";
  // Clear / cloudy groups
  if (code === 0) return "晴れ";
  if (code === 1) return "晴れ時々くもり";
  if (code === 2) return "くもり";
  if (code === 3) return "くもり";
  return "不明";
}

function pickDayIndexes(times: string[], day: string) {
  const idxs: number[] = [];
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (typeof t === "string" && t.startsWith(day)) idxs.push(i);
  }
  return idxs;
}

// 日中(6-18時)のインデックスを優先して概況判定
function pickDaytimeIndexes(times: string[], idxs: number[]) {
  const out: number[] = [];
  for (const i of idxs) {
    const t = times[i];
    // "YYYY-MM-DDTHH:mm"
    const hh = Number((t ?? "").slice(11, 13));
    if (Number.isFinite(hh) && hh >= 6 && hh <= 18) out.push(i);
  }
  return out.length ? out : idxs; // 日中が取れなければ全日
}

function modeNumber(xs: number[]): number | null {
  if (!xs.length) return null;
  const m = new Map<number, number>();
  for (const x of xs) {
    if (!Number.isFinite(x)) continue;
    m.set(x, (m.get(x) ?? 0) + 1);
  }
  let best: { k: number; v: number } | null = null;
  for (const [k, v] of m.entries()) {
    if (!best || v > best.v) best = { k, v };
  }
  return best ? best.k : null;
}

function summarizeOneDay(json: any, day: string): WeatherSummary {
  const h = json?.hourly;
  const times: string[] = h?.time ?? [];
  const idxsAll = pickDayIndexes(times, day);

  const safe: WeatherSummary = {
    tempMin: 0,
    tempMax: 0,
    windAvg: 0,
    windMax: 0,
    gustMax: 0,
    rainMaxProb: 0,
    rainMaxMm: 0,
    cloudAvg: 0,
    weatherCodeMode: null,
    conditionText: "不明",
  };
  if (!idxsAll.length) return safe;

  const idxs = pickDaytimeIndexes(times, idxsAll);

  const pick = (arr: any[], use: number[]) =>
    use.map((i) => Number(arr?.[i])).filter(Number.isFinite);

  const tempAll = pick(h?.temperature_2m ?? [], idxsAll);
  const prcpAll = pick(h?.precipitation ?? [], idxsAll);
  const popAll = pick(h?.precipitation_probability ?? [], idxsAll);
  const windAll = pick(h?.wind_speed_10m ?? [], idxsAll);
  const gustAll = pick(h?.wind_gusts_10m ?? [], idxsAll);

  // 概況用（主に日中）
  const cloudDay = pick(h?.cloud_cover ?? [], idxs);
  const codeDay = pick(h?.weather_code ?? [], idxs).map((x) => Math.round(x));

  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
  const max = (xs: number[]) =>
    xs.length ? xs.reduce((m, x) => (x > m ? x : m), xs[0]) : 0;
  const round1 = (n: number) => Math.round(n * 10) / 10;

  const codeMode = modeNumber(codeDay);
  const codeText = codeMode == null ? "不明" : weatherCodeToJp(codeMode);

  // cloud_cover補正（晴れ/くもり寄せ）
  const cloudAvg = avg(cloudDay);
  let condition = codeText;
  if (condition === "晴れ" && cloudAvg >= 55) condition = "晴れ時々くもり";
  if (
    (condition === "くもり" || condition === "晴れ時々くもり") &&
    cloudAvg < 25
  )
    condition = "晴れ";
  if (condition === "不明") {
    // 最低限のフォールバック
    if (max(popAll) >= 60 || max(prcpAll) >= 1) condition = "雨";
    else if (cloudAvg >= 60) condition = "くもり";
    else condition = "晴れ";
  }

  return {
    tempMin: tempAll.length ? round1(Math.min(...tempAll)) : 0,
    tempMax: tempAll.length ? round1(Math.max(...tempAll)) : 0,
    windAvg: round1(avg(windAll)),
    windMax: round1(max(windAll)),
    gustMax: round1(max(gustAll)),
    rainMaxProb: Math.round(max(popAll)),
    rainMaxMm: round1(max(prcpAll)),
    cloudAvg: round1(cloudAvg),
    weatherCodeMode: codeMode,
    conditionText: condition,
  };
}

async function fetchOpenMeteoHourly(lat: number, lon: number) {
  const tz = "Asia/Tokyo";
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lon))}` +
    // ✅ 概況用に weather_code / cloud_cover を追加
    `&hourly=temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,weather_code,cloud_cover` +
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

function loadWeatherCache(
  cacheKey: string,
): { ts: number; text: string } | null {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const j = JSON.parse(raw) as any;
    if (!j || typeof j !== "object") return null;
    const ts = Number(j.ts);
    const text = String(j.text ?? "");
    if (!Number.isFinite(ts) || !text) return null;
    return { ts, text };
  } catch {
    return null;
  }
}

function saveWeatherCache(
  cacheKey: string,
  data: { ts: number; text: string },
) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify(data));
  } catch {
    // ignore
  }
}

async function buildWeatherHint(
  targetDay: "today" | "tomorrow",
  lat: number,
  lon: number,
): Promise<string> {
  const now = new Date();
  const tmr = new Date(now);
  tmr.setDate(now.getDate() + 1);

  const day = targetDay === "tomorrow" ? dayKey(tmr) : dayKey(now);
  const cacheKey = `${OPENMETEO_CACHE_KEY_PREFIX}${lat},${lon}:${day}`;

  const cached = loadWeatherCache(cacheKey);
  if (cached && Date.now() - cached.ts <= OPENMETEO_TTL_MS) {
    return cached.text;
  }

  const json = await fetchOpenMeteoHourly(lat, lon);
  const s = summarizeOneDay(json, day);

  const label = targetDay === "tomorrow" ? "明日" : "今日";
  const memo = `
【Weather：${label}（焼津周辺の目安 / 単位：風m/s・雨mm/h）】
- 概況：${s.conditionText}（雲量平均${s.cloudAvg}% / code:${s.weatherCodeMode ?? "?"}）
- 気温${s.tempMin}〜${s.tempMax}℃
- 風 平均${s.windAvg} 最大${s.windMax}（突風${s.gustMax}）m/s
- 雨 最大${clampNum(s.rainMaxProb, 0, 100)}%（${Math.max(0, s.rainMaxMm)}mm/h）
`.trim();

  saveWeatherCache(cacheKey, { ts: Date.now(), text: memo });
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
    systemHints: string[],
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

      // ✅ 釣行判断っぽい時だけ Weather hint を作る（焼津固定）
      const hints: string[] = [];
      const isJudge = isFishingJudgeText(text);
      if (isJudge) {
        const targetDay = detectTargetDay(text);
        const YAIZU = { lat: 34.868, lon: 138.3236 };

        try {
          const weatherHint = await buildWeatherHint(
            targetDay,
            YAIZU.lat,
            YAIZU.lon,
          );
          hints.push(weatherHint);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          hints.push(`【Weather】取得失敗（${msg}）`);
        }
      }

      const reply = await callApiChat(thread, currentCharacter, hints);
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
      displayCharacterId={selectedId}
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
