# CraftCode Site

Documentation + info hub for CraftCode plugins and games.
Not a store — plugins are sold on [FAB](https://www.fab.com/).

**Status:** design exploration · Astro Starlight not yet scaffolded
**Stack:** Astro + Starlight + Cloudflare Pages
**Live mockup:** `public/preview.html` — open in browser, cycle through 8 theme variants via the demo panel (bottom-right)

## Structure

```
craftcode-site/
├── DESIGN-BRIEF.md          ← full design spec (brand, tokens, open questions)
├── README.md                ← you are here
├── public/
│   ├── preview.html         ← single-file mockup, 8 themes
│   ├── logo/
│   │   ├── craftcode_icon.png
│   │   └── craftcode_wide.png
│   └── images/
│       └── sprite-optimizer/gallery/
└── .gitignore
```

## Local preview

```bash
python -m http.server 4321 --directory public
# open http://localhost:4321/preview.html
```

## Planned products

1. **Sprite Optimizer** (UE plugin, live on FAB) — sprite-pink accent
2. **ManualSprite** (UE plugin, update planned) — sprite-pink accent
3. **Isometric TopDownShooter** (game, planned) — radar-green accent
4. **Visual Novel Engine** (planned — Crime Board, dialogues, puzzles, squads, relationships) — evidence-red accent

See [`DESIGN-BRIEF.md`](DESIGN-BRIEF.md) for the full spec.

## UX principle

Users must never feel lost. Multiple redundant "you are here" cues on every page.

## License

MIT — see `LICENSE` (to be added).

## Author

Jonathan · [CRAFTCODE-CJD](https://github.com/CRAFTCODE-CJD)
