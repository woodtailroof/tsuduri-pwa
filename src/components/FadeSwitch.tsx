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

type Phase = "idle" | "fadeOut" | "hold" | "fadeIn";

export default function FadeSwitch(props: Props) {
  const durationMsRaw = props.durationMs ?? 260;
  const coverAlphaRaw = props.coverAlpha ?? 0.78;
  const settleMsRaw = props.settleMs ?? 90;

  const durationMs = useMemo(() => {
    return prefersReducedMotion() ? 0 : Math.max(0, Math.floor(durationMsRaw));
  }, [durationMsRaw]);

  const coverAlpha = useMemo(() => {
    const v = Number(coverAlphaRaw);
    if (!Number.isFinite(v)) return 0.78;
    return Math.max(0, Math.min(1, v));
  }, [coverAlphaRaw]);

  const settleMs = useMemo(() => {
    const v = Number(settleMsRaw);
    if (!Number.isFinite(v)) return 90;
    return Math.max(0, Math.floor(v));
  }, [settleMsRaw]);

  const halfMs = useMemo(
    () => Math.max(0, Math.floor(durationMs / 2)),
    [durationMs],
  );

  const [shownKey, setShownKey] = useState(props.activeKey);
  const [shownChildren, setShownChildren] = useState<ReactNode>(props.children);
  const [phase, setPhase] = useState<Phase>("idle");

  const latestChildrenRef = useRef<ReactNode>(props.children);
  useEffect(() => {
    latestChildrenRef.current = props.children;
  }, [props.children]);

  const tokenRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const raf1Ref = useRef<number | null>(null);
  const raf2Ref = useRef<number | null>(null);

  const clearPending = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
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

  // 同一キーのときは中身だけ追従
  useEffect(() => {
    if (phase !== "idle") return;
    if (props.activeKey === shownKey) {
      setShownChildren(props.children);
    }
  }, [props.activeKey, props.children, shownKey, phase]);

  // ✅ 依存は activeKey ベースだけにする
  useEffect(() => {
    if (props.activeKey === shownKey) return;

    const token = ++tokenRef.current;
    clearPending();

    if (durationMs === 0 || halfMs === 0) {
      setShownKey(props.activeKey);
      setShownChildren(latestChildrenRef.current);
      setPhase("idle");
      return;
    }

    setPhase("fadeOut");

    timerRef.current = window.setTimeout(() => {
      if (token !== tokenRef.current) return;

      setShownKey(props.activeKey);
      setShownChildren(latestChildrenRef.current);
      setPhase("hold");

      raf1Ref.current = window.requestAnimationFrame(() => {
        if (token !== tokenRef.current) return;

        raf2Ref.current = window.requestAnimationFrame(() => {
          if (token !== tokenRef.current) return;

          timerRef.current = window.setTimeout(() => {
            if (token !== tokenRef.current) return;

            setPhase("fadeIn");

            timerRef.current = window.setTimeout(() => {
              if (token !== tokenRef.current) return;
              setPhase("idle");
              timerRef.current = null;
            }, halfMs);
          }, settleMs);
        });
      });
    }, halfMs);

    return () => {
      clearPending();
    };
    // ✅ shownKey を入れない
  }, [props.activeKey, durationMs, halfMs, settleMs]);

  const overlayOpacity = phase === "fadeOut" || phase === "hold" ? 1 : 0;

  const easing =
    phase === "fadeOut" ? "cubic-bezier(.4,0,1,1)" : "cubic-bezier(0,0,.2,1)";

  const overlayTransition =
    phase === "hold" || durationMs === 0 || halfMs === 0
      ? "none"
      : `opacity ${halfMs}ms ${easing}`;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
      }}
    >
      <div style={{ width: "100%", height: "100%", minHeight: 0 }}>
        {shownChildren}
      </div>

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: overlayOpacity,
          transition: overlayTransition,
          background: `rgba(0,0,0,${coverAlpha})`,
        }}
      />
    </div>
  );
}
