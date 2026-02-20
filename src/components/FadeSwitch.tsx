// src/components/FadeSwitch.tsx
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

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

export default function FadeSwitch(props: Props) {
  const durationMsRaw = props.durationMs ?? 220;
  const liftPx = props.liftPx ?? 6;

  const durationMs = useMemo(() => {
    return prefersReducedMotion() ? 0 : Math.max(0, Math.floor(durationMsRaw));
  }, [durationMsRaw]);

  // 表示レイヤー（prev / next）
  const [prevChildren, setPrevChildren] = useState<ReactNode>(props.children);
  const [nextChildren, setNextChildren] = useState<ReactNode>(props.children);

  // next を前面にするか（クロスフェード制御）
  const [showNext, setShowNext] = useState(true);

  // 現在表示中のキー（これだけで判定する）
  const [shownKey, setShownKey] = useState(props.activeKey);

  // 最新 children を保持（切替確定時に使う）
  const latestChildrenRef = useRef<ReactNode>(props.children);
  useEffect(() => {
    latestChildrenRef.current = props.children;
  }, [props.children]);

  const tokenRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // 初期化
  useEffect(() => {
    setPrevChildren(props.children);
    setNextChildren(props.children);
    setShowNext(true);
    setShownKey(props.activeKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (props.activeKey === shownKey) {
      // 同じ画面なら何もしない（子が更新されてもフェードさせない）
      return;
    }

    const token = ++tokenRef.current;

    // 後始末
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    // reduced motion なら即座に差し替え
    if (durationMs === 0) {
      const ch = latestChildrenRef.current;
      setPrevChildren(ch);
      setNextChildren(ch);
      setShowNext(true);
      setShownKey(props.activeKey);
      return;
    }

    // いま表示中のレイヤーを prev として固定
    // showNext=true の時は next が見えているので、それを prev に落とす
    if (showNext) {
      setPrevChildren(nextChildren);
    }
    // showNext=false の時は prev が見えているので、そのままでOK

    // 新しい next をセット（最新 children を使う）
    const ch = latestChildrenRef.current;
    setNextChildren(ch);

    // クロスフェード開始
    setShowNext(false);
    rafRef.current = window.requestAnimationFrame(() => {
      if (token !== tokenRef.current) return;
      setShowNext(true);
    });

    // フェード完了後、prev を next と同じに揃えて軽量化 & shownKey 更新
    timerRef.current = window.setTimeout(() => {
      if (token !== tokenRef.current) return;
      setPrevChildren(latestChildrenRef.current);
      setShownKey(props.activeKey);
    }, durationMs + 30);

    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [props.activeKey, durationMs, shownKey, showNext, nextChildren]);

  const vars: CSSProperties & Record<`--${string}`, string> = {
    "--fade-ms": `${durationMs}ms`,
    "--fade-lift": `${liftPx}px`,
  };

  return (
    <div className="fade-switch2" style={vars}>
      <div
        className="fade-switch2__layer"
        data-side="prev"
        data-show={showNext ? "hide" : "show"}
      >
        {prevChildren}
      </div>

      <div
        className="fade-switch2__layer"
        data-side="next"
        data-show={showNext ? "show" : "hide"}
      >
        {nextChildren}
      </div>
    </div>
  );
}
