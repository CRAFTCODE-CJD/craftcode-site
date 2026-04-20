# CraftCode Site — Design Brief

> **Status:** direction-finding stage. Mockup exists (`public/preview.html`), final theme not decided yet.
> **Owner:** Jonathan (tkalenko.1995335@gmail.com)
> **Last updated:** 2026-04-20

---

## 1. What this site IS

A **documentation + hub portal** for CraftCode's plugins and games. Users come here to:
- Read manuals, guides, changelogs for plugins they already own
- Browse the CraftCode catalog and find link-outs to storefronts
- (Future) Read about the games and use companion tools

## 2. What this site IS NOT

- **NOT a store.** Plugins are sold on [FAB](https://www.fab.com/) and other marketplaces. The site links OUT to purchase, never sells directly.
- **NOT a marketing-first lander.** No conversion funnels, no A/B-tested CTAs. Character + clarity > persuasion.
- **NOT a blog-first site.** Blog may exist, but docs are the core.

## 3. Brand

- **Name:** CraftCode
- **Tagline (implicit):** tools crafted by devs, for game devs
- **Logo:**
  - `public/logo/craftcode_icon.png` — hammer + ruler crossed (heraldic craftsman motif)
  - `public/logo/craftcode_wide.png` — wordmark `CRAFT [icon] CODE`
  - Currently **white outline only** (designed for dark video). Needs:
    - Dark-on-light variant (for light themes)
    - Simplified favicon-mono (readable at 16px)
    - SVG vectorisation (currently PNG)
    - Optional: animated variant (hammer tick) for topbar
- **Personality keywords:** craftsman, precise, game-dev-native, quietly opinionated, not corporate, not startup-y

## 4. Audience

- Primary: **Unreal Engine developers** (C++/Blueprint) who bought Sprite Optimizer / ManualSprite on FAB
- Secondary: Unity, Godot, GameMaker, Defold devs (cross-engine support)
- Tertiary (future): game players / VN fans for game pages
- **Reading context:** technical, often checking for a specific answer, reference-driven. Dark-mode heavy.

## 5. Product roadmap (shapes site architecture)

| # | Product | Status | Themed accent |
|---|---|---|---|
| 1 | Sprite Optimizer (UE plugin) | Live on FAB | sprite-pink `#EC4899` |
| 2 | ManualSprite (UE plugin) | Update planned | sprite-pink (same family) |
| 3 | Isometric TopDownShooter (game, Alien Shooter 2 spirit) | Planned | radar-green `#10B981` |
| 4 | Visual Novel Engine (complex — point-and-click, dialogues, Crime Board, puzzles, squads, relationships) | Planned | evidence-red `#DC2626` |

Site must scale from **1 plugin today → 4+ products in 12 months** without redesign.

## 6. UX principles (non-negotiable)

- **Users must never feel lost.** Multiple redundant "you are here" cues:
  - Topbar active section underlined with accent
  - Context strip: `← All Plugins | <product> vN | <engines supported>`
  - Breadcrumbs in every doc (`Plugins :: SpriteOptimizer :: Guides :: Atlas Editor`)
  - Sidebar "You are here" marker on active item
- **One click home / one click to catalog** always visible
- **Maximum 3 levels of nesting** in any nav
- **Light feel.** If an element doesn't help the user locate or navigate, consider removing it

## 7. Technical stack (decided)

- **Framework:** Astro + Starlight (docs theme) — not yet scaffolded
- **Hosting:** Cloudflare Pages (free tier)
- **Domain:** `craftcode.pages.dev` initially, custom domain later
- **Project folder:** `F:\SpriteOptimizer-CrossEngine\craftcode-site\`
- **Search:** Starlight's built-in Pagefind (no external service)
- **Analytics:** TBD — GoatCounter or Plausible candidates
- **Dev server:** `python -m http.server 4321 --directory craftcode-site/public` (for preview stage) → later `npm run dev`

## 8. Design direction explored

### Primary concept: **Toolsmith**
Blueprint-engineer + C++/UE-native dev aesthetic, **restrained**. Casual visitor sees clean docs; UE-dev sees "this was built by one of us" in the small details.

**Signature details** (implemented in `preview.html`):
- Breadcrumbs use C++ namespace separator: `A :: B :: C`
- Page metadata looks like C++ comments: `// Last updated  2026-04-20`
- Link hover reveals a **Blueprint-pin dot** (UE Event Graph connector style) next to the link
- Hero images get a **dimension line** with `1920 × 1080` label above (technical drawing motif)
- Code blocks styled like UE's default C++ syntax highlighting
- Toast `// copied` on code copy
- Logo hammer does a single tick animation on hover (not looped)

### Seven theme variants live in the mockup

| Theme | Type | Vibe | Use case |
|---|---|---|---|
| **Paper** | Light (default) | Warm parchment + copper | Classic docs manual |
| **Blueprint** | Light | Architect's pale blue + orange | Technical drawing feel |
| **Swiss** | Light | Pure white + black + red | Editorial minimalism |
| **Midnight** | Dark | Deep blue-ink + copper | Refined dark docs |
| **Terminal** | Dark | CRT green on black | Hacker/tmux aesthetic |
| **Forge** | Dark | Warm brown + ember orange | Workshop at night |
| **Carbon** | Dark | Neutral gray + electric blue | Modern dev tool |
| **Arcade ★** | Dark | Pixel + magenta + yellow, CRT scanlines | Retro boot screen / game-dev native |

**"Arcade"** was added after user shared an Eggent-like reference — closest to the game-dev aesthetic. Risk: pixel H1 gets tiring if used on every docs page; likely use only on landings + H1-hero moments.

## 9. Design tokens (current Toolsmith — Paper theme)

### Color
```
--bg         #FAF7F0    warm parchment
--surface    #FFFFFF    cards, code backgrounds
--ink        #1C1A17    primary text
--muted      #5C554C    metadata, comments
--faint      #8B8578    dividers, tertiary
--border     #E5DFD0    all borders, grid
--grid       #E5DFD0    background grid (0.4 opacity via overlay)
--accent     #B45309    copper — brand CTA
--link       #1E40AF    UE Blueprint-pin blue
--code-bg    #F3EFE3    code block background
--highlight  #FEF3C7    selection / callout
```
Dark (`Midnight`), Blueprint, Swiss, Terminal, Forge, Carbon, Arcade — see `public/preview.html` inside `[data-theme="<name>"]` blocks.

### Typography
- **Display/headings:** Fraunces (variable serif, 400–700)
- **Body:** Inter (variable sans, 400–700)
- **Mono (code, breadcrumbs, metadata):** JetBrains Mono (400–600)
- **Arcade additions:** Press Start 2P (pixel display), VT323 (CRT mono)

### Scale (body → display)
```
Body         16 px / 1.65
H3           20 px / 1.30
H2           26 px / 1.25
H1           42 px / 1.08
Metadata     13 px / 1.80 mono
```

### Spacing rhythm
- Base unit: 4px
- Card/block padding: 16–20px
- Section gap: 32–40px
- Grid column gap (article shell): 48px
- Max article width: 740px
- Page max width: 1280px
- Sidebar: 260px · Article: fluid · Right rail ToC: 220px (hidden < 1100px)

### Radius
- Default: 6px
- Badges: 3–4px
- Modals/cards: 8–10px

### Grid background
- `linear-gradient` 32×32 px grid
- Overlay `var(--bg)` at 0.82 opacity to fade it

## 10. Component inventory (what's built in preview.html)

- [x] Topbar (brand, nav, search button, theme toggle)
- [x] Context strip (back-link + current product + version badge + platforms)
- [x] Three-column shell (sidebar 260 · article fluid · ToC 220)
- [x] Sidebar with `// group` labels, active-item pink border + `◂` marker
- [x] Breadcrumbs with `::` C++-namespace separators
- [x] H1 / metadata block / ticked divider
- [x] Hero figure with dimension line + "Fig. N" caption
- [x] Callout box (`// Note`)
- [x] Code block with UE syntax tokens + hover-reveal copy button
- [x] Page-nav footer (prev/next cards)
- [x] Right rail ToC (On This Page)
- [x] Theme toggle (sun/moon — cycles Paper ↔ Midnight)
- [x] Demo panel (preview-only — NOT in production)
- [x] Toast (`// copied`)
- [ ] **Not yet built:** main landing page (`/`), plugin catalog page (`/plugins`), plugin landing page, 404, search modal, mobile menu, Crime Board widget (VN engine), Radar scroll (Iso), per-product theme overrides

## 11. Inspiration references

- **Eggent-style retro boot** (what prompted the Arcade theme) — pixel H1 + magenta + yellow stacked chromatic text, CRT scanlines
- **Linear docs** — restrained navigation, strong typographic hierarchy
- **Stripe docs** — sidebar+ToC+article three-col
- **Tailwind docs** — accent animations, demo panels
- **Vercel docs** — dark-first with clean mono accents
- **Starlight examples** — https://starlight.astro.build/resources/showcase/
- **UE editor UI** — for C++ syntax colors + Blueprint-pin motif

## 12. Open design decisions (need answers to proceed)

| # | Question | Constraint | Options |
|---|---|---|---|
| Q1 | **Default theme for production?** | User said "not a fan of light (Paper)" | Midnight, Arcade, Carbon, or Forge — user leaning toward Arcade-style |
| Q2 | **Arcade application scope?** | Pixel fonts tiring on long reading | (a) entire site / (b) landings only, docs use calmer theme / (c) one page of arcade per product landing |
| Q3 | **Accent colors per-product** | Sprite pink, Iso green, VN red set | Keep as-is OR swap to brand-copper with only tiny accent dot differing |
| Q4 | **Homepage concept** | Hub, not sales | (a) Workbench visual (tools laid out) / (b) Splash w/ hero + catalog grid / (c) Terminal boot-sequence animation |
| Q5 | **404 / empty states** | Opportunity for character | Arcade: `// ERROR — missing sprite` / Toolsmith: `// undefined reference to '/path'` |
| Q6 | **Logo redesign scope** | Currently white PNG outline | Vectorise as-is / redraw cleaner / add animated version |
| Q7 | **Custom cursor?** | Arcade theme reference has big pixel cursor | Only on landing, or site-wide, or not at all |
| Q8 | **Hero on landings** | Need something big and distinctive | Pixel-stacked H1 / animated terminal typing / static editorial / workbench illustration |

## 13. What the designer needs to do next

**In priority order:**

1. **Pick default theme** (Q1) — open `public/preview.html` in browser, cycle through 8 themes via demo panel bottom-right, decide. (Then I'll lock it in as `:root` default.)
2. **Resolve Arcade scope** (Q2) — how much of the site gets the retro treatment.
3. **Design the landing page** (Q4) — only page not yet mocked up. This sets the tone.
4. **Finalise logo variants** (Q6) — a clean SVG set (light/dark/mono/animated) unlocks everything else.
5. **Sketch per-product hero** — how does Sprite Optimizer's plugin-landing page look different from ManualSprite's? How does the VN-engine's Crime-Board landing work visually?

## 14. Handoff files

| What | Path |
|---|---|
| Live mockup (open in browser) | `F:\SpriteOptimizer-CrossEngine\craftcode-site\public\preview.html` |
| Logo source (PNG, white outline) | `F:\SpriteOptimizer-CrossEngine\VideoProjects\logo\craftcode_icon.png` |
| Logo wordmark | `F:\SpriteOptimizer-CrossEngine\VideoProjects\logo\craftcode_wide.png` |
| Copy of logo for site | `F:\SpriteOptimizer-CrossEngine\craftcode-site\public\logo\` |
| Screenshots for docs (30 files) | `F:\SpriteOptimizer-CrossEngine\Sprite-Optimizer-main\Images\` |
| Hero gallery (8 × 1920×1080) | `F:\SpriteOptimizer-CrossEngine\Sprite-Optimizer-main\Gallery\` |
| Content source (README) | `F:\SpriteOptimizer-CrossEngine\Sprite-Optimizer-main\README.md` |
| This brief | `F:\SpriteOptimizer-CrossEngine\craftcode-site\DESIGN-BRIEF.md` |
| Design tokens (CSS vars) | `public/preview.html` — inside `<style>` block, `:root {}` and `[data-theme="*"] {}` |
| Server config | `F:\SpriteOptimizer-CrossEngine\.claude\launch.json` |

## 15. How to run the mockup locally

```
cd F:\SpriteOptimizer-CrossEngine
python -m http.server 4321 --directory craftcode-site/public
```
Then open http://localhost:4321/preview.html

Or use the Claude Code preview server: `preview_start` with `craftcode-preview-static`.

## 16. Coming back to Claude Code to iterate

Concrete asks that work well:
- "Switch default theme to Midnight"
- "Add a `Blueprint Pro` theme variant with desaturated palette"
- "Mock up the landing page for `/` with the Workbench concept"
- "Design the 404 page for Arcade theme"
- "Generate SVG versions of the logo"

Avoid vague: "make it nicer" / "more modern". Specific constraints produce better results.
