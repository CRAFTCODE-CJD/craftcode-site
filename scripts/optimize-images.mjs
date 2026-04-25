/**
 * One-shot per build: walk public/images/ and emit WebP variants
 * for every PNG. Skips files that already have a fresh sibling .webp
 * (mtime check) so re-runs are idempotent and fast.
 *
 * Sprites stay PNG — KAPLAY's loadSprite expects raw RGBA sheets.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'public/images');

const QUALITY = 85; // near-lossless for UI screenshots, ~30-50% size of PNG

async function* walkPng(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkPng(full);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) yield full;
  }
}

async function shouldRebuild(pngPath, webpPath) {
  try {
    const [pngStat, webpStat] = await Promise.all([fs.stat(pngPath), fs.stat(webpPath)]);
    return pngStat.mtimeMs > webpStat.mtimeMs;
  } catch {
    return true; // webp missing
  }
}

async function main() {
  let converted = 0;
  let skipped = 0;
  for await (const pngPath of walkPng(sourceDir)) {
    const webpPath = pngPath.replace(/\.png$/i, '.webp');
    if (!(await shouldRebuild(pngPath, webpPath))) {
      skipped++;
      continue;
    }
    await sharp(pngPath).webp({ quality: QUALITY }).toFile(webpPath);
    const [pngStat, webpStat] = await Promise.all([fs.stat(pngPath), fs.stat(webpPath)]);
    const ratio = ((webpStat.size / pngStat.size) * 100).toFixed(0);
    console.log(`  webp: ${path.relative(root, pngPath)} → ${ratio}% of original`);
    converted++;
  }
  console.log(`Image optimization: ${converted} converted, ${skipped} up-to-date.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
