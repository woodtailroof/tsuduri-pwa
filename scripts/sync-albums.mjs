// public/assets/slides 配下を走査して manifest.json と index.json を更新する。
// 表示用WebPがあれば優先し、未変換画像は元PNGへフォールバックする。

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SLIDES_DIR = path.join(ROOT, "public", "assets", "slides");
const INDEX_PATH = path.join(SLIDES_DIR, "index.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
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
    .filter((entry) => entry.isDirectory() && entry.name !== ".thumbs")
    .map((entry) => entry.name);
}

function listDisplayFiles(dir) {
  const candidates = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(png|webp)$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort(naturalCompareJa);

  const byStem = new Map();
  for (const name of candidates) {
    const stem = path.basename(name, path.extname(name));
    const current = byStem.get(stem);
    if (!current || /\.webp$/i.test(name)) byStem.set(stem, name);
  }
  return Array.from(byStem.values()).sort(naturalCompareJa);
}

function thumbPathFor(albumDir, displayName, albumId) {
  const webpName = `${path.basename(displayName, path.extname(displayName))}.webp`;
  const relative = `.thumbs/${webpName}`;
  return fs.existsSync(path.join(albumDir, relative))
    ? `/assets/slides/${albumId}/${relative}`
    : `/assets/slides/${albumId}/${displayName}`;
}

function ensureManifestWithFiles(albumDir) {
  const manifestPath = path.join(albumDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;

  const manifest = readJson(manifestPath);
  const files = listDisplayFiles(albumDir);
  const next = { ...manifest, files };

  if (JSON.stringify(manifest) !== JSON.stringify(next)) {
    writeJson(manifestPath, next);
  }

  return { manifest: next, files };
}

function walkAlbums() {
  if (!fs.existsSync(SLIDES_DIR)) {
    throw new Error(`slides dir not found: ${SLIDES_DIR}`);
  }

  const albums = [];
  for (const characterId of listDirs(SLIDES_DIR)) {
    const characterDir = path.join(SLIDES_DIR, characterId);
    for (const albumFolder of listDirs(characterDir)) {
      const albumDir = path.join(characterDir, albumFolder);
      const result = ensureManifestWithFiles(albumDir);
      if (!result) continue;

      const albumId = `${characterId}/${albumFolder}`;
      const title = String(result.manifest?.title ?? albumId).trim() || albumId;
      const first = result.files[0];

      albums.push({
        id: albumId,
        title,
        thumb: first ? thumbPathFor(albumDir, first, albumId) : undefined,
        characterId,
      });
    }
  }

  albums.sort((a, b) => {
    const characterOrder = naturalCompareJa(a.characterId, b.characterId);
    return characterOrder || naturalCompareJa(a.title ?? a.id, b.title ?? b.id);
  });
  return albums;
}

function loadExistingIndex() {
  if (!fs.existsSync(INDEX_PATH)) return { albums: [] };
  try {
    const json = readJson(INDEX_PATH);
    return json && Array.isArray(json.albums) ? json : { albums: [] };
  } catch {
    return { albums: [] };
  }
}

function main() {
  const generated = walkAlbums();
  const oldIndex = loadExistingIndex();
  const oldById = new Map(
    (oldIndex.albums ?? []).map((album) => [String(album.id), album]),
  );

  const merged = generated.map((album) => ({
    ...album,
    tags: Array.isArray(oldById.get(album.id)?.tags)
      ? oldById.get(album.id).tags
      : [],
  }));

  writeJson(INDEX_PATH, { albums: merged });
  console.log(`[albums:sync] updated index.json: ${merged.length} albums`);
}

main();
