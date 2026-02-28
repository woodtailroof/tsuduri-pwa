// scripts/sync-albums.mjs
// public/assets/slides 配下を走査して
// - 各アルバムの manifest.json に files を自動注入（PNGのみ）
// - public/assets/slides/index.json を更新（thumb は先頭画像、tags は既存を維持）
//
// 実行: node scripts/sync-albums.mjs
// 推奨: npm run albums:sync

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SLIDES_DIR = path.join(ROOT, "public", "assets", "slides");
const INDEX_PATH = path.join(SLIDES_DIR, "index.json");

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function writeJson(filePath, obj) {
  const raw = JSON.stringify(obj, null, 2) + "\n";
  fs.writeFileSync(filePath, raw, "utf8");
}

function isPng(name) {
  return /\.png$/i.test(name);
}

function naturalCompareJa(a, b) {
  return String(a).localeCompare(String(b), "ja", {
    numeric: true,
    sensitivity: "base",
  });
}

function listDirs(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function listPngFiles(dir) {
  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .filter(isPng)
    .sort(naturalCompareJa);
  return files;
}

function ensureManifestWithFiles(albumDirAbs) {
  const manifestPath = path.join(albumDirAbs, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;

  const manifest = readJson(manifestPath);
  const pngs = listPngFiles(albumDirAbs);

  // ✅ manifest.json 自体を「files 自動注入」して更新
  const next = {
    ...manifest,
    files: pngs,
  };

  // 変化がある時だけ書き込み（無駄な差分を減らす）
  const before = JSON.stringify(manifest);
  const after = JSON.stringify(next);
  if (before !== after) writeJson(manifestPath, next);

  return { manifest: next, pngs };
}

function walkAlbums() {
  if (!fs.existsSync(SLIDES_DIR)) {
    throw new Error(`slides dir not found: ${SLIDES_DIR}`);
  }

  const characterDirs = listDirs(SLIDES_DIR).filter((n) => n !== ".");
  const albums = [];

  for (const characterId of characterDirs) {
    const charAbs = path.join(SLIDES_DIR, characterId);
    if (!fs.statSync(charAbs).isDirectory()) continue;

    const albumDirs = listDirs(charAbs);

    for (const albumFolder of albumDirs) {
      const albumAbs = path.join(charAbs, albumFolder);

      const r = ensureManifestWithFiles(albumAbs);
      if (!r) continue;

      const albumId = `${characterId}/${albumFolder}`;
      const title = String(r.manifest?.title ?? albumId).trim() || albumId;

      // ✅ サムネは「フォルダ内の先頭PNG」
      const first = r.pngs[0] ?? null;
      const thumb = first ? `/assets/slides/${albumId}/${first}` : undefined;

      albums.push({
        id: albumId,
        title,
        thumb,
        characterId,
      });
    }
  }

  // 表示順: characterId → title の自然順
  albums.sort((a, b) => {
    const c = naturalCompareJa(a.characterId, b.characterId);
    if (c !== 0) return c;
    return naturalCompareJa(a.title ?? a.id, b.title ?? b.id);
  });

  return albums;
}

function loadExistingIndex() {
  if (!fs.existsSync(INDEX_PATH)) return { albums: [] };
  try {
    const json = readJson(INDEX_PATH);
    if (!json || !Array.isArray(json.albums)) return { albums: [] };
    return json;
  } catch {
    return { albums: [] };
  }
}

function main() {
  const generated = walkAlbums();
  const oldIndex = loadExistingIndex();

  // ✅ tags を維持（新規は空配列）
  const oldById = new Map(
    (oldIndex.albums ?? []).map((a) => [String(a.id), a]),
  );

  const merged = generated.map((a) => {
    const old = oldById.get(a.id);
    const tags = Array.isArray(old?.tags) ? old.tags : [];
    return {
      ...a,
      tags,
    };
  });

  writeJson(INDEX_PATH, { albums: merged });

  const countAlbums = merged.length;
  console.log(`[albums:sync] updated index.json: ${countAlbums} albums`);
}

main();
