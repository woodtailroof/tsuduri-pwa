// src/lib/emotion.tsx
import React, { createContext, useContext, useMemo, useState } from "react";

export type Emotion =
  | "neutral"
  | "happy"
  | "sad"
  | "think"
  | "surprise"
  | "love";

type EmotionState = {
  emotion: Emotion;
  setEmotion: (next: Emotion) => void;
};

const EmotionContext = createContext<EmotionState | null>(null);

export function EmotionProvider({ children }: { children: React.ReactNode }) {
  const [emotion, setEmotion] = useState<Emotion>("neutral");

  const value = useMemo<EmotionState>(
    () => ({ emotion, setEmotion }),
    [emotion],
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
