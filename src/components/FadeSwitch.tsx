// src/components/FadeSwitch.tsx
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

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

function prefersLightweightTransitions(): boolean {
  if (typeof window === "undefined") return true;
  return (
    window.matchMedia?.("(max-width: 820px)")?.matches ||
    window.matchMedia?.("(pointer: coarse)")?.matches ||
    false
  );
}

type Item = {
  key: string;
  node: ReactNode;
};

type CoverPhase = "hidden" | "covered" | "revealing";

export default function FadeSwitch(props: Props) {
  const durationMsRaw = props.durationMs ?? 260;
  const coverAlpha = Math.max(0, Math.min(1, props.coverAlpha ?? 0.82));
  const revealMs = Math.max(100, Math.min(220, props.settleMs ?? 160));

  const lightweightTransitions = useMemo(
    () => prefersLightweightTransitions(),
    [],
  );

  const durationMs = useMemo(() => {
    return prefersReducedMotion() ? 0 : Math.max(0, Math.floor(durationMsRaw));
  }, [durationMsRaw]);

  const [items, setItems] = useState<Item[]>([
    { key: props.activeKey, node: props.children },
  ]);
  const [coverPhase, setCoverPhase] = useState<CoverPhase>("hidden");

  const latestChildrenRef = useRef<ReactNode>(props.children);
  latestChildrenRef.current = props.children;

  const prevKeyRef = useRef(props.activeKey);
  const timerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const firstRafRef = useRef<number | null>(null);
  const secondRafRef = useRef<number | null>(null);

  const clearLightweightTimers = useCallback(() => {
    if (revealTimerRef.current != null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (firstRafRef.current != null) {
      window.cancelAnimationFrame(firstRafRef.current);
      firstRafRef.current = null;
    }
    if (secondRafRef.current != null) {
      window.cancelAnimationFrame(secondRafRef.current);
      secondRafRef.current = null;
    }
  }, []);

  useLayoutEffect(() => {
    if (!lightweightTransitions) return;
    if (props.activeKey === prevKeyRef.current) return;

    clearLightweightTimers();

    const next: Item = {
      key: props.activeKey,
      node: latestChildrenRef.current,
    };

    // スマホでは旧画面を即座に外し、軽い暗転幕だけで切り替える。
    setItems([next]);
    prevKeyRef.current = props.activeKey;
    setCoverPhase("covered");

    firstRafRef.current = window.requestAnimationFrame(() => {
      firstRafRef.current = null;
      secondRafRef.current = window.requestAnimationFrame(() => {
        secondRafRef.current = null;
        setCoverPhase("revealing");
        revealTimerRef.current = window.setTimeout(() => {
          setCoverPhase("hidden");
          revealTimerRef.current = null;
        }, revealMs);
      });
    });

    return clearLightweightTimers;
  }, [
    props.activeKey,
    lightweightTransitions,
    revealMs,
    clearLightweightTimers,
  ]);

  useEffect(() => {
    if (lightweightTransitions) return;
    if (props.activeKey === prevKeyRef.current) return;

    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const next: Item = {
      key: props.activeKey,
      node: latestChildrenRef.current,
    };

    if (durationMs === 0) {
      setItems([next]);
      prevKeyRef.current = props.activeKey;
      return;
    }

    // PCでは従来どおり旧画面と新画面を重ねてクロスフェードする。
    setItems((current) => {
      const prev = current[current.length - 1] ?? {
        key: prevKeyRef.current,
        node: latestChildrenRef.current,
      };
      return [prev, next];
    });
    prevKeyRef.current = props.activeKey;

    timerRef.current = window.setTimeout(() => {
      setItems([{ key: props.activeKey, node: latestChildrenRef.current }]);
      timerRef.current = null;
    }, durationMs);

    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [props.activeKey, durationMs, lightweightTransitions]);

  useEffect(() => {
    if (props.activeKey !== prevKeyRef.current) return;
    setItems((current) => {
      if (current.length !== 1 || current[0]?.key !== props.activeKey) {
        return current;
      }
      return [{ key: props.activeKey, node: props.children }];
    });
  }, [props.activeKey, props.children]);

  useEffect(
    () => () => {
      clearLightweightTimers();
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [clearLightweightTimers],
  );

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
            key={item.key}
            style={{
              position: "absolute",
              inset: 0,
              opacity: isTop ? 1 : 0,
              transition:
                lightweightTransitions || durationMs === 0
                  ? "none"
                  : `opacity ${durationMs}ms ease`,
              pointerEvents: isTop ? "auto" : "none",
              minHeight: 0,
            }}
          >
            {item.node}
          </div>
        );
      })}

      {lightweightTransitions && coverPhase !== "hidden" ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 9999,
            pointerEvents: "none",
            background: "rgb(7, 8, 11)",
            opacity: coverPhase === "covered" ? coverAlpha : 0,
            transition:
              coverPhase === "covered"
                ? "none"
                : `opacity ${revealMs}ms ease-out`,
          }}
        />
      ) : null}
    </div>
  );
}
