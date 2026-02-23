// src/components/CrossFadeSwitch.tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Props = {
  /** 切替トリガーになるキー（screen名など） */
  activeKey: string;
  /** 表示したい中身 */
  children: ReactNode;
  /** ms（デフォルト: 260） */
  durationMs?: number;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
  );
}

/**
 * ✅ 2枚重ねのクロスフェード
 * - A(旧) を opacity:1→0
 * - B(新) を opacity:0→1
 * - フェード完了後に旧を破棄
 *
 * 注意:
 * - opacity は compositor 事情で backdrop-filter に影響しうる。
 *   まずは「試す」目的で実装。
 */
export default function CrossFadeSwitch(props: Props) {
  const durationMsRaw = props.durationMs ?? 260;

  const durationMs = useMemo(() => {
    return prefersReducedMotion() ? 0 : Math.max(0, Math.floor(durationMsRaw));
  }, [durationMsRaw]);

  const [frontKey, setFrontKey] = useState(props.activeKey);
  const [frontChildren, setFrontChildren] = useState<ReactNode>(props.children);

  // 旧レイヤ（フェードアウト中のみ存在）
  const [backKey, setBackKey] = useState<string | null>(null);
  const [backChildren, setBackChildren] = useState<ReactNode>(null);

  // front が見える（true=frontが1、false=frontが0）
  const [frontVisible, setFrontVisible] = useState(true);

  const tokenRef = useRef(0);
  const cleanupTimerRef = useRef<number | null>(null);

  // 同一キーなら中身だけ更新（アニメ無し）
  useEffect(() => {
    if (props.activeKey === frontKey && backKey == null) {
      setFrontChildren(props.children);
    }
    // backKeyが存在する間は、表示確定までは front の中身を不用意に差し替えない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.activeKey, props.children]);

  useEffect(() => {
    if (props.activeKey === frontKey) return;

    const token = ++tokenRef.current;

    if (cleanupTimerRef.current != null) {
      window.clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }

    // reduced motion: 即差し替え
    if (durationMs === 0) {
      setBackKey(null);
      setBackChildren(null);
      setFrontKey(props.activeKey);
      setFrontChildren(props.children);
      setFrontVisible(true);
      return;
    }

    // いま見えてる front を back に退避
    setBackKey(frontKey);
    setBackChildren(frontChildren);

    // 新しい画面を front としてセット（ただし最初は透明）
    setFrontKey(props.activeKey);
    setFrontChildren(props.children);

    // 次フレームでクロスフェード開始
    requestAnimationFrame(() => {
      if (token !== tokenRef.current) return;
      setFrontVisible(false); // back=1, front=0 の状態を作る
      requestAnimationFrame(() => {
        if (token !== tokenRef.current) return;
        setFrontVisible(true); // front=1へ（=クロスフェード完了形）
      });
    });

    // フェード完了後に back を破棄
    cleanupTimerRef.current = window.setTimeout(() => {
      if (token !== tokenRef.current) return;
      setBackKey(null);
      setBackChildren(null);
    }, durationMs + 40);

    return () => {
      if (cleanupTimerRef.current != null) {
        window.clearTimeout(cleanupTimerRef.current);
        cleanupTimerRef.current = null;
      }
    };
  }, [props.activeKey, frontKey, frontChildren, props.children, durationMs]);

  const commonLayerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    minHeight: 0,
  };

  // opacityの切替を2レイヤで行う
  const frontStyle: React.CSSProperties = {
    ...commonLayerStyle,
    opacity: frontVisible ? 1 : 0,
    transition: `opacity ${durationMs}ms ease`,
    pointerEvents: frontVisible ? "auto" : "none",
  };

  const backStyle: React.CSSProperties = {
    ...commonLayerStyle,
    opacity: frontVisible ? 0 : 1,
    transition: `opacity ${durationMs}ms ease`,
    pointerEvents: "none",
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
      {backKey != null ? <div style={backStyle}>{backChildren}</div> : null}
      <div style={frontStyle}>{frontChildren}</div>
    </div>
  );
}
