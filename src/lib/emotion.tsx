/* eslint-disable react-refresh/only-export-components */
// src/lib/emotion.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type Emotion =
  | "neutral"
  | "happy"
  | "sad"
  | "think"
  | "surprise"
  | "love";

export type EmotionSource = "weather" | "chat" | "manual" | "system" | string;

type EmotionEvent = {
  source: EmotionSource;
  emotion: Emotion;
  priority: number;
  expiresAt: number | null; // null = no-expire
  updatedAt: number; // tie-breaker
};

type EmitArgs = {
  source: EmotionSource;
  emotion: Emotion;
  /** 強いほど勝つ。例: chat 30 / weather 10 / manual 50 */
  priority?: number;
  /** ms。null/undefined なら無期限。0以下なら即クリア扱い */
  ttlMs?: number | null;
};

type EmotionState = {
  /** ✅ 現在採用されている感情（Stageが見るのはこれ） */
  emotion: Emotion;

  /** ✅ 旧互換：単純に “手動で” 感情を上書き（manual扱い） */
  setEmotion: (next: Emotion) => void;

  /** ✅ 新：source付きで感情を投げる（寿命・優先順位対応） */
  emitEmotion: (args: EmitArgs) => void;

  /** ✅ 新：source を明示的に消す（画面離脱時など） */
  clearEmotion: (source: EmotionSource) => void;

  /** ✅ 新：デバッグしたい時用（UIには出さなくてOK） */
  getActiveSources: () => {
    source: string;
    emotion: Emotion;
    priority: number;
    expiresAt: number | null;
  }[];
};

const EmotionContext = createContext<EmotionState | null>(null);

function clampInt(n: unknown, fallback: number) {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return fallback;
  return Math.floor(num);
}

function pickWinner(events: EmotionEvent[]): Emotion {
  if (!events.length) return "neutral";
  // priority desc → updatedAt desc
  const sorted = [...events].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.updatedAt - a.updatedAt;
  });
  return sorted[0]?.emotion ?? "neutral";
}

function nowMs(): number {
  // ✅ render中に Date.now() を呼ぶ lint（react-hooks/purity）対策
  // performance.now は “経過時間” なので expiresAt 判定には使わない
  return Date.now();
}

export function EmotionProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<Record<string, EmotionEvent>>({});
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  // ✅ “現在時刻”は state で持って render 外で更新（purity対策）
  const [tickNow, setTickNow] = useState<number>(() => nowMs());

  // ✅ 期限切れを掃除（1秒に1回で十分）
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = nowMs();
      setTickNow(now);

      const cur = eventsRef.current;
      let changed = false;
      const next: Record<string, EmotionEvent> = { ...cur };

      for (const [k, ev] of Object.entries(cur)) {
        if (ev.expiresAt != null && ev.expiresAt <= now) {
          delete next[k];
          changed = true;
        }
      }
      if (changed) setEvents(next);
    }, 1000);

    return () => window.clearInterval(id);
  }, []);

  const emotion = useMemo(() => {
    const now = tickNow;
    const active = Object.values(events).filter(
      (e) => e.expiresAt == null || e.expiresAt > now,
    );
    return pickWinner(active);
  }, [events, tickNow]);

  const emitEmotion = useCallback((args: EmitArgs) => {
    const source = String(args.source ?? "").trim() || "system";
    const emotion = (args.emotion ?? "neutral") as Emotion;

    const priority = clampInt(args.priority, source === "manual" ? 50 : 10);
    const ttlRaw = args.ttlMs;

    // ttl <= 0 は “クリア” 扱いにする
    const ttlMs =
      ttlRaw == null
        ? null
        : Number.isFinite(Number(ttlRaw))
          ? Number(ttlRaw)
          : null;

    if (ttlMs != null && ttlMs <= 0) {
      setEvents((cur) => {
        if (!cur[source]) return cur;
        const next = { ...cur };
        delete next[source];
        return next;
      });
      return;
    }

    const now = nowMs();
    const expiresAt = ttlMs == null ? null : now + Math.floor(ttlMs);

    setEvents((cur) => ({
      ...cur,
      [source]: {
        source,
        emotion,
        priority,
        expiresAt,
        updatedAt: now,
      },
    }));
  }, []);

  const clearEmotion = useCallback((source: EmotionSource) => {
    const key = String(source ?? "").trim();
    if (!key) return;
    setEvents((cur) => {
      if (!cur[key]) return cur;
      const next = { ...cur };
      delete next[key];
      return next;
    });
  }, []);

  // ✅ 旧互換：setEmotion は “manual” として無期限で入れる
  const setEmotion = useCallback(
    (next: Emotion) => {
      emitEmotion({
        source: "manual",
        emotion: next,
        priority: 50,
        ttlMs: null,
      });
    },
    [emitEmotion],
  );

  const getActiveSources = useCallback(() => {
    const now = tickNow;
    return Object.values(eventsRef.current)
      .filter((e) => e.expiresAt == null || e.expiresAt > now)
      .map((e) => ({
        source: String(e.source),
        emotion: e.emotion,
        priority: e.priority,
        expiresAt: e.expiresAt,
      }));
  }, [tickNow]);

  const value = useMemo<EmotionState>(
    () => ({
      emotion,
      setEmotion,
      emitEmotion,
      clearEmotion,
      getActiveSources,
    }),
    [emotion, setEmotion, emitEmotion, clearEmotion, getActiveSources],
  );

  return (
    <EmotionContext.Provider value={value}>{children}</EmotionContext.Provider>
  );
}

export function useEmotion(): EmotionState {
  const ctx = useContext(EmotionContext);
  if (!ctx) throw new Error("useEmotion must be used within EmotionProvider");
  return ctx;
}
