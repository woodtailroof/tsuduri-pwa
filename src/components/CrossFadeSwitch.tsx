// src/components/CrossFadeSwitch.tsx
import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  activeKey: string;
  children: ReactNode;
  durationMs?: number;
};

export default function CrossFadeSwitch({
  activeKey,
  children,
  durationMs = 500,
}: Props) {
  const [items, setItems] = useState<{ key: string; node: ReactNode }[]>([
    { key: activeKey, node: children },
  ]);

  const prevKeyRef = useRef(activeKey);

  useEffect(() => {
    if (activeKey === prevKeyRef.current) return;

    const prev = items[items.length - 1];

    setItems([prev, { key: activeKey, node: children }]);

    prevKeyRef.current = activeKey;

    const t = setTimeout(() => {
      setItems([{ key: activeKey, node: children }]);
    }, durationMs);

    return () => clearTimeout(t);
  }, [activeKey, children, durationMs]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {items.map((item, i) => {
        const isTop = i === items.length - 1;

        return (
          <div
            key={item.key + i}
            style={{
              position: "absolute",
              inset: 0,
              opacity: isTop ? 1 : 0,
              transition: `opacity ${durationMs}ms ease`,
              pointerEvents: isTop ? "auto" : "none",
            }}
          >
            {item.node}
          </div>
        );
      })}
    </div>
  );
}
