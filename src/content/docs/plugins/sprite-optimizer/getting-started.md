---
title: Быстрый старт
description: Первые шаги с Sprite Optimizer — установка и создание первого атласа.
sidebar:
  order: 2
---

## Установка

Плагин ставится через **FAB Marketplace** — после покупки он доступен через Epic Games Launcher.

1. Открой **Epic Games Launcher → Библиотека → Vault**.
2. Найди **Sprite Optimizer** и нажми **Install to Engine** (или **Add to project**).
3. Перезапусти редактор.
4. В меню **Edit → Plugins** убедись, что **Sprite Optimizer** включён.

> Поддерживаются UE 4.27 и 5.0–5.7. Один плагин — все версии.

---

## Первые шаги

### Шаг 1 — выбери текстуры

Открой **Content Browser**, выдели одну или несколько текстур/спрайтов.

### Шаг 2 — контекстное меню

Нажми **ПКМ** → в секции **Sprite Optimizer** выбери нужное действие:

| Действие | Описание |
|----------|----------|
| **Optimize** | Обрезать прозрачные края |
| **Atlas** | Открыть полный редактор атласа |
| **Quick Atlas** | Создать атлас сразу на настройках по умолчанию |
| **Import Atlas** | Реверс-инжиниринг готового атласа |

При выборе нескольких текстур доступны Optimize, Atlas, Quick Atlas, Analyze.  
При выборе одной — дополнительно Import Atlas.

---

## Создание первого атласа

1. Выдели 2+ текстуры в Content Browser.
2. ПКМ → **Atlas** — откроется редактор.
3. Нажми **F5** (Analyze) — алгоритм расставит текстуры по атласу.
4. При желании перетащи элементы вручную, измени размер страницы.
5. Нажми **Ctrl+Shift+Enter** (Create Atlas) — атлас, спрайты и Material Instances сохранятся рядом с исходниками.

```
Content/YourFolder/
├── MyAtlas.uasset              ← атлас-текстура
├── MyAtlas_Project.uasset      ← сессия редактирования (открыть двойным кликом)
├── MyAtlas_Sprite1.uasset      ← сгенерированный спрайт
└── MyAtlas_Sprite1_MI.uasset   ← Material Instance с UV-параметрами
```

---

## Быстрый атлас (Quick Atlas)

Для простых случаев — выдели 2+ текстур, ПКМ → **Quick Atlas**. Атлас создаётся мгновенно на настройках из Project Settings без открытия редактора.

---

## Что дальше

- [Optimize Mode](/plugins/sprite-optimizer/features/optimize/) — детали обрезки прозрачности
- [Atlas Mode](/plugins/sprite-optimizer/features/atlas/) — полный разбор редактора атласа
- [Sprite Optimizer Project](/plugins/sprite-optimizer/features/project-asset/) — как сохранять и возобновлять сессии
- [Справка](/plugins/sprite-optimizer/reference/) — все горячие клавиши и настройки
