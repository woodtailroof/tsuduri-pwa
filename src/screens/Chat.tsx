// src/screens/Chat.tsx
import {
  useCallback,
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
import { useEmotion, type Emotion } from "../lib/emotion";

type Props = {
  back: () => void;
  goCharacterSettings: () => void;
};

type Msg = {
  role: "user" | "assistant";
  content: string;
  characterId?: string;
  characterName?: string;
  characterColor?: string;
};

type ApiMessage = {
  role: "user" | "assistant";
  content: string;
};

const GROUP_ROOM_ID = "group";
const CHAT_SELECTED_ROOM_KEY = "tsuduri_chat_selected_room_v1";

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

type CharacterProfileWithColor = CharacterProfile & {
  color?: string;
};

function safeLoadCharacters(): CharacterProfileWithColor[] {
  const list = safeJsonParse<CharacterProfileWithColor[]>(
    localStorage.getItem(CHARACTERS_STORAGE_KEY),
    [],
  );

  if (Array.isArray(list) && list.length) {
    return list;
  }

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

function safeLoadSelectedRoomId(
  characters: CharacterProfileWithColor[],
  fallback: string,
) {
  try {
    const raw = localStorage.getItem(CHAT_SELECTED_ROOM_KEY);

    if (!raw || !raw.trim()) {
      return fallback;
    }

    if (raw === GROUP_ROOM_ID) {
      return GROUP_ROOM_ID;
    }

    if (characters.some((c) => c.id === raw)) {
      return raw;
    }

    return fallback;
  } catch {
    return fallback;
  }
}

function safeSaveSelectedRoomId(id: string) {
  try {
    localStorage.setItem(CHAT_SELECTED_ROOM_KEY, id);
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

function getStringProp(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === "string" ? v : null;
}

function getBoolProp(o: Record<string, unknown>, key: string): boolean | null {
  const v = o[key];
  return typeof v === "boolean" ? v : null;
}

function safeLoadHistory(roomId: string): Msg[] {
  const raw = localStorage.getItem(historyKey(roomId));
  const parsed = safeJsonParse<unknown>(raw, []);

  if (!Array.isArray(parsed)) {
    return [];
  }

  const out: Msg[] = [];

  for (const item of parsed) {
    if (!isRecordLike(item)) {
      continue;
    }

    const role = getStringProp(item, "role");
    const content = getStringProp(item, "content");

    if (role !== "user" && role !== "assistant") {
      continue;
    }

    if (typeof content !== "string") {
      continue;
    }

    const characterId = getStringProp(item, "characterId") ?? undefined;

    const characterName = getStringProp(item, "characterName") ?? undefined;

    const characterColor = getStringProp(item, "characterColor") ?? undefined;

    out.push({
      role,
      content,
      characterId,
      characterName,
      characterColor,
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

function readCharacterProfile(
  id: string,
  fallback: CharacterProfileWithColor,
): CharacterProfileWithColor {
  const list = safeLoadCharacters();
  return list.find((c) => c.id === id) ?? fallback;
}

function normalizeCharacterColor(color?: string) {
  const value = String(color ?? "").trim();
  return value || "#ff7aa2";
}

function hexToRgba(hex: string, alpha: number) {
  const cleaned = hex.trim().replace(/^#/, "");

  const normalized =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((c) => `${c}${c}`)
          .join("")
      : cleaned;

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(255,122,162,${alpha})`;
  }

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  return `rgba(${r},${g},${b},${alpha})`;
}

function shuffleCharacters<T>(source: readonly T[]): T[] {
  const shuffled = [...source];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }

  return shuffled;
}

type GroupReplyLength = "long" | "medium" | "short";

function detectMentionedCharacter(
  text: string,
  characters: CharacterProfileWithColor[],
): CharacterProfileWithColor | null {
  const normalizedText = String(text ?? "")
    .normalize("NFKC")
    .toLowerCase();

  if (!normalizedText.trim()) {
    return null;
  }

  if (/(みんな|全員|みなさん|皆さん|みんなは|全員は)/.test(normalizedText)) {
    return null;
  }

  const candidates = characters
    .flatMap((character) => {
      const aliases = [character.name, character.selfName, character.id]
        .map((value) =>
          String(value ?? "")
            .normalize("NFKC")
            .toLowerCase()
            .trim(),
        )
        .filter((value) => value.length >= 2);

      return aliases.map((alias) => ({
        character,
        alias,
      }));
    })
    .sort((a, b) => b.alias.length - a.alias.length);

  for (const candidate of candidates) {
    if (normalizedText.includes(candidate.alias)) {
      return candidate.character;
    }
  }

  return null;
}

function assignGroupReplyLengths(
  characters: CharacterProfileWithColor[],
  spotlightCharacterId: string | null,
): Map<string, GroupReplyLength> {
  const assignments = new Map<string, GroupReplyLength>();

  if (!characters.length) {
    return assignments;
  }

  const slots: GroupReplyLength[] = characters.map((_, index) => {
    if (index === 0) return "long";
    if (index === 1) return "medium";
    return "short";
  });

  const shuffledSlots = shuffleCharacters(slots);

  characters.forEach((character, index) => {
    assignments.set(character.id, shuffledSlots[index] ?? "short");
  });

  if (!spotlightCharacterId) {
    return assignments;
  }

  const spotlightLength = assignments.get(spotlightCharacterId);

  if (!spotlightLength || spotlightLength !== "short") {
    return assignments;
  }

  const swapCandidates = characters.filter((character) => {
    if (character.id === spotlightCharacterId) {
      return false;
    }

    const length = assignments.get(character.id);
    return length === "long" || length === "medium";
  });

  if (!swapCandidates.length) {
    assignments.set(spotlightCharacterId, "medium");
    return assignments;
  }

  const swapCharacter =
    swapCandidates[Math.floor(Math.random() * swapCandidates.length)];
  const swapLength = assignments.get(swapCharacter.id) ?? "medium";

  assignments.set(spotlightCharacterId, swapLength);
  assignments.set(swapCharacter.id, "short");

  return assignments;
}

function buildReplyLengthHint(length: GroupReplyLength) {
  if (length === "long") {
    return `
【今回の返答量】
長め

- キャラクター設定と現在の会話の流れに従って、自然にやや長めに返答してください。
- 内容を無理に水増しせず、必要な説明や感情を十分に含めてください。
- 文数は厳密固定ではありませんが、目安は4〜8文程度です。
`.trim();
  }

  if (length === "medium") {
    return `
【今回の返答量】
普通

- キャラクター設定と現在の会話の流れに従って、自然な長さで返答してください。
- 要点と感情をほどよく含めてください。
- 文数は厳密固定ではありませんが、目安は2〜4文程度です。
`.trim();
  }

  return `
【今回の返答量】
短め

- キャラクター設定と現在の会話の流れに従って、短く自然に返答してください。
- 一言だけでも構いません。無理に説明を増やさないでください。
- 他キャラクター全員の発言を拾う必要はありません。
- 文数は厳密固定ではありませんが、目安は1〜2文程度です。
`.trim();
}

async function readErrorBody(res: Response): Promise<string | null> {
  try {
    const ct = res.headers.get("content-type") || "";

    if (ct.includes("application/json")) {
      const j: unknown = await res.json().catch(() => null);

      if (isRecordLike(j)) {
        const err = getStringProp(j, "error");

        if (err) {
          return err;
        }

        const msg = getStringProp(j, "message");

        if (msg) {
          return msg;
        }
      }

      return JSON.stringify(j);
    }

    const t = await res.text().catch(() => "");
    const s = (t || "").trim();

    if (!s) {
      return null;
    }

    return s.slice(0, 400);
  } catch {
    return null;
  }
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
  conditionText: string;
};

const OPENMETEO_TTL_MS = 10 * 60 * 1000;
const OPENMETEO_CACHE_KEY_PREFIX = "tsuduri_openmeteo_cache_v2:";

function weatherCodeToJp(code: number): string {
  if (!Number.isFinite(code)) return "不明";
  if ([95, 96, 99].includes(code)) return "雷";
  if ([51, 53, 55, 56, 57].includes(code)) return "霧雨";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return "雨";
  }

  if ([66, 67].includes(code)) return "凍雨";
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return "雪";
  }

  if ([45, 48].includes(code)) return "霧";
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

    if (typeof t === "string" && t.startsWith(day)) {
      idxs.push(i);
    }
  }

  return idxs;
}

function pickDaytimeIndexes(times: string[], idxs: number[]) {
  const out: number[] = [];

  for (const i of idxs) {
    const t = times[i];
    const hh = Number((t ?? "").slice(11, 13));

    if (Number.isFinite(hh) && hh >= 6 && hh <= 18) {
      out.push(i);
    }
  }

  return out.length ? out : idxs;
}

function modeNumber(xs: number[]): number | null {
  if (!xs.length) {
    return null;
  }

  const m = new Map<number, number>();

  for (const x of xs) {
    if (!Number.isFinite(x)) {
      continue;
    }

    m.set(x, (m.get(x) ?? 0) + 1);
  }

  let best: {
    k: number;
    v: number;
  } | null = null;

  for (const [k, v] of m.entries()) {
    if (!best || v > best.v) {
      best = { k, v };
    }
  }

  return best ? best.k : null;
}

type OpenMeteoHourly = {
  time: string[];
  temperature_2m?: unknown;
  precipitation?: unknown;
  precipitation_probability?: unknown;
  wind_speed_10m?: unknown;
  wind_gusts_10m?: unknown;
  weather_code?: unknown;
  cloud_cover?: unknown;
};

type OpenMeteoResponse = {
  hourly?: OpenMeteoHourly;
};

function summarizeOneDay(json: unknown, day: string): WeatherSummary {
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

  if (!isRecordLike(json)) {
    return safe;
  }

  const hourly = (json as OpenMeteoResponse).hourly;

  const times = Array.isArray(hourly?.time) ? hourly.time : [];

  const idxsAll = pickDayIndexes(times, day);

  if (!idxsAll.length) {
    return safe;
  }

  const idxs = pickDaytimeIndexes(times, idxsAll);

  const pickNums = (arr: unknown, use: number[]) => {
    const a = Array.isArray(arr) ? arr : [];

    return use.map((i) => Number(a[i])).filter((n) => Number.isFinite(n));
  };

  const tempAll = pickNums(hourly?.temperature_2m, idxsAll);

  const prcpAll = pickNums(hourly?.precipitation, idxsAll);

  const popAll = pickNums(hourly?.precipitation_probability, idxsAll);

  const windAll = pickNums(hourly?.wind_speed_10m, idxsAll);

  const gustAll = pickNums(hourly?.wind_gusts_10m, idxsAll);

  const cloudDay = pickNums(hourly?.cloud_cover, idxs);

  const codeDay = pickNums(hourly?.weather_code, idxs).map((x) =>
    Math.round(x),
  );

  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;

  const max = (xs: number[]) =>
    xs.length ? xs.reduce((m, x) => (x > m ? x : m), xs[0]) : 0;

  const round1 = (n: number) => Math.round(n * 10) / 10;

  const codeMode = modeNumber(codeDay);

  const codeText = codeMode == null ? "不明" : weatherCodeToJp(codeMode);

  const cloudAvg = avg(cloudDay);
  let condition = codeText;

  if (condition === "晴れ" && cloudAvg >= 55) {
    condition = "晴れ時々くもり";
  }

  if (
    (condition === "くもり" || condition === "晴れ時々くもり") &&
    cloudAvg < 25
  ) {
    condition = "晴れ";
  }

  if (condition === "不明") {
    if (max(popAll) >= 60 || max(prcpAll) >= 1) {
      condition = "雨";
    } else if (cloudAvg >= 60) {
      condition = "くもり";
    } else {
      condition = "晴れ";
    }
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

async function fetchOpenMeteoHourly(
  lat: number,
  lon: number,
): Promise<unknown> {
  const tz = "Asia/Tokyo";

  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lon))}` +
    "&hourly=temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,weather_code,cloud_cover" +
    "&forecast_days=2" +
    `&timezone=${encodeURIComponent(tz)}` +
    "&wind_speed_unit=ms";

  const res = await fetch(url, {
    method: "GET",
  });

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    const head = (text || "").replace(/\s+/g, " ").trim().slice(0, 160);

    if (res.status === 429) {
      throw new Error(`openmeteo_rate_limited_429${head ? `:${head}` : ""}`);
    }

    throw new Error(`openmeteo_http_${res.status}${head ? `:${head}` : ""}`);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`openmeteo_json_parse_failed:${text.slice(0, 160)}`);
  }
}

function loadWeatherCache(cacheKey: string): {
  ts: number;
  text: string;
} | null {
  try {
    const raw = localStorage.getItem(cacheKey);

    if (!raw) {
      return null;
    }

    const j: unknown = JSON.parse(raw);

    if (!isRecordLike(j)) {
      return null;
    }

    const ts = Number(j.ts);

    const text = typeof j.text === "string" ? j.text : String(j.text ?? "");

    if (!Number.isFinite(ts) || !text) {
      return null;
    }

    return {
      ts,
      text,
    };
  } catch {
    return null;
  }
}

function saveWeatherCache(
  cacheKey: string,
  data: {
    ts: number;
    text: string;
  },
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

  const cacheKey = `${OPENMETEO_CACHE_KEY_PREFIX}` + `${lat},${lon}:${day}`;

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

  saveWeatherCache(cacheKey, {
    ts: Date.now(),
    text: memo,
  });

  return memo;
}

function normalizeEmotion(raw: string | null): Emotion | undefined {
  const v = (raw ?? "").trim();

  if (
    v === "neutral" ||
    v === "happy" ||
    v === "sad" ||
    v === "think" ||
    v === "surprise" ||
    v === "love"
  ) {
    return v;
  }

  return undefined;
}

function inferEmotionFromAssistantText(text: string): Emotion | undefined {
  const s = (text ?? "").trim();

  if (!s) {
    return undefined;
  }

  if (/(結論|根拠|作戦|判断|様子見|検討|プラン|整理|要点)/.test(s)) {
    return "think";
  }

  if (
    /(好き|大好き|愛|惚|きゅん|尊い|付き合|結婚|抱きしめ|ぎゅ|ちゅ)/.test(s)
  ) {
    return "love";
  }

  if (/(えっ|まじ|マジ|！？|びっくり|驚|すご|ヤバ|なんで)/.test(s)) {
    return "surprise";
  }

  if (/(ごめん|すま|残念|つら|悲|しんど|無理|だめ|失敗)/.test(s)) {
    return "sad";
  }

  if (/(やった|いいね|最高|うれし|嬉|ナイス|完璧|勝ち)/.test(s)) {
    return "happy";
  }

  return undefined;
}

function readApiTextResponse(json: unknown): {
  ok: true;
  text: string;
  emotion?: Emotion;
} | null {
  if (!isRecordLike(json)) {
    return null;
  }

  const ok = getBoolProp(json, "ok");

  if (ok !== true) {
    return null;
  }

  const text = getStringProp(json, "text") ?? "";

  const rawEmotion = getStringProp(json, "emotion");

  const emotion = normalizeEmotion(rawEmotion);

  return {
    ok: true,
    text,
    emotion,
  };
}

function readApiErrorResponse(json: unknown): string | null {
  if (!isRecordLike(json)) {
    return null;
  }

  const err = getStringProp(json, "error");

  return err ?? null;
}

function buildSingleThread(messages: Msg[]): ApiMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

/**
 * 配列内の最後のユーザー発言位置を取得する。
 */
function findLastUserMessageIndex(messages: Msg[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      return i;
    }
  }

  return -1;
}

/**
 * 全員集合チャット用の会話履歴を構築する。
 *
 * 対象キャラへ渡す内容：
 *
 * 1. すべてのユーザー発言
 * 2. 対象キャラ自身の過去の返答
 * 3. 今回のユーザー発言より後に投稿された、
 *    他キャラの先行返答
 *
 * 過去ターンにおける他キャラの返答は渡さない。
 * これにより履歴肥大化を抑えながら、
 * 今回のターン内だけ自然な掛け合いを可能にする。
 */
function buildGroupThread(messages: Msg[], characterId: string): ApiMessage[] {
  const lastUserIndex = findLastUserMessageIndex(messages);

  const out: ApiMessage[] = [];

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];

    if (message.role === "user") {
      out.push({
        role: "user",
        content: message.content,
      });

      continue;
    }

    const isOwnReply = message.characterId === characterId;

    if (isOwnReply) {
      out.push({
        role: "assistant",
        content: message.content,
      });

      continue;
    }

    const isCurrentTurnReply = lastUserIndex >= 0 && index > lastUserIndex;

    if (!isCurrentTurnReply) {
      continue;
    }

    const speakerName = message.characterName?.trim() || "ほかのキャラクター";

    out.push({
      role: "assistant",
      content: `【${speakerName}の発言】\n` + message.content,
    });
  }

  return out;
}

/**
 * 全員集合チャットで後続キャラへ渡す補助指示。
 *
 * 先行キャラの発言へ毎回必ず反応させるのではなく、
 * 会話として自然な場合だけ触れさせる。
 */
function buildGroupRelayHint(character: CharacterProfileWithColor) {
  return `
【全員集合チャットでの会話ルール】
- あなたは「${character.name}」として返答してください。
- 会話履歴内に「【〇〇の発言】」という文章がある場合、それは今回あなたより先に話した別キャラクターの発言です。
- 先行キャラクターの発言へ、必要に応じて共感、補足、ツッコミ、質問、反論などを自然に入れてください。
- 毎回必ず他キャラクターへ反応する必要はありません。
- ユーザーへの返答を忘れず、他キャラクター同士だけで会話を完結させないでください。
- 別キャラクターの口調を真似せず、あなた自身の性格と口調を維持してください。
- 他キャラクターの発言内容をそのまま長く繰り返さないでください。
`.trim();
}

export default function Chat({ back, goCharacterSettings }: Props) {
  const { emitEmotion, clearEmotion } = useEmotion();

  const onBack = useCallback(() => {
    clearEmotion("chat");
    back();
  }, [clearEmotion, back]);

  useEffect(() => {
    return () => {
      clearEmotion("chat");
    };
  }, [clearEmotion]);

  const [characters, setCharacters] = useState<CharacterProfileWithColor[]>(
    () => safeLoadCharacters(),
  );

  const fallback = useMemo(
    () => characters[0] ?? safeLoadCharacters()[0],
    [characters],
  );

  const [selectedId, setSelectedId] = useState<string>(() => {
    const loaded = safeLoadCharacters();

    const selectedCharacterId = safeLoadSelectedCharacterId(
      loaded[0]?.id ?? "tsuduri",
    );

    const validCharacterId = loaded.some((c) => c.id === selectedCharacterId)
      ? selectedCharacterId
      : (loaded[0]?.id ?? "tsuduri");

    return safeLoadSelectedRoomId(loaded, validCharacterId);
  });

  const isGroupMode = selectedId === GROUP_ROOM_ID;

  const selectedCharacter = useMemo(() => {
    if (isGroupMode) {
      return fallback;
    }

    return readCharacterProfile(selectedId, fallback);
  }, [isGroupMode, selectedId, fallback]);

  const roomId = selectedId;

  const [messages, setMessages] = useState<Msg[]>(() =>
    safeLoadHistory(roomId),
  );

  const [input, setInput] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(false);

  const [loadingCharacterName, setLoadingCharacterName] = useState<string>("");

  const scrollBoxRef = useRef<HTMLDivElement | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectRef = useRef<HTMLSelectElement | null>(null);

  const titleText = isGroupMode
    ? "💬 全員集合チャット"
    : `💬 ${selectedCharacter.name}と話す`;

  const placeholderText = isGroupMode
    ? "みんなに話しかける…"
    : `${selectedCharacter.name}に話しかける…`;

  function focusInput() {
    const el = inputRef.current;

    if (!el) {
      return;
    }

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

    if (!box) {
      return;
    }

    const run = () => {
      box.scrollTop = box.scrollHeight;
    };

    if (mode === "smooth") {
      box.scrollTo({
        top: box.scrollHeight,
        behavior: "smooth",
      });

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

      setSelectedId((current) => {
        if (current === GROUP_ROOM_ID) {
          return GROUP_ROOM_ID;
        }

        const storedId = safeLoadSelectedCharacterId(list[0]?.id ?? "tsuduri");

        if (list.some((c) => c.id === storedId)) {
          return storedId;
        }

        return list[0]?.id ?? "tsuduri";
      });
    };

    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    setMessages(safeLoadHistory(roomId));

    setLoadingCharacterName("");
    scrollToBottom("auto");
    focusInput();
  }, [roomId]);

  useEffect(() => {
    safeSaveHistory(roomId, messages);

    scrollToBottom("smooth");
  }, [messages, roomId]);

  useEffect(() => {
    safeSaveSelectedRoomId(selectedId);

    if (selectedId !== GROUP_ROOM_ID) {
      safeSaveSelectedCharacterId(selectedId);
    }
  }, [selectedId]);

  const canSend = useMemo(() => !!input.trim() && !loading, [input, loading]);

  function clearHistory() {
    const ok = confirm(
      isGroupMode
        ? "全員集合チャットの履歴を消す？（戻せないよ）"
        : "会話履歴を消す？（戻せないよ）",
    );

    if (!ok) {
      return;
    }

    setMessages([]);

    try {
      localStorage.removeItem(historyKey(roomId));
    } catch {
      // ignore
    }

    focusInput();
  }

  async function callApiChat(
    payloadMessages: ApiMessage[],
    character: CharacterProfileWithColor,
    systemHints: string[],
  ): Promise<{
    text: string;
    emotion?: Emotion;
  }> {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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

    const okText = readApiTextResponse(json);

    if (okText) {
      return {
        text: okText.text,
        emotion: okText.emotion,
      };
    }

    const err = readApiErrorResponse(json);

    throw new Error(err ?? "unknown_error");
  }

  function applyChatEmotion(nextEmotion: Emotion) {
    emitEmotion({
      source: "chat",
      emotion: nextEmotion,
      priority: 30,
      ttlMs: null,
    });
  }

  function applyReplyEmotion(
    replyText: string,
    replyEmotion: Emotion | undefined,
    isJudge: boolean,
  ) {
    if (isJudge) {
      applyChatEmotion("think");
      return;
    }

    if (replyEmotion && replyEmotion !== "neutral") {
      applyChatEmotion(replyEmotion);

      return;
    }

    const inferred = inferEmotionFromAssistantText(replyText);

    if (inferred) {
      applyChatEmotion(inferred);
      return;
    }

    applyChatEmotion("neutral");
  }

  async function buildHintsForText(text: string): Promise<{
    hints: string[];
    isJudge: boolean;
  }> {
    const hints: string[] = [];

    const isJudge = isFishingJudgeText(text);

    if (!isJudge) {
      return {
        hints,
        isJudge,
      };
    }

    const targetDay = detectTargetDay(text);

    const YAIZU = {
      lat: 34.868,
      lon: 138.3236,
    };

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

    return {
      hints,
      isJudge,
    };
  }

  async function sendSingle(text: string, next: Msg[]) {
    try {
      const currentCharacter = readCharacterProfile(
        selectedId,
        selectedCharacter,
      );

      const { hints, isJudge } = await buildHintsForText(text);

      const thread = buildSingleThread(next);

      setLoadingCharacterName(currentCharacter.name);

      const reply = await callApiChat(thread, currentCharacter, hints);

      const replyMessage: Msg = {
        role: "assistant",
        content: reply.text,
        characterId: currentCharacter.id,
        characterName: currentCharacter.name,
        characterColor: normalizeCharacterColor(currentCharacter.color),
      };

      setMessages([...next, replyMessage]);

      applyReplyEmotion(reply.text, reply.emotion, isJudge);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);

      setMessages([
        ...next,
        {
          role: "assistant",
          content: `ごめん…🥺\n` + `理由：${msg}`,
          characterId: selectedCharacter.id,
          characterName: selectedCharacter.name,
          characterColor: normalizeCharacterColor(selectedCharacter.color),
        },
      ]);

      applyChatEmotion("sad");
    }
  }

  async function sendGroup(text: string, next: Msg[]) {
    const { hints, isJudge } = await buildHintsForText(text);

    let workingMessages = [...next];

    let lastSuccessfulReply: {
      text: string;
      emotion?: Emotion;
    } | null = null;

    const speakingOrder = shuffleCharacters(characters);

    const spotlightCharacter = detectMentionedCharacter(text, characters);

    const replyLengths = assignGroupReplyLengths(
      characters,
      spotlightCharacter?.id ?? null,
    );

    for (const character of speakingOrder) {
      setLoadingCharacterName(character.name);

      /**
       * workingMessagesには、
       * このターンですでに返答済みの
       * キャラクター発言も含まれている。
       *
       * buildGroupThread側で
       * 今回分だけ抽出して後続キャラへ渡す。
       */
      const thread = buildGroupThread(workingMessages, character.id);

      const replyLength = replyLengths.get(character.id) ?? "short";

      const groupHints = [
        ...hints,
        buildGroupRelayHint(character),
        buildReplyLengthHint(replyLength),
      ];

      try {
        const reply = await callApiChat(thread, character, groupHints);

        const replyMessage: Msg = {
          role: "assistant",
          content: reply.text,
          characterId: character.id,
          characterName: character.name,
          characterColor: normalizeCharacterColor(character.color),
        };

        workingMessages = [...workingMessages, replyMessage];

        setMessages(workingMessages);

        lastSuccessfulReply = reply;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);

        const errorMessage: Msg = {
          role: "assistant",
          content: `ごめん…🥺\n` + `理由：${msg}`,
          characterId: character.id,
          characterName: character.name,
          characterColor: normalizeCharacterColor(character.color),
        };

        workingMessages = [...workingMessages, errorMessage];

        setMessages(workingMessages);
      }
    }

    if (isJudge) {
      applyChatEmotion("think");
      return;
    }

    if (lastSuccessfulReply) {
      applyReplyEmotion(
        lastSuccessfulReply.text,
        lastSuccessfulReply.emotion,
        false,
      );

      return;
    }

    applyChatEmotion("sad");
  }

  async function send() {
    const text = input.trim();

    if (!text || loading) {
      return;
    }

    const next: Msg[] = [
      ...messages,
      {
        role: "user",
        content: text,
      },
    ];

    setMessages(next);
    setInput("");
    focusInput();
    setLoading(true);
    setLoadingCharacterName("");

    try {
      if (isGroupMode) {
        await sendGroup(text, next);
      } else {
        await sendSingle(text, next);
      }
    } finally {
      setLoading(false);
      setLoadingCharacterName("");
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
      title={<h1 style={{ margin: 0 }}>{titleText}</h1>}
      maxWidth={1100}
      showBack
      onBack={onBack}
      titleLayout="left"
      scrollY="hidden"
      contentPadding="clamp(10px, 2vw, 18px)"
      displayCharacterId={selectedId}
    >
      <style>{`
        @keyframes tsuduri-dot-bounce {
          0%, 80%, 100% {
            transform: translateY(0);
            opacity: 0.55;
          }

          40% {
            transform: translateY(-4px);
            opacity: 1;
          }
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

        .tsuduri-typing .dot:nth-child(2) {
          animation-delay: 0.12s;
        }

        .tsuduri-typing .dot:nth-child(3) {
          animation-delay: 0.24s;
        }

        .chat-btn.glass {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 34px;
          padding: 6px 10px;
          border-radius: 12px;
          cursor: pointer;
          user-select: none;
          color: rgba(255,255,255,0.90);
          background: rgba(17,17,17,var(--glass-alpha,0.22));
          border: 1px solid rgba(255,255,255,0.18);
        }

        .chat-quick {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          min-width: 0;
        }

        .chat-speaker-label {
          display: flex;
          align-items: center;
          gap: 7px;
          margin: 0 0 5px 3px;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.3;
        }

        .chat-speaker-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          flex: 0 0 auto;
        }
      `}</style>

      <div
        style={{
          height: "100%",
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

              <option value={GROUP_ROOM_ID}>👭 全員集合</option>
            </select>

            <span
              style={{
                position: "absolute",
                right: 10,
                pointerEvents: "none",
                color: "rgba(255,255,255,0.55)",
                fontSize: "clamp(11px, 1.8vw, 12px)",
                transform: "translateY(-1px)",
              }}
            >
              ▼
            </span>
          </div>

          <button
            type="button"
            onClick={goCharacterSettings}
            title="キャラ管理"
            className="chat-btn glass"
            style={uiButtonStyle}
          >
            🎭
          </button>

          <button
            type="button"
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
            <div
              style={{
                color: "rgba(255,255,255,0.60)",
                fontSize: "clamp(12px, 2vw, 13px)",
              }}
            >
              {isGroupMode
                ? "みんなが集まってるよ。何を話す？🎣"
                : `${selectedCharacter.name}「${selectedCharacter.callUser}、今日はどうする？🎣」`}
            </div>
          ) : (
            messages.map((m, index) => {
              const isUser = m.role === "user";

              const messageCharacter =
                !isUser && m.characterId
                  ? characters.find((c) => c.id === m.characterId)
                  : undefined;

              const speakerName =
                m.characterName ??
                messageCharacter?.name ??
                (!isGroupMode ? selectedCharacter.name : "キャラクター");

              const speakerColor = normalizeCharacterColor(
                m.characterColor ??
                  messageCharacter?.color ??
                  selectedCharacter.color,
              );

              return (
                <div
                  key={`${index}-${m.characterId ?? m.role}`}
                  style={{
                    marginBottom: 10,
                    textAlign: isUser ? "right" : "left",
                  }}
                >
                  {!isUser && isGroupMode && (
                    <div
                      className="chat-speaker-label"
                      style={{
                        color: speakerColor,
                      }}
                    >
                      <span
                        className="chat-speaker-dot"
                        aria-hidden="true"
                        style={{
                          background: speakerColor,
                          boxShadow: `0 0 0 3px ${hexToRgba(
                            speakerColor,
                            0.18,
                          )}`,
                        }}
                      />

                      <span>{speakerName}</span>
                    </div>
                  )}

                  <span
                    className={!isUser ? "glass" : undefined}
                    style={{
                      display: "inline-block",
                      padding:
                        "clamp(8px, 1.2vw, 10px) clamp(10px, 1.6vw, 12px)",
                      borderRadius: 14,
                      background: isUser
                        ? "rgba(255,77,109,0.92)"
                        : isGroupMode
                          ? hexToRgba(speakerColor, 0.13)
                          : undefined,
                      color: "#fff",
                      maxWidth: "80%",
                      whiteSpace: "pre-wrap",
                      lineHeight: "clamp(1.45, 1.5, 1.65)",
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                      border: !isUser
                        ? `1px solid ${
                            isGroupMode
                              ? hexToRgba(speakerColor, 0.42)
                              : "rgba(255,255,255,0.16)"
                          }`
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
            <div
              style={{
                marginTop: 6,
                textAlign: "left",
              }}
            >
              <div className="tsuduri-typing glass">
                <span className="label">
                  {loadingCharacterName
                    ? `${loadingCharacterName}が入力中`
                    : "入力中"}
                </span>

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
            style={{
              opacity: 0.92,
              ...uiButtonStyle,
            }}
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
            style={{
              opacity: 0.92,
              ...uiButtonStyle,
            }}
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
            style={{
              opacity: 0.92,
              ...uiButtonStyle,
            }}
          >
            🌙 明日の釣行判断
          </button>
        </div>

        <div
          className="glass glass-strong"
          style={{
            borderRadius: 14,
            padding: 10,
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
              placeholder={placeholderText}
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
              type="button"
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
