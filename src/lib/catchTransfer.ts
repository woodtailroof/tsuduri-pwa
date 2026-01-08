// src/lib/catchTransfer.ts
import JSZip from 'jszip'
import { db, type CatchRecord } from '../db'

/**
 * 画像を縮小して Blob にする
 * 長辺 maxSize px / jpeg quality 0.8
 */
async function resizeImage(blob: Blob, maxSize = 1280): Promise<Blob> {
  const img = document.createElement('img')
  const url = URL.createObjectURL(blob)
  img.src = url
  await img.decode()

  const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)

  URL.revokeObjectURL(url)

  return new Promise((resolve) => {
    canvas.toBlob(
      (b) => resolve(b!),
      'image/jpeg',
      0.8
    )
  })
}

/**
 * 📤 釣果をZIPでエクスポート
 */
export async function exportCatches() {
  const zip = new JSZip()
  const photoDir = zip.folder('photos')!

  const all = await db.catches.toArray()
  const manifest: any[] = []

  for (const r of all) {
    const { photoBlob, ...meta } = r
    let photoFileName: string | undefined

    if (photoBlob) {
      const resized = await resizeImage(photoBlob)
      photoFileName = `${r.id}.jpg`
      photoDir.file(photoFileName, resized)
    }

    manifest.push({
      ...meta,
      photoFileName,
    })
  }

  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        count: manifest.length,
        records: manifest,
      },
      null,
      2
    )
  )

  const blob = await zip.generateAsync({ type: 'blob' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `tsuduri-catches-${Date.now()}.zip`
  a.click()
  URL.revokeObjectURL(a.href)
}

/**
 * 📥 ZIPから釣果を完全復元（全消し→置き換え）
 */
export async function importCatches(file: File) {
  const zip = await JSZip.loadAsync(file)
  const manifestRaw = await zip.file('manifest.json')!.async('string')
  const manifest = JSON.parse(manifestRaw)

  if (!Array.isArray(manifest.records)) {
    throw new Error('manifest が不正')
  }

  await db.catches.clear()

  const records: CatchRecord[] = []

  for (const r of manifest.records) {
    let photoBlob: Blob | undefined

    if (r.photoFileName) {
      const f = zip.file(`photos/${r.photoFileName}`)
      if (f) {
        photoBlob = await f.async('blob')
      }
    }

    records.push({
      ...r,
      photoBlob,
    })
  }

  await db.catches.bulkAdd(records)
}
