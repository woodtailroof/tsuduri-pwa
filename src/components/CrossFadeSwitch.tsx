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

  const rootRef = useRef<HTMLDivElement | null>(null);

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

    // 新しい画面をfrontにセット（prep中は透明）
    setFrontKey(props.activeKey);
    setFrontChildren(props.children);

    // ✅ prep: ここで「開始状態」を確定させる（transition無し）
    setPhase("prep");

    // ① 次フレーム：DOM反映を待つ
    raf1Ref.current = window.requestAnimationFrame(() => {
      if (token !== tokenRef.current) return;

      // ✅ reflow を1回読んで「prep状態」を確定させる（ここが肝）
      // これが無いと、ブラウザが変更をまとめて「瞬間切替」にすることがある
      if (rootRef.current) {
        rootRef.current.getBoundingClientRect();
      }

      // ② さらに次フレーム：runに入って transition 発火
      raf2Ref.current = window.requestAnimationFrame(() => {
        if (token !== tokenRef.current) return;

        setPhase("run");

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

  const common: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    minHeight: 0,
    willChange: "opacity",
  };

  const transition =
    phase === "run" ? `opacity ${durationMs}ms ease-in-out` : "none";

  // 見た目（opacity）
  const frontOpacity = phase === "prep" ? 0 : 1;
  const backOpacity = phase === "prep" ? 1 : 0;

  // ✅ 入力（pointer-events）
  // prep中は back（旧画面）だけ触れる。run/ stable は front を触れる。
  const backPE: React.CSSProperties["pointerEvents"] =
    phase === "prep" ? "auto" : "none";
  const frontPE: React.CSSProperties["pointerEvents"] =
    backKey != null ? (phase === "prep" ? "none" : "auto") : "auto";

  return (
    <div
      ref={rootRef}
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
            ...common,
            opacity: backOpacity,
            transition,
            pointerEvents: backPE,
          }}
        >
          {backChildren}
        </div>
      ) : null}

      <div
        style={{
          ...common,
          opacity: backKey != null ? frontOpacity : 1,
          transition,
          pointerEvents: frontPE,
        }}
      >
        {frontChildren}
      </div>
    </div>
  );
}
