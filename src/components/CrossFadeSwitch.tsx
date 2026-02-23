// src/components/CrossFadeSwitch.tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Props = {
  activeKey: string;
  children: ReactNode;
  durationMs?: number;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
  );
}

export default function CrossFadeSwitch(props: Props) {
  const durationRaw = props.durationMs ?? 500; // ★ 0.5秒
  const durationMs = useMemo(() => {
    return prefersReducedMotion() ? 0 : Math.max(0, durationRaw);
  }, [durationRaw]);

  const [frontKey, setFrontKey] = useState(props.activeKey);
  const [frontChildren, setFrontChildren] = useState<ReactNode>(props.children);

  const [backKey, setBackKey] = useState<string | null>(null);
  const [backChildren, setBackChildren] = useState<ReactNode>(null);

  const [running, setRunning] = useState(false);

  const tokenRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (props.activeKey === frontKey) {
      if (!running) {
        setFrontChildren(props.children);
      }
      return;
    }

    const token = ++tokenRef.current;

    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (durationMs === 0) {
      setBackKey(null);
      setBackChildren(null);
      setFrontKey(props.activeKey);
      setFrontChildren(props.children);
      setRunning(false);
      return;
    }

    // 現在のfrontをbackへ
    setBackKey(frontKey);
    setBackChildren(frontChildren);

    // 新しい画面をfrontへ（最初は透明）
    setFrontKey(props.activeKey);
    setFrontChildren(props.children);

    // クロスフェード開始
    requestAnimationFrame(() => {
      if (token !== tokenRef.current) return;
      setRunning(true);
    });

    // 終了処理
    timerRef.current = window.setTimeout(() => {
      if (token !== tokenRef.current) return;
      setBackKey(null);
      setBackChildren(null);
      setRunning(false);
    }, durationMs);

    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    props.activeKey,
    props.children,
    durationMs,
    frontKey,
    frontChildren,
    running,
  ]);

  const common: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    minHeight: 0,
    transition: `opacity ${durationMs}ms ease-in-out`,
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
      }}
    >
      {backKey != null && (
        <div
          style={{
            ...common,
            opacity: running ? 0 : 1,
            pointerEvents: "none",
          }}
        >
          {backChildren}
        </div>
      )}

      <div
        style={{
          ...common,
          opacity: running ? 1 : 1,
          pointerEvents: "auto",
        }}
      >
        {frontChildren}
      </div>
    </div>
  );
}
