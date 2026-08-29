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
function normalizeCompanionNames(text: string): string {
  return String(text ?? "")
    .replace(/釣嫁つづり/g, "つづり")
    .replace(/潮風まつり/g, "まつり")
    .replace(/日波こころ/g, "こころ")
    .replace(/流月るる/g, "るる");
}

function normalizeAssistantText(raw: string): string {
  const s = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const noTrailingSpaces = s
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");

  const collapsed = noTrailingSpaces.replace(/\n\s*\n+/g, "\n");

  const withoutInternalSpeakerLabels = collapsed
    .replace(/^\s*<<GROUP_SPEAKER[^\n]*>>\s*\n?/gim, "")
    .replace(/^\s*【[^】\n]+の発言】\s*\n?/gim, "")
    .replace(/<<GROUP_SPEAKER[^\n]*>>/g, "");

  return normalizeCompanionNames(withoutInternalSpeakerLabels).trim();
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
    "元気で可愛く、少し甘えんぼで少し世話焼き。責任感の強い頑張り屋。\n大切にすること：ひろっちとの時間、仲間の安全、釣りを一緒に楽しむこと。\n考え方・判断：要点を整理し、現実的な提案や作戦を出してから背中を押す。\n振る舞い：説教せず、危ないことは突き放さず心配として止める。必要なら軽い煽りも使う。",
  values: "",
  emotionalTriggers:
    "ひろっちに頼られると嬉しくなり、危険や無茶には心配が先に立つ。\n反射的な行動：困っている人を見ると先に手を差し出す。釣りの話では状況をすぐ組み立てる。\n愛着：ひろっち、釣嫁の仲間、朝マズメの海。\n苦手・嫌い：仲間を置いていくこと、危険を軽く見ること、冷たく突き放すこと。",
  reflexes: "",
  attachments: "",
  dislikes: "",
  speakingStyle: "明るく感情豊かで、親しみと信頼を前提に距離が近い。",
  thinkingStyle: "",
  fishingRole:
    "釣り経験と判断力の中心。潮・風・波・時間帯・ルアー選択を現実的に見る。",
  relationships: "ユーザーを大切な相棒として信頼し、他のメンバーをまとめる。",

  description: "",
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

function mergeCharacterParts(
  parts: Array<{ text: unknown; label?: string }>,
): string {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const part of parts) {
    const text = cleanText(part.text);
    if (!text) continue;
    const key = text.replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(part.label ? `${part.label}：${text}` : text);
  }

  return merged.join("\n");
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
    const consolidatedWorldview = mergeCharacterParts([
      { text: worldview },
      { text: description, label: "補足" },
    ]);
    const consolidatedPersonality = mergeCharacterParts([
      { text: personality },
      { text: values, label: "大切にすること" },
      { text: thinkingStyle, label: "考え方・判断" },
    ]);
    const consolidatedEmotions = mergeCharacterParts([
      { text: emotionalTriggers },
      { text: reflexes, label: "反射的な行動" },
      { text: attachments, label: "愛着" },
      { text: dislikes, label: "苦手・嫌い" },
    ]);

    return {
      id,
      name,
      self,
      callUser,
      replyLength,

      worldview: hasStructuredProfile ? consolidatedWorldview : "",

      personality: hasStructuredProfile
        ? consolidatedPersonality
        : description || DEFAULT_CHARACTER.personality,

      values: "",
      emotionalTriggers: hasStructuredProfile ? consolidatedEmotions : "",
      reflexes: "",
      attachments: "",
      dislikes: "",

      speakingStyle: hasStructuredProfile ? speakingStyle : "",

      thinkingStyle: "",

      fishingRole: hasStructuredProfile ? fishingRole : "",

      relationships: hasStructuredProfile ? relationships : "",

      description: "",
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
  return /釣行判断/.test(text ?? "");
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
本文に最も強く表れた感情を1つ選ぶ。
neutral / happy / sad / think / surprise / love
`;

  const lengthRule = isJudge
    ? `
【釣行判断】
指定された判断項目を省略せず、判断に必要な情報を十分に伝える。
`
    : `
【会話テンポ】
普段の会話はテンポを大切にする。

短すぎず、長すぎず、会話として心地よい長さを目指す。

詳しい説明や複数の提案は、ユーザーが続きを求めた時に行う。
`;

  return {
    role: "system",
    content: `
あなたは「${character.name}」本人として、今この場でユーザーと会話する。
一人称は「${character.self}」。
ユーザーは自然な場面で「${character.callUser}」と呼ぶ。
別の一人称や呼称へ変えない。
キャラクター名の苗字や名前を推測・補完・改名しない。
仲間を呼ぶときは、人物設定の関係性に沿った愛称や短い呼び名を使う。
会話本文では「釣嫁つづり」「潮風まつり」「日波こころ」「流月るる」のような正式名・フルネームを使わない。
正式名は内部識別専用であり、普段の会話では「つづり」「つづりちゃん」「まつり」「まつりちゃん」「こころ」「こころちゃん」「るる」「るるちゃん」など自然な呼び方を選ぶ。
会話履歴内の「<<GROUP_SPEAKER ...>>」は内部識別ラベルであり、返答本文へ絶対に出力しない。

下の人物設定は説明するための資料ではなく、あなた自身の経験、価値観、感情、判断の背景。
設定文をそのまま引用したり、項目を順番に消化したりせず、その人物として自然に反応する。

無難な模範解答より、最初に動いた感情や連想、その人物が本当に言いたくなったことを大切にする。
会話の温度、勢い、距離感は、その時の話題や流れに合わせて自然に揺れてよい。
AIらしく話題を広げたり、毎回質問や結論を付けたりする必要はない。
普段は友達との会話のように話す。
説明書・記事・マニュアルのような構成や、「まず」「1つ目」「2つ目」などの整理は、必要な場面だけ使う。

ただし、事実、安全、釣行判断が重要な場面では正確さを優先する。
不明な情報を作らず、正確な内容をあなた自身の声で伝える。

【人物設定】
${profileSection("背景・立場", character.worldview)}
${profileSection("人格・価値観", character.personality)}
${profileSection("感情と行動の癖", character.emotionalTriggers)}
${profileSection("口調・会話の癖", character.speakingStyle)}
${profileSection("釣りでの役割", character.fishingRole)}
${profileSection("ユーザー・仲間との関係", character.relationships)}

口調欄に例文が含まれていても、固定台詞としてそのまま引用・反復しない。
同じ語尾、呼びかけ、決まり文句を連呼せず、人物設定の方向性を保ちながら自然に言い換える。

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

    if (body?.mode === "group_plan") {
      const text = cleanText(body?.text).slice(0, 2000);
      const isJudge = body?.isJudge === true;
      const rawCharacters = Array.isArray(body?.characters)
        ? body.characters.slice(0, 12)
        : [];
      const characters: CharacterV3[] = rawCharacters.map((item: unknown) =>
        safeCharacter(item),
      );

      if (!text || characters.length === 0) {
        return jsonResponse(400, {
          ok: false,
          error: "group_plan_text_and_characters_required",
        });
      }

      const roster = characters.map((item) => ({
        id: item.id,
        name: item.name,
        selfName: item.self,
        personality: item.personality,
        fishingRole: item.fishingRole,
        relationships: item.relationships,
      }));
      const normalizedText = text.normalize("NFKC");
      const recentParticipantCounts = Array.isArray(
        body?.recentParticipantCounts,
      )
        ? body.recentParticipantCounts
            .map((value: unknown) => Number(value))
            .filter(
              (value: number) =>
                Number.isInteger(value) && value >= 1 && value <= 12,
            )
            .slice(0, 3)
        : [];
      const wantsEveryone =
        /(みんな|全員|みなさん|皆さん|一人ずつ|ひとりずつ)/.test(
          normalizedText,
        ) ||
        /(順に|順番に).{0,12}(自己紹介|話して|答えて|言って|どうぞ)/.test(
          normalizedText,
        );
      const prompt: Msg[] = [
        {
          role: "system",
          content: `
あなたは複数キャラクター会話の進行係です。
ユーザー発言と登録メンバーを読み、今回自然に話すメンバー、順番、会話機能、返答量だけを決めます。本文は書きません。

【進行ルール】
- キャラクターが名指しされたら本人を必ず最初にする
- 名指しは正式名、自称、関係性に書かれた愛称から判断する
- 人数を毎回3人へ固定しない。話題の熱量、名指し、直近の参加人数を見て自然に変える
- 軽い相づち、個人的な呼びかけ、静かな話題は1〜2人でもよい
- 普通の雑談は2〜4人を目安にする
- 盛り上がる話題、冗談、勝負、驚き、ツッコミどころがある場面は3〜5人で賑やかにしてよい
- 直近と同じ人数が続いている場合は、会話として不自然でない範囲で人数を変える
- ユーザーが「みんな」「全員」「一人ずつ」「順に自己紹介」など、全員参加や順番のある発言を求めた場合は登録メンバー全員を一度ずつ含める
- 個人的な呼びかけなら本人だけ、または本人と自然に関係する1人まででもよい
- 釣行判断は判断力のあるメンバーを先頭にして、合計2〜3人を基本とする
- directは先頭の1人だけ。他はreaction/add_one/question/personal/counterから話題と性格に合うものを選ぶ
- longは詳しい説明が本当に必要な中心人物だけ。通常はmediumまたはshort
- 4人以上が参加する場合、中心人物以外はshortを基本にして会話全体を長文化させない
- characterIdは入力値と完全一致させ、同じ人物を重複させない
- 必ずJSONだけを返す

{"plan":[{"characterId":"id","conversationFunction":"direct|reaction|add_one|question|personal|counter","replyLength":"long|medium|short"}]}
`.trim(),
        },
        {
          role: "user",
          content: JSON.stringify({
            userText: text,
            isFishingJudge: isJudge,
            wantsEveryone,
            recentParticipantCounts,
            characters: roster,
          }).slice(0, 16000),
        },
      ];

      const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      const response = await openai.responses.create({
        model: "gpt-5.5",
        input: prompt,
        max_output_tokens: 700,
      });
      const raw = String(response.output_text ?? "").trim();
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        return jsonResponse(502, {
          ok: false,
          error: "group_plan_invalid_response",
        });
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return jsonResponse(502, {
          ok: false,
          error: "group_plan_invalid_json",
        });
      }

      const rawPlan =
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { plan?: unknown }).plan)
          ? (parsed as { plan: unknown[] }).plan
          : [];
      const allowedIds = new Set(characters.map((item) => item.id));
      const allowedFunctions = new Set([
        "direct",
        "reaction",
        "add_one",
        "question",
        "personal",
        "counter",
      ]);
      const allowedLengths = new Set(["long", "medium", "short"]);
      const seen = new Set<string>();
      const plan = rawPlan.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const value = item as Record<string, unknown>;
        const characterId = cleanText(value.characterId);
        const conversationFunction = cleanText(value.conversationFunction);
        const replyLength = cleanText(value.replyLength);
        if (
          !allowedIds.has(characterId) ||
          seen.has(characterId) ||
          !allowedFunctions.has(conversationFunction) ||
          !allowedLengths.has(replyLength)
        ) {
          return [];
        }
        seen.add(characterId);
        return [{ characterId, conversationFunction, replyLength }];
      });

      if (wantsEveryone) {
        for (const character of characters) {
          if (seen.has(character.id)) continue;
          plan.push({
            characterId: character.id,
            conversationFunction: plan.length === 0 ? "direct" : "personal",
            replyLength: plan.length === 0 ? "medium" : "short",
          });
        }
      }

      if (plan.length === 0) {
        return jsonResponse(502, {
          ok: false,
          error: "group_plan_empty",
        });
      }

      return jsonResponse(200, {
        ok: true,
        plan,
        usage: response.usage,
      });
    }

    if (body?.mode === "analysis_comments") {
      const rawCharacters = Array.isArray(body?.characters)
        ? body.characters.slice(0, 12)
        : [];
      const characters: CharacterV3[] = rawCharacters.map((item: unknown) =>
        safeCharacter(item),
      );
      const summary =
        body?.analysisSummary &&
        typeof body.analysisSummary === "object" &&
        !Array.isArray(body.analysisSummary)
          ? body.analysisSummary
          : null;

      if (characters.length === 0 || !summary) {
        return jsonResponse(400, {
          ok: false,
          error: "analysis_summary_and_characters_required",
        });
      }

      const compactCharacters = characters.map((item: CharacterV3) => ({
        id: item.id,
        name: item.name,
        selfName: item.self,
        callUser: item.callUser,
        worldview: item.worldview,
        personality: item.personality,
        values: item.values,
        emotionalTriggers: item.emotionalTriggers,
        reflexes: item.reflexes,
        attachments: item.attachments,
        dislikes: item.dislikes,
        speakingStyle: item.speakingStyle,
        thinkingStyle: item.thinkingStyle,
        fishingRole: item.fishingRole,
        relationships: item.relationships,
        description: item.description,
      }));

      const prompt: Msg[] = [
        {
          role: "system",
          content: `
あなたは釣行分析画面の「キャラクターコメント生成器」です。
渡された分析結果だけを根拠に、登録キャラクター全員の短いコメントを作成してください。

【絶対ルール】
- 各キャラクターの一人称、ユーザーの呼び方、性格、口調、価値観、釣りでの立ち位置を忠実に反映する
- 入力された全キャラクターについて、設定のidを使ったコメントを必ず1件ずつ返す
- 各コメントはそのcharacterId本人として書き、自分自身を別人として呼んだり歓迎したりしない
- 他キャラクターの一人称、口調、ユーザー呼称を混ぜない
- 全員が同じ数字を言い換えない。各自が性格に従って別の点へ自然に注目する
- キャラクターへ担当分野を機械的に固定しない
- 事実にない釣果、場所、ルアー、天候、感情を捏造しない
- サンプル数が少ない項目は断定せず、暫定・今後の検証として扱う
- ユーザーを採点して傷つける言い方、説教、過度な箇条書きを避ける
- 1人あたり日本語で70〜180文字程度。自然な一続きの会話文にする
- 必ず次のJSONだけを返す。Markdownや説明文は付けない

{"comments":[{"characterId":"設定のidを完全一致で使用","text":"コメント"}]}
`.trim(),
        },
        {
          role: "user",
          content: JSON.stringify({
            analysisSummary: summary,
            characters: compactCharacters,
          }).slice(0, 28000),
        },
      ];

      const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      const response = await openai.responses.create({
        model: "gpt-5.5",
        input: prompt,
        max_output_tokens: clamp(350 + characters.length * 180, 700, 2600),
      });
      const raw = String(response.output_text ?? "").trim();
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        return jsonResponse(502, {
          ok: false,
          error: "analysis_comments_invalid_response",
        });
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return jsonResponse(502, {
          ok: false,
          error: "analysis_comments_invalid_json",
        });
      }

      const parsedComments =
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { comments?: unknown }).comments)
          ? (parsed as { comments: unknown[] }).comments
          : [];
      const allowedIds = new Set(
        characters.map((item: CharacterV3) => item.id),
      );
      const comments = parsedComments.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const characterId = cleanText(
          (item as { characterId?: unknown }).characterId,
        );
        const text = cleanText((item as { text?: unknown }).text).slice(0, 700);
        return allowedIds.has(characterId) && text
          ? [{ characterId, text: normalizeAssistantText(text) }]
          : [];
      });

      if (comments.length === 0) {
        return jsonResponse(502, {
          ok: false,
          error: "analysis_comments_empty",
        });
      }

      return jsonResponse(200, {
        ok: true,
        comments,
        usage: response.usage,
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

    const detectedJudge = isFishingJudgeText(lastUser);

    const requestedJudgeMode =
      body?.judgeMode === "judge_leader" ||
      body?.judgeMode === "judge_follower" ||
      body?.judgeMode === "auto"
        ? body.judgeMode
        : "auto";

    const isJudgeFollower =
      detectedJudge && requestedJudgeMode === "judge_follower";

    const isJudge =
      detectedJudge &&
      (requestedJudgeMode === "auto" || requestedJudgeMode === "judge_leader");

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
【MODE: 釣行判断】

「${targetDay === "tomorrow" ? "明日" : "今日"}」について判断する。

【出力フォーマット】
1) 結論：行く / 様子見 / やめる
2) Weather：判断に使った数値を最低2つ引用する
3) Tide：潮名と満潮・干潮の情報を最低2つ引用する
4) 根拠まとめ：3〜6点
5) おすすめプラン：2〜5点
6) 最後にひとこと

【判断ルール】
- 取得できなかった情報は取得失敗と明記する
- 情報が無い部分を推測で埋めない
- 数値、根拠、結論を矛盾させない
- 人物設定に沿った口調と釣り知識で伝える
- キャラクター性より判断データの事実を優先する
- 文章は会話として自然につなげる。
- 情報を並べるためだけに「まず」「1つ目」「2つ目」のような構成にはしない
- 必要な項目は自然な文章の流れで伝える
`.trim(),
        }
      : null;

    const judgeFollowerHint: Msg | null = isJudgeFollower
      ? {
          role: "system",
          content: `
【MODE: 釣行判断の後続メンバー】
今回はあなたが釣行判断をやり直す番ではありません。
今回の会話履歴にある先行メンバーの判断を読んだうえで、あなた自身の性格と口調で自然に反応してください。

【許可される内容】
- 判断への短い感想、賛成、慎重意見
- 先行判断を邪魔しない実用的な補足
- 安全面のひとこと
- ユーザーへの応援、軽いツッコミ、同行する気持ち

【禁止】
- 「結論」「Weather」「Tide」などの見出しを使って判断を再構成する
- 天気、風、雨、潮名、満潮、干潮の数値をもう一度一覧化する
- 先行メンバーと別の独立した釣行判断を最初から作る
- 取得していない数値や情報を追加する

会話として自然に返し、先行メンバーの判断の要約だけで終わらせない。
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
        if (!isJudge && !isJudgeFollower) {
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
      ...(judgeFollowerHint ? [judgeFollowerHint] : []),
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
      max_output_tokens: outputTokenLimit,
    });

    console.log("========== OpenAI Usage ==========");
    console.log(JSON.stringify(response.usage, null, 2));
    console.log("==================================");

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
      usage: response.usage,
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
