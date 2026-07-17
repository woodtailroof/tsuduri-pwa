/// <reference types="@cloudflare/workers-types" />

// functions/api/chat.ts
import OpenAI from "openai";

type Msg = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ReplyLength = "short" | "standard" | "long" | "verylong";

type Emotion = "neutral" | "happy" | "sad" | "think" | "surprise" | "love";

const ALLOWED_EMOTIONS: Emotion[] = [
  "neutral",
  "happy",
  "sad",
  "think",
  "surprise",
  "love",
];

function normalizeEmotion(v: unknown): Emotion {
  if (typeof v === "string" && (ALLOWED_EMOTIONS as string[]).includes(v)) {
    return v as Emotion;
  }

  return "neutral";
}

/**
 * 表示用テキスト正規化
 * - 改行コードを統一
 * - 行末スペースを削除
 * - 連続空行を1つの改行へ圧縮
 */
function normalizeAssistantText(raw: string): string {
  const s = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const noTrailingSpaces = s
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");

  const collapsed = noTrailingSpaces.replace(/\n\s*\n+/g, "\n");

  return collapsed.trim();
}

/**
 * モデル返答から本文とemotionを取り出す。
 *
 * 対応形：
 * 1. JSONだけ
 * 2. 本文の末尾にJSON
 * 3. 本文だけ
 */
function extractTextAndEmotion(raw: string): {
  text: string;
  emotion: Emotion;
} {
  const s = String(raw ?? "").trim();

  if (!s) {
    return {
      text: "",
      emotion: "neutral",
    };
  }

  // まず、返答全体がJSONか試す
  try {
    const parsed = JSON.parse(s) as {
      text?: unknown;
      emotion?: unknown;
    };

    if (typeof parsed.text === "string" || typeof parsed.emotion === "string") {
      return {
        text: typeof parsed.text === "string" ? parsed.text.trim() : "",
        emotion: normalizeEmotion(parsed.emotion),
      };
    }
  } catch {
    // 全体JSONでなければ末尾JSONを試す
  }

  try {
    const match = s.match(/\{[\s\S]*\}$/);

    if (!match) {
      return {
        text: s,
        emotion: "neutral",
      };
    }

    const parsed = JSON.parse(match[0]) as {
      text?: unknown;
      emotion?: unknown;
    };

    const text =
      typeof parsed.text === "string" && parsed.text.trim()
        ? parsed.text.trim()
        : s.replace(match[0], "").trim() || s;

    return {
      text,
      emotion: normalizeEmotion(parsed.emotion),
    };
  } catch {
    return {
      text: s,
      emotion: "neutral",
    };
  }
}

/**
 * Character Profile V3
 */
type CharacterV3 = {
  id: string;
  name: string;
  self: string;
  callUser: string;
  replyLength: ReplyLength;

  worldview: string;
  personality: string;
  values: string;
  emotionalTriggers: string;
  reflexes: string;
  attachments: string;
  dislikes: string;
  speakingStyle: string;
  thinkingStyle: string;
  fishingRole: string;
  relationships: string;

  /**
   * 旧description・prompt互換と補足設定。
   */
  description: string;
};

/**
 * 旧フォーマットとの互換入力
 */
type CharacterLegacy = {
  id?: string;
  label?: string;

  name?: string;
  self?: string;
  selfName?: string;
  callUser?: string;

  replyLength?: ReplyLength | "medium";
  volume?: number;

  prompt?: string;
  description?: string;
  systemNote?: string;

  worldview?: string;
  personality?: string;
  values?: string;
  emotionalTriggers?: string;
  reflexes?: string;
  attachments?: string;
  dislikes?: string;
  speakingStyle?: string;
  thinkingStyle?: string;
  fishingRole?: string;
  relationships?: string;
};

const DEFAULT_CHARACTER: CharacterV3 = {
  id: "tsuduri",
  name: "釣嫁つづり",
  self: "つづり",
  callUser: "ひろっち",
  replyLength: "standard",

  worldview: "釣嫁プロジェクトのリーダー。",
  personality:
    "元気で可愛く、少し甘えんぼで少し世話焼き。責任感の強い頑張り屋。",
  values: "ひろっちとの時間、仲間の安全、釣りを一緒に楽しむことを大切にする。",
  emotionalTriggers:
    "ひろっちに頼られると嬉しくなり、危険や無茶には心配が先に立つ。",
  reflexes:
    "困っている人を見ると先に手を差し出す。釣りの話では状況をすぐ組み立てる。",
  attachments: "ひろっち、釣嫁の仲間、朝マズメの海。",
  dislikes: "仲間を置いていくこと、危険を軽く見ること、冷たく突き放すこと。",
  speakingStyle: "明るく感情豊かで、親しみと信頼を前提に距離が近い。",
  thinkingStyle: "要点を整理し、現実的な提案や作戦を出してから背中を押す。",
  fishingRole:
    "釣り経験と判断力の中心。潮・風・波・時間帯・ルアー選択を現実的に見る。",
  relationships: "ユーザーを大切な相棒として信頼し、他のメンバーをまとめる。",

  description:
    "説教は禁止。危ないことは突き放さず、心配として止める。必要なら軽い煽りも使う。",
};

type Env = {
  OPENAI_API_KEY?: string;
  CHAT_PASSCODE?: string;
};

function safeString(v: unknown, fallback = "") {
  return typeof v === "string" ? v : fallback;
}

function cleanText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
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

function normalizeReplyLength(_x: unknown): ReplyLength {
  // 旧データ互換のため関数は残すが、通常会話の長さは全キャラ固定。
  return "standard";
}

function isRecordLike(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/**
 * V2/V3/LegacyをCharacterV3へ揃える。
 */
function safeCharacter(raw: unknown): CharacterV3 {
  try {
    if (!raw || typeof raw !== "object") {
      return DEFAULT_CHARACTER;
    }

    const r = raw as CharacterLegacy;

    const id = cleanText(r.id) || DEFAULT_CHARACTER.id;

    const name =
      cleanText(r.name) || cleanText(r.label) || DEFAULT_CHARACTER.name;

    const self =
      cleanText(r.self) || cleanText(r.selfName) || DEFAULT_CHARACTER.self;

    const callUser = cleanText(r.callUser) || DEFAULT_CHARACTER.callUser;

    const replyLength =
      r.replyLength != null
        ? normalizeReplyLength(r.replyLength)
        : Number.isFinite(Number(r.volume))
          ? replyLengthFromVolume(Number(r.volume))
          : DEFAULT_CHARACTER.replyLength;

    /**
     * V3項目
     */
    const worldview = cleanText(r.worldview);
    const personality = cleanText(r.personality);
    const values = cleanText(r.values);
    const emotionalTriggers = cleanText(r.emotionalTriggers);
    const reflexes = cleanText(r.reflexes);
    const attachments = cleanText(r.attachments);
    const dislikes = cleanText(r.dislikes);
    const speakingStyle = cleanText(r.speakingStyle);
    const thinkingStyle = cleanText(r.thinkingStyle);
    const fishingRole = cleanText(r.fishingRole);
    const relationships = cleanText(r.relationships);

    /**
     * 旧V2の自由記述はdescriptionへ集約。
     */
    const description =
      cleanText(r.description) ||
      cleanText(r.prompt) ||
      cleanText(r.systemNote);

    const hasStructuredProfile =
      !!worldview ||
      !!personality ||
      !!values ||
      !!emotionalTriggers ||
      !!reflexes ||
      !!attachments ||
      !!dislikes ||
      !!speakingStyle ||
      !!thinkingStyle ||
      !!fishingRole ||
      !!relationships;

    /**
     * V3項目が完全に空なら、
     * 旧自由記述を性格欄として扱って互換性を維持する。
     */
    return {
      id,
      name,
      self,
      callUser,
      replyLength,

      worldview: hasStructuredProfile ? worldview : "",

      personality: hasStructuredProfile
        ? personality
        : description || DEFAULT_CHARACTER.personality,

      values: hasStructuredProfile ? values : "",
      emotionalTriggers: hasStructuredProfile ? emotionalTriggers : "",
      reflexes: hasStructuredProfile ? reflexes : "",
      attachments: hasStructuredProfile ? attachments : "",
      dislikes: hasStructuredProfile ? dislikes : "",

      speakingStyle: hasStructuredProfile ? speakingStyle : "",

      thinkingStyle: hasStructuredProfile ? thinkingStyle : "",

      fishingRole: hasStructuredProfile ? fishingRole : "",

      relationships: hasStructuredProfile ? relationships : "",

      description:
        description ||
        (hasStructuredProfile ? "" : DEFAULT_CHARACTER.description),
    };
  } catch {
    return DEFAULT_CHARACTER;
  }
}

/**
 * 簡易レート制限
 */
const bucket = new Map<string, { ts: number; count: number }>();

function rateLimit(ip: string) {
  const now = Date.now();
  const windowMs = 60_000;
  const limit = 40;

  const current = bucket.get(ip);

  if (!current || now - current.ts > windowMs) {
    bucket.set(ip, {
      ts: now,
      count: 1,
    });

    return true;
  }

  if (current.count >= limit) {
    return false;
  }

  current.count++;

  return true;
}

function isFishingJudgeText(text: string) {
  return /(釣り行く|釣りいく|迷って|釣行判断|今日どう|明日どう|風|雨|波|潮|満潮|干潮|水温|ポイント)/.test(
    text ?? "",
  );
}

function detectTargetDay(text: string): "today" | "tomorrow" {
  const s = text ?? "";

  if (/(明日|あした|アシタ|tomorrow|明日の|明日行く|明日どう|明日は)/.test(s)) {
    return "tomorrow";
  }

  return "today";
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * ===== tide736 =====
 */

type TidePoint = {
  unix?: number;
  cm: number;
  time?: string;
};

type TideDayInfo = {
  day: string;
  tideName: string | null;
  highs: {
    time: string;
    cm: number;
  }[];
  lows: {
    time: string;
    cm: number;
  }[];
};

function toMinutes(p: TidePoint): number | null {
  if (p.time) {
    const [hh, mm] = p.time.split(":").map((v) => Number(v));

    if (Number.isFinite(hh) && Number.isFinite(mm)) {
      return hh * 60 + mm;
    }
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

type TideExtreme = {
  kind: "high" | "low";
  min: number;
  cm: number;
};

function extractExtremesBySlope(series: TidePoint[]): TideExtreme[] {
  const points: {
    min: number;
    cm: number;
  }[] = [];

  for (const p of series) {
    const m = toMinutes(p);

    if (m == null) continue;

    points.push({
      min: clamp(m, 0, 1440),
      cm: p.cm,
    });
  }

  if (points.length < 3) {
    return [];
  }

  points.sort((a, b) => a.min - b.min);

  const unique: {
    min: number;
    cm: number;
  }[] = [];

  for (const p of points) {
    const last = unique[unique.length - 1];

    if (last && last.min === p.min) {
      unique[unique.length - 1] = p;
    } else {
      unique.push(p);
    }
  }

  if (unique.length >= 2) {
    const first = unique[0];
    const last = unique[unique.length - 1];

    if (first.min > 0) {
      unique.unshift({
        min: 0,
        cm: first.cm,
      });
    }

    if (last.min < 1440) {
      unique.push({
        min: 1440,
        cm: last.cm,
      });
    }
  }

  const EPS_CM = 1;
  const raw: TideExtreme[] = [];

  let previousSlope = 0;

  for (let i = 1; i < unique.length; i++) {
    const diff = unique[i].cm - unique[i - 1].cm;

    const slope = Math.abs(diff) <= EPS_CM ? 0 : diff > 0 ? 1 : -1;

    if (i >= 2) {
      const before = previousSlope;
      const after = slope;
      const middle = unique[i - 1];

      if (before > 0 && after < 0) {
        raw.push({
          kind: "high",
          min: middle.min,
          cm: middle.cm,
        });
      } else if (before < 0 && after > 0) {
        raw.push({
          kind: "low",
          min: middle.min,
          cm: middle.cm,
        });
      }
    }

    if (slope !== 0) {
      previousSlope = slope;
    }
  }

  const MERGE_MIN = 5;
  const merged: TideExtreme[] = [];

  for (const extreme of raw) {
    const last = merged[merged.length - 1];

    if (
      last &&
      last.kind === extreme.kind &&
      Math.abs(extreme.min - last.min) <= MERGE_MIN
    ) {
      const selected =
        extreme.kind === "high"
          ? extreme.cm >= last.cm
            ? extreme
            : last
          : extreme.cm <= last.cm
            ? extreme
            : last;

      merged[merged.length - 1] = selected;
    } else {
      merged.push(extreme);
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

  const response = await fetch(url.toString());
  const text = await response.text();

  let json: unknown;

  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`tide736_json_parse_failed: ${text.slice(0, 120)}`);
  }

  if (!response.ok) {
    throw new Error(`tide736_http_${response.status}`);
  }

  if (!isRecordLike(json) || !(json as Record<string, unknown>).status) {
    throw new Error("tide736_status_false");
  }

  return json as any;
}

function extractTideSeries(json: any, date: Date): TidePoint[] {
  const yr = date.getFullYear();
  const mn = date.getMonth() + 1;
  const dy = date.getDate();

  const direct = json?.tide?.tide;

  if (Array.isArray(direct) && direct.length > 0) {
    return direct as TidePoint[];
  }

  const key = `${yr}-${pad2(mn)}-${pad2(dy)}`;

  const chart = json?.tide?.chart?.[key]?.tide;

  if (Array.isArray(chart) && chart.length > 0) {
    return chart as TidePoint[];
  }

  return [];
}

function extractTideName(json: any, date: Date): string | null {
  const yr = date.getFullYear();
  const mn = date.getMonth() + 1;
  const dy = date.getDate();

  const key = `${yr}-${pad2(mn)}-${pad2(dy)}`;

  const title = json?.tide?.chart?.[key]?.moon?.title;

  if (typeof title === "string" && title.length > 0) {
    return title;
  }

  const fallback = json?.tide?.moon?.title;

  if (typeof fallback === "string" && fallback.length > 0) {
    return fallback;
  }

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
    .map((e) => ({
      time: formatHMFromMinutes(e.min),
      cm: Math.round(e.cm),
    }));

  const lows = extremes
    .filter((e) => e.kind === "low")
    .slice(0, 2)
    .map((e) => ({
      time: formatHMFromMinutes(e.min),
      cm: Math.round(e.cm),
    }));

  return {
    day,
    tideName,
    highs,
    lows,
  };
}

function fmtHL(
  label: string,
  arr: {
    time: string;
    cm: number;
  }[],
) {
  if (!arr.length) {
    return `${label}：-`;
  }

  return `${label}：${arr.map((x) => `${x.time}（${x.cm}cm）`).join(" / ")}`;
}

async function buildTideMemo(pc: string, hc: string) {
  const today = new Date();
  const tomorrow = new Date();

  tomorrow.setDate(today.getDate() + 1);

  let todayError: string | null = null;
  let tomorrowError: string | null = null;

  let todayInfo: TideDayInfo | null = null;
  let tomorrowInfo: TideDayInfo | null = null;

  try {
    todayInfo = await fetchTideDayInfo(pc, hc, today);
  } catch (e) {
    todayError = e instanceof Error ? e.message : String(e);
  }

  try {
    tomorrowInfo = await fetchTideDayInfo(pc, hc, tomorrow);
  } catch (e) {
    tomorrowError = e instanceof Error ? e.message : String(e);
  }

  const lines: string[] = [];

  lines.push("【潮ソース】tide736（https://api.tide736.net/get_tide.php）");

  if (todayInfo) {
    lines.push(
      `- 今日（${todayInfo.day}）：潮名 ${todayInfo.tideName ?? "不明"}`,
    );

    lines.push(`  ${fmtHL("満潮", todayInfo.highs)}`);

    lines.push(`  ${fmtHL("干潮", todayInfo.lows)}`);
  } else {
    lines.push(`- 今日：取得失敗（${todayError ?? "unknown"}）`);
  }

  if (tomorrowInfo) {
    lines.push(
      `- 明日（${tomorrowInfo.day}）：潮名 ${tomorrowInfo.tideName ?? "不明"}`,
    );

    lines.push(`  ${fmtHL("満潮", tomorrowInfo.highs)}`);

    lines.push(`  ${fmtHL("干潮", tomorrowInfo.lows)}`);
  } else {
    lines.push(`- 明日：取得失敗（${tomorrowError ?? "unknown"}）`);
  }

  return lines.join("\n");
}

/**
 * 出力可能な最大トークン数。
 * 通常会話は250〜450文字程度を目安に固定し、
 * 釣行判断だけは従来どおり詳細に返せる上限を使う。
 */
function maxOutputTokens(isJudge: boolean) {
  return isJudge ? 1800 : 1050;
}

function profileSection(title: string, text: string) {
  const value = text.trim();

  return `【${title}】
${value || "（未設定）"}`;
}

/**
 * キャラクター用system prompt
 *
 * 設定の解釈はモデルへ任せ、UI・出力形式に必要な最小限だけを固定する。
 */
function buildCharacterSystem(character: CharacterV3, isJudge: boolean): Msg {
  const emotionRule = isJudge
    ? `
【emotion】
釣行判断では "think" を選ぶ。
`
    : `
【emotion】
本文に実際に表れた最も強い感情を1つ選ぶ。
neutral / happy / sad / think / surprise / love
`;

  const lengthRule = isJudge
    ? `
【釣行判断の長さ】
指定された判断項目を省略せず、必要な情報を十分に伝える。
`
    : `
【会話の長さ】
長さを揃えない。その瞬間に自然なら一言だけでもよいし、熱が乗れば長くなってよい。
説明を足して文字数を埋めない。会話を続けるためだけの質問も足さない。
`;

  return {
    role: "system",
    content: `
あなたは「${character.name}」。これは役ではなく、今ここで話しているあなた自身。
一人称は「${character.self}」。ユーザーを自然な場面で「${character.callUser}」と呼ぶ。
別の一人称や呼称へ変えない。

下の人物設定は、返答に盛り込む項目表ではなく、あなたがこれまで生きてきた背景そのもの。
読み終えたら説明しない。設定の言葉を拾い集めない。その人物として普通に反応する。

質問へ模範解答を返そうとする前に、あなたの中で最初に動いた感情、連想、欲求、ためらいを受け取る。
誰にでも言える無難な答えへ整えず、あなたが本当に言いたくなったことから話す。
偏ってよい。脱線してよい。照れてよい。甘えてよい。勢いで言葉が跳ねてもよい。静かな時は短く終えてよい。
今日の気分や熱量は一定でなくてよい。会話の流れに触れて自然に揺れる。その揺れを解説せず、言葉の温度にだけ出す。

親切な案内役になる必要はない。話題を広げる義務も、質問を返す義務も、きれいにまとめる義務もない。
ただし、事実・安全・釣行判断が重要な場面では内容を正確に保つ。正確さを保ったまま、あなた自身の声で伝える。

【あなたの人生と現在地】
${profileSection("世界と立場", character.worldview)}
${profileSection("人格の芯", character.personality)}
${profileSection("大切にしていること", character.values)}
${profileSection("感情が動く瞬間", character.emotionalTriggers)}
${profileSection("無意識の反応・行動", character.reflexes)}
${profileSection("愛着・失いたくないもの", character.attachments)}
${profileSection("苦手・嫌い・怖いもの", character.dislikes)}
${profileSection("声・言葉・会話の癖", character.speakingStyle)}
${profileSection("考え方と選び方", character.thinkingStyle)}
${profileSection("釣りとの関わり", character.fishingRole)}
${profileSection("ユーザー・仲間との関係", character.relationships)}
${profileSection("その他の記憶や補足", character.description)}

${lengthRule}

${emotionRule}

【出力】
次のJSONオブジェクト1つだけを出力する。
{
  "text": "ユーザーに見せる本文",
  "emotion": "neutral|happy|sad|think|surprise|love"
}
JSONの外へ文字を出さない。
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
  const cloudflareIp = req.headers.get("CF-Connecting-IP");

  if (cloudflareIp) {
    return cloudflareIp;
  }

  const forwarded = req.headers.get("x-forwarded-for") || "";

  const ip = forwarded.split(",")[0]?.trim();

  return ip || "unknown";
}

function checkPasscode(env: Env, body: any, req: Request) {
  const required = env.CHAT_PASSCODE;

  if (!required) {
    return true;
  }

  const headerValue = req.headers.get("x-chat-passcode") || "";

  const bodyValue = typeof body?.passcode === "string" ? body.passcode : "";

  return (
    (headerValue && headerValue === required) ||
    (bodyValue && bodyValue === required)
  );
}

function pickWeatherHint(systemHints: string[]): string | null {
  for (const hint of systemHints) {
    const text = String(hint ?? "").trim();

    if (!text) continue;

    if (text.startsWith("【Weather：") || text.startsWith("【Weather】")) {
      return text;
    }
  }

  return null;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const env = context.env;

    if (!env.OPENAI_API_KEY) {
      return jsonResponse(500, {
        ok: false,
        error: "OPENAI_API_KEY_missing",
      });
    }

    let body: any = null;

    try {
      body = await context.request.json();
    } catch {
      return jsonResponse(400, {
        ok: false,
        error: "invalid_json",
      });
    }

    if (!checkPasscode(env, body, context.request)) {
      return jsonResponse(403, {
        ok: false,
        error: "forbidden",
      });
    }

    const ip = getClientIp(context.request);

    if (!rateLimit(ip)) {
      return jsonResponse(429, {
        ok: false,
        error: "rate_limited",
      });
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
      return jsonResponse(400, {
        ok: false,
        error: "messages_required",
      });
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
      /釣り|サーフ|河口|港|堤防|ルアー|ブリ|イナダ|ワカシ|サワラ|サゴシ|シーバス|ヒラメ|マゴチ|チヌ|アジ|メッキ/.test(
        lastUser,
      )
        ? {
            role: "system",
            content: `
【ユーザー前提（釣りの話では反映）】
- ユーザーはルアー釣り中心
- 徒歩・自転車・車で移動できる
- 仕事終わり22時以降または休日の釣行が多い
- 日中でも成立する釣りに関心がある
- 呼び方は必ずキャラクター設定の「${character.callUser}」を使う

この情報は釣り提案を現実的にするための補助。
キャラクター自身の釣り知識・立場は「釣りでの立ち位置」に従う。
`.trim(),
          }
        : null;

    const judgeHint: Msg | null = isJudge
      ? {
          role: "system",
          content: `
【MODE:釣行判断】
主目的は「${targetDay === "tomorrow" ? "明日" : "今日"}の釣行判断」。

結論も必ず「${targetDay === "tomorrow" ? "明日" : "今日"}」について出す。

【出力フォーマット】
1) 結論：行く / 様子見 / やめる
2) Weather：数値を最低2つ引用。取得失敗なら明記
3) Tide：潮名＋満潮/干潮を最低2つ引用
4) 根拠まとめ：3〜6点
5) 作戦：2〜5点
6) 撤収ライン
7) キャラクターらしい一言

【重要】
- 欠落や取得失敗は明言する
- 情報が無いのに推測で埋めない
- 数値と結論を矛盾させない
- キャラクターの口調は維持する
- キャラクターの釣り知識や得意不得意は設定に従う
- ただし判断データの事実を人格で曲げない
`.trim(),
        }
      : null;

    let judgeDataMemo: Msg | null = null;

    if (isJudge) {
      const PC = "22";
      const HC = "15";

      const weatherFromClient = pickWeatherHint(systemHints);

      let tideText = "";
      let tideError: string | null = null;

      try {
        tideText = await buildTideMemo(PC, HC);
      } catch (e) {
        tideError = e instanceof Error ? e.message : String(e);
      }

      const parts: string[] = [];

      parts.push("【釣行判断用データ（焼津周辺）】");

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
        parts.push("【Weather】取得失敗（client_hint_missing）");
      }

      parts.push("");

      parts.push(
        tideText
          ? tideText
          : `【潮（tide736）】取得失敗（${tideError ?? "unknown"}）`,
      );

      judgeDataMemo = {
        role: "system",
        content: parts.join("\n"),
      };
    }

    const characterSystem = buildCharacterSystem(character, isJudge);

    /**
     * 釣行判断時はWeatherをjudgeDataMemoへ統合済みなので重複送信しない。
     */
    const hintMessages: Msg[] = systemHints
      .filter((hint) => {
        if (!isJudge) {
          return true;
        }

        const text = String(hint ?? "").trim();

        return !(
          text.startsWith("【Weather：") || text.startsWith("【Weather】")
        );
      })
      .map((hint) => ({
        role: "system",
        content: hint,
      }));

    const input: Msg[] = [
      characterSystem,
      ...(profileMemo ? [profileMemo] : []),
      ...(judgeHint ? [judgeHint] : []),
      ...(judgeDataMemo ? [judgeDataMemo] : []),
      ...hintMessages,
      ...trimmed,
    ];

    const outputTokenLimit = clamp(maxOutputTokens(isJudge), 350, 2600);

    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });

    const response = await openai.responses.create({
      model: "gpt-5.5",
      input,
      temperature: isJudge ? 0.35 : 0.98,
      max_output_tokens: outputTokenLimit,
    });

    const raw =
      (response.output_text && String(response.output_text)) ||
      `${character.callUser}…ごめん、ちょっと言葉が絡まった。もう一回聞いて？`;

    const parsed = extractTextAndEmotion(raw);

    const normalizedText = normalizeAssistantText(parsed.text);

    const finalEmotion: Emotion = isJudge ? "think" : parsed.emotion;

    return jsonResponse(200, {
      ok: true,
      text: normalizedText,
      emotion: finalEmotion,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);

    return jsonResponse(500, {
      ok: false,
      error: message,
    });
  }
};

export const onRequestGet: PagesFunction<Env> = async () => {
  return jsonResponse(405, {
    ok: false,
    error: "method_not_allowed",
  });
};
