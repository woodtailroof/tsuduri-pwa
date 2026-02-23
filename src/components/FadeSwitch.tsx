// src/components/FadeSwitch.tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Props = {
  /** 切替トリガーになるキー（screen名など） */
  activeKey: string;
  /** 表示したい中身 */
  children: ReactNode;
  /** ms（デフォルト: 260） */
  durationMs?: number;
  /**
   * ✅ 幕の濃さ（0〜1）
   * 0.65〜0.85 あたりが「切替が見えにくくて自然」になりやすい
   * デフォルト: 0.78
   */
  coverAlpha?: number;
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
 * - 幕が最も濃い瞬間に中身を差し替える（切替が見えない）
 */
export default function FadeSwitch(props: Props) {
  const durationMsRaw = props.durationMs ?? 260;
  const coverAlphaRaw = props.coverAlpha ?? 0.78;

  const durationMs = useMemo(() => {
    return prefersReducedMotion() ? 0 : Math.max(0, Math.floor(durationMsRaw));
  }, [durationMsRaw]);

  const coverAlpha = useMemo(() => {
    const v = Number(coverAlphaRaw);
    if (!Number.isFinite(v)) return 0.78;
    return Math.max(0, Math.min(1, v));
  }, [coverAlphaRaw]);

  // 半分ずつ（暗転→差替→復帰）
  const halfMs = useMemo(
    () => Math.max(0, Math.floor(durationMs / 2)),
    [durationMs],
  );

  const [shownKey, setShownKey] = useState(props.activeKey);
  const [shownChildren, setShownChildren] = useState<ReactNode>(props.children);
  const [phase, setPhase] = useState<Phase>("idle");

  // 最新のchildrenを保持
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

    // reduced motion / 短すぎる場合は即差替え
    if (durationMs === 0 || halfMs === 0) {
      setShownKey(props.activeKey);
      setShownChildren(latestChildrenRef.current);
      setPhase("idle");
      return;
    }

    // 1) 暗転開始（幕を濃く）
    setPhase("fadeOut");

    // 2) 暗転が最大になったタイミングで差し替え
    timerRef.current = window.setTimeout(() => {
      if (token !== tokenRef.current) return;

      setShownKey(props.activeKey);
      setShownChildren(latestChildrenRef.current);

      // 3) 次フレームから復帰（明転）
      requestAnimationFrame(() => {
        if (token !== tokenRef.current) return;

        setPhase("fadeIn");

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

  // overlay（幕）の見え方
  const overlayOpacity = phase === "fadeOut" || phase === "fadeIn" ? 1 : 0;

  // 暗転は ease-in、明転は ease-out にすると自然
  const easing =
    phase === "fadeOut" ? "cubic-bezier(.4,0,1,1)" : "cubic-bezier(0,0,.2,1)";

  const overlayTransition =
    durationMs === 0 || halfMs === 0 ? "none" : `opacity ${halfMs}ms ${easing}`;

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

      {/* 幕（これだけがフェードする） */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: overlayOpacity,
          transition: overlayTransition,

          // ✅ 重要：切替を完全に隠すため「幕の濃さ」を強めに
          background: `rgba(0,0,0,${coverAlpha})`,

          // ほんの少しだけハイライトを足して“質感”を出す（好みで）
          // background: `linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.00)), rgba(0,0,0,${coverAlpha})`,
        }}
      />
    </div>
  );
}
