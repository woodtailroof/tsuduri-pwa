// src/lib/emotion.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type Emotion =
  | "neutral"
  | "happy"
  | "sad"
  | "think"
  | "surprise"
  | "love";

export type EmotionSource =
  | "system"
  | "weather"
  | "chat"
  | "record"
  | "settings"
  | "unknown";

export type SetEmotionOptions = {
  /** 発生源（デバッグに超便利） */
  source?: EmotionSource;

  /** この感情を一定時間で自動解除して neutral に戻す（例: surprise 2500ms） */
  ttlMs?: number;

  /** 任意メモ（ログ用） */
  reason?: string;
};

type EmotionState = {
  emotion: Emotion;
  source: EmotionSource;
  reason?: string;
  updatedAt: number; // epoch ms
};

type EmotionContextValue = {
  emotion: Emotion;
  state: EmotionState;
  setEmotion: (emotion: Emotion, options?: SetEmotionOptions) => void;

  /** 強制的に neutral に戻す */
  resetEmotion: (options?: Omit<SetEmotionOptions, "ttlMs">) => void;
};

const EmotionContext = createContext<EmotionContextValue | null>(null);

export function EmotionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EmotionState>(() => ({
    emotion: "neutral",
    source: "system",
    reason: "init",
    updatedAt: Date.now(),
  }));

  // TTL管理（後から来た感情が勝つようにトークンでガード）
  const ttlTokenRef = useRef(0);
  const ttlTimerRef = useRef<number | null>(null);

  const clearTtl = useCallback(() => {
    if (ttlTimerRef.current != null) {
      window.clearTimeout(ttlTimerRef.current);
      ttlTimerRef.current = null;
    }
  }, []);

  const setEmotion = useCallback((emotion: Emotion, options?: SetEmotionOptions) => {
    const source = options?.source ?? "unknown";
    const reason = options?.reason;

    clearTtl();
    ttlTokenRef.current += 1;
    const myToken = ttlTokenRef.current;

    setState({
      emotion,
      source,
      reason,
      updatedAt: Date.now(),
    });

    const ttlMs = options?.ttlMs;
    if (typeof ttlMs === "number" && ttlMs > 0) {
      ttlTimerRef.current = window.setTimeout(() => {
        // 途中で別感情が入ってたら戻さない
        if (ttlTokenRef.current !== myToken) return;

        setState({
          emotion: "neutral",
          source: "system",
          reason: "ttl-reset",
          updatedAt: Date.now(),
        });
      }, ttlMs);
    }
  }, [clearTtl]);

  const resetEmotion = useCallback((options?: Omit<SetEmotionOptions, "ttlMs">) => {
    setEmotion("neutral", { source: options?.source ?? "system", reason: options?.reason ?? "manual-reset" });
  }, [setEmotion]);

  useEffect(() => {
    return () => {
      clearTtl();
    };
  }, [clearTtl]);

  const value = useMemo<EmotionContextValue>(() => {
    return {
      emotion: state.emotion,
      state,
      setEmotion,
      resetEmotion,
    };
  }, [state, setEmotion, resetEmotion]);

  return <EmotionContext.Provider value={value}>{children}</EmotionContext.Provider>;
}

export function useEmotion() {
  const ctx = useContext(EmotionContext);
  if (!ctx) {
    throw new Error("useEmotion must be used within EmotionProvider");
  }
  return ctx;
}
