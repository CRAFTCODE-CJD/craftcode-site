/**
 * Mobile-first image pipeline. Walks public/images/ and emits, for every
 * source PNG, a fan-out of responsive variants:
 *
 *   foo.png         (untouched original — fallback)
 *   foo.webp        (full-resolution WebP, q=72)
 *   foo-360.webp    \
 *   foo-720.webp     responsive WebP variants (only emitted when source ≥ width)
 *   foo-1280.webp   /
 *   foo.avif        full-resolution AVIF, q=55 (modern browsers — biggest win)
 *   foo-360.avif    \
 *   foo-720.avif     responsive AVIF variants
 *   foo-1280.avif   /
 *
 * Skips generation when a fresh sibling exists (mtime check) so re-runs are
 * idempotent. Skips a width if the source is already narrower (no upscale).
 *
 * Sprites under public/sprites/ are NOT touched — KAPLAY's loadSprite
 * expects raw RGBA PNG sheets.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'public/images');

// Lower quality than q=85 (visually-lossless ceiling for screenshots) — phones
// won't tell the difference and we save another 25-35%.
const WEBP_QUALITY = 72;
const AVIF_QUALITY = 55;

// Phone-first breakpoints. The site's main column maxes out around 1200px and
// hero cards are full-bleed at desktop, so 1280 is a solid HiDPI ceiling.
const WIDTHS = [360, 720, 1280];

async function* walkPng(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkPng(full);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) yield full;
  }
}

async function isFresh(srcPath, outPath) {
  try {
    const [src, out] = await Promise.all([fs.stat(srcPath), fs.stat(outPath)]);
    return out.mtimeMs >= src.mtimeMs;
  } catch {
    return false; // missing → not fresh
  }
}

/**
 * Emit a single variant. `width` is undefined for full-resolution copies.
 * Returns a label for logging. Skips silently when output is fresh.
 *
 * IMPORTANT: when the source is narrower than the target width, we still
 * emit the variant — without resize (Sharp's `withoutEnlargement` enforces
 * this). The file lands at the source's native resolution. This keeps every
 * URL in templated `srcset` strings valid; otherwise browsers on hi-DPI
 * displays would 404 on `Atlas-1280.avif` for 800px sources.
 */
async function emitVariant(srcPath, format, width, srcWidth) {
  const ext = format === 'webp' ? '.webp' : '.avif';
  const suffix = width !== undefined ? `-${width}` : '';
  const outPath = srcPath.replace(/\.png$/i, `${suffix}${ext}`);

  if (await isFresh(srcPath, outPath)) return { skipped: true, outPath };

  let pipeline = sharp(srcPath);
  if (width !== undefined) {
    pipeline = pipeline.resize({ width, withoutEnlargement: true });
  }
  if (format === 'webp') {
    pipeline = pipeline.webp({ quality: WEBP_QUALITY, effort: 4 });
  } else {
    pipeline = pipeline.avif({ quality: AVIF_QUALITY, effort: 4 });
  }
  await pipeline.toFile(outPath);
  return { skipped: false, outPath };
}

async function main() {
  let made = 0;
  let skipped = 0;
  let avifSupported = true;

  // Probe AVIF once — older Sharp builds (or libheif-less installs) bail out
  // with a "no avif support" runtime error. We don't want to die on those.
  try {
    await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } })
      .avif({ quality: 50 })
      .toBuffer();
  } catch {
    avifSupported = false;
    console.warn('[optimize-images] AVIF not available in this Sharp build — skipping AVIF variants.');
  }

  for await (const pngPath of walkPng(sourceDir)) {
    let srcWidth;
    try {
      const meta = await sharp(pngPath).metadata();
      srcWidth = meta.width;
    } catch {
      srcWidth = undefined;
    }

    const tasks = [];
    // Full-res WebP (always — many <picture> sources still reference foo.webp).
    tasks.push(['webp', undefined]);
    // Responsive WebP set.
    for (const w of WIDTHS) tasks.push(['webp', w]);
    // AVIF mirror — only when supported by this Sharp build.
    if (avifSupported) {
      tasks.push(['avif', undefined]);
      for (const w of WIDTHS) tasks.push(['avif', w]);
    }

    for (const [fmt, w] of tasks) {
      const res = await emitVariant(pngPath, fmt, w, srcWidth);
      if (!res) continue; // upscale skipped
      if (res.skipped) {
        skipped++;
      } else {
        made++;
        const stat = await fs.stat(res.outPath);
        console.log(
          `  ${fmt.padEnd(4)} ${w ? String(w).padStart(4) : ' src'}  ` +
            `${path.relative(root, res.outPath)}  (${(stat.size / 1024).toFixed(0)} KB)`,
        );
      }
    }
  }

  console.log(`Image pipeline: ${made} written, ${skipped} up-to-date.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
