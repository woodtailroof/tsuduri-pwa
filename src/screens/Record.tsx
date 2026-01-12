// src/screens/Record.tsx
import type { CSSProperties } from 'react'
import PageShell from '../components/PageShell'

type Props = {
  back: () => void
  // 既存の遷移実装に合わせて、必要なら App 側で差し替えてね
  goNew?: () => void
  goHistory?: () => void
  goAnalysis?: () => void
}

export default function Record({ back, goNew, goHistory, goAnalysis }: Props) {
  const btn: CSSProperties = {
    width: 'min(720px, 100%)',
    borderRadius: 18,
    padding: '14px 16px',
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(255,255,255,0.06)',
    color: '#eee',
    cursor: 'pointer',
    textAlign: 'center',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    boxShadow: '0 10px 26px rgba(0,0,0,0.18)',
  }

  const hint: CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,0.6)' }

  return (
    <PageShell
      title={<h1 style={{ margin: 0, fontSize: 'clamp(20px, 6vw, 32px)', lineHeight: 1.15 }}>📸 釣果</h1>}
      maxWidth={900}
      showBack
      onBack={back}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={hint}>※「最近5件」は削除（短期ノイズが強すぎるため）。Homeから各機能に直行できる構成へ。</div>

        <button type="button" style={btn} onClick={() => (goNew ? goNew() : alert('RecordNewへ遷移する実装（goNew）をApp側で渡してね'))}>
          💾 釣果を記録する
        </button>

        <button
          type="button"
          style={btn}
          onClick={() => (goHistory ? goHistory() : alert('RecordHistoryへ遷移する実装（goHistory）をApp側で渡してね'))}
        >
          📚 全履歴
        </button>

        <button
          type="button"
          style={btn}
          onClick={() => (goAnalysis ? goAnalysis() : alert('RecordAnalysisへ遷移する実装（goAnalysis）をApp側で渡してね'))}
        >
          📈 偏差分析
        </button>
      </div>
    </PageShell>
  )
}
