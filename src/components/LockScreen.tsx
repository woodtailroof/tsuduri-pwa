// src/components/LockScreen.tsx
import { useMemo, useState, type CSSProperties } from "react";
import { setSessionUnlocked, verifyAppPassword } from "../lib/appLock";

type Props = {
  onUnlocked: () => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function LockScreen({ onUnlocked }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [missCount, setMissCount] = useState(0);

  const waitSeconds = useMemo(() => {
    if (missCount < 3) return 0;
    return clamp((missCount - 2) * 2, 2, 10);
  }, [missCount]);

  async function waitPenalty() {
    if (waitSeconds <= 0) return;
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, waitSeconds * 1000);
    });
  }

  async function handleUnlock() {
    const trimmed = password.trim();

    if (!trimmed) {
      setError("パスワードを入力してね");
      return;
    }

    setBusy(true);
    setError("");

    try {
      await waitPenalty();

      const ok = await verifyAppPassword(trimmed);
      if (!ok) {
        setMissCount((v) => v + 1);
        setError(
          waitSeconds > 0
            ? "パスワードが違うよ。少し待ってからもう一度どうぞ"
            : "パスワードが違うよ",
        );
        return;
      }

      setSessionUnlocked(true);
      setMissCount(0);
      setPassword("");
      onUnlocked();
    } catch (err) {
      console.error(err);
      setError("ロック解除に失敗したよ");
    } finally {
      setBusy(false);
    }
  }

  const inputType = reveal ? "text" : "password";

  const shell: CSSProperties = {
    width: "100vw",
    height: "100dvh",
    minHeight: 0,
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    padding: 16,
    boxSizing: "border-box",
    background:
      "radial-gradient(circle at top, rgba(255,255,255,0.08), rgba(0,0,0,0) 38%), rgba(8,10,14,0.96)",
  };

  const card: CSSProperties = {
    width: "min(520px, 96vw)",
    borderRadius: 22,
    padding: 18,
    boxSizing: "border-box",
    color: "rgba(255,255,255,0.92)",
    background: "rgba(18, 20, 28, 0.72)",
    border: "1px solid rgba(255,255,255,0.14)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
    display: "grid",
    gap: 14,
  };

  const title: CSSProperties = {
    margin: 0,
    fontSize: 22,
    fontWeight: 900,
    letterSpacing: "0.02em",
  };

  const sub: CSSProperties = {
    fontSize: 13,
    lineHeight: 1.5,
    color: "rgba(255,255,255,0.72)",
  };

  const label: CSSProperties = {
    fontSize: 12,
    color: "rgba(255,255,255,0.72)",
    lineHeight: 1.2,
  };

  const input: CSSProperties = {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.94)",
    padding: "12px 14px",
    outline: "none",
    fontSize: 16,
  };

  const button: CSSProperties = {
    appearance: "none",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.92)",
    borderRadius: 999,
    padding: "12px 16px",
    cursor: busy ? "not-allowed" : "pointer",
    fontWeight: 800,
    opacity: busy ? 0.65 : 1,
  };

  const ghostButton: CSSProperties = {
    ...button,
    padding: "10px 14px",
    fontSize: 13,
    background: "rgba(255,255,255,0.06)",
  };

  return (
    <div style={shell}>
      <div style={card}>
        <div style={{ display: "grid", gap: 8 }}>
          <h1 style={title}>🔒 ロック解除</h1>
          <div style={sub}>
            このアプリは入口ロック中だよ。パスワードを知らない人は中に入れないようにしてある。
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div style={label}>パスワード</div>
          <input
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            type={inputType}
            autoFocus
            autoComplete="current-password"
            style={input}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void handleUnlock();
              }
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <button
            type="button"
            style={ghostButton}
            onClick={() => setReveal((v) => !v)}
            disabled={busy}
          >
            {reveal ? "🙈 非表示にする" : "👁 表示する"}
          </button>

          <button
            type="button"
            style={button}
            onClick={() => {
              void handleUnlock();
            }}
            disabled={busy}
          >
            解錠する
          </button>
        </div>

        {error ? (
          <div
            style={{
              color: "#ffbfd0",
              fontSize: 13,
              lineHeight: 1.4,
              background: "rgba(255, 110, 150, 0.10)",
              border: "1px solid rgba(255, 150, 180, 0.18)",
              borderRadius: 12,
              padding: "10px 12px",
            }}
          >
            {error}
          </div>
        ) : null}

        {missCount >= 3 ? (
          <div style={sub}>
            連続ミスが増えると、少しずつ待ち時間が入るようにしてあるよ。
          </div>
        ) : null}
      </div>
    </div>
  );
}
