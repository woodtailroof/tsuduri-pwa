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
  const [prevKey, setPrevKey] = useState(props.activeKey);
  const [prevChildren, setPrevChildren] = useState<ReactNode>(props.children);

  const [nextKey, setNextKey] = useState(props.activeKey);
  const [nextChildren, setNextChildren] = useState<ReactNode>(props.children);

  // next を前面にするか（クロスフェード制御）
  const [showNext, setShowNext] = useState(true);

  // 最新の children はここに保持（切替確定時に使う）
  const latestChildrenRef = useRef<ReactNode>(props.children);
  useEffect(() => {
    latestChildrenRef.current = props.children;
  }, [props.children]);

  const tokenRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // 初回はそのまま表示（ふわっと出したい場合は showNext を false→true にしてもOK）
  useEffect(() => {
    setPrevKey(props.activeKey);
    setPrevChildren(props.children);
    setNextKey(props.activeKey);
    setNextChildren(props.children);
    setShowNext(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (props.activeKey === nextKey) {
      // 同じ画面なら何もしない（子が変わってもフェードは発生させない）
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
      setPrevKey(props.activeKey);
      setPrevChildren(ch);
      setNextKey(props.activeKey);
      setNextChildren(ch);
      setShowNext(true);
      return;
    }

    // いま見えてる方を prev として固定
    // showNext=true の時：next が表示中なので、それを prev に落としてから新しい next を作る
    // showNext=false の時：prev が表示中なので、そのまま prev を使う
    if (showNext) {
      setPrevKey(nextKey);
      setPrevChildren(nextChildren);
    }

    // 新しい next をセット（最新 children を使う）
    const ch = latestChildrenRef.current;
    setNextKey(props.activeKey);
    setNextChildren(ch);

    // 次フレームで showNext=true にしてクロスフェード開始
    setShowNext(false);
    rafRef.current = window.requestAnimationFrame(() => {
      if (token !== tokenRef.current) return;
      setShowNext(true);
    });

    // フェード完了後に prev を next と同じに揃えて軽量化
    timerRef.current = window.setTimeout(() => {
      if (token !== tokenRef.current) return;
      setPrevKey(props.activeKey);
      setPrevChildren(latestChildrenRef.current);
    }, durationMs + 30);

    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [props.activeKey, durationMs, nextKey, nextChildren, showNext]);

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
