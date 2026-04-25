# Site Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring craftcode-site from "no security headers, no CI, no perf budget" to a production-ready static site with enforced CSP, optimized assets, and automated quality gates on every PR.

**Architecture:** Risk-stratified phases — P0 (security + asset basics) → P1 (perf polish) → P2 (CI/automation) → P3 (verification). Each task ends in a single commit so any phase can be reverted independently. Pre-launch posture (no real users) → enforced changes from day one, no report-only stage.

**Tech Stack:** Astro 5 SSG, Cloudflare Pages, MDX, KAPLAY 3001, Sharp 0.33, Node 24, GitHub Actions, husky, lint-staged, Lighthouse CI, Sharp (PNG → WebP), `@astrojs/sitemap`, Dependabot.

**Spec reference:** `docs/superpowers/specs/2026-04-25-site-audit-design.md`

---

## Phase 0 — Critical security + assets

### Task 1: Capture baseline metrics

**Files:**
- Create: `docs/audit-2026-04-25.md`

This task records "before" numbers so P3 has a comparison target. No code changes.

- [ ] **Step 1: Build the site fresh to get accurate dist sizes**

```bash
cd F:/SpriteOptimizer-CrossEngine/craftcode-site
npm ci
npm run build 2>&1 | tail -8
```

Expected: build completes in ~10 s, produces 18 pages.

- [ ] **Step 2: Capture bundle sizes**

```bash
du -sh dist dist/_astro
du -h dist/_astro/*.js | sort -hr
du -h dist/_astro/*.css | sort -hr
```

Save output for the doc.

- [ ] **Step 3: Capture image inventory**

```bash
du -sh public/images
find public/images -type f -name "*.png" | wc -l
find public/images -type f -name "*.webp" | wc -l
find public/images -name "*.png" -size +200k -exec du -h {} \; | sort -hr | head -10
```

- [ ] **Step 4: Capture npm audit baseline**

```bash
npm audit --json > /tmp/npm-audit-before.json 2>/dev/null
npm audit
```

Note the line: "X vulnerabilities (Y low, Z moderate, W high, V critical)".

- [ ] **Step 5: Write `docs/audit-2026-04-25.md` with baseline**

```markdown
# Site Audit — 2026-04-25

Implementation of `docs/superpowers/specs/2026-04-25-site-audit-design.md`.

## Baseline (before P0)

### Bundle sizes (dist/_astro)

| File | Size |
|---|---|
| (paste `du -h dist/_astro/*.js` table here) |

Total dist: (paste `du -sh dist`)
Total _astro: (paste `du -sh dist/_astro`)

### Images (public/images)

- Total size: (paste `du -sh`)
- PNG count: N
- WebP count: 0
- Largest PNGs (>200 KB): (paste table)

### npm audit

(paste output of `npm audit`)

### Lighthouse

(deferred to P3 — measured against deployed Cloudflare URL after each phase)

### Security headers (securityheaders.com)

(deferred to P3)

---

## After (post-P3)

(filled in during Task 13)
```

- [ ] **Step 6: Commit**

```bash
git add docs/audit-2026-04-25.md
git commit -m "docs: capture site audit baseline metrics"
```

---

### Task 2: Add `public/_headers` with security + cache headers

**Files:**
- Create: `public/_headers`

Cloudflare Pages reads this file at build time and applies headers at edge. Keep CSP tight: only `'self'` + Google Fonts (confirmed used in Base.astro:67) + YouTube (confirmed used in Video.astro).

- [ ] **Step 1: Inventory external URLs in src/ to confirm CSP scope**

```bash
grep -rEn "https?://" src --include="*.astro" --include="*.ts" --include="*.tsx" --include="*.mdx" | grep -v "// " | grep -Ev "comment|spec|todo" | sort -u | head -40
```

Expected to find:
- `fonts.googleapis.com`, `fonts.gstatic.com` (Base.astro)
- `youtube.com`, `www.youtube.com`, `youtu.be` (Video.astro)
- `github.com`, `youtube.com`, `fab.com` (CTA hrefs in plugin frontmatter — these are navigation, not loaded resources, so they don't need CSP entries)
- Anything else → add to CSP

- [ ] **Step 2: Create `public/_headers`**

```
# Cloudflare Pages headers
# https://developers.cloudflare.com/pages/configuration/headers/

/*
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; frame-src https://www.youtube.com https://youtube.com; media-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests

# Content-hashed bundles → cache forever
/_astro/*
  Cache-Control: public, max-age=31536000, immutable

# Static assets keyed by filename → cache forever (filename changes = cache busts)
/sprites/*
  Cache-Control: public, max-age=31536000, immutable
/images/*
  Cache-Control: public, max-age=31536000, immutable
/logo/*
  Cache-Control: public, max-age=31536000, immutable

# Manifests change occasionally → 1 day
/manifests/*
  Cache-Control: public, max-age=86400

# HTML — short cache, must-revalidate via ETag
/*.html
  Cache-Control: public, max-age=300, must-revalidate
```

CSP rationale:
- `script-src 'self'` — no `'unsafe-inline'`/`'unsafe-eval'`. Astro emits external `<script src>` tags by default.
- `style-src 'self' 'unsafe-inline'` — Astro's `inlineStylesheets: 'auto'` puts critical CSS as inline `<style>`. Without `'unsafe-inline'` the page renders unstyled.
- `img-src 'self' data: https:` — `https:` allows any HTTPS image (broad, but safe for static site that doesn't accept user input). Tighten later if needed.
- `frame-ancestors 'none'` — defense-in-depth alongside `X-Frame-Options: DENY`.
- `upgrade-insecure-requests` — auto-upgrades any leaked `http:` URL to `https:`.

- [ ] **Step 3: Build and verify `_headers` is copied to dist**

```bash
npm run build
ls -la dist/_headers && head dist/_headers
```

Expected: file exists in `dist/`, content matches what we wrote.

- [ ] **Step 4: Commit**

```bash
git add public/_headers
git commit -m "feat(security): add Cloudflare _headers with CSP/HSTS/cache rules"
```

After this commit pushes to main, Cloudflare will redeploy and apply headers. Verification via `curl` happens in Task 13.

---

### Task 3: npm audit + lockfile verification

**Files:**
- Modify: `.npmrc` (create if missing)
- Verify: `package-lock.json` is committed

- [ ] **Step 1: Confirm `package-lock.json` is tracked**

```bash
git ls-files package-lock.json
```

Expected: `package-lock.json` printed. If empty output → lockfile is gitignored or untracked. If gitignored, remove the entry from `.gitignore`. If untracked, `git add package-lock.json && git commit -m "chore: commit package-lock.json"`.

- [ ] **Step 2: Run npm audit**

```bash
npm audit --audit-level=high
```

Three outcomes:
- **0 vulnerabilities at high+** → skip to Step 4.
- **High/critical found, fixable without `--force`** → run `npm audit fix` (NO `--force`), re-run `npm audit`, verify clean.
- **High/critical require `--force` (major bumps)** → STOP. Print the package list and the major version delta. User must decide each one. Do not auto-bump.

- [ ] **Step 3: Create `.npmrc` with audit threshold**

```
audit-level=high
fund=false
loglevel=warn
```

This makes `npm install` and `npm ci` emit only relevant audit info. CI workflow (Task 9) will use the same threshold.

- [ ] **Step 4: Re-build to confirm lockfile didn't introduce regressions**

```bash
rm -rf node_modules
npm ci
npm run build 2>&1 | tail -3
```

Expected: 18 pages built.

- [ ] **Step 5: Commit**

```bash
git add .npmrc package-lock.json package.json
git commit -m "chore(deps): npm audit clean + add .npmrc audit threshold"
```

(If `package.json` didn't change, omit it from `git add`.)

---

### Task 4: Image optimization (PNG → WebP)

**Files:**
- Create: `scripts/optimize-images.mjs`
- Modify: `package.json` (add `prebuild` script)
- Modify: `src/components/PluginHero.astro` (use `<picture>` for hero)
- Modify: `src/components/mdx/Image.astro` (use `<picture>` for content images)
- Modify: `src/pages/plugins/[...slug].astro` (use `<picture>` for gallery shots)

The script generates WebP variants at build time. Components use `<picture>` with `<source srcset="*.webp">` + PNG `<img>` fallback. Sharp is already in deps.

- [ ] **Step 1: Create `scripts/optimize-images.mjs`**

```javascript
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
```

- [ ] **Step 2: Add `prebuild` hook to `package.json`**

Edit `package.json` `"scripts"` section. Insert before `"build"`:

```json
"prebuild": "node scripts/optimize-images.mjs",
"build": "astro build",
```

- [ ] **Step 3: Run the script once to populate WebP**

```bash
node scripts/optimize-images.mjs
ls public/images/plugins/sprite-optimizer/*.webp | wc -l
```

Expected: ~30 WebP files generated (count depends on PNG count). Check sizes:

```bash
du -sh public/images
```

Expected: total grows, but each WebP is 30-50% of its PNG.

- [ ] **Step 4: Update `src/components/mdx/Image.astro`**

Read the file first to confirm current structure. Then locate the `<img>` element (around line 36 per recon) and wrap it in `<picture>`:

Find:
```astro
<img
  src={src}
  alt={alt}
  loading="lazy"
  ...
/>
```

Replace with:
```astro
<picture>
  <source srcset={src.replace(/\.png$/i, '.webp')} type="image/webp" />
  <img
    src={src}
    alt={alt}
    loading="lazy"
    ...
  />
</picture>
```

Keep all existing attributes on `<img>`. Only wrap.

- [ ] **Step 5: Update `src/components/PluginHero.astro` hero image**

Find around line 60-65:
```astro
{image ? (
  <div class="plugin-hero-media">
    <div class="media-overlay"></div>
    <img src={image} alt={title} loading="eager" />
    <div class="media-badge">PREVIEW_01</div>
  </div>
) : null}
```

Replace `<img>` with `<picture>` wrap (keeping `loading="eager"` since hero is above-fold):

```astro
<picture>
  <source srcset={image.replace(/\.png$/i, '.webp')} type="image/webp" />
  <img src={image} alt={title} loading="eager" />
</picture>
```

- [ ] **Step 6: Update `src/pages/plugins/[...slug].astro` gallery images**

Find around line 224 (gallery shot rendering):
```astro
<img src={shot.src} alt={shot.caption} loading="lazy" />
```

Replace with:
```astro
<picture>
  <source srcset={shot.src.replace(/\.png$/i, '.webp')} type="image/webp" />
  <img src={shot.src} alt={shot.caption} loading="lazy" />
</picture>
```

- [ ] **Step 7: Update `src/pages/plugins/index.astro` (around line 40)**

Find the existing lazy-loaded `<img>`. Apply the same `<picture>` wrap pattern.

- [ ] **Step 8: Build + verify WebP variants exist in dist**

```bash
npm run build 2>&1 | tail -5
ls dist/images/plugins/sprite-optimizer/*.webp | wc -l
du -sh dist/images
```

Expected: build green, WebP files present in `dist/images/`.

- [ ] **Step 9: Spot-check a built HTML file references both formats**

```bash
grep -A2 "picture\|webp" dist/plugins/sprite-optimizer/index.html | head -20
```

Expected: see `<picture><source ... type="image/webp">` blocks.

- [ ] **Step 10: Commit**

```bash
git add scripts/optimize-images.mjs package.json src/components/PluginHero.astro src/components/mdx/Image.astro src/pages/plugins/index.astro "src/pages/plugins/[...slug].astro" public/images
git commit -m "feat(perf): generate WebP variants at build, use <picture> with PNG fallback"
```

---

## Phase 1 — Performance polish

### Task 5: Code-split i18n bundle by language

**Files:**
- Modify: `src/i18n/i18n.ts`

Currently `i18n.ts:19-20` statically imports both JSONs → 288 KB single bundle. Convert to dynamic import → Vite emits two ~140 KB chunks; only active language loads on first paint.

- [ ] **Step 1: Read current `src/i18n/i18n.ts` to understand consumer signature**

```bash
head -60 src/i18n/i18n.ts
```

Note how `en` and `ru` are used downstream (likely a `dict` map keyed by lang).

- [ ] **Step 2: Refactor static imports to dynamic**

Change near line 19-20:

Find:
```typescript
import en from './translations/en.json';
import ru from './translations/ru.json';

// (some structure that consumes en + ru, e.g.)
const dicts: Record<Lang, Record<string, string>> = { en, ru };
```

Replace with:
```typescript
type Dict = Record<string, string>;
const cache: Partial<Record<Lang, Dict>> = {};

async function loadDict(lang: Lang): Promise<Dict> {
  if (cache[lang]) return cache[lang]!;
  const mod = lang === 'en'
    ? await import('./translations/en.json')
    : await import('./translations/ru.json');
  cache[lang] = (mod as { default: Dict }).default;
  return cache[lang]!;
}
```

Then update every site that previously did `dicts[lang]` to await `loadDict(lang)`. Keep the public `t(key)` API synchronous if possible by pre-loading the active language at startup (`await loadDict(detectLang())`).

If the existing API is heavily synchronous, an alternative: load active language synchronously via `<script type="module">` import in `Base.astro` BEFORE the i18n module evaluates. This is more invasive — only do it if step 2's refactor breaks consumers.

- [ ] **Step 3: Build and inspect output chunks**

```bash
npm run build 2>&1 | tail -5
du -h dist/_astro/*.js | sort -hr | head -8
```

Expected: see two i18n-related chunks instead of one 288-KB monolith. Each ~140-150 KB.

- [ ] **Step 4: Smoke-test in browser**

Open `http://localhost:4321/` after `npm run preview` (or use Cloudflare preview after push). Toggle language. Verify:
- No console errors.
- Switching to RU doesn't break (was previously already in memory, now loads on demand).
- Switching back to EN doesn't double-load.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/i18n.ts
git commit -m "perf(i18n): dynamic-import translations per language (288 KB → 2× ~140 KB)"
```

---

### Task 6: Font preload + font-display: swap

**Files:**
- Modify: `src/layouts/Base.astro`

Currently `Base.astro:67` loads Google Fonts CSS with `display=swap` query param (good!) but does NOT preload critical font files. Add preload for above-fold fonts.

- [ ] **Step 1: Read Base.astro lines 50-80 to confirm current font setup**

```bash
sed -n '50,80p' src/layouts/Base.astro
```

- [ ] **Step 2: Identify which fonts are critical (above-fold)**

From recent CSS inspection:
- **Press Start 2P** — used in `.plugin-hero-title`, `.kc-stage-sign-word` (hero titles, large)
- **VT323** — body kicker, plugin section titles
- **JetBrains Mono** — code labels, kicker tags
- **Inter** — body text (very common)

Skip preload for: Rubik Pixels, Russo One, Play (used as fallback or rare).

- [ ] **Step 3: Add preload links to Base.astro**

After the existing `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />` line (around line 57), insert:

```astro
<!-- Preload critical fonts to eliminate FOIT for the hero title and primary text. -->
<link rel="preload" as="font" type="font/woff2"
      href="https://fonts.gstatic.com/s/pressstart2p/v15/e3t4euO8T-267oIAQAu6jDQyK3nVivM.woff2"
      crossorigin="anonymous" />
<link rel="preload" as="font" type="font/woff2"
      href="https://fonts.gstatic.com/s/vt323/v17/pxiKyp0ihIEF2isfFJU.woff2"
      crossorigin="anonymous" />
<link rel="preload" as="font" type="font/woff2"
      href="https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50ojIa1ZL7.woff2"
      crossorigin="anonymous" />
```

NOTE: Google Fonts URLs include hashes that change. To get current URLs, fetch `https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap` and extract the `woff2` URL from `@font-face { src: url(...) }`. Do this at implementation time:

```bash
curl -sH "User-Agent: Mozilla/5.0" "https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=Inter:wght@400&display=swap" | grep -oE "https://fonts\.gstatic\.com/[^)]+woff2"
```

Use the actual URLs from that output.

- [ ] **Step 4: Build + verify preload links land in HTML**

```bash
npm run build
grep -E "rel=.preload.*as=.font" dist/index.html | head -3
```

Expected: 3 preload lines in HTML.

- [ ] **Step 5: Smoke-test — first paint shouldn't show FOIT**

Open Network tab in browser, throttle to "Slow 3G". Reload `/`. Hero title "CRAFTCODE" should appear with the Press Start 2P font OR with the system fallback (per `font-display: swap`), never blank.

- [ ] **Step 6: Commit**

```bash
git add src/layouts/Base.astro
git commit -m "perf(fonts): preload critical font files (Press Start 2P, VT323, Inter)"
```

---

### Task 7: Lazy-load KaplayPlayground via client:visible

**Files:**
- Modify: `src/pages/index.astro`

Currently `<KaplayPlayground />` (276 KB JS) loads eagerly on `/`. Astro's built-in `client:visible` directive defers script execution until the component scrolls into viewport — perfect for a heavy interactive island below the fold.

- [ ] **Step 1: Verify KaplayPlayground is currently eager**

```bash
grep -n "KaplayPlayground" src/pages/index.astro
```

Expected: `<KaplayPlayground />` with no `client:*` directive.

- [ ] **Step 2: Check if KaplayPlayground.astro has a client-script island that triggers on mount**

```bash
head -30 src/components/KaplayPlayground.astro
```

If it uses `<script>` tags directly (Astro hoisted scripts), those run on every page that includes the component, regardless of `client:*`. In that case `client:visible` won't help — we'd need to refactor the script into a function called from `IntersectionObserver`.

If it's a React island or framework component, `client:visible` works directly.

- [ ] **Step 3: Apply lazy strategy based on Step 2 findings**

**Branch A — Astro hoisted `<script>`** (most likely):

In `src/components/KaplayPlayground.astro`, find the inline `<script>` block. Wrap the body in an IntersectionObserver:

```astro
<script>
  // Defer mount until the playground container is visible.
  const stage = document.querySelector('.kc-stage');
  if (stage) {
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        io.disconnect();
        // (existing init code goes here, wrapped or extracted to mount())
        mount();
      }
    }, { rootMargin: '200px' });
    io.observe(stage);
  }

  async function mount() {
    const { initKaplayPlayground } = await import('../bots/kaplay.engine.ts');
    // ... rest of existing init
  }
</script>
```

The `await import()` produces a separate chunk that isn't loaded until `mount()` runs. Bundler handles this automatically.

**Branch B — `client:visible` works as-is**:

Edit `src/pages/index.astro:13`:

Find:
```astro
<KaplayPlayground />
```

Replace with:
```astro
<KaplayPlayground client:visible />
```

- [ ] **Step 4: Build + verify chunk-splitting**

```bash
npm run build 2>&1 | tail -5
du -h dist/_astro/*.js | sort -hr | head -8
```

Expected: a new chunk like `KaplayPlayground.[hash].js` is no longer in the entry-graph for `/` — it loads on intersection.

- [ ] **Step 5: Smoke-test in browser**

Open `/` with Network tab open. Initial page load should NOT include `KaplayPlayground.*.js`. Scroll down — chunk loads, playground initializes.

- [ ] **Step 6: Commit**

```bash
git add src/components/KaplayPlayground.astro src/pages/index.astro
git commit -m "perf(home): lazy-load KaplayPlayground (276 KB) until in viewport"
```

---

### Task 8: SEO — sitemap + robots.txt

**Files:**
- Create: `public/robots.txt`
- Modify: `astro.config.mjs` (add @astrojs/sitemap)
- Modify: `package.json` (add @astrojs/sitemap dep)

- [ ] **Step 1: Install @astrojs/sitemap**

```bash
npm install @astrojs/sitemap
```

- [ ] **Step 2: Add to astro.config.mjs**

Edit `astro.config.mjs`:

Find:
```javascript
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
```

Add:
```javascript
import sitemap from '@astrojs/sitemap';
```

Find:
```javascript
integrations: [react(), mdx()],
```

Replace:
```javascript
integrations: [react(), mdx(), sitemap()],
```

- [ ] **Step 3: Create `public/robots.txt`**

```
User-agent: *
Allow: /
Disallow: /_astro/

Sitemap: https://craftcode-site.pages.dev/sitemap-index.xml
```

- [ ] **Step 4: Build + verify sitemap is generated**

```bash
npm run build 2>&1 | grep -i sitemap
ls dist/sitemap*.xml
head -20 dist/sitemap-index.xml
```

Expected: `sitemap-index.xml` and at least one `sitemap-N.xml` in dist.

- [ ] **Step 5: Verify robots.txt copied through**

```bash
cat dist/robots.txt
```

Expected: matches what we wrote.

- [ ] **Step 6: Commit**

```bash
git add astro.config.mjs package.json package-lock.json public/robots.txt
git commit -m "feat(seo): generate sitemap.xml + add robots.txt"
```

---

## Phase 2 — CI / automation

### Task 9: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `scripts/check-bundle-size.mjs`

CI runs on every push/PR: typecheck, build, audit, bundle-size budget, header presence check.

- [ ] **Step 1: Create `scripts/check-bundle-size.mjs`**

```javascript
/**
 * Bundle-size budget check — fails CI if any per-route or total JS
 * payload exceeds the budget table. Run after `npm run build`.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const astroDir = path.join(root, 'dist/_astro');

const BUDGET_TOTAL_KB = 700;       // total JS across all chunks
const BUDGET_PER_FILE_KB = 320;    // any single chunk

async function main() {
  const files = (await fs.readdir(astroDir)).filter((f) => f.endsWith('.js'));
  let totalKB = 0;
  let failed = false;
  console.log('Bundle-size check:');
  for (const f of files) {
    const stat = await fs.stat(path.join(astroDir, f));
    const kb = stat.size / 1024;
    totalKB += kb;
    const flag = kb > BUDGET_PER_FILE_KB ? '❌ OVER BUDGET' : 'OK';
    if (kb > BUDGET_PER_FILE_KB) failed = true;
    console.log(`  ${f.padEnd(60)} ${kb.toFixed(1).padStart(7)} KB  ${flag}`);
  }
  console.log(`Total JS: ${totalKB.toFixed(1)} KB / ${BUDGET_TOTAL_KB} KB budget`);
  if (totalKB > BUDGET_TOTAL_KB) {
    console.error(`❌ Total JS exceeds budget by ${(totalKB - BUDGET_TOTAL_KB).toFixed(1)} KB`);
    failed = true;
  }
  if (failed) process.exit(1);
  console.log('✅ Bundle within budget.');
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  build-and-check:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - name: Install
        run: npm ci

      - name: Audit (high+critical fails)
        run: npm audit --audit-level=high

      - name: Typecheck
        run: npx astro check

      - name: Build
        run: npm run build

      - name: Bundle-size budget
        run: node scripts/check-bundle-size.mjs

      - name: Verify _headers exists with CSP
        run: |
          test -f dist/_headers || (echo "::error::dist/_headers missing" && exit 1)
          grep -q "Content-Security-Policy" dist/_headers || (echo "::error::CSP missing in _headers" && exit 1)
          grep -q "Strict-Transport-Security" dist/_headers || (echo "::error::HSTS missing in _headers" && exit 1)
          echo "✅ _headers OK"

      - name: Verify sitemap exists
        run: |
          test -f dist/sitemap-index.xml || (echo "::error::sitemap missing" && exit 1)
          test -f dist/robots.txt || (echo "::error::robots.txt missing" && exit 1)
          echo "✅ SEO files OK"
```

- [ ] **Step 3: Test workflow locally (optional but recommended)**

If `act` is installed:
```bash
act -j build-and-check
```

Otherwise, push to a branch and inspect Actions tab on GitHub.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml scripts/check-bundle-size.mjs
git commit -m "ci: add typecheck/build/audit/size/header checks"
```

After push, verify on GitHub: `https://github.com/CRAFTCODE-CJD/craftcode-site/actions`. First run should be green.

---

### Task 10: Lighthouse CI workflow

**Files:**
- Create: `.github/workflows/lighthouse.yml`
- Create: `lighthouserc.json`

- [ ] **Step 1: Create `lighthouserc.json` at repo root**

```json
{
  "ci": {
    "collect": {
      "startServerCommand": "npx serve dist -l 4321 -s",
      "url": [
        "http://localhost:4321/",
        "http://localhost:4321/plugins/sprite-optimizer/",
        "http://localhost:4321/plugins/mouseinterceptor/"
      ],
      "numberOfRuns": 3,
      "settings": {
        "preset": "desktop"
      }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.85 }],
        "categories:accessibility": ["error", { "minScore": 0.90 }],
        "categories:best-practices": ["error", { "minScore": 0.95 }],
        "categories:seo": ["error", { "minScore": 0.95 }]
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

Performance threshold 0.85 (not 0.90) for slack on CI runners which are slower than dev machines.

- [ ] **Step 2: Create `.github/workflows/lighthouse.yml`**

```yaml
name: Lighthouse CI

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - name: Install
        run: npm ci

      - name: Build
        run: npm run build

      - name: Install LHCI
        run: npm install -g @lhci/cli@0.14.x serve

      - name: Run Lighthouse
        run: lhci autorun
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
```

The `LHCI_GITHUB_APP_TOKEN` is optional — without it, runs still happen, just no PR comment. Add later if desired.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/lighthouse.yml lighthouserc.json
git commit -m "ci: add Lighthouse CI on PRs (perf 85+, a11y 90+, BP 95+, SEO 95+)"
```

---

### Task 11: Husky pre-commit hook

**Files:**
- Create: `.husky/pre-commit`
- Modify: `package.json` (add `prepare` script + lint-staged config)
- Add deps: `husky`, `lint-staged`

- [ ] **Step 1: Install dev deps**

```bash
npm install --save-dev husky lint-staged
```

- [ ] **Step 2: Initialize husky**

```bash
npx husky init
```

This creates `.husky/pre-commit` with a default `npm test` line.

- [ ] **Step 3: Replace `.husky/pre-commit` content**

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Block commit if staged TS/Astro files don't typecheck or pass lint.
npx lint-staged
```

- [ ] **Step 4: Add lint-staged config to `package.json`**

Add at top level (after `"scripts"`):

```json
"lint-staged": {
  "*.{ts,tsx,astro}": [
    "node -e \"console.log('typecheck staged files')\""
  ],
  "*.{json,md,yml,yaml}": [
    "node -e \"console.log('format placeholder')\""
  ]
}
```

NOTE: TypeScript can't typecheck individual files without project context, so the placeholder above just prints. The actual typecheck happens on full project via `astro check` in CI (Task 9). A more useful hook here would be Prettier formatting, but if Prettier isn't already configured, defer to a future task. For now the hook is a safety stub.

If you want a stronger hook NOW: install Prettier (`npm i -D prettier`), add `*.{ts,tsx,astro,json,md,yml}: prettier --write` to lint-staged. Skip this step if Prettier isn't already in the project — adding it changes formatting on every commit and creates a giant churn PR.

- [ ] **Step 5: Test hook locally**

```bash
echo "// trivial" >> src/components/Topbar.astro
git add src/components/Topbar.astro
git commit -m "test: husky hook"
git reset --hard HEAD~1  # undo the test commit
```

Expected: hook fires (you see "typecheck staged files" or similar).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .husky
git commit -m "chore: add husky + lint-staged pre-commit safety stub"
```

---

### Task 12: Dependabot

**Files:**
- Create: `.github/dependabot.yml`

- [ ] **Step 1: Create `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
      day: monday
      time: "06:00"
    open-pull-requests-limit: 5
    groups:
      minor-and-patch:
        patterns:
          - "*"
        update-types:
          - minor
          - patch
    labels:
      - dependencies
    commit-message:
      prefix: "chore(deps)"
      include: scope

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: monthly
    labels:
      - dependencies
      - ci
    commit-message:
      prefix: "chore(ci)"
```

This groups all minor+patch npm updates into ONE weekly PR. Majors get their own PR (one per package) so you can review breaking changes individually.

- [ ] **Step 2: Commit**

```bash
git add .github/dependabot.yml
git commit -m "ci: add dependabot weekly minor/patch grouping"
```

After push, Dependabot will fire its first scan within ~24 h and open a PR if updates are due.

---

## Phase 3 — Verification

### Task 13: Run all checks + write postmortem

**Files:**
- Modify: `docs/audit-2026-04-25.md` (fill in "After" section)

Final verification: run every metric we baselined in Task 1, capture deltas, document outcomes.

- [ ] **Step 1: Wait for Cloudflare to redeploy**

Push the prior commits and wait until the Cloudflare Pages dashboard shows "Production deployment ready" (~1-2 min).

```bash
# Verify the deploy is live by hitting the homepage
curl -sI https://craftcode-site.pages.dev/ | head -5
```

- [ ] **Step 2: Capture security headers via curl**

```bash
curl -sI https://craftcode-site.pages.dev/ | grep -iE "content-security|strict-transport|x-frame|x-content-type|referrer|permissions|cross-origin"
```

Expected: all 7 headers present.

- [ ] **Step 3: Run securityheaders.com**

```bash
curl -s "https://securityheaders.com/?q=https%3A%2F%2Fcraftcode-site.pages.dev%2F&hide=on&followRedirects=on" -o /tmp/sh.html
grep -oE "grade[^>]*>[A-F][+-]?" /tmp/sh.html | head -1
```

Or open in browser: `https://securityheaders.com/?q=https://craftcode-site.pages.dev/`. Expected grade: A or A+.

- [ ] **Step 4: Run Mozilla Observatory**

Open `https://observatory.mozilla.org/analyze/craftcode-site.pages.dev`. Wait for scan (~30 s). Note the letter grade.

- [ ] **Step 5: Run Lighthouse against deployed URLs**

```bash
npx lighthouse https://craftcode-site.pages.dev/ --output=json --output-path=/tmp/lh-home.json --chrome-flags="--headless" --quiet
npx lighthouse https://craftcode-site.pages.dev/plugins/sprite-optimizer/ --output=json --output-path=/tmp/lh-plugin.json --chrome-flags="--headless" --quiet
```

Extract scores:
```bash
node -e "const r = require('/tmp/lh-home.json'); for (const k of ['performance','accessibility','best-practices','seo']) console.log(k, Math.round(r.categories[k].score * 100));"
```

- [ ] **Step 6: Capture final bundle sizes**

```bash
du -sh dist
du -sh dist/_astro
du -h dist/_astro/*.js | sort -hr
```

- [ ] **Step 7: Capture final image inventory**

```bash
du -sh public/images dist/images
find dist/images -name "*.webp" | wc -l
```

- [ ] **Step 8: Final npm audit**

```bash
npm audit
```

- [ ] **Step 9: Fill in "After" section of `docs/audit-2026-04-25.md`**

Append below the "After (post-P3)" header:

```markdown
## After (post-P3)

### Bundle sizes (dist/_astro)

| File | Before | After | Δ |
|---|---|---|---|
| (compare against Task 1 baseline) |

Total: (before) → (after)

### Images

- WebP files: 0 → N
- Total dist/images: (before) → (after)

### npm audit

(After output)

### Lighthouse scores

| Page | Performance | A11y | Best Practices | SEO |
|---|---|---|---|---|
| `/` | N | N | N | N |
| `/plugins/sprite-optimizer/` | N | N | N | N |

### Security headers (securityheaders.com)

Grade: ?

### Mozilla Observatory

Grade: ?

## Outcomes

- [x] CSP enforced
- [x] HSTS preload-eligible
- [x] WebP variants for all PNGs > 0 KB
- [x] CI: build, audit, size, headers, sitemap checks
- [x] Lighthouse CI on PRs
- [x] Pre-commit hook
- [x] Dependabot weekly group PRs

## Deferred / known issues

(any moderate audit issues, future improvements, etc.)

## Recommendations for next audit (~6 mo)

- Re-run Lighthouse after major content additions
- Review CSP report-only logs (when added later)
- Run `npm audit` and bump majors deliberately
```

- [ ] **Step 10: Commit final audit doc**

```bash
git add docs/audit-2026-04-25.md
git commit -m "docs: complete site-audit postmortem with after-state metrics"
git push origin main
```

---

## Self-Review

Running through the spec checklist against this plan.

**Spec coverage:**

| Spec section | Plan task |
|---|---|
| P0.1 _headers (CSP/HSTS/etc) | Task 2 |
| P0.2 npm audit + lockfile | Task 3 |
| P0.3 PNG → WebP | Task 4 |
| P1.1 i18n bundle split | Task 5 |
| P1.2 Font loading | Task 6 |
| P1.3 Defer KaplayPlayground | Task 7 |
| P1.4 Sitemap + robots.txt | Task 8 |
| P2.1 GitHub Actions CI | Task 9 |
| P2.2 Lighthouse CI | Task 10 |
| P2.3 Pre-commit hook | Task 11 |
| P2.4 Dependabot | Task 12 |
| P3.1-P3.5 Verification + postmortem | Task 1 (baseline) + Task 13 (after) |

All spec sections covered.

**Placeholder scan:**
- Task 6 Step 3 has "actual URLs from that output" — this is intentional; URLs change weekly and must be fetched at implementation time. Acceptable.
- Task 1 doc template has `(paste output)` placeholders — these are the format the engineer fills in. Acceptable for a doc template.
- Task 11 Step 4 lint-staged stub — explicitly flagged as a stub with rationale.
- No "TBD"/"TODO" remaining.

**Type consistency:**
- `loadDict` (Task 5) returns `Promise<Dict>` — used internally only.
- `mount()` (Task 7) is a fresh function name, not used elsewhere.
- Bundle-size budget script (Task 9) is self-contained.

No type collisions across tasks.

**Risk:** Task 7 has a Branch A/B fork — engineer must read step 2 output to choose. Acceptable since the choice is mechanical.

Plan is ready for execution.
