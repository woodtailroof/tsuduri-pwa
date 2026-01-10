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

  return (
    <div
      className="page-shell"
      style={{
        width: '100%',
        minHeight: '100vh',
        boxSizing: 'border-box',
        overflowX: 'hidden',

        // ✅ 背景（ページ単位で差し替え可能）
        ['--bg-image' as any]: bgImage ? `url(${bgImage})` : 'none',
        ['--bg-dim' as any]: String(bgDim),
        ['--bg-blur' as any]: `${bgBlur}px`,

        // ✅ UIガラス用のCSS変数（デフォで“透過”）
        // PC: ほんのり濃いめ / Mobile: さらに透ける（下の <style> のmediaで上書き）
        ['--ui-surface-a' as any]: '0.22',
        ['--ui-surface-2-a' as any]: '0.16',
        ['--ui-border-a' as any]: '0.28',

        ['--ui-surface' as any]: 'rgba(18,18,18,var(--ui-surface-a))',
        ['--ui-surface-2' as any]: 'rgba(12,12,12,var(--ui-surface-2-a))',
        ['--ui-border' as any]: 'rgba(255,255,255,var(--ui-border-a))',

        ['--ui-text' as any]: '#eaeaea',
        ['--ui-text-dim' as any]: '#cfcfcf',
        ['--ui-text-mute' as any]: '#a8a8a8',
      }}
    >
      {/* ✅ ここでレスポンシブに“透過率”だけ変える（スマホほど薄く） */}
      <style>{`
        .page-shell {
          position: relative;
          isolation: isolate; /* z-indexを安定させる（レイヤー構成用） */
        }

        /* 背景レイヤー（最背面） */
        .page-shell::before {
          content: "";
          position: fixed;
          inset: 0;
          z-index: 0;
          background-image: var(--bg-image);
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          filter: blur(var(--bg-blur));
          transform: translateZ(0);
          opacity: 1;
          pointer-events: none;
        }

        /* 暗幕（背景の上、でもまだ最背面） */
        .page-shell::after {
          content: "";
          position: fixed;
          inset: 0;
          z-index: 1;
          background: rgba(0,0,0,var(--bg-dim));
          pointer-events: none;
        }

        /* 情報レイヤー（最前面） */
        .page-shell-inner {
          position: relative;
          z-index: 30;
        }

        /* 戻るボタンも最前面 */
        .back-button {
          position: fixed;
          top: 12px;
          right: 12px;
          z-index: 40;
        }

        /* スマホはUIを“もっと透けさせる” */
        @media (max-width: 520px) {
          .page-shell {
            --ui-surface-a: 0.14;
            --ui-surface-2-a: 0.10;
            --ui-border-a: 0.22;
          }
        }

        /* さらに小さい端末 */
        @media (max-width: 380px) {
          .page-shell {
            --ui-surface-a: 0.12;
            --ui-surface-2-a: 0.08;
            --ui-border-a: 0.20;
          }
        }
      `}</style>

      {showBack && (
        <button type="button" className="back-button" onClick={handleBack} aria-label="戻る">
          {backLabel}
        </button>
      )}

      <div
        className={showBack ? 'with-back-button page-shell-inner' : 'page-shell-inner'}
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

      {/* ✅ キャラレイヤー（情報の下、背景の上） */}
      {showTestCharacter && !!testCharacterSrc && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            right: testCharacterOffset.right ?? 16,
            bottom: testCharacterOffset.bottom ?? 16,
            zIndex: 20, // ✅ 情報(30/40)より下、背景(0/1)より上
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
    </div>
  )
}
