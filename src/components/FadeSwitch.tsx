// src/components/FadeSwitch.tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Props = {
  /** 切替トリガーになるキー（screen名など） */
  activeKey: string;
  /** 表示したい中身 */
  children: ReactNode;
  /** ms（デフォルト: 220） */
  durationMs?: number;
  /** ほんの少しだけ動かす（デフォルト: 6） */
  liftPx?: number;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
  );
}

type Phase = "enter" | "exit" | "idle";

export default function FadeSwitch(props: Props) {
  const durationMsRaw = props.durationMs ?? 220;
  const liftPx = props.liftPx ?? 6;

  const durationMs = useMemo(() => {
    return prefersReducedMotion() ? 0 : Math.max(0, Math.floor(durationMsRaw));
  }, [durationMsRaw]);

  // ✅ いま表示している（確定済み）のキー/中身
  const [shownKey, setShownKey] = useState(props.activeKey);
  const [shownChildren, setShownChildren] = useState<ReactNode>(props.children);
  const [phase, setPhase] = useState<Phase>("idle");

  // ✅ 最新のchildrenはrefで常に保持（切替確定タイミングで読む）
  const latestChildrenRef = useRef<ReactNode>(props.children);
  useEffect(() => {
    latestChildrenRef.current = props.children;
  }, [props.children]);

  // ✅ 進行中の切替を識別（古いタイマーが新しい状態を壊さない）
  const tokenRef = useRef(0);
  const exitTimerRef = useRef<number | null>(null);
  const enterRafRef = useRef<number | null>(null);

  // ✅ 同一キーなら中身だけ追従（フェードさせない）
  useEffect(() => {
    if (props.activeKey === shownKey) {
      setShownChildren(props.children);
    }
  }, [props.activeKey, props.children, shownKey]);

  useEffect(() => {
    if (props.activeKey === shownKey) return;

    const token = ++tokenRef.current;

    // 後始末（新しい切替が来たら古いのは必ず殺す）
    if (exitTimerRef.current != null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    if (enterRafRef.current != null) {
      window.cancelAnimationFrame(enterRafRef.current);
      enterRafRef.current = null;
    }

    // reduced motion は即差し替え
    if (durationMs === 0) {
      setShownKey(props.activeKey);
      setShownChildren(latestChildrenRef.current);
      setPhase("idle");
      return;
    }

    // 1) まずフェードアウト開始
    setPhase("exit");

    // 2) duration後に中身を差し替えてフェードイン
    exitTimerRef.current = window.setTimeout(() => {
      if (token !== tokenRef.current) return;

      setShownKey(props.activeKey);
      setShownChildren(latestChildrenRef.current);

      // enter を1フレーム挟んで確実に効かせる
      setPhase("enter");
      enterRafRef.current = window.requestAnimationFrame(() => {
        if (token !== tokenRef.current) return;
        setPhase("idle");
      });
    }, durationMs);

    return () => {
      if (exitTimerRef.current != null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      if (enterRafRef.current != null) {
        window.cancelAnimationFrame(enterRafRef.current);
        enterRafRef.current = null;
      }
    };
  }, [props.activeKey, shownKey, durationMs]);

  const style = {
    ["--fade-ms" as any]: `${durationMs}ms`,
    ["--fade-lift" as any]: `${liftPx}px`,
  };

  const dataPhase: "exit" | "enter" = phase === "exit" ? "exit" : "enter";

  return (
    <div className="fade-switch" data-phase={dataPhase} style={style}>
      {shownChildren}
    </div>
  );
}