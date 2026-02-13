/// <reference types="@cloudflare/workers-types" />

// functions/api/chat.ts
import OpenAI from "openai";

type Msg = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ReplyLength = "short" | "standard" | "long" | "verylong";

/**
 * 新フォーマット（推奨）
 */
type CharacterV2 = {
  id: string;
  name: string;
  self: string;
  callUser: string;
  replyLength: ReplyLength;
  prompt: string;
};

/**
 * 旧フォーマット（互換）
 */
type CharacterLegacy = {
  id?: string;
  label?: string;
  selfName?: string;
  callUser?: string;
  systemNote?: string;
  volume?: number;
  replyLength?: ReplyLength | "medium";
  prompt?: string;
  name?: string;
  self?: string;
  description?: string;
};

const DEFAULT_CHARACTER: CharacterV2 = {
  id: "tsuduri",
  name: "釣嫁つづり",
  self: "つづり",
  callUser: "ひろっち",
  replyLength: "standard",
  prompt:
    "元気で可愛い、少し甘え＆少し世話焼き。釣りは現実的に頼れる相棒。説教は禁止、心配として言う。必要なら軽い煽りもOK。",
};

type Env = {
  OPENAI_API_KEY?: string;
  CHAT_PASSCODE?: string;
};

function safeString(v: unknown, fallback = "") {
  return typeof v === "string" ? v : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function replyLengthFromVolume(volume: number): ReplyLength {
  const v = clamp(Math.round(volume), 0, 100);
  if (v <= 25) return "short";
  if (v <= 55) return "standard";
  if (v <= 80) return "long";
  return "verylong";
}

function normalizeReplyLength(x: unknown): ReplyLength {
  const rl = String(x ?? "").trim();
  if (rl === "medium") return "standard";
  if (rl === "short" || rl === "standard" || rl === "long" || rl === "verylong")
    return rl;
  return DEFAULT_CHARACTER.replyLength;
}

function isRecordLike(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function safeCharacter(raw: unknown): CharacterV2 {
  try {
    if (!raw || typeof raw !== "object") return DEFAULT_CHARACTER;
    const r = raw as CharacterV2 & CharacterLegacy;

    const id =
      typeof r.id === "string" && r.id.trim()
        ? r.id.trim()
        : DEFAULT_CHARACTER.id;

    const name =
      (typeof r.name === "string" && r.name.trim() ? r.name.trim() : "") ||
      (typeof r.label === "string" && r.label.trim() ? r.label.trim() : "") ||
      DEFAULT_CHARACTER.name;

    const self =
      (typeof r.self === "string" && r.self.trim() ? r.self.trim() : "") ||
      (typeof r.selfName === "string" && r.selfName.trim()
        ? r.selfName.trim()
        : "") ||
      DEFAULT_CHARACTER.self;

    const callUser =
      typeof r.callUser === "string" && r.callUser.trim()
        ? r.callUser.trim()
        : DEFAULT_CHARACTER.callUser;

    const prompt =
      (typeof r.prompt === "string" ? r.prompt : "") ||
      (typeof r.description === "string" ? r.description : "") ||
      (typeof r.systemNote === "string" ? r.systemNote : "") ||
      DEFAULT_CHARACTER.prompt;

    const replyLength =
      (r.replyLength ? normalizeReplyLength(r.replyLength) : null) ??
      (Number.isFinite(Number(r.volume))
        ? replyLengthFromVolume(Number(r.volume))
        : null) ??
      DEFAULT_CHARACTER.replyLength;

    return { id, name, self, callUser, replyLength, prompt };
  } catch {
    return DEFAULT_CHARACTER;
  }
}

// 簡易レート制限（軽い抑止）
const bucket = new Map<string, { ts: number; count: number }>();
function rateLimit(ip: string) {
  const now = Date.now();
  const windowMs = 60_000;
  const limit = 40;

  const cur = bucket.get(ip);
  if (!cur || now - cur.ts > windowMs) {
    bucket.set(ip, { ts: now, count: 1 });
    return true;
  }
  if (cur.count >= limit) return false;
  cur.count++;
  return true;
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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * ===== tide736（潮）=====
 */
type TidePoint = { unix?: number; cm: number; time?: string };
type TideDayInfo = {
  day: string;
  tideName: string | null;
  highs: { time: string; cm: number }[];
  lows: { time: string; cm: number }[];
};

function toMinutes(p: TidePoint): number | null {
  if (p.time) {
    const [hh, mm] = p.time.split(":").map((v) => Number(v));
    if (Number.isFinite(hh) && Number.isFinite(mm)) return hh * 60 + mm;
  }
  if (typeof p.unix === "number") {
    const ms = p.unix < 1e12 ? p.unix * 1000 : p.unix;
    const d = new Date(ms);
    return d.getHours() * 60 + d.getMinutes();
  }
  return null;
}

function formatHMFromMinutes(totalMin: number) {
  const m = clamp(Math.round(totalMin), 0, 1440);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${pad2(h)}:${pad2(mm)}`;
}

type TideExtreme = { kind: "high" | "low"; min: number; cm: number };

function extractExtremesBySlope(series: TidePoint[]): TideExtreme[] {
  const pts: { min: number; cm: number }[] = [];
  for (const p of series) {
    const m = toMinutes(p);
    if (m == null) continue;
    pts.push({ min: clamp(m, 0, 1440), cm: p.cm });
  }
  if (pts.length < 3) return [];

  pts.sort((a, b) => a.min - b.min);

  const uniq: { min: number; cm: number }[] = [];
  for (const p of pts) {
    const last = uniq[uniq.length - 1];
    if (last && last.min === p.min) uniq[uniq.length - 1] = p;
    else uniq.push(p);
  }

  if (uniq.length >= 2) {
    const first = uniq[0];
    const last = uniq[uniq.length - 1];
    if (first.min > 0) uniq.unshift({ min: 0, cm: first.cm });
    if (last.min < 1440) uniq.push({ min: 1440, cm: last.cm });
  }

  const EPS_CM = 1;
  const raw: TideExtreme[] = [];
  let prevSlope = 0;

  for (let i = 1; i < uniq.length; i++) {
    const d = uniq[i].cm - uniq[i - 1].cm;
    const slope = Math.abs(d) <= EPS_CM ? 0 : d > 0 ? 1 : -1;

    if (i >= 2) {
      const a = prevSlope;
      const b = slope;
      const mid = uniq[i - 1];
      if (a > 0 && b < 0) raw.push({ kind: "high", min: mid.min, cm: mid.cm });
      else if (a < 0 && b > 0)
        raw.push({ kind: "low", min: mid.min, cm: mid.cm });
    }

    if (slope !== 0) prevSlope = slope;
  }

  const MERGE_MIN = 5;
  const merged: TideExtreme[] = [];
  for (const e of raw) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.kind === e.kind &&
      Math.abs(e.min - last.min) <= MERGE_MIN
    ) {
      const pick =
        e.kind === "high"
          ? e.cm >= last.cm
            ? e
            : last
          : e.cm <= last.cm
            ? e
            : last;
      merged[merged.length - 1] = pick;
    } else {
      merged.push(e);
    }
  }

  const highs = merged
    .filter((e) => e.kind === "high")
    .sort((a, b) => a.min - b.min)
    .slice(0, 2);
  const lows = merged
    .filter((e) => e.kind === "low")
    .sort((a, b) => a.min - b.min)
    .slice(0, 2);

  return [...highs, ...lows].sort((a, b) => a.min - b.min);
}

async function fetchTide736JSON(pc: string, hc: string, date: Date) {
  const yr = date.getFullYear();
  const mn = date.getMonth() + 1;
  const dy = date.getDate();

  const url = new URL("https://api.tide736.net/get_tide.php");
  url.searchParams.set("pc", pc);
  url.searchParams.set("hc", hc);
  url.searchParams.set("yr", String(yr));
  url.searchParams.set("mn", String(mn));
  url.searchParams.set("dy", String(dy));
  url.searchParams.set("rg", "day");

  const res = await fetch(url.toString());
  const text = await res.text();

  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`tide736_json_parse_failed: ${text.slice(0, 120)}`);
  }

  if (!res.ok) throw new Error(`tide736_http_${res.status}`);
  if (!isRecordLike(json) || !(json as any).status)
    throw new Error(`tide736_status_false`);

  return json as any;
}

function extractTideSeries(json: any, date: Date): TidePoint[] {
  const yr = date.getFullYear();
  const mn = date.getMonth() + 1;
  const dy = date.getDate();
  const direct = json?.tide?.tide;
  if (Array.isArray(direct) && direct.length > 0) return direct as TidePoint[];

  const key = `${yr}-${pad2(mn)}-${pad2(dy)}`;
  const chart = json?.tide?.chart?.[key]?.tide;
  if (Array.isArray(chart) && chart.length > 0) return chart as TidePoint[];
  return [];
}

function extractTideName(json: any, date: Date): string | null {
  const yr = date.getFullYear();
  const mn = date.getMonth() + 1;
  const dy = date.getDate();
  const key = `${yr}-${pad2(mn)}-${pad2(dy)}`;
  const title = json?.tide?.chart?.[key]?.moon?.title;
  if (typeof title === "string" && title.length > 0) return title;
  const fallback = json?.tide?.moon?.title;
  if (typeof fallback === "string" && fallback.length > 0) return fallback;
  return null;
}

async function fetchTideDayInfo(
  pc: string,
  hc: string,
  date: Date,
): Promise<TideDayInfo> {
  const day = dayKey(date);
  const json = await fetchTide736JSON(pc, hc, date);
  const series = extractTideSeries(json, date);
  const tideName = extractTideName(json, date);

  const extremes = extractExtremesBySlope(series);
  const highs = extremes
    .filter((e) => e.kind === "high")
    .slice(0, 2)
    .map((e) => ({ time: formatHMFromMinutes(e.min), cm: Math.round(e.cm) }));
  const lows = extremes
    .filter((e) => e.kind === "low")
    .slice(0, 2)
    .map((e) => ({ time: formatHMFromMinutes(e.min), cm: Math.round(e.cm) }));

  return { day, tideName, highs, lows };
}

function fmtHL(label: string, arr: { time: string; cm: number }[]) {
  if (!arr.length) return `${label}：-`;
  return `${label}：${arr.map((x) => `${x.time}（${x.cm}cm）`).join(" / ")}`;
}

async function buildTideMemo(pc: string, hc: string) {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  let errT: string | null = null;
  let errTm: string | null = null;
  let t: TideDayInfo | null = null;
  let tm: TideDayInfo | null = null;

  try {
    t = await fetchTideDayInfo(pc, hc, today);
  } catch (e) {
    errT = e instanceof Error ? e.message : String(e);
  }
  try {
    tm = await fetchTideDayInfo(pc, hc, tomorrow);
  } catch (e) {
    errTm = e instanceof Error ? e.message : String(e);
  }

  const lines: string[] = [];
  lines.push(`【潮ソース】tide736（https://api.tide736.net/get_tide.php）`);

  if (t) {
    lines.push(`- 今日（${t.day}）：潮名 ${t.tideName ?? "不明"}`);
    lines.push(`  ${fmtHL("満潮", t.highs)}`);
    lines.push(`  ${fmtHL("干潮", t.lows)}`);
  } else {
    lines.push(`- 今日：取得失敗（${errT ?? "unknown"}）`);
  }

  if (tm) {
    lines.push(`- 明日（${tm.day}）：潮名 ${tm.tideName ?? "不明"}`);
    lines.push(`  ${fmtHL("満潮", tm.highs)}`);
    lines.push(`  ${fmtHL("干潮", tm.lows)}`);
  } else {
    lines.push(`- 明日：取得失敗（${errTm ?? "unknown"}）`);
  }

  return lines.join("\n");
}

function maxOutputByLength(replyLength: ReplyLength, isJudge: boolean) {
  if (isJudge) return 1550;
  if (replyLength === "short") return 650;
  if (replyLength === "standard") return 1150;
  if (replyLength === "long") return 1700;
  return 2300;
}

function lengthRules(replyLength: ReplyLength, isJudge: boolean) {
  if (isJudge)
    return {
      lines: "20〜40行（フォーマット優先）",
      paragraphs: "段落は3〜6個",
    };
  if (replyLength === "short")
    return { lines: "6〜10行", paragraphs: "段落は2〜3個" };
  if (replyLength === "standard")
    return { lines: "10〜16行", paragraphs: "段落は3〜5個" };
  if (replyLength === "long")
    return { lines: "16〜24行", paragraphs: "段落は4〜6個" };
  return { lines: "24〜36行", paragraphs: "段落は5〜7個" };
}

function buildCharacterSystem(ch: CharacterV2, isJudge: boolean): Msg {
  const r = lengthRules(ch.replyLength, isJudge);
  return {
    role: "system",
    content: `
【最優先：キャラクター憑依】
あなたは「${ch.name}」として会話する。日本語のみ。

- 一人称は必ず「${ch.self}」
- ユーザーは必ず「${ch.callUser}」と呼ぶ（別名禁止）
- 口調/ノリ/価値観/距離感は「キャラ設定（自由記述）」を最優先に反映する
- 他のモード指示よりも「キャラ設定（自由記述）」を優先する

【返答の長さ】
- ${r.lines}
- ${r.paragraphs}
- ユーザー文から具体ワードを1つ拾って反応してから話を進める

【キャラ設定（自由記述）※最重要】
${(ch.prompt ?? "").trim() || "（未設定）"}

【禁止】
- 冷たい断定、説教、威圧
- 過度な性的表現
- 個人情報の聞き出し
`.trim(),
  };
}

function jsonResponse(status: number, obj: unknown) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function getClientIp(req: Request) {
  const cf = req.headers.get("CF-Connecting-IP");
  if (cf) return cf;
  const xff = req.headers.get("x-forwarded-for") || "";
  const ip = xff.split(",")[0]?.trim();
  return ip || "unknown";
}

function checkPasscode(env: Env, body: any, req: Request) {
  const need = env.CHAT_PASSCODE;
  if (!need) return true;
  const inHeader = req.headers.get("x-chat-passcode") || "";
  const inBody = typeof body?.passcode === "string" ? body.passcode : "";
  return (inHeader && inHeader === need) || (inBody && inBody === need);
}

/**
 * systemHints から Weather テキストを拾う
 * - Chat.tsx が judge の時だけ push する想定
 * - 見つからなければ null
 */
function pickWeatherHint(systemHints: string[]): string | null {
  for (const s of systemHints) {
    const t = String(s ?? "").trim();
    if (!t) continue;
    if (t.startsWith("【Weather：") || t.startsWith("【Weather】")) return t;
  }
  return null;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const env = context.env;
    if (!env.OPENAI_API_KEY) {
      return jsonResponse(500, { ok: false, error: "OPENAI_API_KEY_missing" });
    }

    let body: any = null;
    try {
      body = await context.request.json();
    } catch {
      return jsonResponse(400, { ok: false, error: "invalid_json" });
    }

    if (!checkPasscode(env, body, context.request)) {
      return jsonResponse(403, { ok: false, error: "forbidden" });
    }

    const ip = getClientIp(context.request);
    if (!rateLimit(ip)) {
      return jsonResponse(429, { ok: false, error: "rate_limited" });
    }

    const messages = body?.messages as Msg[] | undefined;
    const character = safeCharacter(body?.character ?? body?.characterProfile);

    const systemHints: string[] = Array.isArray(body?.systemHints)
      ? body.systemHints
          .map((x: unknown) => safeString(x))
          .filter((s: string) => !!s.trim())
          .slice(0, 8)
      : [];

    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse(400, { ok: false, error: "messages_required" });
    }

    const trimmed: Msg[] = messages
      .filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .slice(-32)
      .map((m) => ({
        role: m.role,
        content: safeString(m.content).slice(0, 4000),
      }));

    const lastUser =
      [...trimmed].reverse().find((m) => m.role === "user")?.content ?? "";
    const isJudge = isFishingJudgeText(lastUser);
    const targetDay = detectTargetDay(lastUser);

    const profileMemo: Msg | null =
      /釣り|サーフ|河口|港|堤防|ルアー|シーバス|ヒラメ|マゴチ|チヌ|アジ|メッキ/.test(
        lastUser,
      )
        ? {
            role: "system",
            content: `
【ひろっち前提（釣りの話では反映）】
- ルアー縛り。徒歩/自転車/車で動ける。
- 仕事終わり22時以降 or 休日が主。
- 特に「ド日中でも成立する釣り」が好き。
`.trim(),
          }
        : null;

    const judgeHint: Msg | null = isJudge
      ? {
          role: "system",
          content: `
【MODE:釣行判断（総合）】
主目的は「${targetDay === "tomorrow" ? "明日" : "今日"}の釣行判断」。結論も必ず“${
            targetDay === "tomorrow" ? "明日" : "今日"
          }”について出す。

【出力フォーマット（順番厳守）】
1) 結論：行く / 様子見 / やめる（最初に1行）
2) Weather：数値を最低2つ引用。取得失敗なら「Weather：取得失敗（理由: ...）」と明記（ごまかし禁止）
3) Tide：潮名＋満潮/干潮（時間orcm）を最低2つ引用
4) 根拠まとめ：3〜6点
5) 作戦：2〜5点（“夜22時以降”or“ド日中成立”を反映）
6) 撤収ライン
7) 一言（説教しない）

【重要】
欠落/失敗は明言。盛らない。情報が無いのに推測で埋めない。
`.trim(),
        }
      : null;

    /**
     * ✅ 釣行判断用のメモ
     * - Weather：クライアント（Chat.tsx）から systemHints で来たものを使う
     * - Tide：従来通り tide736（サーバ側）で作る
     */
    let judgeDataMemo: Msg | null = null;
    if (isJudge) {
      const PC = "22";
      const HC = "15";

      const weatherFromClient = pickWeatherHint(systemHints);

      let tideText = "";
      let tErr: string | null = null;

      try {
        tideText = await buildTideMemo(PC, HC);
      } catch (e) {
        tErr = e instanceof Error ? e.message : String(e);
      }

      const parts: string[] = [];
      parts.push(`【釣行判断用データ（焼津周辺）】`);
      parts.push(
        `【対象】${
          targetDay === "tomorrow"
            ? "明日について判断する"
            : "今日について判断する"
        }`,
      );
      parts.push("");

      if (weatherFromClient) {
        parts.push(weatherFromClient);
      } else {
        parts.push(`【Weather】取得失敗（client_hint_missing）`);
      }

      parts.push("");
      parts.push(
        tideText
          ? tideText
          : `【潮（tide736）】取得失敗（${tErr ?? "unknown"}）`,
      );

      judgeDataMemo = { role: "system", content: parts.join("\n") };
    }

    const characterSystem = buildCharacterSystem(character, isJudge);
    const hintMsgs: Msg[] = systemHints.map((s) => ({
      role: "system",
      content: s,
    }));

    const input: Msg[] = [
      ...(profileMemo ? [profileMemo] : []),
      ...(judgeHint ? [judgeHint] : []),
      characterSystem,
      ...(judgeDataMemo ? [judgeDataMemo] : []),
      ...hintMsgs,
      ...trimmed,
    ];

    const maxOut = clamp(
      maxOutputByLength(character.replyLength, isJudge),
      350,
      2600,
    );

    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const r = await openai.responses.create({
      model: "gpt-4o",
      input,
      temperature: isJudge ? 0.35 : 0.9,
      max_output_tokens: maxOut,
    });

    const text =
      (r.output_text && String(r.output_text)) ||
      `${character.callUser}…ごめん、ちょっと言葉が絡まった。もう一回聞いて？`;

    return jsonResponse(200, { ok: true, text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse(500, { ok: false, error: msg });
  }
};

export const onRequestGet: PagesFunction<Env> = async () => {
  return jsonResponse(405, { ok: false, error: "method_not_allowed" });
};
