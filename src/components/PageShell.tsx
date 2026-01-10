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
  /** ✅ テスト用キャラの高さ(px)をclampで制御（デフォルト: "clamp(140px, 18vw, 220px)"） */
  testCharacterHeight?: string
  /** ✅ キャラの位置微調整（px） */
  testCharacterOffset?: { right?: number; bottom?: number }
  /** ✅ キャラの不透明度（0〜1） */
  testCharacterOpacity?: number

  /** ✅ UIを読みやすくする固定スクリーン（上/下） */
  uiScrimTop?: boolean
  uiScrimBottom?: boolean
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
  bgImage,
  bgDim = 0.55,
  bgBlur = 0,

  // ✅ テストキャラ（全画面共通）
  showTestCharacter = true,
  testCharacterSrc = '/assets/character-test.png',
  testCharacterHeight = 'clamp(140px, 18vw, 220px)',
  testCharacterOffset = { right: 16, bottom: 16 },
  testCharacterOpacity = 1,

  // ✅ UIスクリーン
  uiScrimTop = true,
  uiScrimBottom = true,
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

  // iPhoneなどのセーフエリア
  const safeRight = 'env(safe-area-inset-right, 0px)'
  const safeTop = 'env(safe-area-inset-top, 0px)'
  const safeBottom = 'env(safe-area-inset-bottom, 0px)'

  return (
    <div
      className="page-shell"
      style={{
        width: '100%',
        // ✅ 画面全体は固定してスクロールを内部に閉じ込める
        height: '100dvh',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'relative',

        // ✅ CSS変数で背景を制御（ページ単位で差し替え可能）
        ['--bg-image' as any]: bgImage ? `url(${bgImage})` : 'none',
        ['--bg-dim' as any]: String(bgDim),
        ['--bg-blur' as any]: `${bgBlur}px`,
      }}
    >
      {/* =========================
          背景レイヤー（固定）
         ========================= */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          userSelect: 'none',
          backgroundImage: bgImage ? `url(${bgImage})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          filter: bgBlur ? `blur(${bgBlur}px)` : undefined,
          transform: bgBlur ? 'scale(1.03)' : undefined, // ぼかし縁のはみ出し対策
        }}
      />
      {/* 背景の暗幕（固定） */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          background: `rgba(0,0,0,${Math.max(0, Math.min(1, bgDim))})`,
        }}
      />

      {/* =========================
          キャラレイヤー（固定・UIより下）
         ========================= */}
      {showTestCharacter && !!testCharacterSrc && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            right: `calc(${testCharacterOffset.right ?? 16}px + ${safeRight})`,
            bottom: `calc(${testCharacterOffset.bottom ?? 16}px + ${safeBottom})`,
            zIndex: 20, // ✅ UIより下
            pointerEvents: 'none',
            userSelect: 'none',
            opacity: testCharacterOpacity,
            filter: 'drop-shadow(0 10px 28px rgba(0,0,0,0.28))',
          }}
        >
          <img
            src={testCharacterSrc}
            alt=""
            style={{
              height: testCharacterHeight,
              width: 'auto',
              display: 'block',
            }}
            draggable={false}
          />
        </div>
      )}

      {/* =========================
          UIレイヤー（スクロールするのはここだけ）
         ========================= */}
      <div
        className="page-shell-ui"
        style={{
          position: 'relative',
          zIndex: 30, // ✅ 最前面（情報・ボタン）
          height: '100dvh',
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* UIスクリーン（上）: タイトル/戻る周りが読みやすい */}
        {uiScrimTop && (
          <div
            aria-hidden="true"
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 40,
              height: 90,
              pointerEvents: 'none',
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0))',
            }}
          />
        )}

        {/* 戻るボタン（UI最前面・固定） */}
        {showBack && (
          <button
            type="button"
            className="back-button"
            onClick={handleBack}
            aria-label="戻る"
            style={{
              position: 'fixed',
              top: `calc(12px + ${safeTop})`,
              right: `calc(12px + ${safeRight})`,
              zIndex: 50,
            }}
          >
            {backLabel}
          </button>
        )}

        {/* コンテンツ */}
        <div
          className={showBack ? 'with-back-button page-shell-inner' : 'page-shell-inner'}
          style={{
            maxWidth,
            margin: '0 auto',
            padding: 'clamp(16px, 3vw, 24px)',
            paddingTop: `calc(clamp(16px, 3vw, 24px) + ${safeTop})`,
            paddingBottom: `calc(clamp(16px, 3vw, 24px) + ${safeBottom})`,
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

        {/* UIスクリーン（下）: 入力欄や下部ボタンが読みやすい */}
        {uiScrimBottom && (
          <div
            aria-hidden="true"
            style={{
              position: 'sticky',
              bottom: 0,
              zIndex: 40,
              height: 110,
              pointerEvents: 'none',
              background: 'linear-gradient(to top, rgba(0,0,0,0.6), rgba(0,0,0,0))',
            }}
          />
        )}
      </div>
    </div>
  )
}
