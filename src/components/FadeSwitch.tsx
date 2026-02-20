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
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

export default function FadeSwitch(props: Props) {
  const durationMsRaw = props.durationMs ?? 220;
  const liftPx = props.liftPx ?? 6;

  const durationMs = useMemo(() => {
    return prefersReducedMotion() ? 0 : Math.max(0, Math.floor(durationMsRaw));
  }, [durationMsRaw]);

  const [shownKey, setShownKey] = useState(props.activeKey);
  const [shownChildren, setShownChildren] = useState<ReactNode>(props.children);

  // "enter" | "exit"
  const [phase, setPhase] = useState<"enter" | "exit">("enter");
  const pendingTimer = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  // 初回マウント時にふわっと出す（いきなり1にならないように）
  useEffect(() => {
    // 0msの場合は何もしない
    if (durationMs === 0) return;

    setPhase("exit");
    raf.current = window.requestAnimationFrame(() => {
      setPhase("enter");
    });

    return () => {
      if (raf.current != null) window.cancelAnimationFrame(raf.current);
      raf.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (props.activeKey === shownKey) return;

    // 切替中のタイマーを掃除
    if (pendingTimer.current != null) window.clearTimeout(pendingTimer.current);
    pendingTimer.current = null;

    if (durationMs === 0) {
      setShownKey(props.activeKey);
      setShownChildren(props.children);
      setPhase("enter");
      return;
    }

    // まずフェードアウト
    setPhase("exit");

    // 終わったら差し替えてフェードイン
    pendingTimer.current = window.setTimeout(() => {
      setShownKey(props.activeKey);
      setShownChildren(props.children);

      // 1フレーム挟んで enter にする（確実にトランジションが走る）
      raf.current = window.requestAnimationFrame(() => {
        setPhase("enter");
      });
    }, durationMs);

    return () => {
      if (pendingTimer.current != null) window.clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
      if (raf.current != null) window.cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [props.activeKey, props.children, shownKey, durationMs]);

  return (
    <div
      className="fade-switch"
      data-phase={phase}
      style={
        {
          "--fade-ms": `${durationMs}ms`,
          "--fade-lift": `${liftPx}px`,
        } as React.CSSProperties
      }
    >
      {shownChildren}
    </div>
  );
}