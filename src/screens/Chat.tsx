// src/screens/Chat.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { CharacterProfile } from "./CharacterSettings";
import {
  ALLHANDS_BANTER_ENABLED_KEY,
  ALLHANDS_BANTER_RATE_KEY,
  CHARACTERS_STORAGE_KEY,
  SELECTED_CHARACTER_ID_KEY,
} from "./CharacterSettings";
import PageShell from "../components/PageShell";
import { useAppSettings } from "../lib/appSettings";

type Props = {
  back: () => void;
  goCharacterSettings: () => void;
};

type Msg = {
  role: "user" | "assistant";
  content: string;
  speakerId?: string;
};

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

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
        "元気で可愛い、少し甘え＆少し世話焼き。釣りは現実的に頼れる相棒。",
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
  } catch {}
}

function historyKey(roomId: string) {
  return `tsuduri_chat_history_v2:${roomId}`;
}

function safeLoadHistory(roomId: string): Msg[] {
  const raw = localStorage.getItem(historyKey(roomId));
  return safeJsonParse<Msg[]>(raw, []);
}

function safeSaveHistory(roomId: string, messages: Msg[]) {
  try {
    localStorage.setItem(historyKey(roomId), JSON.stringify(messages));
  } catch {}
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function Chat({ back, goCharacterSettings }: Props) {
  const { settings } = useAppSettings();

  const [characters, setCharacters] = useState(() => safeLoadCharacters());
  const fallback = useMemo(() => characters[0], [characters]);

  const [selectedId, setSelectedId] = useState(() =>
    safeLoadSelectedCharacterId(fallback?.id ?? "tsuduri"),
  );

  const selectedCharacter = useMemo(
    () => characters.find((c) => c.id === selectedId) ?? fallback,
    [characters, selectedId, fallback],
  );

  const [roomMode, setRoomMode] = useState<"single" | "all">("single");
  const roomId = roomMode === "single" ? selectedId : "all";

  const [messages, setMessages] = useState<Msg[]>(() =>
    safeLoadHistory(roomId),
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const scrollBoxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMessages(safeLoadHistory(roomId));
  }, [roomId]);

  useEffect(() => {
    safeSaveHistory(roomId, messages);
    const box = scrollBoxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages, roomId]);

  useEffect(() => {
    safeSaveSelectedCharacterId(selectedId);
  }, [selectedId]);

  const canSend = !!input.trim() && !loading;

  async function send() {
    if (!canSend) return;
    const text = input.trim();
    setInput("");

    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          characterProfile: selectedCharacter,
        }),
      });

      const json = await res.json();
      setMessages([
        ...next,
        { role: "assistant", content: String(json.text ?? "") },
      ]);
    } catch (e) {
      setMessages([
        ...next,
        { role: "assistant", content: "ごめん…通信で失敗した🥺" },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <PageShell
      title={<h1 style={{ margin: 0 }}>💬 {selectedCharacter.name}と話す</h1>}
      maxWidth={1100}
      showBack
      onBack={back}
      titleLayout="left"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          gap: 12,
        }}
      >
        <div
          ref={scrollBoxRef}
          className="glass"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 12,
            borderRadius: 14,
          }}
        >
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                marginBottom: 10,
                textAlign: m.role === "user" ? "right" : "left",
              }}
            >
              <span
                className="glass"
                style={{
                  display: "inline-block",
                  padding: "10px 12px",
                  borderRadius: 14,
                  maxWidth: "80%",
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.content}
              </span>
            </div>
          ))}
        </div>

        <div className="glass" style={{ padding: 10, borderRadius: 14 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 12,
                border: "none",
                outline: "none",
                background: "transparent",
                color: "#fff",
              }}
            />
            <button onClick={send} disabled={!canSend}>
              送信
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
