// src/components/PageShell.tsx

import type { ReactNode } from 'react'
import { useCallback } from 'react'

type Props = {
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  /** 画面ごとに幅を変えたい時用（チャットだけ広め…とか） */
  maxWidth?: number

  /** 戻るボタンを表示するか（デフォルト: true） */
  showBack?: boolean
  /** 戻るボタン押下時の挙動を上書きしたい場合 */
  onBack?: () => void
  /** 戻るボタンのラベル */
  backLabel?: ReactNode
}

export default function PageShell({
  title,
  subtitle,
  children,
  maxWidth = 980,
  showBack = true,
  onBack,
  backLabel = '← 戻る',
}: Props) {
  const handleBack = useCallback(() => {
    if (onBack) return onBack()

    // ルーター不使用でも動く「戻る」
    // 履歴が無い場合は何も起きない（安全）
    window.history.back()
  }, [onBack])

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}
    >
      {/* ✅ 左上固定の戻るボタン（全画面統一） */}
      {showBack && (
        <button
          type="button"
          className="back-button"
          onClick={handleBack}
          aria-label="戻る"
        >
          {backLabel}
        </button>
      )}

      <div
        className={showBack ? 'with-back-button' : undefined}
        style={{
          maxWidth,
          margin: '0 auto',
          padding: 'clamp(16px, 3vw, 24px)',
          boxSizing: 'border-box',
        }}
      >
        {(title || subtitle) && (
          <div style={{ marginBottom: 16 }}>
            {title}
            {subtitle}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
