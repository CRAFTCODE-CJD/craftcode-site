# Site audit — design

**Date**: 2026-04-25  
**Status**: design approved (verbal), pending written review  
**Approach**: Risk-stratified phases (4 phases, single spec)

## Goal

Bring `craftcode-site` (Astro 5 SSG, Cloudflare Pages, pet/pre-launch) to a
production-ready state on three fronts:

1. **Security** — HTTP security headers, CSP, supply-chain hygiene.
2. **Performance** — image optimization, bundle splitting, asset caching,
   Lighthouse-grade scores.
3. **Automation** — CI/CD, pre-commit hooks, dependency updates,
   Lighthouse budget enforcement on every PR.

The site is statically rendered, has no auth/API/DB, and currently has no
real users — so we can apply aggressive changes (strict CSP enforcement,
major asset reorganization) without rollout staging.

## Non-goals

- Major framework migration (Astro 5 stays).
- Migrating away from Cloudflare Pages.
- Internationalization beyond what already exists (EN/RU).
- Refactoring the KAPLAY playground architecture (recently overhauled).

## Findings (current state)

| Area | Observation |
|---|---|
| HTTP headers | No `_headers` file → no CSP, no HSTS, no X-Frame-Options. |
| Bundle | `i18n.js` 288 KB (EN+RU concatenated), `KaplayPlayground.js` 276 KB. |
| Images | 5.0 MB total in `public/images/`, 6 PNGs > 200 KB, **0 WebP**. |
| Caching | No `Cache-Control` on `/_astro/*` (content-hashed → could be `immutable`). |
| Lockfile | `package-lock.json` not visible in repo — needs verification + commit. |
| CI | No GitHub Actions, no pre-commit hook, no automated checks. |
| SEO | No `robots.txt`, no `sitemap.xml`. |
| Lighthouse | Never measured — no baseline. |

## Architecture

This is a **work plan**, not a runtime architecture change. The deliverables
are config files, scripts, and CI workflows — no changes to existing
`src/` runtime code unless required (e.g. `<picture>` switch for WebP).

```
craftcode-site/
├── public/
│   ├── _headers              ← NEW: Cloudflare security + cache headers
│   ├── robots.txt            ← NEW: search-engine policy
│   └── images/
│       └── plugins/**/*.webp ← NEW: WebP variants (built from PNG)
├── scripts/
│   ├── extract-i18n.mjs      ← existing
│   └── optimize-images.mjs   ← NEW: Sharp-based PNG → WebP
├── .github/
│   ├── workflows/
│   │   ├── ci.yml            ← NEW: typecheck + build + size + audit
│   │   └── lighthouse.yml    ← NEW: Lighthouse CI on PRs
│   └── dependabot.yml        ← NEW: weekly dep updates
├── .husky/
│   └── pre-commit            ← NEW: typecheck + lint-staged
├── docs/
│   ├── audit-2026-04-25.md   ← NEW: before/after results
│   └── superpowers/specs/    ← this file
├── astro.config.mjs          ← MODIFY: add @astrojs/sitemap integration
└── package.json              ← MODIFY: add prebuild hook, lint-staged config
```

## Phases

### P0 — Critical security + assets (high impact, low risk)

**P0.1 — `public/_headers`** with security + cache headers.

Security headers:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `Content-Security-Policy:` (composed after live-site domain audit — see Risks)

CSP skeleton (final policy assembled after a `grep` pass over `src/`):

- `default-src 'self'`
- `script-src 'self'` (no inline; Astro's `inlineStylesheets: 'auto'` only inlines CSS)
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` (Astro inlines critical CSS; Google Fonts CSS confirmed in `src/layouts/Base.astro:67`)
- `img-src 'self' data:` (data: for SVG)
- `font-src 'self' https://fonts.gstatic.com` (Google Fonts confirmed: Rubik Pixels, Russo One, Play, Inter, JetBrains Mono, Press Start 2P, VT323)
- `connect-src 'self'`
- `frame-src https://www.youtube.com` (YouTube embeds in `Video.astro`)
- `object-src 'none'`
- `base-uri 'self'`
- `form-action 'self'`
- `upgrade-insecure-requests`

Cache headers:

- `/_astro/*` → `public, max-age=31536000, immutable` (content-hashed bundles)
- `/sprites/*`, `/images/*`, `/logo/*` → same (rarely change, hash-busting via filename)
- `/manifests/*` → `public, max-age=86400` (1 day, may change)
- HTML pages (default `/*` rule) → `public, max-age=300, must-revalidate` (5 min, ETag-based)

**P0.2 — npm audit + lockfile**

- Verify `package-lock.json` exists and is committed; if not, generate via
  `npm install --package-lock-only` and commit.
- Run `npm audit --audit-level=high`. Fix all high+critical via
  `npm audit fix` (no `--force` — won't bump majors silently).
- If majors are flagged → escalate to user, decide per-dep.
- Add `.npmrc` with `audit-level=high` (CI will respect this threshold).

**P0.3 — Image optimization (PNG → WebP)**

- New `scripts/optimize-images.mjs`:
  - Walks `public/images/**/*.png`.
  - For each PNG, if no sibling `*.webp` exists or PNG is newer, emit
    `*.webp` via Sharp at quality 85 (near-lossless for UI screenshots).
  - Skip files in `public/sprites/` (KAPLAY needs raw PNG sheets).
- Add `prebuild` script in `package.json`:
  `"prebuild": "node scripts/optimize-images.mjs"`.
- Update Astro `<Image>` and MDX-rendered images: switch to `<picture>`
  with WebP source + PNG fallback. Add `loading="lazy"` for below-fold.

### P1 — Performance polish (medium impact, medium risk)

**P1.1 — i18n bundle code-split**

- Current `src/i18n/i18n.ts` imports both `en.json` and `ru.json` statically
  → 288 KB for the dual.
- Refactor to dynamic-import the JSON for the current language only.
  Vite/Rollup will emit two ~140 KB chunks instead of one 288 KB.
- Initial language detection (cookie/`<html lang>`) at boot decides which
  to load first. Switch loads the other on demand.

**P1.2 — Font loading**

- Identify which fonts are critical for above-fold (likely Press Start 2P
  for hero titles, VT323 for body kicker, JetBrains Mono for code labels).
- Add `<link rel="preload" as="font" type="font/woff2" crossorigin>` for
  critical fonts.
- Add `font-display: swap` to all `@font-face` rules (no FOIT).
- Subset fonts to Latin + Cyrillic only (drop unused glyphs) — saves
  20-40% per font file.

**P1.3 — Defer KaplayPlayground**

- 276 KB bundle currently loads on `/` even before user scrolls to it.
- Wrap the playground mount in an `IntersectionObserver` that triggers the
  dynamic-import only when the playground container enters the viewport.
- For users who never scroll to it (e.g. mobile bouncing), 276 KB never
  downloads.

**P1.4 — SEO + crawlability**

- Add `@astrojs/sitemap` integration → emits `/sitemap-index.xml` at build.
- Add `public/robots.txt`:
  ```
  User-agent: *
  Allow: /
  Disallow: /_astro/
  Sitemap: https://craftcode-site.pages.dev/sitemap-index.xml
  ```

### P2 — CI / automation (foundation)

**P2.1 — `.github/workflows/ci.yml`**

Triggers: every push to `main`, every PR. Steps:

1. `actions/checkout@v4`
2. `actions/setup-node@v4` with `node-version: 24` and npm cache
3. `npm ci` (uses lockfile, fails if mismatch)
4. `npm audit --audit-level=high` (fails on high/critical)
5. `npx astro check` (typecheck)
6. `npm run build`
7. **Bundle-size budget check** via custom script: total JS ≤ 600 KB,
   per-route JS ≤ 300 KB. Compares `dist/_astro/*.js` sizes against
   budget table.
8. **Header presence check**: `dist/_headers` exists and contains
   `Content-Security-Policy` line.

**P2.2 — `.github/workflows/lighthouse.yml`**

Triggers: every PR.

1. Same checkout + setup-node.
2. `npm run build && npx serve dist -l 3000 &`
3. `lhci autorun` against `http://localhost:3000/` and
   `http://localhost:3000/plugins/sprite-optimizer/`.
4. Budgets in `lighthouserc.json`:
   - Performance ≥ 90
   - Accessibility ≥ 90
   - Best Practices ≥ 95
   - SEO ≥ 95
5. PR comment with score table (lhci action does this natively).

**P2.3 — Pre-commit hook**

- `husky` + `lint-staged` setup.
- Pre-commit: `astro check` (typecheck) on staged `*.astro|*.ts|*.tsx`,
  Prettier on staged source files.
- Fast-fail: if typecheck breaks, commit is blocked locally.

**P2.4 — Dependabot**

- `.github/dependabot.yml` with weekly schedule for `npm` ecosystem.
- Group minors/patches into one PR per week; majors get their own PR.

### P3 — Verification (tests)

Run all checks, capture before/after, document outcomes.

**P3.1 — Lighthouse before/after**

Run Lighthouse manually against deployed Cloudflare URL (after each phase
push). Save scores to `docs/audit-2026-04-25.md`:

| Page | Metric | Before | After |
|---|---|---|---|
| `/` | Performance | ? | ? |
| `/` | LCP | ? | ? |
| `/plugins/sprite-optimizer/` | Performance | ? | ? |
| ... | ... | ... | ... |

**P3.2 — Bundle size before/after**

Capture `dist/_astro/*.js` size table now (before P0) and after P1 lands.
Record total + per-file deltas in audit doc.

**P3.3 — Online security checks**

- `https://securityheaders.com/?q=craftcode-site.pages.dev` — target A or A+.
- `https://observatory.mozilla.org/analyze/craftcode-site.pages.dev` —
  target A.
- Save HTML/screenshot of report to `docs/`.

**P3.4 — npm audit clean run**

`npm audit` after P0.2 should be 0 high / 0 critical. If it still flags
moderate issues — document them in audit doc with rationale ("not
exploitable in static SSG context: ..." or "fix requires major bump,
deferred to next cycle").

**P3.5 — Postmortem**

Single `docs/audit-2026-04-25.md` summarizing: what was found, what was
fixed, before/after metrics, deferred items, recommendations for next
audit cycle (~6 months out).

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| CSP breaks legitimate content (e.g. unknown CDN, tracker, font source) | Audit `src/` for all external domains BEFORE writing CSP. Test on Cloudflare preview deploy before merging to main. |
| Lighthouse CI flakey on slow CI runners | Pin to `lighthouse@latest` 12.x, use 3-run median, allow 5 % slack on perf budget. |
| Major dep bump from `npm audit fix` breaks build | Don't use `--force`. Manual review for any `BREAKING CHANGE` notes. |
| `package-lock.json` grows churn-heavy in CI | `npm ci` only verifies, doesn't write. Lockfile changes happen only in dev via explicit `npm install <pkg>`. |
| WebP not supported by ancient browsers | `<picture>` fallback to PNG → universal support. |
| Husky hook annoys author on every commit | Hook runs only on staged files (lint-staged), typecheck is fast (~2 s). Can `git commit --no-verify` for emergency. |
| Cloudflare Pages doesn't honor _headers in some edge cases | Verify via `curl -I https://...pages.dev/` after deploy. Cloudflare docs explicitly support this file. |

## Testing strategy

Each phase has its own validation step before proceeding:

- **P0**: Build succeeds, `curl -I` shows headers, `npm audit` clean,
  WebP files exist in `dist/`, build still produces 18 pages.
- **P1**: Bundle size table shows i18n split, Lighthouse Performance ≥ 90
  on Cloudflare preview, viewing `/` doesn't load Kaplay bundle until
  scroll.
- **P2**: Push test PR, both workflows run, both pass. Try committing
  broken TypeScript locally → blocked by hook.
- **P3**: All numbers captured in audit doc. Sec-headers grade A+.
  Mozilla Observatory grade A. Lighthouse green.

## Out-of-scope (deferred)

- ARIA / a11y deep audit (Lighthouse a11y score will catch obvious issues;
  full WCAG audit is a separate effort).
- Internationalization expansion beyond EN/RU.
- Search functionality.
- Analytics integration.
- Bot protection / Turnstile (no forms or submission endpoints exist yet).
- E2E tests (Playwright). Static SSG site has minimal interactive surface;
  Lighthouse + visual smoke covers it.
- CMS migration (current MDX flow works fine for current scale).

## Open questions

(none currently — user has approved aggressive rollout, "follow your
recommendations" carte blanche.)

## Approval

- [x] Approach (Variant 3 — risk-stratified phases): user approved verbally
- [x] Scope (Variant C — deep dive with CI): user approved verbally
- [x] Rollout posture (Variant A — pre-launch, aggressive): user approved verbally
- [ ] Written spec review by user
- [ ] Implementation plan (writing-plans skill)

## References

- Astro security best practices: https://docs.astro.build/en/guides/security/
- Cloudflare Pages headers: https://developers.cloudflare.com/pages/configuration/headers/
- OWASP Secure Headers Project: https://owasp.org/www-project-secure-headers/
- web.dev Lighthouse Budgets: https://web.dev/articles/use-lighthouse-for-performance-budgets
- CSP Reference: https://content-security-policy.com/
