// src/components/PageShell.tsx

import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo } from 'react'

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
  /** 戻れない場合の遷移先（デフォルト: "/"） */
  fallbackHref?: string
  /** この画面を履歴に積まない（ホームなど） */
  disableStackPush?: boolean
}

const STACK_KEY = 'tsuduri_nav_stack_v1'

function getPath() {
  return window.location.pathname + window.location.search + window.location.hash
}

function readStack(): string[] {
  try {
    const raw = sessionStorage.getItem(STACK_KEY)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function writeStack(stack: string[]) {
  try {
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-50))) // 念のため上限
  } catch {
    // ignore
  }
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
  disableStackPush = false,
}: Props) {
  const current = useMemo(() => getPath(), [])

  // ✅ この画面を「アプリ内スタック」に積む
  useEffect(() => {
    if (disableStackPush) return

    const stack = readStack()
    const last = stack[stack.length - 1]

    // 連続で同じURLを積まない
    if (last !== current) {
      stack.push(current)
      writeStack(stack)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disableStackPush])

  const handleBack = useCallback(() => {
    if (onBack) return onBack()

    const stack = readStack()

    // 末尾が自分なら1つ捨てる（「戻る」で今の自分を消す）
    if (stack.length && stack[stack.length - 1] === getPath()) {
      stack.pop()
    }

    const prev = stack.pop() // さらに1つ戻る
    writeStack(stack)

    // ✅ 戻り先があればそこへ。無ければホームへ。
    window.location.assign(prev ?? fallbackHref)
  }, [onBack, fallbackHref])

  // ✅ 右上固定ボタンがタイトルに被らないための上余白
  // 端末のセーフエリア（ノッチ）も考慮して、少し余裕を持たせる
  const contentPaddingTop = showBack ? 'clamp(64px, 8vw, 84px)' : undefined

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        boxSizing: 'border-box',
        overflowX: 'hidden',
        position: 'relative',
      }}
    >
      {showBack && (
        <button
          type="button"
          className="back-button"
          onClick={handleBack}
          aria-label="戻る"
          style={{
            position: 'fixed',
            top: 'max(12px, env(safe-area-inset-top))',
            right: 'max(12px, env(safe-area-inset-right))',
            zIndex: 1000,

            borderRadius: 999,
            padding: '8px 12px',
            fontSize: 14,
            lineHeight: 1.1,

            background: 'rgba(18,18,18,0.75)',
            color: '#eee',
            border: '1px solid rgba(255,255,255,0.22)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            WebkitTapHighlightColor: 'transparent',
            cursor: 'pointer',
          }}
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
          paddingTop: contentPaddingTop,
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
