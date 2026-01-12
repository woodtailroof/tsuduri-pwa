// src/App.tsx
import { useState, type ReactNode } from 'react'
import Home from './screens/Home'
import Record from './screens/Record'
import Weather from './screens/Weather'
import Chat from './screens/Chat'
import Settings from './screens/Settings'
import CharacterSettings from './screens/CharacterSettings'
import Archive from './screens/Archive'

type Screen = 'home' | 'record' | 'archive' | 'weather' | 'chat' | 'settings' | 'characterSettings'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')

  const backHome = () => setScreen('home')
  const goFromHome = (s: 'record' | 'archive' | 'weather' | 'chat' | 'settings') => setScreen(s)

  let content: ReactNode
  if (screen === 'record') content = <Record back={backHome} />
  else if (screen === 'archive') content = <Archive back={backHome} />
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
        height: '100svh',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {content}
    </div>
  )
}
