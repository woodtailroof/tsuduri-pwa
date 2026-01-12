// src/App.tsx

import { useState, type ReactNode } from 'react'
import Home from './screens/Home'
import Record from './screens/Record'
import RecordNew from './screens/RecordNew'
import RecordHistory from './screens/RecordHistory'
import RecordAnalysis from './screens/RecordAnalysis'
import Weather from './screens/Weather'
import Chat from './screens/Chat'
import Settings from './screens/Settings'
import CharacterSettings from './screens/CharacterSettings'

type Screen =
  | 'home'
  | 'record' // 互換ハブ（残してOK / 使わなくてもOK）
  | 'recordNew'
  | 'recordHistory'
  | 'recordAnalysis'
  | 'weather'
  | 'chat'
  | 'settings'
  | 'characterSettings'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')

  const backHome = () => setScreen('home')

  // Home からの遷移先を拡張（recordNew / recordHistory / recordAnalysis を追加）
  const goFromHome = (s: 'record' | 'recordNew' | 'recordHistory' | 'recordAnalysis' | 'weather' | 'chat' | 'settings') => setScreen(s)

  let content: ReactNode

  if (screen === 'record') {
    // 互換ハブ：Home直行にしたら使わなくてもOK
    content = (
      <Record
        back={backHome}
        goNew={() => setScreen('recordNew')}
        goHistory={() => setScreen('recordHistory')}
        goAnalysis={() => setScreen('recordAnalysis')}
      />
    )
  } else if (screen === 'recordNew') {
    content = <RecordNew back={backHome} />
  } else if (screen === 'recordHistory') {
    content = <RecordHistory back={backHome} />
  } else if (screen === 'recordAnalysis') {
    content = <RecordAnalysis back={backHome} />
  } else if (screen === 'weather') {
    content = <Weather back={backHome} />
  } else if (screen === 'settings') {
    content = <Settings back={backHome} />
  } else if (screen === 'chat') {
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
        height: '100svh', // ✅ iPhone Safariのアドレスバー伸縮に強い
        overflow: 'hidden', // ✅ アプリ全体はスクロールさせない（各PageShell内でスクロール）
        position: 'relative',
      }}
    >
      {content}
    </div>
  )
}
