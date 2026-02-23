// src/components/CrossFadeSwitch.tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Props = {
  /** 切替トリガーになるキー（screen名など） */
  activeKey: string;
  /** 表示したい中身 */
  children: ReactNode;
  /** ms（デフォルト: 500） */
  durationMs?: number;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
  );
}

type Phase = "stable" | "prep" | "run";

/**
 * ✅ 2枚重ねのクロスフェード（確実に opacity トランジションが走る版）
 * - stable: front=1 / back=なし
 * - prep  : front=0 / back=1（transition無しで1フレーム確定）
 * - run   : front 0→1, back 1→0（transition有り）
 * - 完了後 stable に戻して back を破棄
 */
export default function CrossFadeSwitch(props: Props) {
  const durationMsRaw = props.durationMs ?? 500;

  const durationMs = useMemo(() => {
    return prefersReducedMotion() ? 0 : Math.max(0, Math.floor(durationMsRaw));
  }, [durationMsRaw]);

  const [frontKey, setFrontKey] = useState(props.activeKey);
  const [frontChildren, setFrontChildren] = useState<ReactNode>(props.children);

  const [backKey, setBackKey] = useState<string | null>(null);
  const [backChildren, setBackChildren] = useState<ReactNode>(null);

  const [phase, setPhase] = useState<Phase>("stable");

  const tokenRef = useRef(0);
  const cleanupTimerRef = useRef<number | null>(null);
  const raf1Ref = useRef<number | null>(null);
  const raf2Ref = useRef<number | null>(null);

  // 同一キーなら中身だけ更新（フェードさせない）
  useEffect(() => {
    if (props.activeKey === frontKey && backKey == null && phase === "stable") {
      setFrontChildren(props.children);
    }
  }, [props.activeKey, props.children, frontKey, backKey, phase]);

  useEffect(() => {
    if (props.activeKey === frontKey) return;

    const token = ++tokenRef.current;

    // 後始末
    if (cleanupTimerRef.current != null) {
      window.clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }
    if (raf1Ref.current != null) {
      window.cancelAnimationFrame(raf1Ref.current);
      raf1Ref.current = null;
    }
    if (raf2Ref.current != null) {
      window.cancelAnimationFrame(raf2Ref.current);
      raf2Ref.current = null;
    }

    // reduced motion は即差し替え
    if (durationMs === 0) {
      setBackKey(null);
      setBackChildren(null);
      setFrontKey(props.activeKey);
      setFrontChildren(props.children);
      setPhase("stable");
      return;
    }

    // 旧frontをbackに退避
    setBackKey(frontKey);
    setBackChildren(frontChildren);

    // 新しい画面をfrontにセット
    setFrontKey(props.activeKey);
    setFrontChildren(props.children);

    // ① prep: front=0 / back=1 を「確定」させる（transition無し）
    setPhase("prep");

    // ② 次フレームでrunにして transition を走らせる
    raf1Ref.current = window.requestAnimationFrame(() => {
      if (token !== tokenRef.current) return;

      raf2Ref.current = window.requestAnimationFrame(() => {
        if (token !== tokenRef.current) return;

        setPhase("run");

        // ③ duration後にback破棄して stable に戻す
        cleanupTimerRef.current = window.setTimeout(() => {
          if (token !== tokenRef.current) return;
          setBackKey(null);
          setBackChildren(null);
          setPhase("stable");
        }, durationMs + 60);
      });
    });

    return () => {
      if (cleanupTimerRef.current != null) {
        window.clearTimeout(cleanupTimerRef.current);
        cleanupTimerRef.current = null;
      }
      if (raf1Ref.current != null) {
        window.cancelAnimationFrame(raf1Ref.current);
        raf1Ref.current = null;
      }
      if (raf2Ref.current != null) {
        window.cancelAnimationFrame(raf2Ref.current);
        raf2Ref.current = null;
      }
    };
  }, [props.activeKey, props.children, durationMs, frontKey, frontChildren]);

  const commonLayerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    minHeight: 0,
  };

  const transition =
    phase === "run" ? `opacity ${durationMs}ms ease-in-out` : "none";

  // prep中は front=0 / back=1、run中は front=1 / back=0
  const frontOpacity = phase === "prep" ? 0 : 1;
  const backOpacity = phase === "prep" ? 1 : 0;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
      }}
    >
      {backKey != null ? (
        <div
          style={{
            ...commonLayerStyle,
            opacity: backOpacity,
            transition,
            pointerEvents: "none",
          }}
        >
          {backChildren}
        </div>
      ) : null}

      <div
        style={{
          ...commonLayerStyle,
          opacity: backKey != null ? frontOpacity : 1,
          transition,
          pointerEvents: "auto",
        }}
      >
        {frontChildren}
      </div>
    </div>
  );
}
