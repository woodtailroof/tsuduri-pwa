// src/components/PageShell.tsx

import type { ReactNode } from 'react'

type Props = {
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  /** 画面ごとに幅を変えたい時用（チャットだけ広め…とか） */
  maxWidth?: number
}

export default function PageShell({ title, subtitle, children, maxWidth = 980 }: Props) {
  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}
    >
      <div
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
