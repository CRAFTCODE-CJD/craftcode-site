# Plugin Repo Deliverables

Эти файлы нужно скопировать в соответствующие репозитории плагинов:
- `Sprite-Optimizer/` → https://github.com/CRAFTCODE-CJD/Sprite-Optimizer
- `ManualSprite/`    → https://github.com/CRAFTCODE-CJD/ManualSprite
- `MouseInterceptor/` → https://github.com/CRAFTCODE-CJD/MouseInterceptor

## Что в каждой папке

- `manifest.json` — корневой манифест плагина. Site читает его с
  `https://raw.githubusercontent.com/CRAFTCODE-CJD/<repo>/main/manifest.json`.
  Заполни name/description (EN+RU), image, docs. Поля `version` и `updated`
  будет обновлять workflow автоматически.
- `.github/workflows/manifest.yml` — автоматизация. Триггеры:
  - `release: published` — подставляет тэг релиза в `version`.
  - `push: main` (на изменения `manifest.json` или workflow) — обновляет `updated`.
  Коммитит изменения обратно в `main` под ботом `github-actions[bot]`.

## Как поставить

В каждом репо:

```bash
# скопируй deliverables/<repo>/manifest.json → корень репо
# скопируй deliverables/<repo>/.github/workflows/manifest.yml → .github/workflows/
git add manifest.json .github/workflows/manifest.yml
git commit -m "chore: add craftcode site manifest + auto-updater"
git push
```

После этого:
- создай новый release с тэгом `vX.Y.Z` → workflow впишет `X.Y.Z` в `manifest.json`.
- сайт (craftcode-site) при следующей сборке подтянет обновлённый манифест.

## Формат манифеста

```json
{
  "slug":        "<url-slug>",
  "repo":        "<GitHub repo name>",
  "name":        { "en": "...", "ru": "..." },
  "version":     "0.0.0",
  "description": { "en": "...", "ru": "..." },
  "image":       "",
  "video":       "",
  "docs":        "",
  "updated":     "ISO-8601 (UTC)",
  "accent":      "#EC4899"
}
```

`slug` и `repo` должны совпадать с записями в
`src/lib/github/manifest.ts:PLUGIN_REGISTRY` на сайте.
