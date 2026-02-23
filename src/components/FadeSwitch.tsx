// src/components/FadeSwitch.tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Props = {
  /** 切替トリガーになるキー（screen名など） */
  activeKey: string;
  /** 表示したい中身 */
  children: ReactNode;
  /** ms（デフォルト: 220） */
  durationMs?: number;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
  );
}

type Phase = "idle" | "fadeOut" | "fadeIn";

/**
 * ✅ backdrop-filter を殺しにくいフェード方式
 * - コンテンツ側の opacity を触らない
 * - 上に「幕(overlay)」を被せてフェード
 * - 幕が最大になった瞬間に中身を差し替える
 */
export default function FadeSwitch(props: Props) {
  const durationMsRaw = props.durationMs ?? 220;

  const durationMs = useMemo(() => {
    return prefersReducedMotion() ? 0 : Math.max(0, Math.floor(durationMsRaw));
  }, [durationMsRaw]);

  const halfMs = useMemo(
    () => Math.max(0, Math.floor(durationMs / 2)),
    [durationMs],
  );

  const [shownKey, setShownKey] = useState(props.activeKey);
  const [shownChildren, setShownChildren] = useState<ReactNode>(props.children);
  const [phase, setPhase] = useState<Phase>("idle");

  const latestChildrenRef = useRef<ReactNode>(props.children);
  useEffect(() => {
    latestChildrenRef.current = props.children;
  }, [props.children]);

  const tokenRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  // 同一キーなら中身だけ追従（フェード無し）
  useEffect(() => {
    if (props.activeKey === shownKey) {
      setShownChildren(props.children);
    }
  }, [props.activeKey, props.children, shownKey]);

  useEffect(() => {
    if (props.activeKey === shownKey) return;

    const token = ++tokenRef.current;

    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (durationMs === 0 || halfMs === 0) {
      setShownKey(props.activeKey);
      setShownChildren(latestChildrenRef.current);
      setPhase("idle");
      return;
    }

    // 1) 幕を濃くする
    setPhase("fadeOut");

    // 2) 半分経ったら差し替え + 幕を薄くする
    timerRef.current = window.setTimeout(() => {
      if (token !== tokenRef.current) return;

      setShownKey(props.activeKey);
      setShownChildren(latestChildrenRef.current);

      // 次フレームで fadeIn に入れる（CSS反映を確実に）
      requestAnimationFrame(() => {
        if (token !== tokenRef.current) return;
        setPhase("fadeIn");

        // 3) 残り半分で idle
        timerRef.current = window.setTimeout(() => {
          if (token !== tokenRef.current) return;
          setPhase("idle");
        }, halfMs);
      });
    }, halfMs);

    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [props.activeKey, shownKey, durationMs, halfMs]);

  // overlay の不透明度
  const overlayOpacity = phase === "fadeOut" ? 1 : phase === "fadeIn" ? 0 : 0;

  // overlay のトランジション
  const overlayTransition =
    durationMs === 0
      ? "none"
      : phase === "fadeOut"
        ? `opacity ${halfMs}ms ease`
        : phase === "fadeIn"
          ? `opacity ${halfMs}ms ease`
          : "none";

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
      }}
    >
      {/* コンテンツは常に不透明（backdrop-filterを守る） */}
      <div style={{ width: "100%", height: "100%", minHeight: 0 }}>
        {shownChildren}
      </div>

      {/* 幕（これだけが opacity 変化する） */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: overlayOpacity,
          transition: overlayTransition,
          // “暗転”は真っ黒だと強いので、ほんのりガラスっぽく
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.26), rgba(0,0,0,0.26))",
        }}
      />
    </div>
  );
}
