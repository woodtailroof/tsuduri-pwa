// src/components/PageShell.tsx

import type { CSSProperties, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

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

  /** ✅ 背景画像（ページ単位で差し替えたい時）例: "/bg/home.webp" */
  bgImage?: string
  /** ✅ 背景の暗幕の濃さ（0〜1）デフォルト: 0.55 */
  bgDim?: number
  /** ✅ 背景のぼかし(px) デフォルト: 0 */
  bgBlur?: number

  /** ✅ テスト用キャラを表示するか（デフォルト: true） */
  showTestCharacter?: boolean
  /** ✅ テスト用キャラ画像パス（例: "/assets/character-test.png"） */
  testCharacterSrc?: string
  /**
   * ✅ テスト用キャラの高さ(px)をclampで制御
   * 未指定なら、端末（スマホ/PC）で自動最適化するよ
   */
  testCharacterHeight?: string
  /** ✅ キャラの位置微調整（px） */
  testCharacterOffset?: { right?: number; bottom?: number }
  /** ✅ キャラの不透明度（0〜1） */
  testCharacterOpacity?: number

  /** ✅ スクロールバーを非表示にしたい場合（デフォルト: true） */
  hideScrollbar?: boolean
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
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-50)))
  } catch {
    // ignore
  }
}

/** ✅ 端末判別（スマホっぽい表示幅 or タッチ端末） */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    const mq = window.matchMedia('(max-width: 820px)')
    const coarse = window.matchMedia('(pointer: coarse)')
    return mq.matches || coarse.matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 820px)')
    const coarse = window.matchMedia('(pointer: coarse)')

    const onChange = () => setIsMobile(mq.matches || coarse.matches)

    mq.addEventListener?.('change', onChange)
    coarse.addEventListener?.('change', onChange)
    window.addEventListener('orientationchange', onChange)

    return () => {
      mq.removeEventListener?.('change', onChange)
      coarse.removeEventListener?.('change', onChange)
      window.removeEventListener('orientationchange', onChange)
    }
  }, [])

  return isMobile
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
  bgImage,
  bgDim = 0.55,
  bgBlur = 0,

  showTestCharacter = true,
  testCharacterSrc = '/assets/character-test.png',
  testCharacterHeight, // ← デフォルトは「自動」にした
  testCharacterOffset = { right: 16, bottom: 16 },
  testCharacterOpacity = 1,

  hideScrollbar = true,
}: Props) {
  const isMobile = useIsMobile()
  const current = useMemo(() => getPath(), [])

  useEffect(() => {
    if (disableStackPush) return

    const stack = readStack()
    const last = stack[stack.length - 1]
    if (last !== current) {
      stack.push(current)
      writeStack(stack)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disableStackPush])

  const handleBack = useCallback(() => {
    if (onBack) return onBack()

    const stack = readStack()

    if (stack.length && stack[stack.length - 1] === getPath()) {
      stack.pop()
    }

    const prev = stack.pop()
    writeStack(stack)

    window.location.assign(prev ?? fallbackHref)
  }, [onBack, fallbackHref])

  // ✅ bgImage 未指定時に :root の --bg-image を潰さない
  const shellStyle: CSSProperties & Record<string, string> = {
    width: '100vw',
    height: '100svh',
    overflow: 'hidden',
    position: 'relative',

    ['--bg-dim' as any]: String(bgDim),
    ['--bg-blur' as any]: `${bgBlur}px`,
  }
  if (bgImage) shellStyle['--bg-image' as any] = `url(${bgImage})`

  // ✅ キャラサイズ：未指定ならスマホ/PCで自動最適化
  // 置物化の元は「最大が小さすぎる」なので、上限を一気に引き上げる
  const autoCharacterHeight = isMobile
    ? 'clamp(280px, 72vw, 520px)' // スマホは“画面幅”基準でドーン
    : 'clamp(360px, 34vw, 720px)' // PCは横幅に比例して育つ

  const characterHeight = testCharacterHeight ?? autoCharacterHeight

  // ✅ キャラの位置：safe-area込みで右下固定（スマホは少しはみ出し気味でデカく見せる）
  const rightPx = testCharacterOffset.right ?? 16
  const bottomPx = testCharacterOffset.bottom ?? 16

  const characterRight = `calc(env(safe-area-inset-right) + ${rightPx}px)`
  const characterBottom = isMobile
    ? `calc(env(safe-area-inset-bottom) - 8px)` // スマホはちょい下に沈めて“迫力”
    : `calc(env(safe-area-inset-bottom) + ${bottomPx}px)`

  // ✅ 情報の読み取りを守るための“下余白”
  // キャラがでかくなった分、コンテンツの最下部が踏まれないようにする
  const contentPadBottom = isMobile ? 'clamp(140px, 22svh, 240px)' : 'clamp(80px, 14svh, 180px)'

  return (
    <div className="page-shell" style={shellStyle}>
      {/* ✅ キャラレイヤ（固定） */}
      {showTestCharacter && !!testCharacterSrc && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            right: characterRight,
            bottom: characterBottom,
            zIndex: 5,
            pointerEvents: 'none',
            userSelect: 'none',
            opacity: testCharacterOpacity,
            filter: 'drop-shadow(0 10px 28px rgba(0,0,0,0.28))',
            // ✅ でかいキャラでも描画が安定しやすい
            transform: 'translateZ(0)',
            willChange: 'transform',
          }}
        >
          <img
            src={testCharacterSrc}
            alt=""
            style={{
              height: characterHeight,
              width: 'auto',
              display: 'block',
            }}
            draggable={false}
          />
        </div>
      )}

      {/* ✅ 戻るボタン（最前面） */}
      {showBack && (
        <button type="button" className="back-button" onClick={handleBack} aria-label="戻る" style={{ zIndex: 30 }}>
          {backLabel}
        </button>
      )}

      {/* ✅ 情報レイヤ：全幅スクロール（スクロールバーは画面右端に出る） */}
      <div
        className={['page-shell-scroll', hideScrollbar ? 'scrollbar-hidden' : '', showBack ? 'with-back-button' : '']
          .filter(Boolean)
          .join(' ')}
        style={{
          position: 'relative',
          zIndex: 10,
          width: '100vw',
          height: '100svh',
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
      >
        <div
          className="page-shell-inner"
          style={{
            maxWidth,
            margin: '0 auto',
            padding: 'clamp(16px, 3vw, 24px)',
            paddingBottom: `calc(clamp(16px, 3vw, 24px) + ${contentPadBottom})`,
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
    </div>
  )
}
