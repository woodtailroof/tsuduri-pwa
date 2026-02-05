// src/components/PageShell.tsx
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useAppSettings } from "../lib/appSettings";

type Props = {
  title?: ReactNode;
  children: ReactNode;
  maxWidth?: number;
  showBack?: boolean;
  onBack?: () => void;
};

export default function PageShell({
  title,
  children,
  maxWidth = 1100,
  showBack = true,
  onBack,
}: Props) {
  const { settings } = useAppSettings();

  const bgDim = settings.bgDim ?? 0.35;
  const bgBlur = settings.bgBlur ?? 10;
  const characterEnabled = settings.characterEnabled ?? true;
  const characterOpacity = settings.characterOpacity ?? 0.9;
  const characterScale = settings.characterScale ?? 1;

  const bgSrc = useMemo(() => {
    return "/assets/bg/surf_day.png"; // いったん固定（後で戻せる）
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100svh",
        overflow: "hidden",
      }}
    >
      {/* 背景 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${bgSrc})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: `blur(${bgBlur}px)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `rgba(0,0,0,${bgDim})`,
        }}
      />

      {/* ヘッダー（固定） */}
      <header
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 56,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          zIndex: 20,
        }}
      >
        <div style={{ flex: 1, fontWeight: 700 }}>{title}</div>

        {showBack && (
          <button
            onClick={() => (onBack ? onBack() : history.back())}
            className="glass"
            style={{
              padding: "6px 12px",
              borderRadius: 999,
            }}
          >
            ← 戻る
          </button>
        )}
      </header>

      {/* コンテンツ枠（スクロール禁止） */}
      <main
        style={{
          position: "absolute",
          top: 56,
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </div>
      </main>

      {/* キャラ（右下固定・影なし） */}
      {characterEnabled && (
        <img
          src="/assets/characters/tsuduri.png"
          alt=""
          style={{
            position: "fixed",
            right: 12,
            bottom: 12,
            height: `${220 * characterScale}px`,
            opacity: characterOpacity,
            pointerEvents: "none",
            zIndex: 15,
          }}
        />
      )}
    </div>
  );
}
