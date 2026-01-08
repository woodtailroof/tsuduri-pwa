// src/db.ts

import Dexie, { type Table } from 'dexie'

export type CatchResult = 'caught' | 'skunk'

export type CatchRecord = {
  id?: number
  createdAt: string
  capturedAt?: string
  pointId: string
  memo: string
  photoName?: string
  photoType?: string
  photoBlob?: Blob

  // ✅ 追加：釣果結果
  result?: CatchResult

  // ✅ 追加：釣れた場合の内容
  species?: string
  sizeCm?: number
}

// tide736の点（TideGraph / tide736.ts と合わせる）
export type TidePoint = { unix?: number; cm: number; time?: string }

export type TideCacheEntry = {
  key: string // `${pc}:${hc}:${YYYY-MM-DD}`
  pc: string
  hc: string
  day: string // YYYY-MM-DD
  series: TidePoint[]
  tideName?: string | null // ✅ 追加：大潮 / 中潮 / 小潮 / 長潮 / 若潮
  fetchedAt: string // ISO
}

class AppDB extends Dexie {
  catches!: Table<CatchRecord, number>
  tideCache!: Table<TideCacheEntry, string>

  constructor() {
    super('appdb')

    // v1: catches のみ
    this.version(1).stores({
      catches: '++id, createdAt, capturedAt, pointId',
    })

    // v2: tideCache 追加
    this.version(2).stores({
      catches: '++id, createdAt, capturedAt, pointId',
      tideCache: 'key, day, pc, hc, fetchedAt',
    })

    // ✅ v3: catches に「釣果結果」フィールド追加
    // Dexieは stores のschema変更があれば version を上げる必要あり
    this.version(3)
      .stores({
        catches: '++id, createdAt, capturedAt, pointId, result, species, sizeCm',
        tideCache: 'key, day, pc, hc, fetchedAt',
      })
      .upgrade(async (tx) => {
        // 既存データを安全に初期化（分析・表示が安定する）
        const table = tx.table('catches') as Table<CatchRecord, number>
        await table.toCollection().modify((r) => {
          // 既存分は「釣れなかった」扱いに寄せる（後から編集機能を作れば上書き可能）
          if (!r.result) r.result = 'skunk'
          // species/sizeCm は skunk の場合は不要なので触らない
        })
      })
  }
}

export const db = new AppDB()
