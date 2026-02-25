// src/components/SecretPortalHotspot.tsx
import { useEffect, useRef, useState, type CSSProperties } from "react";

type Props = {
  onUnlock: () => void;
  style?: CSSProperties;
};

/**
 * 透明の秘密入口。
 * 解放条件:
 * - 長押し 1200ms
 * - または 7回タップ（2.5秒以内）
 */
export default function SecretPortalHotspot(props: Props) {
  const [tapCount, setTapCount] = useState(0);
  const windowMs = 2500;

  const firstTapAtRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const unlockedRef = useRef(false);

  const unlock = () => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    props.onUnlock();
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const onPointerDown = () => {
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      unlock();
    }, 1200);
  };

  const onPointerUp = () => {
    clearLongPress();
  };

  const onClick = () => {
    const now = Date.now();
    const first = firstTapAtRef.current;

    if (first == null || now - first > windowMs) {
      firstTapAtRef.current = now;
      setTapCount(1);
      return;
    }

    setTapCount((c) => c + 1);
  };

  useEffect(() => {
    if (tapCount >= 7) {
      unlock();
      return;
    }

    const first = firstTapAtRef.current;
    if (first == null) return;

    const remain = Math.max(0, windowMs - (Date.now() - first));
    const t = window.setTimeout(() => {
      firstTapAtRef.current = null;
      setTapCount(0);
    }, remain + 30);

    return () => window.clearTimeout(t);
  }, [tapCount]);

  return (
    <div
      style={{
        pointerEvents: "auto",
        background: "transparent",
        touchAction: "manipulation",
        userSelect: "none",
        ...props.style,
      }}
      aria-label="secret-portal-hotspot"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={onClick}
    />
  );
}
