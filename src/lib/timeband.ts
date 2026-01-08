export type TimeBand = '朝マズメ' | 'デイ' | '夕マズメ' | 'ナイト'

export function getTimeBand(date: Date): TimeBand {
  const h = date.getHours()

  // ざっくりマズメ判定（後で自由に調整OK）
  if (h >= 4 && h < 8) return '朝マズメ'
  if (h >= 16 && h < 19) return '夕マズメ'

  // ナイトは夜〜深夜〜明け方
  if (h >= 19 || h < 4) return 'ナイト'

  return 'デイ'
}
