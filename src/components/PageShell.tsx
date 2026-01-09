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
  /** 戻れない/戻ると危険な場合に遷移する先（デフォルト: "/"） */
  fallbackHref?: string
}

export default function PageShell({
  title,
  subtitle,
  children,
  maxWidth = 980,
  showBack = true,
  onBack,
  backLabel = '← 戻る',
  fallbackHref = '/',
}: Props) {
  const handleBack = useCallback(() => {
    if (onBack) return onBack()

    // ✅ 外部サイトに戻る事故を防ぐ「安全な戻る」
    // - referrer が同一オリジンなら back
    // - それ以外（直アクセス/外部から来た等）はホームへ
    try {
      const ref = document.referrer
      const sameOrigin = ref ? new URL(ref).origin === window.location.origin : false

      if (sameOrigin && window.history.length > 1) {
        window.history.back()
        return
      }
    } catch {
      // referrer が変な値でも落とさない
    }

    window.location.assign(fallbackHref)
  }, [onBack, fallbackHref])

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}
    >
      {showBack && (
        <button type="button" className="back-button" onClick={handleBack} aria-label="戻る">
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
