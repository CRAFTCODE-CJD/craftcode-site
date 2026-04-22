// ════════════════════════════════════════════════════
//  CraftCode companions — dialogue scene database
// ════════════════════════════════════════════════════
//  Each scene is a typed object. The engine picks by tag, respects
//  cooldowns, weighs by `weight`, gates by `requires(ctx)`, and may
//  mutate shared flags via `effect(ctx)`.
//
//  Scene schema:
//    id        — unique string (cooldown/history tracking)
//    tags      — string[] (e.g. 'idle', 'grab:craft', 'partner_on_throw:craft')
//    weight    — number (default 1; higher = more likely within tier)
//    cooldown  — seconds (default 30; scene can't replay sooner)
//    requires  — (ctx) => bool  (optional predicate)
//    effect    — (ctx) => void  (optional side-effect on play)
//    lines     — [{ who, text, act?, clip?, hold? }]
//      • act   — legacy state: 'wave' | 'surprised' | 'excited' | 'typing'
//      • clip  — rich clip name from CLIPS registry (plays alongside act)
//      • hold  — extra ms to keep the bubble up after typewriter finishes
//
//  LORE & CHARACTER BIBLE
//  (Полный лор: LORE.md в корне репо. Здесь — рабочая шпаргалка.)
//
//  🎭 CRAFT (Коралловый, высокий) — Творец
//     Поверхность: энтузиаст, импульсивный, тёплый, немного забывчивый.
//     Глубина: боится, что его работа "недостаточно настоящая". Ревнует к
//              точности CODE, но глубоко её уважает. Его энергия идёт
//              волнами — от гиперактивности ("искрит") до меланхоличного
//              затишья.
//     Речь: короткие восклицания ("!", "Ого!"), эмоциональные глаголы.
//           Часто начинает длинную метафору и забывает её закончить.
//     Тики: лепит формы из воздуха (sketch_air), покачивается, крутит
//           молоток. Эксклюзивные клипы: hammer, sketch_air.
//     Радости: новый тон краски, круглые фаски, когда CODE улыбается.
//     Страхи: потерять мысль до вечера, обидеть партнёра.
//
//  🧊 CODE (Бирюзовый, широкий) — Инженер
//     Поверхность: точный, методичный, сухой, молчаливый.
//     Глубина: его "сухость" — форма глубокой нежности. Не понимает иронию,
//              но заботится через точность ("3.14 см правее, иначе упадёшь").
//              Боится неточности: "неровное = неспокойное".
//     Речь: короткие фразы, факты, цифры, существительные. Редкий, ОЧЕНЬ
//           сухой юмор.
//     Тики: измеряет расстояние (measure_distance), микро-тайпинг,
//           выравнивание ног. Эксклюзивные клипы: bar, measure_distance.
//     Радости: когда цифры сошлись. Когда тишина "правильной" длины.
//     Страхи: что CRAFT улетит со сквозняком и не вернётся.
//
//  ⚖️ ДИНАМИКА ПАРЫ
//     - CRAFT инициирует, CODE сдерживает и направляет.
//     - Микро-ссоры (из-за миллиметров) и микро-примирения — рутина.
//     - Их объединяет работа над «Чертежом № 7» (Магнум Опус).
//     - НИКАКОЙ четвёртой стены. Вмешательство пользователя = ветер/
//       аномалия/сквозняк/"слой перекрасили".
//
//  🔑 СЛОВАРЬ МАСТЕРСКОЙ
//     Валентин       = любимый тяжёлый камень / гиря
//     Сквозняк       = вмешательство пользователя (drag/throw)
//     Аномалия       = непредвиденное физическое событие
//     Слой перекрасили = смена темы сайта
//     Не по чертежу  = хаос, ошибка
//     Ровно / В допуске = наивысшая похвала от CODE
//     Усадка         = отдых, пауза
//     Шум            = баги, непонятные явления
//     Искрит         = гипер-возбуждение CRAFT
//     Пересчёт       = способ CODE успокоиться
//     Архитектор     = "Первый Архитектор", создатель (отсутствует)
//
//  Adding a new scene: push a new entry into SCENES with a unique id
//  and at least one matching `tags` value. The engine auto-picks it
//  whenever that tag's context fires.
// ════════════════════════════════════════════════════

export const SCENES = [
  // ─── IDLE chatter ────────────────────────────────────
  { id: 'idle.build_idea', tags: ['idle'], weight: 3, cooldown: 80,
    lines: [
      { who: 'craft', text: 'придумал новую форму' },
      { who: 'code',  text: 'чертёж есть?' },
      { who: 'craft', text: 'в голове', act: 'excited' },
      { who: 'code',  text: 'ненадёжное место' },
    ]},

  { id: 'idle.sculpt_air', tags: ['idle'], weight: 2, cooldown: 100,
    lines: [
      { who: 'craft', text: '*лепит в воздухе*', act: 'typing' },
      { who: 'code',  text: 'что это' },
      { who: 'craft', text: 'угол' },
      { who: 'code',  text: 'в нём 91 градус' },
      { who: 'craft', text: 'я старался' },
    ]},

  { id: 'idle.measure_me', tags: ['idle'], weight: 2, cooldown: 90,
    lines: [
      { who: 'code',  text: 'между нами 3.14 см' },
      { who: 'craft', text: 'только что было пять' },
      { who: 'code',  text: 'ты подполз' },
    ]},

  { id: 'idle.breathing', tags: ['idle'], weight: 1, cooldown: 180,
    lines: [
      { who: 'code',  text: 'ты дышишь?' },
      { who: 'craft', text: 'вроде' },
      { who: 'code',  text: 'перестань' },
      { who: 'craft', text: '...' },
      { who: 'code',  text: 'теперь дыши' },
    ]},

  { id: 'idle.what_are_we', tags: ['idle'], weight: 2, cooldown: 140,
    lines: [
      { who: 'craft', text: 'а мы для чего?' },
      { who: 'code',  text: 'строить' },
      { who: 'craft', text: 'что' },
      { who: 'code',  text: 'всё это' },
      { who: 'craft', text: '*оглядывается*' },
    ]},

  { id: 'idle.redo_it', tags: ['idle'], weight: 2, cooldown: 100,
    lines: [
      { who: 'code',  text: 'надо переделать' },
      { who: 'craft', text: 'что именно' },
      { who: 'code',  text: 'я ещё не решил' },
      { who: 'craft', text: 'это опасно звучит' },
    ]},

  { id: 'idle.draft_sketch', tags: ['idle'], weight: 2, cooldown: 120,
    lines: [
      { who: 'craft', text: 'нарисую — покажу' },
      { who: 'code',  text: 'я возьму линейку' },
      { who: 'craft', text: 'не надо', act: 'surprised' },
      { who: 'code',  text: 'поздно' },
    ]},

  { id: 'idle.small_victory', tags: ['idle'], weight: 1, cooldown: 150,
    lines: [
      { who: 'code',  text: 'вчера я подровнял край' },
      { who: 'craft', text: 'какой' },
      { who: 'code',  text: 'не помню какой' },
      { who: 'craft', text: 'но ты помнишь что ровнял' },
      { who: 'code',  text: 'я помню чувство' },
    ]},

  { id: 'idle.listen_quiet', tags: ['idle'], weight: 1, cooldown: 140,
    lines: [
      { who: 'craft', text: 'слышишь как тишина звенит?' },
      { who: 'code',  text: 'это не тишина. это нагрузка' },
      { who: 'craft', text: 'красиво звучит' },
    ]},

  { id: 'idle.count_something', tags: ['idle'], weight: 1, cooldown: 140,
    lines: [
      { who: 'code',  text: 'давай посчитаем' },
      { who: 'craft', text: 'что' },
      { who: 'code',  text: 'что-нибудь' },
      { who: 'craft', text: 'один' },
      { who: 'code',  text: 'достаточно' },
    ]},

  { id: 'idle.valentin', tags: ['idle'], weight: 0.8, cooldown: 400,
    lines: [
      { who: 'craft', text: 'имя камню придумаем?' },
      { who: 'code',  text: 'какому' },
      { who: 'craft', text: 'любому' },
      { who: 'code',  text: 'Валентин' },
      { who: 'craft', text: '...почему' },
      { who: 'code',  text: 'он похож' },
    ],
    effect: (ctx) => ctx.setFlag('valentin_mentioned', 1, 600) },

  { id: 'idle.valentin_callback', tags: ['idle'], weight: 3, cooldown: 900,
    requires: (ctx) => !!ctx.flags.valentin_mentioned,
    lines: [
      { who: 'craft', text: 'а где Валентин?' },
      { who: 'code',  text: 'на своём месте' },
      { who: 'craft', text: 'хорошо' },
    ]},

  { id: 'idle.tiny_wave', tags: ['idle'], weight: 1.2, cooldown: 180,
    lines: [
      { who: 'craft', text: 'потренируюсь', act: 'wave' },
      { who: 'code',  text: 'в чём' },
      { who: 'craft', text: 'в эмоциях' },
      { who: 'code',  text: 'убедительно' },
    ]},

  { id: 'idle.you_tired', tags: ['idle'], weight: 1, cooldown: 160,
    lines: [
      { who: 'code',  text: 'ты сегодня тише' },
      { who: 'craft', text: 'думаю' },
      { who: 'code',  text: 'о?' },
      { who: 'craft', text: 'это секрет' },
    ]},

  { id: 'idle.both_stare', tags: ['idle'], weight: 0.7, cooldown: 240,
    lines: [
      { who: 'craft', text: '*смотрит вдаль*' },
      { who: 'code',  text: '*смотрит туда же*' },
      { who: 'craft', text: 'что там' },
      { who: 'code',  text: 'другая сторона' },
    ]},

  // ─── CLICK responses ─────────────────────────────────
  { id: 'click.craft.1',  tags: ['click:craft'], weight: 1, cooldown: 3,
    lines: [{ who: 'craft', text: 'хэй' }] },
  { id: 'click.craft.2',  tags: ['click:craft'], weight: 1, cooldown: 3,
    lines: [{ who: 'craft', text: 'осторожнее' }] },
  { id: 'click.craft.3',  tags: ['click:craft'], weight: 1, cooldown: 3,
    lines: [{ who: 'craft', text: 'щекотно' }] },
  { id: 'click.craft.4',  tags: ['click:craft'], weight: 0.8, cooldown: 6,
    lines: [{ who: 'craft', text: '*поёжился*', act: 'surprised' }] },
  { id: 'click.craft.spam', tags: ['click:craft'], weight: 2, cooldown: 12,
    requires: (ctx) => (ctx.flags.craft_click_count || 0) >= 4,
    lines: [{ who: 'craft', text: 'СТОП', act: 'surprised' }] },

  { id: 'click.code.1', tags: ['click:code'], weight: 1, cooldown: 3,
    lines: [{ who: 'code', text: 'зафиксировано' }] },
  { id: 'click.code.2', tags: ['click:code'], weight: 1, cooldown: 3,
    lines: [{ who: 'code', text: 'измерено' }] },
  { id: 'click.code.3', tags: ['click:code'], weight: 1, cooldown: 3,
    lines: [{ who: 'code', text: 'и что это было' }] },
  { id: 'click.code.4', tags: ['click:code'], weight: 0.7, cooldown: 8,
    lines: [{ who: 'code', text: '*демонстративно молчит*' }] },
  { id: 'click.code.spam', tags: ['click:code'], weight: 2, cooldown: 12,
    requires: (ctx) => (ctx.flags.code_click_count || 0) >= 4,
    lines: [{ who: 'code', text: 'достаточно касаний', act: 'surprised' }] },

  // ─── GRAB reactions (fast, one-liner) ────────────────
  { id: 'grab.craft.1', tags: ['grab:craft'], weight: 2, cooldown: 2,
    lines: [{ who: 'craft', text: 'ОЙ' }] },
  { id: 'grab.craft.2', tags: ['grab:craft'], weight: 1, cooldown: 5,
    lines: [{ who: 'craft', text: 'ЛЕЧУ?' }] },
  { id: 'grab.craft.3', tags: ['grab:craft'], weight: 1, cooldown: 5,
    lines: [{ who: 'craft', text: 'невесомость!' }] },
  { id: 'grab.craft.4', tags: ['grab:craft'], weight: 1, cooldown: 5,
    lines: [{ who: 'craft', text: 'аа, коррекция высоты' }] },
  { id: 'grab.craft.5', tags: ['grab:craft'], weight: 0.6, cooldown: 12,
    lines: [{ who: 'craft', text: 'лапы, лапы не трогай' }] },

  { id: 'grab.code.1', tags: ['grab:code'], weight: 2, cooldown: 2,
    lines: [{ who: 'code', text: 'координаты плывут' }] },
  { id: 'grab.code.2', tags: ['grab:code'], weight: 1, cooldown: 5,
    lines: [{ who: 'code', text: 'высота: растёт' }] },
  { id: 'grab.code.3', tags: ['grab:code'], weight: 1, cooldown: 5,
    lines: [{ who: 'code', text: 'не ронять' }] },
  { id: 'grab.code.4', tags: ['grab:code'], weight: 1, cooldown: 5,
    lines: [{ who: 'code', text: 'отпусти на платформу' }] },
  { id: 'grab.code.5', tags: ['grab:code'], weight: 0.6, cooldown: 12,
    lines: [{ who: 'code', text: 'я точное оборудование' }] },

  // ─── THROW reactions (airborne launched) ─────────────
  { id: 'throw.craft.1', tags: ['throw:craft'], weight: 2, cooldown: 3,
    lines: [{ who: 'craft', text: 'ЛЕЧУУУУ' }] },
  { id: 'throw.craft.2', tags: ['throw:craft'], weight: 1, cooldown: 5,
    lines: [{ who: 'craft', text: 'я ПТИЦА' }] },
  { id: 'throw.craft.3', tags: ['throw:craft'], weight: 1, cooldown: 5,
    lines: [{ who: 'craft', text: 'не по чертежу!' }] },
  { id: 'throw.craft.4', tags: ['throw:craft'], weight: 0.7, cooldown: 12,
    lines: [{ who: 'craft', text: 'ВАУ' }] },

  { id: 'throw.code.1', tags: ['throw:code'], weight: 2, cooldown: 3,
    lines: [{ who: 'code', text: 'скорость: избыточна' }] },
  { id: 'throw.code.2', tags: ['throw:code'], weight: 1, cooldown: 5,
    lines: [{ who: 'code', text: 'траектория неизвестна' }] },
  { id: 'throw.code.3', tags: ['throw:code'], weight: 1, cooldown: 5,
    lines: [{ who: 'code', text: 'я этого не просил' }] },
  { id: 'throw.code.4', tags: ['throw:code'], weight: 0.7, cooldown: 12,
    lines: [{ who: 'code', text: 'инерция подхватила' }] },

  // ─── PARTNER reactions — when OTHER is airborne/lands ─
  { id: 'partner.code_sees_craft_flying', tags: ['partner_on_throw:craft'], weight: 2, cooldown: 6,
    lines: [{ who: 'code', text: 'CRAFT?!', act: 'surprised' }] },
  { id: 'partner.code_measures_flight', tags: ['partner_on_throw:craft'], weight: 1, cooldown: 10,
    lines: [{ who: 'code', text: 'любопытная траектория' }] },
  { id: 'partner.code_calls_craft', tags: ['partner_on_throw:craft'], weight: 1, cooldown: 10,
    lines: [{ who: 'code', text: 'возвращайся' }] },
  { id: 'partner.code_shrug', tags: ['partner_on_throw:craft'], weight: 0.8, cooldown: 15,
    lines: [{ who: 'code', text: '*записывает высоту*', act: 'typing' }] },

  { id: 'partner.craft_sees_code_flying', tags: ['partner_on_throw:code'], weight: 2, cooldown: 6,
    lines: [{ who: 'craft', text: 'CODE!', act: 'surprised' }] },
  { id: 'partner.craft_cheers_code', tags: ['partner_on_throw:code'], weight: 1, cooldown: 10,
    lines: [{ who: 'craft', text: 'ты МОЖЕШЬ летать!' }] },
  { id: 'partner.craft_worry_code', tags: ['partner_on_throw:code'], weight: 1, cooldown: 10,
    lines: [{ who: 'craft', text: 'не потеряйся' }] },

  { id: 'partner.code_check_craft', tags: ['partner_on_land_hard:craft'], weight: 2, cooldown: 8,
    lines: [
      { who: 'code',  text: 'ты цел?', act: 'surprised' },
      { who: 'craft', text: 'угу' },
      { who: 'code',  text: 'это не по чертежу' },
    ]},
  { id: 'partner.craft_check_code', tags: ['partner_on_land_hard:code'], weight: 2, cooldown: 8,
    lines: [
      { who: 'craft', text: 'CODE?', act: 'surprised' },
      { who: 'code',  text: 'углы на месте' },
      { who: 'craft', text: 'фух' },
    ]},

  // ─── LANDING reactions (own bubble, fast) ────────────
  { id: 'land_soft.1', tags: ['land_soft:craft','land_soft:code'], weight: 2, cooldown: 2,
    lines: [{ who: 'craft', text: 'уф' }] },
  { id: 'land_soft.2', tags: ['land_soft:craft','land_soft:code'], weight: 1, cooldown: 4,
    lines: [{ who: 'craft', text: '*отряхивается*' }] },
  { id: 'land_soft.3', tags: ['land_soft:craft','land_soft:code'], weight: 1, cooldown: 4,
    lines: [{ who: 'craft', text: 'приземлился' }] },
  { id: 'land_soft.4', tags: ['land_soft:craft','land_soft:code'], weight: 0.8, cooldown: 8,
    lines: [{ who: 'craft', text: 'живой' }] },

  { id: 'land_hard.1', tags: ['land_hard:craft','land_hard:code'], weight: 2, cooldown: 2,
    lines: [{ who: 'craft', text: 'БАМ', act: 'surprised' }] },
  { id: 'land_hard.2', tags: ['land_hard:craft','land_hard:code'], weight: 1, cooldown: 5,
    lines: [{ who: 'craft', text: 'я видел звёзды' }] },
  { id: 'land_hard.3', tags: ['land_hard:craft','land_hard:code'], weight: 1, cooldown: 5,
    lines: [{ who: 'craft', text: '*лежит*' }] },
  { id: 'land_hard.4', tags: ['land_hard:craft','land_hard:code'], weight: 0.8, cooldown: 8,
    lines: [{ who: 'craft', text: 'ещё раз — не надо' }] },

  // ─── SETDOWN (released gently) ───────────────────────
  { id: 'setdown.1', tags: ['setdown:craft','setdown:code'], weight: 2, cooldown: 2,
    lines: [{ who: 'craft', text: '*поставили на место*' }] },
  { id: 'setdown.2', tags: ['setdown:craft','setdown:code'], weight: 1, cooldown: 4,
    lines: [{ who: 'craft', text: 'спасибо' }] },
  { id: 'setdown.3', tags: ['setdown:craft','setdown:code'], weight: 1, cooldown: 4,
    lines: [{ who: 'craft', text: 'удобно' }] },

  // ─── ACCENT change — "we repainted a layer" ──────────
  { id: 'accent.repaint', tags: ['accent'], weight: 2, cooldown: 30,
    lines: [
      { who: 'craft', text: 'мы перекрасили?', act: 'surprised' },
      { who: 'code',  text: 'слой сдвинулся' },
      { who: 'craft', text: 'красиво' },
    ]},
  { id: 'accent.spectrum', tags: ['accent'], weight: 1.5, cooldown: 30,
    lines: [
      { who: 'code',  text: 'пигмент изменён' },
      { who: 'craft', text: 'запиши тон' },
    ]},
  { id: 'accent.try_it', tags: ['accent'], weight: 1, cooldown: 45,
    lines: [
      { who: 'craft', text: 'новая палитра!' },
      { who: 'code',  text: 'надо привыкнуть' },
    ]},
  { id: 'accent.smell', tags: ['accent'], weight: 0.6, cooldown: 120,
    lines: [
      { who: 'craft', text: 'пахнет иначе' },
      { who: 'code',  text: 'у цвета нет запаха' },
      { who: 'craft', text: 'есть' },
    ]},

  // ─── KONAMI / special ────────────────────────────────
  { id: 'konami.dance', tags: ['konami'], weight: 1, cooldown: 5,
    lines: [
      { who: 'craft', text: '🕺', act: 'wave' },
      { who: 'code',  text: '💃', act: 'wave' },
      { who: 'craft', text: 'что это было' },
      { who: 'code',  text: 'не останавливайся' },
    ]},

  { id: 'unmuted.return', tags: ['unmuted'], weight: 1, cooldown: 5,
    lines: [
      { who: 'craft', text: 'живые', act: 'wave' },
      { who: 'code',  text: 'снова' },
    ]},

  // ─── INSIGHT one-liners (during thinking macro) ──────
  { id: 'insight.craft.1', tags: ['insight:craft'], weight: 1, cooldown: 25,
    lines: [{ who: 'craft', text: 'идея!' }] },
  { id: 'insight.craft.2', tags: ['insight:craft'], weight: 1, cooldown: 25,
    lines: [{ who: 'craft', text: 'щас запишу' }] },
  { id: 'insight.craft.3', tags: ['insight:craft'], weight: 1, cooldown: 25,
    lines: [{ who: 'craft', text: '*рисует*' }] },
  { id: 'insight.craft.4', tags: ['insight:craft'], weight: 1, cooldown: 25,
    lines: [{ who: 'craft', text: 'новая форма' }] },
  { id: 'insight.craft.5', tags: ['insight:craft'], weight: 0.7, cooldown: 45,
    lines: [{ who: 'craft', text: 'ну конечно!' }] },

  { id: 'insight.code.1', tags: ['insight:code'], weight: 1, cooldown: 25,
    lines: [{ who: 'code', text: '3.14 см ровно' }] },
  { id: 'insight.code.2', tags: ['insight:code'], weight: 1, cooldown: 25,
    lines: [{ who: 'code', text: 'проверим ещё раз' }] },
  { id: 'insight.code.3', tags: ['insight:code'], weight: 1, cooldown: 25,
    lines: [{ who: 'code', text: '*измеряет*' }] },
  { id: 'insight.code.4', tags: ['insight:code'], weight: 1, cooldown: 25,
    lines: [{ who: 'code', text: 'сходится' }] },
  { id: 'insight.code.5', tags: ['insight:code'], weight: 0.7, cooldown: 45,
    lines: [{ who: 'code', text: 'рефактор готов' }] },

  // ─── TOSS — scene A sets up a launch, the engine actions it ─
  { id: 'toss.craft.chertyozh', tags: ['toss_intro:craft'], weight: 1, cooldown: 420,
    lines: [
      { who: 'craft', text: 'ты опять поправил мой чертёж?' },
      { who: 'code',  text: 'он был косой' },
      { who: 'craft', text: 'он был ТВОРЧЕСКИЙ', act: 'surprised' },
      { who: 'code',  text: 'и косой' },
      { who: 'craft', text: '.всё.' },
    ]},
  { id: 'toss.craft.ruler', tags: ['toss_intro:craft'], weight: 1, cooldown: 420,
    lines: [
      { who: 'code',  text: '3.14 см. отойди' },
      { who: 'craft', text: 'отойду? я?' },
      { who: 'code',  text: 'ты мешаешь замеру' },
      { who: 'craft', text: 'знаешь что ещё мешает' },
      { who: 'code',  text: 'что' },
      { who: 'craft', text: 'ничего. ты летишь.' },
    ]},
  { id: 'toss.craft.silent', tags: ['toss_intro:craft'], weight: 0.8, cooldown: 500,
    lines: [
      { who: 'craft', text: 'CODE' },
      { who: 'code',  text: 'что' },
      { who: 'craft', text: 'у меня идея' },
      { who: 'code',  text: 'ок' },
      { who: 'craft', text: 'ты не спросил какая', act: 'surprised' },
      { who: 'code',  text: '...какая' },
      { who: 'craft', text: 'поздно' },
    ]},

  { id: 'toss.code.noise', tags: ['toss_intro:code'], weight: 1, cooldown: 420,
    lines: [
      { who: 'craft', text: 'ААААААА' },
      { who: 'code',  text: 'тише' },
      { who: 'craft', text: 'АААААА' },
      { who: 'code',  text: 'ладно.' },
    ]},
  { id: 'toss.code.plan', tags: ['toss_intro:code'], weight: 1, cooldown: 420,
    lines: [
      { who: 'craft', text: '*лепит круглое*', act: 'typing' },
      { who: 'code',  text: 'должно быть квадратным' },
      { who: 'craft', text: 'нет' },
      { who: 'code',  text: 'проверь траекторию' },
      { who: 'craft', text: 'чью' },
      { who: 'code',  text: 'свою.' },
    ]},
  { id: 'toss.code.measurement', tags: ['toss_intro:code'], weight: 0.8, cooldown: 500,
    lines: [
      { who: 'code',  text: 'между нами стало 2 см' },
      { who: 'craft', text: 'это я подошёл' },
      { who: 'code',  text: 'нарушение протокола' },
      { who: 'craft', text: 'ой', act: 'surprised' },
      { who: 'code',  text: 'коррекция' },
    ]},

  { id: 'toss_shout.craft.1', tags: ['toss_shout:craft'], weight: 1, cooldown: 10,
    lines: [{ who: 'craft', text: 'АЛЛЕ-ОП!' }] },
  { id: 'toss_shout.craft.2', tags: ['toss_shout:craft'], weight: 1, cooldown: 10,
    lines: [{ who: 'craft', text: 'ЛЕТИ' }] },
  { id: 'toss_shout.craft.3', tags: ['toss_shout:craft'], weight: 0.7, cooldown: 20,
    lines: [{ who: 'craft', text: '*хех*' }] },

  { id: 'toss_shout.code.1', tags: ['toss_shout:code'], weight: 1, cooldown: 10,
    lines: [{ who: 'code', text: 'замер высоты' }] },
  { id: 'toss_shout.code.2', tags: ['toss_shout:code'], weight: 1, cooldown: 10,
    lines: [{ who: 'code', text: 'параболический эксперимент' }] },
  { id: 'toss_shout.code.3', tags: ['toss_shout:code'], weight: 0.7, cooldown: 20,
    lines: [{ who: 'code', text: 'давай ещё раз' }] },

  // ─── CONTINUITY scenes — reference recent events ────
  { id: 'idle.after_throw', tags: ['idle'], weight: 5, cooldown: 40,
    requires: (ctx) => ctx.flags.craft_airborne_recent || ctx.flags.code_airborne_recent,
    lines: [
      { who: 'craft', text: 'до сих пор укачивает' },
      { who: 'code',  text: 'очень понимаю' },
    ]},

  { id: 'idle.wary_after_throws', tags: ['idle'], weight: 4, cooldown: 180,
    requires: (ctx) => (ctx.flags.thrown_count || 0) >= 3,
    lines: [
      { who: 'craft', text: 'давай сегодня недалеко от пола' },
      { who: 'code',  text: 'высота — плохая идея' },
    ]},

  { id: 'idle.post_crash', tags: ['idle'], weight: 6, cooldown: 30,
    requires: (ctx) => ctx.flags.craft_landed_hard_recent || ctx.flags.code_landed_hard_recent,
    lines: [
      { who: 'code',  text: 'у меня ещё звенит' },
      { who: 'craft', text: 'у меня тоже' },
      { who: 'code',  text: 'постоим' },
    ]},

  { id: 'idle.tense', tags: ['idle'], weight: 3, cooldown: 90,
    requires: (ctx) => (ctx.flags.rapport ?? 50) < 30,
    lines: [
      { who: 'craft', text: 'ты сегодня странный' },
      { who: 'code',  text: 'ты всегда странный' },
      { who: 'craft', text: '...' },
    ]},

  { id: 'idle.warm', tags: ['idle'], weight: 2, cooldown: 180,
    requires: (ctx) => (ctx.flags.rapport ?? 50) > 70,
    lines: [
      { who: 'craft', text: 'мне нравится как мы работаем' },
      { who: 'code',  text: '*молча, но одобрительно*' },
    ]},

  { id: 'accent.followup', tags: ['idle'], weight: 6, cooldown: 0,
    requires: (ctx) => ctx.flags.accent_changed_recent && !ctx.flags.accent_followup_done,
    effect: (ctx) => ctx.setFlag('accent_followup_done', 1, 180),
    lines: [
      { who: 'craft', text: 'этот тон ещё тёплый' },
      { who: 'code',  text: 'пигмент оседает' },
      { who: 'craft', text: 'он приживётся' },
    ]},

  { id: 'idle.annoyed_craft', tags: ['idle'], weight: 3, cooldown: 60,
    requires: (ctx) => ctx.flags.craft_annoyed,
    lines: [
      { who: 'craft', text: '*дуется*' },
      { who: 'code',  text: 'пройдёт' },
    ]},
  { id: 'idle.annoyed_code', tags: ['idle'], weight: 3, cooldown: 60,
    requires: (ctx) => ctx.flags.code_annoyed,
    lines: [
      { who: 'code',  text: 'я ещё раз пересчитаю' },
      { who: 'craft', text: 'всё, всё, я тихо' },
    ]},

  // ─── SCENE CHAINS — scene A sets flag, scene B follows up ─
  { id: 'chain.build.open', tags: ['idle'], weight: 2, cooldown: 100,
    requires: (ctx) => !ctx.flags.chain_build,
    effect: (ctx) => ctx.setFlag('chain_build', 1, 120),
    lines: [
      { who: 'craft', text: 'что будем строить?' },
      { who: 'code',  text: 'сначала чертёж' },
      { who: 'craft', text: 'ок', act: 'typing' },
    ]},
  { id: 'chain.build.close', tags: ['idle'], weight: 8, cooldown: 30,
    requires: (ctx) => ctx.flags.chain_build,
    effect: (ctx) => { delete ctx.flags.chain_build; delete ctx.flagExpiry.chain_build; },
    lines: [
      { who: 'code',  text: 'ну что, чертёж?' },
      { who: 'craft', text: 'получается' },
      { who: 'code',  text: 'проверю пропорции', act: 'typing' },
      { who: 'craft', text: 'они... творческие' },
    ]},

  { id: 'chain.measure.open', tags: ['idle'], weight: 1.5, cooldown: 120,
    requires: (ctx) => !ctx.flags.chain_measure,
    effect: (ctx) => ctx.setFlag('chain_measure', 1, 90),
    lines: [
      { who: 'code',  text: 'я что-то измерю' },
      { who: 'craft', text: 'что именно' },
      { who: 'code',  text: 'узнаешь потом', act: 'typing' },
    ]},
  { id: 'chain.measure.close', tags: ['idle'], weight: 8, cooldown: 30,
    requires: (ctx) => ctx.flags.chain_measure,
    effect: (ctx) => { delete ctx.flags.chain_measure; delete ctx.flagExpiry.chain_measure; },
    lines: [
      { who: 'craft', text: 'ну?' },
      { who: 'code',  text: 'ровно' },
      { who: 'craft', text: 'что ровно' },
      { who: 'code',  text: 'всё что должно быть ровно' },
    ]},

  // ═════════════════════════════════════════════════════════════════
  //  БЛОК 3 — «Чертёж № 7» (шести-этапная арка, тикает раз в 60 с)
  //  Сценарий: CRAFT вдохновляется → CODE замеряет → CRAFT изгибает →
  //  CODE замечает ошибку → CRAFT чинит → вместе ликуют → сброс цикла.
  //  Прогресс хранится в flags.chertyozh_7_step (0..5, потом назад в 0).
  // ═════════════════════════════════════════════════════════════════
  { id: 'chertyozh.step_0', tags: ['chertyozh_7_tick'], weight: 10,
    requires: (ctx) => (ctx.flags.chertyozh_7_step || 0) === 0,
    effect:   (ctx) => ctx.setFlag('chertyozh_7_step', 1),
    lines: [
      { who: 'craft', text: 'Я снова думал о Седьмом.', clip: 'idea' },
      { who: 'code',  text: 'Базовые векторы всё ещё не утверждены.' },
      { who: 'craft', text: 'Забудь про векторы. Важен импульс.' },
    ]},
  { id: 'chertyozh.step_1', tags: ['chertyozh_7_tick'], weight: 10,
    requires: (ctx) => ctx.flags.chertyozh_7_step === 1,
    effect:   (ctx) => ctx.setFlag('chertyozh_7_step', 2),
    lines: [
      { who: 'code',  text: 'Замеряю дистанцию для Седьмого.', clip: 'measure_distance' },
      { who: 'craft', text: 'Сколько нам нужно места?' },
      { who: 'code',  text: 'Больше, чем мы имеем.' },
    ]},
  { id: 'chertyozh.step_2', tags: ['chertyozh_7_tick'], weight: 10,
    requires: (ctx) => ctx.flags.chertyozh_7_step === 2,
    effect:   (ctx) => ctx.setFlag('chertyozh_7_step', 3),
    lines: [
      { who: 'craft', text: 'Если изогнём фаску вот так...', clip: 'sketch_air' },
      { who: 'code',  text: 'Допуск нарушен на 3 миллиметра.' },
      { who: 'craft', text: 'Это дыхание формы. Ей нужен воздух.' },
    ]},
  { id: 'chertyozh.step_3', tags: ['chertyozh_7_tick'], weight: 10,
    requires: (ctx) => ctx.flags.chertyozh_7_step === 3,
    effect:   (ctx) => ctx.setFlag('chertyozh_7_step', 4),
    lines: [
      { who: 'code',  text: 'Ты сделал угол 91 градус.' },
      { who: 'craft', text: 'Он... так лучше чувствуется.', act: 'surprised' },
      { who: 'code',  text: '91 — это не чувство. Это структурный коллапс.', clip: 'facepalm' },
    ]},
  { id: 'chertyozh.step_4', tags: ['chertyozh_7_tick'], weight: 10,
    requires: (ctx) => ctx.flags.chertyozh_7_step === 4,
    effect:   (ctx) => ctx.setFlag('chertyozh_7_step', 5),
    lines: [
      { who: 'craft', text: 'Я выровнял стыки.', clip: 'hammer' },
      { who: 'code',  text: 'Сканирую... Отклонение 0.00. Ровно.' },
      { who: 'craft', text: 'Ради тебя, мой друг.' },
    ]},
  { id: 'chertyozh.step_5', tags: ['chertyozh_7_tick'], weight: 15,
    requires: (ctx) => ctx.flags.chertyozh_7_step === 5,
    effect:   (ctx) => {
      ctx.setFlag('chertyozh_7_step', 0);
      ctx.modifyMood('craft', +20);
      ctx.modifyMood('code',  +20);
    },
    lines: [
      { who: 'code',  text: 'Седьмой Чертёж стабилизирован.', clip: 'bar' },
      { who: 'craft', text: 'МЫ ЭТО СДЕЛАЛИ!', clip: 'cheer' },
      { who: 'code',  text: 'Процесс усадки начат.', clip: 'laugh' },
    ]},

  // ═════════════════════════════════════════════════════════════════
  //  БЛОК 7 — ВРЕМЯ СУТОК (morning / evening / silence_break)
  // ═════════════════════════════════════════════════════════════════
  { id: 'env.morning_1', tags: ['morning'], weight: 5, cooldown: 600,
    lines: [
      { who: 'craft', text: 'Свежий цикл. Шарниры готовы.', clip: 'excited' },
      { who: 'code',  text: 'Синхронизация осей завершена.' },
    ]},
  { id: 'env.morning_2', tags: ['morning'], weight: 3, cooldown: 600,
    lines: [
      { who: 'code',  text: 'Калибровка прошла. Ты?' },
      { who: 'craft', text: 'Я всегда готов. Для чего — потом вспомню.' },
    ]},
  { id: 'env.evening_1', tags: ['evening'], weight: 5, cooldown: 600,
    lines: [
      { who: 'craft', text: 'Мастерская затихает. Тени мягче.' },
      { who: 'code',  text: 'Температура среды снижена на 4 градуса.' },
      { who: 'craft', text: 'Время для тихих мыслей.', clip: 'silent_stare' },
    ]},
  { id: 'env.evening_2', tags: ['evening'], weight: 3, cooldown: 600,
    lines: [
      { who: 'code',  text: 'Архитектор сегодня не приходил.' },
      { who: 'craft', text: 'Его чертежи говорят за него.' },
    ]},
  { id: 'env.silence_1', tags: ['silence_break'], weight: 5,
    lines: [
      { who: 'craft', text: 'Тишина правильной формы.' },
      { who: 'code',  text: 'Акустический вакуум. Ровно.' },
    ]},
  { id: 'env.silence_2', tags: ['silence_break'], weight: 3,
    lines: [
      { who: 'code',  text: '...' },
      { who: 'craft', text: 'Ты тоже думаешь?' },
      { who: 'code',  text: 'Всегда.' },
    ]},

  // ═════════════════════════════════════════════════════════════════
  //  БЛОК 5 — ПРОСТРАНСТВЕННЫЕ ХУКИ (stack / platform / stuck / lost / drag)
  // ═════════════════════════════════════════════════════════════════
  // --- СТЕК: кто-то на голове у другого ---
  { id: 'space.stack_top_craft', tags: ['stack:top:craft'], weight: 5, cooldown: 30,
    lines: [{ who: 'craft', text: 'Ого! Вижу верхний край!', clip: 'wave' }]},
  { id: 'space.stack_top_code',  tags: ['stack:top:code'],  weight: 5, cooldown: 30,
    lines: [{ who: 'code',  text: 'Координата Y увеличена. Обзор оптимален.' }]},
  { id: 'space.stack_bot_craft', tags: ['stack:bottom:craft'], weight: 5, cooldown: 30,
    lines: [{ who: 'craft', text: 'Стоишь как каменный блок. Тяжёлый!', act: 'surprised' }]},
  { id: 'space.stack_bot_code',  tags: ['stack:bottom:code'],  weight: 5, cooldown: 30,
    lines: [{ who: 'code',  text: 'Моя несущая способность не рассчитана на хаос.', clip: 'facepalm' }]},

  // --- ПЕРЕТАСКИВАНИЕ (аномалия) ---
  { id: 'space.drag_craft', tags: ['partner_dragged:craft'], weight: 5, cooldown: 20,
    lines: [
      { who: 'code',  text: 'Фиксирую пространственную аномалию.' },
      { who: 'craft', text: 'Лечу не по чертежу-у-у!' },
    ]},
  { id: 'space.drag_code',  tags: ['partner_dragged:code'],  weight: 5, cooldown: 20,
    lines: [
      { who: 'craft', text: 'Эй! Куда сквозняк тебя потащил?!', act: 'surprised' },
      { who: 'code',  text: 'Внешняя сила. Я не контролирую вектор.' },
    ]},

  // --- ПОТЕРЯН за верхним краем мастерской ---
  { id: 'space.lost_craft', tags: ['partner_lost:craft'], weight: 5, cooldown: 15,
    lines: [{ who: 'code', text: 'Связь потеряна. Он покинул сетку координат.', act: 'surprised' }]},
  { id: 'space.lost_code',  tags: ['partner_lost:code'],  weight: 5, cooldown: 15,
    lines: [{ who: 'craft', text: 'CODE?! Ты где?!', act: 'surprised' }]},

  // --- ЗАСТРЯЛИ ВМЕСТЕ (микро-нежность или раздражение) ---
  { id: 'space.stuck_1', tags: ['stuck_together'], weight: 5, cooldown: 60,
    lines: [
      { who: 'code',  text: 'Дистанция ноль. Мы занимаем одни координаты.' },
      { who: 'craft', text: 'Так теплее. Считай это усадкой.' },
    ]},
  { id: 'space.stuck_2', tags: ['stuck_together'], weight: 3, cooldown: 60,
    lines: [
      { who: 'code',  text: 'Ты стоишь слишком близко. Протокол нарушен.' },
      { who: 'craft', text: 'А если не нарушать?' },
      { who: 'code',  text: '...допустимо.' },
    ]},

  // --- ОТДЫХ НА ПЛАТФОРМЕ (10 с без движения на возвышении) ---
  { id: 'space.platform_craft', tags: ['platform_rest:craft'], weight: 5, cooldown: 45,
    lines: [
      { who: 'craft', text: 'С этой полки пыль выглядит как звёзды.', clip: 'stargaze' },
      { who: 'code',  text: 'Это микрочастицы силикона.' },
    ]},
  { id: 'space.platform_code',  tags: ['platform_rest:code'],  weight: 5, cooldown: 45,
    lines: [{ who: 'code', text: 'Возвышение стабильно. Можно начать пересчёт.', clip: 'measure_distance' }]},

  // --- СЕРИЯ УДАРОВ (3+ за 10 с) ---
  { id: 'space.bumped_craft', tags: ['bumped_repeated:craft'], weight: 5, cooldown: 30,
    lines: [{ who: 'craft', text: 'У меня шарниры искрят от стен!', clip: 'facepalm' }]},
  { id: 'space.bumped_code',  tags: ['bumped_repeated:code'],  weight: 5, cooldown: 30,
    lines: [{ who: 'code',  text: 'Механический стресс 85%. Поставь меня ровно.', clip: 'facepalm' }]},

  // ═════════════════════════════════════════════════════════════════
  //  БЛОК 6 — ВЗАИМОДЕЙСТВИЕ С ПОЛЬЗОВАТЕЛЕМ (без 4-й стены)
  // ═════════════════════════════════════════════════════════════════
  // --- ГЛАДЯТ (один спокойный click после паузы) ---
  { id: 'user.touch_craft', tags: ['gentle_touch:craft'], weight: 5, cooldown: 120,
    lines: [
      { who: 'craft', text: 'Ой, щекотно!', clip: 'chuckle' },
      { who: 'code',  text: 'Сенсоры зафиксировали статический разряд.' },
    ]},
  { id: 'user.touch_code',  tags: ['gentle_touch:code'],  weight: 5, cooldown: 120,
    lines: [
      { who: 'code',  text: 'Внешнее давление оптимально.', clip: 'wave' },
      { who: 'craft', text: 'Стенд вибрирует. Добрый знак!' },
    ]},

  // --- СОБРАЛИ ВМЕСТЕ (мягко опустили рядом) ---
  { id: 'user.reconcile_1', tags: ['reconciliation'], weight: 5, cooldown: 60,
    lines: [
      { who: 'code',  text: 'Дистанция восстановлена. Система стабильна.' },
      { who: 'craft', text: 'Аномалия нас сблизила. Хорошо.', clip: 'excited' },
    ]},
  { id: 'user.reconcile_2', tags: ['reconciliation'], weight: 3, cooldown: 60,
    lines: [
      { who: 'craft', text: 'Кажется, чертёж снова сходится.', clip: 'sketch_air' },
      { who: 'code',  text: 'Подтверждаю. Допуски в норме.' },
    ]},

  // --- СПАСЛИ ПОСЛЕ УДАРА (подняли сразу после хита) ---
  { id: 'user.saved_craft', tags: ['picked_up_after_hurt:craft'], weight: 5, cooldown: 30,
    effect: (ctx) => ctx.modifyMood('craft', +10),
    lines: [{ who: 'craft', text: 'Фух... спасибо. Меня знатно помяло.', clip: 'wipe_tear' }]},
  { id: 'user.saved_code',  tags: ['picked_up_after_hurt:code'],  weight: 5, cooldown: 30,
    effect: (ctx) => ctx.modifyMood('code', +10),
    lines: [{ who: 'code', text: 'Вектор изменён. Благодарю за стабилизацию.' }]},

  // ═════════════════════════════════════════════════════════════════
  //  БЛОК 8 / 9 — МАКРО-СЦЕНЫ (handoff, coffee break, pair wave)
  // ═════════════════════════════════════════════════════════════════
  // Длинная работа молотком (только на этапе 4 Седьмого Чертежа)
  { id: 'macro.hammer_time', tags: ['idle'], weight: 2, cooldown: 180,
    requires: (ctx) => ctx.flags.chertyozh_7_step === 4,
    lines: [
      { who: 'craft', text: 'Сейчас... подгоню этот край.' },
      { who: 'craft', text: '...хрясь...', clip: 'hammer' },
      { who: 'craft', text: '...ещё чуть-чуть...', clip: 'hammer' },
      { who: 'craft', text: 'Идеально. Как по маслу.' },
      { who: 'code',  text: 'Механическое воздействие в пределах нормы.' },
    ]},
  // Передача ноутбука (когда боты рядом). Близость отслеживает _simTick,
  // выставляющий flag.bots_close (TTL 2с после последнего подтверждения).
  // Клавиша: проверяем FLAG, не DOM.
  { id: 'macro.handoff_laptop', tags: ['idle'], weight: 2, cooldown: 240,
    requires: (ctx) => !!ctx.flags.bots_close,
    lines: [
      { who: 'craft', text: 'Я пересчитал векторы. Смотри.', clip: 'share_laptop' },
      { who: 'code',  text: 'Принимаю пакет данных...', clip: 'share_laptop' },
      { who: 'code',  text: 'Ошибка 0%. Удивительно.', clip: 'typing' },
      { who: 'craft', text: 'Я же говорил! Интуиция.', clip: 'excited' },
    ]},
  // Кофе-брейк (только после полудня)
  { id: 'macro.coffee_break', tags: ['idle'], weight: 2, cooldown: 300,
    requires: (ctx) => ctx.sim && ctx.sim.workshopTime > 0.5,
    lines: [
      { who: 'code',  text: 'Уровень энергии падает. Предлагаю паузу.', clip: 'rest' },
      { who: 'craft', text: 'Хорошая идея. Вливаем масло.', clip: 'coffee_sip' },
      { who: 'code',  text: '...Тишина стабилизирует.', clip: 'silent_stare' },
    ]},
  // Одновременный привет в пустоту
  { id: 'macro.pair_wave', tags: ['idle'], weight: 2, cooldown: 180,
    lines: [
      { who: 'craft', text: 'Привет, пространство!', clip: 'wave' },
      { who: 'code',  text: 'Приветствую, вакуум.', clip: 'wave' },
    ]},

  // ═════════════════════════════════════════════════════════════════
  //  ПАСХАЛКИ (редкие, cooldown 300+ секунд)
  // ═════════════════════════════════════════════════════════════════
  { id: 'easter.singing', tags: ['idle'], weight: 0.5, cooldown: 300,
    lines: [
      { who: 'craft', text: '*ммм-мм-ммм...*', clip: 'wave' },
      { who: 'code',  text: 'Что за звуковая частота?' },
      { who: 'craft', text: 'Мелодия из старого чертежа Архитектора.' },
    ]},
  { id: 'easter.code_laugh', tags: ['idle'], weight: 0.5, cooldown: 500,
    lines: [
      { who: 'code',  text: '101010. Шутка.', clip: 'laugh' },
      { who: 'craft', text: 'Ты... ты только что смеялся?!', act: 'surprised' },
      { who: 'code',  text: 'Акустический сбой. Забудь.' },
    ]},
  { id: 'easter.valentin_missing', tags: ['idle'], weight: 2, cooldown: 180,
    lines: [
      { who: 'craft', text: 'Ты не видел Валентина?' },
      { who: 'code',  text: 'Твой камень лежал на оси X:40. Я его не трогал.' },
      { who: 'craft', text: 'Он вечно куда-то уползает...' },
    ]},
  { id: 'easter.theme_sense', tags: ['idle'], weight: 2, cooldown: 240,
    lines: [
      { who: 'craft', text: 'Чувствуешь? Слой перекрасили.' },
      { who: 'code',  text: 'Фоновый контраст изменён на 12%. Допустимо.' },
    ]},
  // Низкое настроение — нежная поддержка
  { id: 'mood.low_craft', tags: ['idle'], weight: 3, cooldown: 120,
    requires: (ctx) => ctx.sim && ctx.sim.mood.craft < 30,
    lines: [
      { who: 'craft', text: '*тихо*' },
      { who: 'code',  text: 'Хочешь, я подсчитаю что-нибудь?' },
      { who: 'craft', text: 'Потом. Сейчас хочу просто постоять.' },
    ]},
  { id: 'mood.low_code', tags: ['idle'], weight: 3, cooldown: 120,
    requires: (ctx) => ctx.sim && ctx.sim.mood.code < 30,
    lines: [
      { who: 'code',  text: 'Множество допусков нарушено.' },
      { who: 'craft', text: 'Мы починим. Потом.' },
      { who: 'code',  text: '...спасибо.' },
    ]},
  // Высокое настроение — совместная радость
  { id: 'mood.high_both', tags: ['idle'], weight: 2, cooldown: 180,
    requires: (ctx) => ctx.sim && ctx.sim.mood.craft > 70 && ctx.sim.mood.code > 70,
    lines: [
      { who: 'craft', text: 'Сегодня что-то... поётся.' },
      { who: 'code',  text: 'Оптимальный операционный режим. Я согласен.' },
    ]},
];
