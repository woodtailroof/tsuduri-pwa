// src/App.tsx
import { useState } from 'react'
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

  if (screen === 'record') return <Record back={backHome} />
  if (screen === 'weather') return <Weather back={backHome} />
  if (screen === 'settings') return <Settings back={backHome} />

  if (screen === 'chat') {
    return <Chat back={backHome} goCharacterSettings={() => setScreen('characterSettings')} />
  }

  if (screen === 'characterSettings') {
    // キャラ設定から戻ったらチャットへ
    return <CharacterSettings back={() => setScreen('chat')} />
  }

  return <Home go={goFromHome} />
}
