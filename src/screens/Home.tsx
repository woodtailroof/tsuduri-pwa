// src/screens/Home.tsx
import { useEffect, useMemo, useState } from 'react'
import PageShell from '../components/PageShell'

type Props = {
  go: (screen: 'record' | 'recordHistory' | 'recordAnalysis' | 'weather' | 'chat' | 'settings') => void
}

const APP_LOCK_PASS_KEY = 'tsuduri_app_pass_v1'
const APP_LOCK_UNLOCKED_KEY = 'tsuduri_app_unlocked_v1'

function loadSavedPass() {
  try {
    return localStorage.getItem(APP_LOCK_PASS_KEY) ?? ''
  } catch {
    return ''
  }
}

function isUnlocked() {
  try {
    return localStorage.getItem(APP_LOCK_UNLOCKED_KEY) === '1'
  } catch {
    return false
  }
}

function setUnlocked(pass: string) {
  try {
    localStorage.setItem(APP_LOCK_PASS_KEY, pass)
    localStorage.setItem(APP_LOCK_UNLOCKED_KEY, '1')
  } catch {
    // ignore
  }
}

export default function Home({ go }: Props) {
  const [unlocked, setUnlockedState] = useState<boolean>(() => isUnlocked())
  const [pass, setPass] = useState<string>(() => loadSavedPass())
  const [error, setError] = useState<string>('')

  useEffect(() => {
    setUnlockedState(isUnlocked())
  }, [])

  const canUse = useMemo(() => unlocked, [unlocked])

  function unlockNow() {
    const p = pass.trim()
    if (!p) {
      setError('合言葉を入れてね')
      return
    }
    setUnlocked(p)
    setUnlockedState(true)
    setError('')
  }

  return (
    <PageShell
      title={<h1 style={{ margin: 0 }}>🎣 釣嫁つづり</h1>}
      subtitle={<p style={{ marginTop: 8 }}>ひろっちの釣りライフ、今日も一投いこ？</p>}
      maxWidth={760}
    >
      {!canUse && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.72)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              width: 'min(520px, 96vw)',
              borderRadius: 14,
              border: '1px solid #333',
              background: '#0f0f0f',
              color: '#ddd',
              padding: 14,
              boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>🔒 合言葉を入力</div>
            <div style={{ fontSize: 12, color: '#aaa', lineHeight: 1.6 }}>
              ※ これは「自分だけプレ運用」用の簡易ロックだよ。<br />
              チャットAPI側でもチェックするから、合言葉がないと会話は動かないようにしてある。
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <input
                value={pass}
                onChange={(e) => {
                  setPass(e.target.value)
                  setError('')
                }}
                type="password"
                placeholder="合言葉"
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid #333',
                  background: '#111',
                  color: '#fff',
                  minWidth: 0,
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') unlockNow()
                }}
              />
              <button
                type="button"
                onClick={unlockNow}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #333',
                  background: '#1b1b1b',
                  color: '#fff',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                解錠
              </button>
            </div>

            {!!error && <div style={{ marginTop: 10, color: '#ffb3c1', fontSize: 12 }}>{error}</div>}

            <div style={{ marginTop: 10, fontSize: 11, color: '#777' }}>ヒント：合言葉は端末内に保存されるよ（localStorage）</div>
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 24,
          display: 'grid',
          gap: 12,
          opacity: canUse ? 1 : 0.25,
          pointerEvents: canUse ? 'auto' : 'none',
        }}
      >
        <button onClick={() => go('record')}>📸 釣果を記録する</button>
        <button onClick={() => go('recordHistory')}>📚 全履歴を見る</button>
        <button onClick={() => go('recordAnalysis')}>📈 偏差分析を見る</button>

        <hr style={{ margin: '12px 0', opacity: 0.3 }} />

        <button onClick={() => go('weather')}>🌊 天気・潮を見る</button>
        <button onClick={() => go('chat')}>💬 話す</button>

        <hr style={{ margin: '12px 0', opacity: 0.3 }} />

        <button onClick={() => go('settings')}>⚙ キャッシュ設定</button>
      </div>
    </PageShell>
  )
}
