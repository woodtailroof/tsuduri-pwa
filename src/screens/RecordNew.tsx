// src/screens/RecordNew.tsx

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import exifr from 'exifr'
import { db, type CatchRecord, type CatchResult } from '../db'
import { FIXED_PORT } from '../points'
import PageShell from '../components/PageShell'

type Props = {
  back: () => void
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toDateTimeLocalValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function parseDateTimeLocalValue(v: string): Date | null {
  if (!v || !v.includes('T')) return null
  const [ds, ts] = v.split('T')
  if (!ds || !ts) return null
  const [y, m, d] = ds.split('-').map(Number)
  const [hh, mm] = ts.split(':').map(Number)
  if (![y, m, d, hh, mm].every(Number.isFinite)) return null
  if (m < 1 || m > 12) return null
  if (d < 1 || d > 31) return null
  if (hh < 0 || hh > 23) return null
  if (mm < 0 || mm > 59) return null
  return new Date(y, m - 1, d, hh, mm, 0, 0)
}

export default function RecordNew({ back }: Props) {
  // =========================
  // ✅ スタイル（Record.tsxから必要分だけ）
  // =========================
  const glassBoxStyle: CSSProperties = {
    borderRadius: 16,
    padding: 12,
    display: 'grid',
    gap: 10,
  }

  const segWrapStyle: CSSProperties = {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    alignItems: 'center',
    minWidth: 0,
  }

  const segLabelStyle: CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    cursor: 'pointer',
    userSelect: 'none',
    minWidth: 0,
  }

  const segInputHidden: CSSProperties = {
    position: 'absolute',
    opacity: 0,
    pointerEvents: 'none',
    width: 1,
    height: 1,
  }

  const segPillBase: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    borderRadius: 16,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    minWidth: 0,
    maxWidth: '100%',
    border: '1px solid rgba(255,255,255,0.22)',
    background: 'rgba(255,255,255,0.06)',
    color: '#ddd',
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)',
    WebkitTapHighlightColor: 'transparent',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
  }

  function segPill(checked: boolean): CSSProperties {
    return {
      ...segPillBase,
      border: checked ? '2px solid #ff4d6d' : segPillBase.border,
      background: checked ? 'rgba(255,77,109,0.18)' : segPillBase.background,
      color: checked ? '#fff' : segPillBase.color,
      boxShadow: checked
        ? '0 6px 18px rgba(0,0,0,0.22), inset 0 0 0 1px rgba(255,77,109,0.25)'
        : segPillBase.boxShadow,
    }
  }

  function segDot(checked: boolean): CSSProperties {
    return {
      width: 10,
      height: 10,
      borderRadius: 999,
      flex: '0 0 auto',
      border: checked ? '1px solid rgba(255,77,109,0.9)' : '1px solid rgba(255,255,255,0.35)',
      background: checked ? '#ff4d6d' : 'transparent',
      boxShadow: checked ? '0 0 0 4px rgba(255,77,109,0.16)' : 'none',
    }
  }

  // =========================
  // ✅ 状態：登録フォームだけ
  // =========================
  const [photo, setPhoto] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const [capturedAt, setCapturedAt] = useState<Date | null>(null)
  const [exifNote, setExifNote] = useState<string>('')

  const [manualMode, setManualMode] = useState(false)
  const [manualValue, setManualValue] = useState('')
  const [allowUnknown, setAllowUnknown] = useState(false)

  const [result, setResult] = useState<CatchResult>('skunk')
  const [species, setSpecies] = useState('')
  const [sizeCm, setSizeCm] = useState('')

  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function resetPhotoStates() {
    setPhoto(null)
    setPreviewUrl(null)
    setCapturedAt(null)
    setExifNote('')
    setManualMode(false)
    setManualValue('')
    setAllowUnknown(false)
  }

  function resetResultStates() {
    setResult('skunk')
    setSpecies('')
    setSizeCm('')
  }

  const sizeCmNumber = useMemo(() => {
    const v = Number(sizeCm)
    if (!Number.isFinite(v)) return null
    if (v <= 0) return null
    return Math.round(v * 10) / 10
  }, [sizeCm])

  const resultOk = result === 'skunk' || (result === 'caught' && (sizeCm.trim() === '' || sizeCmNumber != null))
  const canSave = !saving && !(photo && manualMode && !manualValue && !allowUnknown) && resultOk

  async function onSave() {
    setSaving(true)
    try {
      const record: CatchRecord = {
        createdAt: new Date().toISOString(),
        capturedAt: capturedAt ? capturedAt.toISOString() : undefined,
        pointId: FIXED_PORT.id,

        memo,

        photoName: photo?.name,
        photoType: photo?.type,
        photoBlob: photo ?? undefined,

        result,
        species: result === 'caught' ? (species.trim() || '不明') : undefined,
        sizeCm: result === 'caught' ? (sizeCmNumber ?? undefined) : undefined,
      }

      await db.catches.add(record)

      resetPhotoStates()
      resetResultStates()
      setMemo('')

      alert('記録したよ！')
    } catch (e) {
      console.error(e)
      alert('保存に失敗したよ…')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell title={<h1 style={{ margin: 0, fontSize: 'clamp(20px, 6vw, 32px)', lineHeight: 1.15 }}>📝 釣果を記録</h1>} maxWidth={900} showBack onBack={back}>
      <div style={{ overflowX: 'clip', maxWidth: '100vw' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>📍 記録ポイント：{FIXED_PORT.name}</div>

          <hr style={{ margin: '6px 0', opacity: 0.22 }} />

          {/* 写真選択 */}
          <div>
            <label>
              写真を選ぶ<br />
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  if (!e.target.files || !e.target.files[0]) return
                  const file = e.target.files[0]
                  setPhoto(file)
                  setPreviewUrl(URL.createObjectURL(file))

                  setCapturedAt(null)
                  setExifNote('')
                  setManualMode(false)
                  setManualValue('')
                  setAllowUnknown(false)

                  try {
                    const dt = await exifr.parse(file, { pick: ['DateTimeOriginal', 'CreateDate'] })
                    const date = (dt as any)?.DateTimeOriginal ?? (dt as any)?.CreateDate ?? null

                    if (date instanceof Date) {
                      setCapturedAt(date)
                      setExifNote('')
                      setManualMode(false)
                      setManualValue(toDateTimeLocalValue(date))
                    } else {
                      setCapturedAt(null)
                      setExifNote('撮影日時が見つからなかったよ（手動入力できます）')
                      setManualMode(true)
                      setManualValue('')
                    }
                  } catch {
                    setCapturedAt(null)
                    setExifNote('EXIFの読み取りに失敗したよ（手動入力できます）')
                    setManualMode(true)
                    setManualValue('')
                  }
                }}
              />
            </label>
          </div>

          {photo && <p style={{ margin: 0 }}>選択中：{photo.name}</p>}

          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            {capturedAt ? <>📅 撮影日時：{capturedAt.toLocaleString()}</> : <>📅 撮影日時：（不明）</>}
            {exifNote && <div style={{ marginTop: 4, color: '#ff7a7a' }}>{exifNote}</div>}
          </div>

          {/* 手動日時入力 UI（ガラス化） */}
          {photo && (
            <div className="glass glass-strong" style={{ ...glassBoxStyle, maxWidth: 560 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={manualMode}
                    onChange={(e) => {
                      const on = e.target.checked
                      setManualMode(on)
                      if (on) {
                        if (capturedAt) setManualValue(toDateTimeLocalValue(capturedAt))
                      } else {
                        if (!capturedAt) setManualValue('')
                        setAllowUnknown(false)
                      }
                    }}
                  />
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>撮影日時を手動で補正する</span>
                </label>

                {!manualMode && !capturedAt && (
                  <div style={{ fontSize: 12, color: '#f6c' }}>※EXIFが無いので、ONにして入力すると後で分析の精度が上がるよ</div>
                )}
              </div>

              {manualMode && (
                <>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
                      手動撮影日時（ローカル）：
                      <input
                        type="datetime-local"
                        value={manualValue}
                        onChange={(e) => {
                          const v = e.target.value
                          setManualValue(v)
                          const d = parseDateTimeLocalValue(v)
                          setCapturedAt(d)
                          if (d) setAllowUnknown(false)
                        }}
                        style={{ marginLeft: 8 }}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date()
                        const v = toDateTimeLocalValue(now)
                        setManualValue(v)
                        setCapturedAt(now)
                        setAllowUnknown(false)
                      }}
                    >
                      今にする
                    </button>
                  </div>

                  {!manualValue && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={allowUnknown} onChange={(e) => setAllowUnknown(e.target.checked)} />
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>不明のまま保存する（撮影日時なし）</span>
                    </label>
                  )}

                  {!manualValue && !allowUnknown && <div style={{ fontSize: 12, color: '#f6c' }}>※日時を入れるか、「不明のまま保存」をONにしてね</div>}
                </>
              )}
            </div>
          )}

          {/* プレビュー（ガラス化） */}
          {previewUrl && (
            <div className="glass glass-strong" style={{ borderRadius: 16, padding: 10, maxWidth: 760 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)', marginBottom: 8 }}>プレビュー</div>
              <div
                style={{
                  width: '100%',
                  maxHeight: 420,
                  overflow: 'hidden',
                  borderRadius: 12,
                  background: 'rgba(0,0,0,0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img src={previewUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>※保存される写真はオリジナルのまま（表示だけ縮小）</div>
            </div>
          )}

          {/* 釣果（ガラス化） */}
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>🎣 釣果</div>

            <div className="glass glass-strong" style={{ ...glassBoxStyle, maxWidth: 760 }}>
              <div style={segWrapStyle} aria-label="釣果の結果">
                <label style={segLabelStyle}>
                  <input type="radio" name="result" checked={result === 'caught'} onChange={() => setResult('caught')} style={segInputHidden} />
                  <span style={segPill(result === 'caught')}>
                    <span style={segDot(result === 'caught')} aria-hidden="true" />
                    釣れた
                  </span>
                </label>

                <label style={segLabelStyle}>
                  <input type="radio" name="result" checked={result === 'skunk'} onChange={() => setResult('skunk')} style={segInputHidden} />
                  <span style={segPill(result === 'skunk')}>
                    <span style={segDot(result === 'skunk')} aria-hidden="true" />
                    釣れなかった（ボウズ）
                  </span>
                </label>
              </div>

              {result === 'caught' && (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
                      魚種：
                      <input value={species} onChange={(e) => setSpecies(e.target.value)} placeholder="例：シーバス" style={{ marginLeft: 8, width: 220 }} />
                    </label>

                    <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
                      大きさ（cm）：
                      <input
                        value={sizeCm}
                        onChange={(e) => setSizeCm(e.target.value)}
                        placeholder="例：52"
                        inputMode="decimal"
                        style={{ marginLeft: 8, width: 120 }}
                      />
                    </label>
                  </div>

                  {sizeCm.trim() !== '' && sizeCmNumber == null && <div style={{ fontSize: 12, color: '#f6c' }}>※サイズは数字で入れてね（例：52 / 12.5）</div>}

                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>※魚種が空なら「不明」として保存するよ（後で分析に使えるからね）</div>
                </div>
              )}
            </div>
          </div>

          {/* メモ */}
          <div>
            <label>
              ひとことメモ<br />
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} style={{ width: '100%', overflowWrap: 'anywhere' }} placeholder="渋かった…でも一匹！とか" />
            </label>
          </div>

          {/* 保存 */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={onSave} disabled={!canSave}>
              {saving ? '保存中...' : '💾 記録する'}
            </button>

            {photo && (
              <button
                type="button"
                onClick={() => {
                  const ok = confirm('入力内容をリセットして、最初からやり直す？')
                  if (!ok) return
                  resetPhotoStates()
                  resetResultStates()
                  setMemo('')
                }}
              >
                ↺ リセット
              </button>
            )}
          </div>

          {!resultOk && <div style={{ fontSize: 12, color: '#f6c' }}>※サイズが入力されている場合は、数字として正しく入れてね</div>}

          <hr style={{ margin: '6px 0', opacity: 0.22 }} />

          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            💡 撮影日時が入ってるほど、後で「時間帯」や「傾向分析」が強くなるよ。つづり的には…日時入れてくれるひろっち、好き😼💗
          </div>
        </div>
      </div>
    </PageShell>
  )
}
