import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SLIDES_DIR = path.join(ROOT, "public", "assets", "slides");
const DISPLAY_QUALITY = 88;
const THUMB_QUALITY = 78;
const DISPLAY_MAX = 1920;
const THUMB_WIDTH = 480;
const THUMB_HEIGHT = 270;

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const dryRun = args.has("--dry-run");
const deleteSource = args.has("--delete-source");
const limitArg = process.argv.find((value) => value.startsWith("--limit="));
const parsedLimit = limitArg ? Number(limitArg.slice("--limit=".length)) : Infinity;
const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : Infinity;

function naturalCompareJa(a, b) {
  return String(a).localeCompare(String(b), "ja", {
    numeric: true,
    sensitivity: "base",
  });
}

function walk(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== ".thumbs") result.push(...walk(absolute));
      continue;
    }
    if (entry.isFile() && /\.png$/i.test(entry.name)) result.push(absolute);
  }
  return result.sort(naturalCompareJa);
}

function outputPaths(source) {
  const dir = path.dirname(source);
  const stem = path.basename(source, path.extname(source));
  return {
    display: path.join(dir, `${stem}.webp`),
    thumb: path.join(dir, ".thumbs", `${stem}.webp`),
  };
}

function isCurrent(source, output) {
  if (force || !fs.existsSync(output)) return false;
  const sourceStat = fs.statSync(source);
  const outputStat = fs.statSync(output);
  return outputStat.size > 0 && outputStat.mtimeMs >= sourceStat.mtimeMs;
}

async function isValidWebp(file) {
  if (!fs.existsSync(file) || fs.statSync(file).size <= 0) return false;
  try {
    const metadata = await sharp(file).metadata();
    return (
      metadata.format === "webp" &&
      Number(metadata.width) > 0 &&
      Number(metadata.height) > 0
    );
  } catch {
    return false;
  }
}

function assertSafeSource(source) {
  const relative = path.relative(SLIDES_DIR, source);
  if (
    path.isAbsolute(relative) ||
    relative === "" ||
    relative.startsWith(`..${path.sep}`) ||
    !/\.png$/i.test(source)
  ) {
    throw new Error(`refusing to delete unexpected source: ${source}`);
  }
}

async function writeAtomic(builder, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  try {
    await builder.toFile(temporary);
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

async function optimizeOne(source) {
  const outputs = outputPaths(source);
  let displayCurrent = isCurrent(source, outputs.display);
  let thumbCurrent = isCurrent(source, outputs.thumb);

  // 更新日時だけでなく、実際に読めるWebPかも確認する。
  if (displayCurrent && !(await isValidWebp(outputs.display))) displayCurrent = false;
  if (thumbCurrent && !(await isValidWebp(outputs.thumb))) thumbCurrent = false;

  if (dryRun) {
    return {
      converted: !displayCurrent || !thumbCurrent,
      deleted: deleteSource,
      planned: true,
    };
  }

  if (!displayCurrent) {
    await writeAtomic(
      sharp(source)
        .rotate()
        .resize({
          width: DISPLAY_MAX,
          height: DISPLAY_MAX,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: DISPLAY_QUALITY, smartSubsample: true, effort: 4 }),
      outputs.display,
    );
  }

  if (!thumbCurrent) {
    await writeAtomic(
      sharp(source)
        .rotate()
        .resize({
          width: THUMB_WIDTH,
          height: THUMB_HEIGHT,
          fit: "cover",
          position: "attention",
          withoutEnlargement: true,
        })
        .webp({ quality: THUMB_QUALITY, smartSubsample: true, effort: 4 }),
      outputs.thumb,
    );
  }

  const displayValid = await isValidWebp(outputs.display);
  const thumbValid = await isValidWebp(outputs.thumb);
  if (!displayValid || !thumbValid) {
    throw new Error("generated WebP validation failed; original PNG was kept");
  }

  if (deleteSource) {
    assertSafeSource(source);
    fs.unlinkSync(source);
  }

  return {
    converted: !displayCurrent || !thumbCurrent,
    deleted: deleteSource,
    planned: false,
  };
}

async function main() {
  if (!fs.existsSync(SLIDES_DIR)) {
    throw new Error(`slides dir not found: ${SLIDES_DIR}`);
  }

  const sources = walk(SLIDES_DIR).slice(0, limit);
  const counts = { converted: 0, deleted: 0, skipped: 0, planned: 0, failed: 0 };

  console.log(
    `[albums:optimize] ${dryRun ? "dry-run" : "start"}: ${sources.length} PNG files`,
  );

  // 大きな画像を同時展開しすぎないよう、4本だけ並列処理する。
  let cursor = 0;
  async function worker() {
    while (cursor < sources.length) {
      const index = cursor++;
      const source = sources[index];
      const relative = path.relative(ROOT, source);
      try {
        const result = await optimizeOne(source);
        if (result.converted) counts.converted += 1;
        if (result.deleted) counts.deleted += 1;
        if (result.planned) counts.planned += 1;
        if (!result.converted && !result.deleted && !result.planned) counts.skipped += 1;
      } catch (error) {
        counts.failed += 1;
        console.error(`[albums:optimize] failed: ${relative}`, error);
      }

      const done = index + 1;
      if (done % 50 === 0 || done === sources.length) {
        console.log(`[albums:optimize] ${done}/${sources.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: 4 }, () => worker()));

  console.log(
    `[albums:optimize] done: converted=${counts.converted}, deleted=${counts.deleted}, skipped=${counts.skipped}, planned=${counts.planned}, failed=${counts.failed}`,
  );

  if (counts.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[albums:optimize] fatal:", error);
  process.exitCode = 1;
});
