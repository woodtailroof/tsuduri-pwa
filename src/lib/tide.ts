// src/lib/tide.ts

// 仮の潮フェーズ判定（あとで本物に差し替える）
export type TidePhase =
  | '満潮前'
  | '満潮'
  | '下げ始め'
  | '干潮'
  | '上げ始め'

export function getTidePhase(date: Date): TidePhase {
  const hour = date.getHours()

  if (hour >= 5 && hour < 8) return '上げ始め'
  if (hour >= 8 && hour < 11) return '満潮前'
  if (hour >= 11 && hour < 13) return '満潮'
  if (hour >= 13 && hour < 17) return '下げ始め'
  return '干潮'
}
