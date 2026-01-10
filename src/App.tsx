// src/App.tsx

import { useMemo, useState, type ReactNode } from 'react'
import Home from './screens/Home'
import Record from './screens/Record'
import Weather from './screens/Weather'
import Chat from './screens/Chat'
import Settings from './screens/Settings'
import CharacterSettings from './screens/CharacterSettings'
import PageShell from './components/PageShell'

type Screen = 'home' | 'record' | 'weather' | 'chat' | 'settings' | 'characterSettings'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')

  const backHome = () => setScreen('home')

  // Homeから遷移できる画面はここだけ
  const goFromHome = (s: 'record' | 'weather' | 'chat' | 'settings') => setScreen(s)

  const content: ReactNode = useMemo(() => {
    if (screen === 'record') return <Record back={backHome} />
    if (screen === 'weather') return <Weather back={backHome} />
    if (screen === 'settings') return <Settings back={backHome} />
    if (screen === 'chat')
      return <Chat back={backHome} goCharacterSettings={() => setScreen('characterSettings')} />
    if (screen === 'characterSettings') return <CharacterSettings back={() => setScreen('chat')} />
    return <Home go={goFromHome} />
  }, [screen])

  // ✅ PageShellの戻るボタンを、screen遷移に合わせて制御
  const showBack = screen !== 'home'
  const onBack = () => {
    if (screen === 'characterSettings') {
      setScreen('chat')
      return
    }
    setScreen('home')
  }

  return (
    <PageShell
      maxWidth={960}
      showBack={showBack}
      onBack={onBack}
      backLabel="← 戻る"
      // ✅ URL履歴スタックはこのアプリ構造だと効かないので積まない
      disableStackPush={true}
      // ✅ 背景はとりあえず全画面共通（必要なら画面ごとにbgImageを足す）
      // bgImage="/bg/home.webp"
      // bgDim={0.55}
      // bgBlur={0}
      // ✅ テストキャラはデフォでON（PageShell側のデフォルトで全画面表示）
      // showTestCharacter={true}
      // testCharacterSrc="/assets/character-test.png"
    >
      {content}
    </PageShell>
  )
}
