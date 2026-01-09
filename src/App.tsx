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

  // Homeから遷移できる画面はここだけ
  const goFromHome = (s: 'record' | 'weather' | 'chat' | 'settings') => setScreen(s)

  // 画面の中身を先に決める（JSX.Element を使わず ReactNode にする）
  let content: ReactNode
  if (screen === 'record') content = <Record back={backHome} />
  else if (screen === 'weather') content = <Weather back={backHome} />
  else if (screen === 'settings') content = <Settings back={backHome} />
  else if (screen === 'chat') {
    content = <Chat back={backHome} goCharacterSettings={() => setScreen('characterSettings')} />
  } else if (screen === 'characterSettings') {
    // キャラ設定から戻ったらチャットへ
    content = <CharacterSettings back={() => setScreen('chat')} />
  } else {
    content = <Home go={goFromHome} />
  }

  // 共通の“器”：中央寄せ + スマホ対応 + 横はみ出し対策
  return (
    <div
      style={{
        minHeight: '100dvh',
        width: '100%',
        overflowX: 'hidden',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 960,
          padding: '16px 16px 24px',
          boxSizing: 'border-box',
          minWidth: 0,
        }}
      >
        {content}
      </div>
    </div>
  )
}
