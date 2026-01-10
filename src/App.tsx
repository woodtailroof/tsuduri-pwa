// src/App.tsx

import { useState, type ReactNode } from 'react'
import Home from './screens/Home'
import Record from './screens/Record'
import Weather from './screens/Weather'
import Chat from './screens/Chat'
import Settings from './screens/Settings'
import CharacterSettings from './screens/CharacterSettings'

type Screen = 'home' | 'record' | 'weather' | 'chat' | 'settings' | 'characterSettings'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')

  const backHome = () => setScreen('home')
  const goFromHome = (s: 'record' | 'weather' | 'chat' | 'settings') => setScreen(s)

  let content: ReactNode
  if (screen === 'record') content = <Record back={backHome} />
  else if (screen === 'weather') content = <Weather back={backHome} />
  else if (screen === 'settings') content = <Settings back={backHome} />
  else if (screen === 'chat') {
    content = <Chat back={backHome} goCharacterSettings={() => setScreen('characterSettings')} />
  } else if (screen === 'characterSettings') {
    content = <CharacterSettings back={() => setScreen('chat')} />
  } else {
    content = <Home go={goFromHome} />
  }

  return (
    <div
      id="app-root"
      style={{
        width: '100vw',
        height: '100svh', // ✅ iPhone Safariで安定
        overflow: 'hidden', // ✅ bodyスクロールに逃がさない
        position: 'relative',
      }}
    >
      {/* ✅ ここに FixedBackground / CharacterLayer を “センター箱の外” に置くと最強 */}
      {/* 例:
        <FixedBackground />
        <CharacterLayer />
      */}

      {/* ✅ 情報(=画面コンテンツ)だけをスクロールさせる器 */}
      <div
        id="app-scroll"
        style={{
          width: '100vw',
          height: '100svh',
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* ✅ “センター固定” はスクロール内の中身にだけ適用 */}
        <div
          style={{
            width: '100%',
            maxWidth: 960,
            margin: '0 auto',
            padding: '16px 16px 24px',
            boxSizing: 'border-box',
            minWidth: 0,
          }}
        >
          {content}
        </div>
      </div>
    </div>
  )
}
