// src/components/PageShell.tsx

import type { CSSProperties, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { pickRandomCharacterId, resolveCharacterSrc, useAppSettings } from '../lib/appSettings'

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
  /** ✅ 背景の暗幕の濃さ（0〜1）デフォルト: 0.55（※設定があれば設定を優先） */
  bgDim?: number
  /** ✅ 背景のぼかし(px) デフォルト: 0（※設定があれば設定を優先） */
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
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
  testCharacterHeight = 'clamp(140px, 18vw, 220px)',
  testCharacterOffset = { right: 16, bottom: 16 },
  testCharacterOpacity = 1,

  hideScrollbar = true,
}: Props) {
  const { settings } = useAppSettings()

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

  // ===========
  // ✅ 設定反映（暗幕/ぼかし/情報板）
  // ===========
  const effectiveBgDim = settings?.bgDim ?? bgDim
  const effectiveBgBlur = settings?.bgBlur ?? bgBlur
  const infoPanelAlpha = clamp(settings?.infoPanelAlpha ?? 0, 0, 1)

  // ===========
  // ✅ キャラ（固定/ランダム） + チラつき対策
  // ===========
  const requestedCharacterId = useMemo(() => {
    if (!settings.characterEnabled) return null
    if (settings.characterMode === 'random') return pickRandomCharacterId()
    return settings.fixedCharacterId
  }, [settings.characterEnabled, settings.characterMode, settings.fixedCharacterId])

  const requestedCharacterSrc = useMemo(() => {
    if (!requestedCharacterId) return null
    return resolveCharacterSrc(requestedCharacterId)
  }, [requestedCharacterId])

  // 「画面遷移の瞬間に一瞬消える」を防ぐため、
  // 新しい src を先読みしてから差し替える（旧表示は残す）
  const [displaySrc, setDisplaySrc] = useState<string | null>(() => {
    if (!requestedCharacterSrc) return testCharacterSrc
    return requestedCharacterSrc
  })
  const [fadeIn, setFadeIn] = useState(true)
  const lastSrcRef = useRef<string | null>(null)

  useEffect(() => {
    const next = requestedCharacterSrc ?? testCharacterSrc
    if (!next) return

    if (lastSrcRef.current === next) return
    lastSrcRef.current = next

    // 先読みしてから差し替え
    const img = new Image()
    img.decoding = 'async'
    img.src = next

    let cancelled = false
    const onLoad = () => {
      if (cancelled) return
      setFadeIn(false) // 一旦 0 に落として
      // 次フレームで差し替え→フェード
      requestAnimationFrame(() => {
        setDisplaySrc(next)
        requestAnimationFrame(() => setFadeIn(true))
      })
    }
    const onError = () => {
      if (cancelled) return
      // エラー時は無理に変えない（表示継続）
    }

    img.addEventListener('load', onLoad)
    img.addEventListener('error', onError)

    return () => {
      cancelled = true
      img.removeEventListener('load', onLoad)
      img.removeEventListener('error', onError)
    }
  }, [requestedCharacterSrc, testCharacterSrc])

  const characterScale = clamp(settings.characterScale ?? 1, 0.7, 2.0)
  const characterOpacity = clamp(settings.characterOpacity ?? testCharacterOpacity, 0, 1)

  // ✅ bgImage 未指定時に :root の --bg-image を潰さない
  const shellStyle: CSSProperties & Record<string, string> = {
    width: '100vw',
    height: '100svh',
    overflow: 'hidden',
    position: 'relative',

    ['--bg-dim' as any]: String(effectiveBgDim),
    ['--bg-blur' as any]: `${effectiveBgBlur}px`,
  }
  if (bgImage) shellStyle['--bg-image' as any] = `url(${bgImage})`

  const shouldShowCharacter = showTestCharacter && settings.characterEnabled && !!displaySrc

  return (
    <div className="page-shell" style={shellStyle}>
      {/* ✅ キャラレイヤ（固定） */}
      {shouldShowCharacter && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            right: testCharacterOffset.right ?? 16,
            bottom: testCharacterOffset.bottom ?? 16,
            zIndex: 5,
            pointerEvents: 'none',
            userSelect: 'none',
            opacity: characterOpacity,
            transform: `scale(${characterScale})`,
            transformOrigin: 'right bottom',
            filter: 'drop-shadow(0 10px 28px rgba(0,0,0,0.28))',
            transition: 'opacity 220ms ease, transform 220ms ease',
            willChange: 'opacity, transform',
          }}
        >
          <img
            src={displaySrc ?? ''}
            alt=""
            draggable={false}
            loading="eager"
            decoding="async"
            style={{
              height: testCharacterHeight,
              width: 'auto',
              display: 'block',
              opacity: fadeIn ? 1 : 0,
              transition: 'opacity 260ms ease',
              willChange: 'opacity',
            }}
          />
        </div>
      )}

      {/* ✅ 戻るボタン（最前面） */}
      {showBack && (
        <button type="button" className="back-button" onClick={handleBack} aria-label="戻る" style={{ zIndex: 30 }}>
          {backLabel}
        </button>
      )}

      {/* ✅ 情報レイヤ：全幅スクロール */}
      <div
        className={['page-shell-scroll', hideScrollbar ? 'scrollbar-hidden' : '', showBack ? 'with-back-button' : ''].filter(Boolean).join(' ')}
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
            boxSizing: 'border-box',
            position: 'relative',
          }}
        >
          {/* ✅ 情報板（文字は薄くしない） */}
          {infoPanelAlpha > 0 && (
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 18,
                background: `rgba(0,0,0,${infoPanelAlpha})`,
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
                pointerEvents: 'none',
              }}
            />
          )}

          <div style={{ position: 'relative' }}>
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
    </div>
  )
}
