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

  // 表示データは ref で握る（stateのタイミングズレで二重表示しないため）
  const prevRef = useRef<ReactNode>(props.children);
  const nextRef = useRef<ReactNode>(props.children);

  // どっちを前面に出すか
  const [showNext, setShowNext] = useState(true);

  // 「今の画面キー（切替済み扱い）」を保持
  const [shownKey, setShownKey] = useState(props.activeKey);

  const tokenRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // 最新の children は常に nextRef に入れておく（切替時に使う）
  useEffect(() => {
    nextRef.current = props.children;
  }, [props.children]);

  // 初期化
  useEffect(() => {
    prevRef.current = props.children;
    nextRef.current = props.children;
    setShowNext(true);
    setShownKey(props.activeKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (props.activeKey === shownKey) return;

    const token = ++tokenRef.current;

    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    // reduced motion は即差し替え
    if (durationMs === 0) {
      prevRef.current = nextRef.current;
      setShowNext(true);
      setShownKey(props.activeKey);
      return;
    }

    // いま「表示されている側」を prev に確定
    // showNext=true → next が見えてるので nextRef を prev に落とす
    // showNext=false → prev が見えてるので prevRef はそのまま
    if (showNext) {
      prevRef.current = nextRef.current;
    }

    // 次に見せる内容は nextRef.current（最新 children が入ってる）
    // 一度 prev を見せてから、次フレームで next を前に
    setShowNext(false);

    rafRef.current = window.requestAnimationFrame(() => {
      if (token !== tokenRef.current) return;
      setShowNext(true);
    });

    // フェード完了後：prev を next に揃えて軽量化＋shownKey 更新
    timerRef.current = window.setTimeout(() => {
      if (token !== tokenRef.current) return;
      prevRef.current = nextRef.current;
      setShownKey(props.activeKey);
    }, durationMs + 30);

    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [props.activeKey, shownKey, durationMs, showNext]);

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
        {prevRef.current}
      </div>

      <div
        className="fade-switch2__layer"
        data-side="next"
        data-show={showNext ? "show" : "hide"}
      >
        {nextRef.current}
      </div>
    </div>
  );
}
