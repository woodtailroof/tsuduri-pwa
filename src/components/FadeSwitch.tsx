// src/components/FadeSwitch.tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Props = {
  activeKey: string;
  children: ReactNode;
  durationMs?: number;
  coverAlpha?: number;
  settleMs?: number;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
  );
}

type Item = {
  key: string;
  node: ReactNode;
};

export default function FadeSwitch(props: Props) {
  const durationMsRaw = props.durationMs ?? 260;

  const durationMs = useMemo(() => {
    return prefersReducedMotion() ? 0 : Math.max(0, Math.floor(durationMsRaw));
  }, [durationMsRaw]);

  const [items, setItems] = useState<Item[]>([
    { key: props.activeKey, node: props.children },
  ]);

  const latestChildrenRef = useRef<ReactNode>(props.children);
  useEffect(() => {
    latestChildrenRef.current = props.children;
  }, [props.children]);

  const prevKeyRef = useRef(props.activeKey);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (props.activeKey === prevKeyRef.current) {
      setItems((cur) => {
        if (cur.length !== 1) return cur;
        if (cur[0]?.key !== props.activeKey) return cur;
        return [{ key: props.activeKey, node: props.children }];
      });
      return;
    }

    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const prev = items[items.length - 1] ?? {
      key: prevKeyRef.current,
      node: latestChildrenRef.current,
    };

    const next: Item = {
      key: props.activeKey,
      node: latestChildrenRef.current,
    };

    if (durationMs === 0) {
      setItems([next]);
      prevKeyRef.current = props.activeKey;
      return;
    }

    // いったん旧画面+新画面を重ねる
    setItems([prev, next]);
    prevKeyRef.current = props.activeKey;

    // duration後に旧画面を外して新画面だけ残す
    timerRef.current = window.setTimeout(() => {
      setItems([{ key: props.activeKey, node: latestChildrenRef.current }]);
      timerRef.current = null;
    }, durationMs);

    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [props.activeKey, props.children, durationMs, items]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
      }}
    >
      {items.map((item, i) => {
        const isTop = i === items.length - 1;

        return (
          <div
            key={`${item.key}:${i}`}
            style={{
              position: "absolute",
              inset: 0,
              opacity: isTop ? 1 : 0,
              transition:
                durationMs === 0 ? "none" : `opacity ${durationMs}ms ease`,
              pointerEvents: isTop ? "auto" : "none",
              minHeight: 0,
            }}
          >
            {item.node}
          </div>
        );
      })}
    </div>
  );
}
